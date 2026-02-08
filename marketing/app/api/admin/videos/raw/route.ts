import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CUSTOMER_ROOT = path.join(process.cwd(), "storage", "videos", "customer");

const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const getCustomerDir = (customerId: string) =>
  path.join(CUSTOMER_ROOT, customerId);

const getVideoDir = (customerId: string, videoId: string) =>
  path.join(getCustomerDir(customerId), videoId);

const metaPath = (customerId: string, videoId: string) =>
  path.join(getVideoDir(customerId, videoId), "meta.json");

const rawPath = (customerId: string, videoId: string) =>
  path.join(getVideoDir(customerId, videoId), "raw.mp4");

export const GET = async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId") || "";
    const root = customerId ? getCustomerDir(customerId) : CUSTOMER_ROOT;
    if (!existsSync(root)) {
      return NextResponse.json({ ok: true, files: [] });
    }
    const customers = customerId ? [customerId] : await fs.readdir(root);
    const results: Array<{
      videoId: string;
      customerId: string;
      name: string;
      size: number;
      createdAt: string;
      status: string;
      originalFilePath: string;
    }> = [];
    for (const cid of customers) {
      const customerDir = getCustomerDir(cid);
      if (!existsSync(customerDir)) continue;
      const videos = await fs.readdir(customerDir);
      for (const vid of videos) {
        const metadataPath = metaPath(cid, vid);
        if (!existsSync(metadataPath)) continue;
        const raw = await fs.readFile(metadataPath, "utf-8");
        const meta = JSON.parse(raw) as {
          originalFilePath?: string;
          status?: string;
          createdAt?: string;
        };
        const filePath = rawPath(cid, vid);
        if (!existsSync(filePath)) continue;
        const stat = await fs.stat(filePath);
        results.push({
          videoId: vid,
          customerId: cid,
          name: path.basename(filePath),
          size: stat.size,
          createdAt: meta.createdAt || stat.birthtime.toISOString(),
          status: meta.status || "READY",
          originalFilePath: meta.originalFilePath || "",
        });
      }
    }
    return NextResponse.json({ ok: true, files: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};

export const POST = async (request: Request) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const customerId = formData.get("customerId");
    const autoProcess = formData.get("autoProcess");
    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
    }
    if (!customerId || typeof customerId !== "string") {
      return NextResponse.json(
        { ok: false, error: "customerId is required" },
        { status: 400 }
      );
    }
    const videoId = randomUUID();
    const videoDir = getVideoDir(customerId, videoId);
    await ensureDir(videoDir);
    const blob = file as File;
    const buffer = Buffer.from(await blob.arrayBuffer());
    const targetPath = rawPath(customerId, videoId);
    await fs.writeFile(targetPath, buffer);
    const meta = {
      videoId,
      customerId,
      originalFilePath: `storage/videos/customer/${customerId}/${videoId}/raw.mp4`,
      processedFilePath: null,
      status: "READY",
      createdAt: new Date().toISOString()
    };
    await fs.writeFile(metaPath(customerId, videoId), JSON.stringify(meta, null, 2), "utf-8");
    let autoProcessResult: { ok: boolean; error?: string } | null = null;
    const shouldAutoProcess =
      typeof autoProcess === "string" &&
      (autoProcess === "true" || autoProcess === "1" || autoProcess === "yes");
    if (shouldAutoProcess) {
      try {
        const origin = new URL(request.url).origin;
        const response = await fetch(`${origin}/api/admin/process/shorts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: customerId, videoId })
        });
        const payload = (await response.json()) as { ok?: boolean; error?: string };
        autoProcessResult = response.ok && payload.ok !== false
          ? { ok: true }
          : { ok: false, error: payload.error || "auto process failed" };
      } catch (error) {
        autoProcessResult = {
          ok: false,
          error: error instanceof Error ? error.message : "auto process failed"
        };
      }
    }
    return NextResponse.json({
      ok: true,
      videoId,
      fileName: path.basename(targetPath),
      autoProcess: autoProcessResult
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
