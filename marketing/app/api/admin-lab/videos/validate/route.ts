import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 500 * 1024 * 1024;

const resolvePath = (value: string) => {
  if (path.isAbsolute(value)) return value;
  return path.resolve(process.cwd(), value);
};

const getDuration = async (filePath: string) =>
  new Promise<number>((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        const parsed = Number.parseFloat(stdout.trim());
        resolve(Number.isFinite(parsed) ? parsed : 0);
      } else {
        reject(new Error(stderr || "ffprobe failed"));
      }
    });
  });

export const POST = async (request: Request) => {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      filePath?: string;
    };
    const rawPath = typeof body.filePath === "string" ? body.filePath : "";
    if (!rawPath) {
      return NextResponse.json(
        { ok: false, error: "filePath가 필요합니다." },
        { status: 400 }
      );
    }
    const filePath = resolvePath(rawPath);
    if (!existsSync(filePath)) {
      return NextResponse.json({ ok: false, error: "파일이 존재하지 않습니다." });
    }
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_FILE_BYTES) {
      return NextResponse.json({
        ok: false,
        error: "파일 크기 제한을 초과했습니다."
      });
    }
    const duration = await getDuration(filePath);
    if (duration <= 0) {
      return NextResponse.json({
        ok: false,
        error: "영상 길이 정보를 확인할 수 없습니다."
      });
    }
    const title = path.basename(filePath);
    const description = `${title} 업로드 준비`;
    return NextResponse.json({
      ok: true,
      title,
      description,
      duration
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
