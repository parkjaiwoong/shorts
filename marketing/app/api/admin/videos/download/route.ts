import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CUSTOMER_ROOT = path.join(process.cwd(), "storage", "videos", "customer");

const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const getCustomerDir = (customerId: string) => path.join(CUSTOMER_ROOT, customerId);

const getVideoDir = (customerId: string, videoId: string) =>
  path.join(getCustomerDir(customerId), videoId);

const metaPath = (customerId: string, videoId: string) =>
  path.join(getVideoDir(customerId, videoId), "meta.json");

const rawPath = (customerId: string, videoId: string) =>
  path.join(getVideoDir(customerId, videoId), "raw.mp4");

const statusPath = (videoId: string) =>
  path.join(process.cwd(), "storage", "logs", "downloads", `${videoId}.json`);

const writeStatus = async (videoId: string, payload: Record<string, unknown>) => {
  const target = statusPath(videoId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(
    target,
    JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }, null, 2),
    "utf-8"
  );
};

const parseProgress = (line: string) => {
  const match = line.match(/(\d{1,3}\.\d+)%/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
};

export const GET = async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId") || "";
    if (!videoId) {
      return NextResponse.json({ ok: false, error: "videoId is required" }, { status: 400 });
    }
    const target = statusPath(videoId);
    if (!existsSync(target)) {
      return NextResponse.json({ ok: false, error: "status not found" }, { status: 404 });
    }
    const raw = await fs.readFile(target, "utf-8");
    const status = JSON.parse(raw);
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};

export const POST = async (request: Request) => {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      customerId?: string;
      platform?: "youtube" | "tiktok" | "instagram";
      url?: string;
      autoProcess?: boolean;
    };
    const customerId = payload.customerId;
    const url = payload.url?.trim();
    if (!customerId) {
      return NextResponse.json({ ok: false, error: "customerId is required" }, { status: 400 });
    }
    if (!url) {
      return NextResponse.json({ ok: false, error: "url is required" }, { status: 400 });
    }
    const videoId = randomUUID();
    const videoDir = getVideoDir(customerId, videoId);
    await ensureDir(videoDir);
    const targetPath = rawPath(customerId, videoId);

    await writeStatus(videoId, {
      status: "DOWNLOADING",
      progress: 0,
      message: "starting"
    });

    const meta = {
      videoId,
      customerId,
      originalFilePath: `storage/videos/customer/${customerId}/${videoId}/raw.mp4`,
      processedFilePath: null,
      status: "DOWNLOADING",
      createdAt: new Date().toISOString(),
      sourceUrl: url,
      sourcePlatform: payload.platform || "youtube",
      sourceType: "URL"
    };
    await fs.writeFile(metaPath(customerId, videoId), JSON.stringify(meta, null, 2), "utf-8");

    const origin = new URL(request.url).origin;
    void (async () => {
      try {
        const command = "python";
        const args = [
          "-m",
          "yt_dlp",
          "-f",
          "bv*+ba/b",
          "--merge-output-format",
          "mp4",
          "--newline",
          "-o",
          targetPath,
          url
        ];
        const child = spawn(command, args, { cwd: process.cwd() });
        child.stdout.on("data", (data) => {
          const text = data.toString();
          const lines = text.split(/\r?\n/);
          for (const line of lines) {
            const progress = parseProgress(line);
            if (progress !== null) {
              void writeStatus(videoId, {
                status: "DOWNLOADING",
                progress,
                message: line.trim()
              });
            }
          }
        });
        child.stderr.on("data", (data) => {
          const line = data.toString().trim();
          if (line) {
            void writeStatus(videoId, {
              status: "DOWNLOADING",
              progress: null,
              message: line
            });
          }
        });
        child.on("error", (error: NodeJS.ErrnoException) => {
          void writeStatus(videoId, {
            status: "FAILED",
            progress: null,
            message: `python not found (${error.code ?? "unknown"})`
          });
        });
        child.on("close", async (code) => {
          if (code === 0 && existsSync(targetPath)) {
            const updatedMeta = { ...meta, status: "READY" };
            await fs.writeFile(
              metaPath(customerId, videoId),
              JSON.stringify(updatedMeta, null, 2),
              "utf-8"
            );
            await writeStatus(videoId, {
              status: "DONE",
              progress: 100,
              message: "completed",
              filePath: targetPath
            });
            if (payload.autoProcess) {
              try {
                await fetch(`${origin}/api/admin/process/shorts`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ clientId: customerId, videoId })
                });
              } catch {
                // ignore
              }
            }
          } else {
            const notFound = code === -4058 || code === 127;
            await writeStatus(videoId, {
              status: "FAILED",
              progress: null,
              message: notFound
                ? "yt-dlp not found. Install: pip install -U yt-dlp"
                : `download failed (exit ${code ?? 0})`
            });
            const failedMeta = { ...meta, status: "FAILED" };
            await fs.writeFile(
              metaPath(customerId, videoId),
              JSON.stringify(failedMeta, null, 2),
              "utf-8"
            );
          }
        });
      } catch (error) {
        await writeStatus(videoId, {
          status: "FAILED",
          progress: null,
          message: error instanceof Error ? error.message : "download failed"
        });
        const failedMeta = { ...meta, status: "FAILED" };
        await fs.writeFile(metaPath(customerId, videoId), JSON.stringify(failedMeta, null, 2));
      }
    })();

    return NextResponse.json({
      ok: true,
      videoId,
      fileName: path.basename(targetPath)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
