import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;
const DEFAULT_FONT_PATH = "C:/Windows/Fonts/malgun.ttf";
const DEFAULT_FONT_SIZE = 56;

const run = (cmd: string, args: string[]) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: process.cwd() });
    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error) => {
      reject(new Error(`spawn failed: ${cmd} (${error.code || "unknown"})`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stderr.trim());
      } else {
        reject(new Error(stderr || `exit ${code ?? 0}`));
      }
    });
  });

const probeHasVideo = async (inputPath: string) => {
  const output = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_type",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath
  ]);
  return output.trim() === "video";
};

const wrapCaption = (caption: string) => {
  const trimmed = caption.trim();
  const maxChars = 16;
  if (trimmed.length <= maxChars) return trimmed;
  const parts = trimmed.split(" · ").map((part) => part.trim()).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const part of parts) {
    const next = current ? `${current} · ${part}` : part;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
      current = part;
    } else {
      lines.push(part.slice(0, maxChars));
      current = part.slice(maxChars);
    }
    if (lines.length >= 2) break;
  }
  if (current && lines.length < 2) lines.push(current);
  if (lines.length === 1 && trimmed.length > maxChars) {
    const midpoint = Math.ceil(trimmed.length / 2);
    return `${trimmed.slice(0, midpoint)}\n${trimmed.slice(midpoint)}`;
  }
  return lines.slice(0, 2).join("\n");
};

const escapeDrawtext = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n");

const resolveFontPath = (fontPath?: string) =>
  fontPath && existsSync(fontPath) ? fontPath : DEFAULT_FONT_PATH;

const resolveFontSize = (fontSize?: number) => {
  if (!fontSize || Number.isNaN(fontSize)) return DEFAULT_FONT_SIZE;
  return Math.min(96, Math.max(28, Math.round(fontSize)));
};

const buildFilter = (
  caption: string,
  fontPath?: string,
  fontSize?: number,
  removeWatermark?: boolean
) => {
  const wrapped = wrapCaption(caption);
  const text = escapeDrawtext(wrapped);
  const fontfile = resolveFontPath(fontPath).replace(/\\/g, "/").replace(/:/g, "\\:");
  const size = resolveFontSize(fontSize);
  const blur = "gblur=sigma=30";
  const scaleBg = `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase`;
  const cropBg = `crop=${TARGET_WIDTH}:${TARGET_HEIGHT}`;
  const scaleFg = `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease`;
  const padFg = `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2`;
  const wmWidth = 180;
  const wmHeight = 80;
  const wmMargin = 32;
  const wmX = TARGET_WIDTH - wmWidth - wmMargin;
  const wmY = wmMargin;
  const delogo = `delogo=x=${wmX}:y=${wmY}:w=${wmWidth}:h=${wmHeight}:show=0`;
  const drawText =
    "drawtext=" +
    `fontfile='${fontfile}':` +
    "fontcolor=white:" +
    `fontsize=${size}:` +
    "x=(w-text_w)/2:" +
    "y=h-text_h-240:" +
    "line_spacing=10:" +
    "box=1:" +
    "boxcolor=black@0.45:" +
    `text='${text}'`;
  const fgChain = removeWatermark
    ? `[fg]${scaleFg},${padFg},${delogo},${drawText}[fg]`
    : `[fg]${scaleFg},${padFg},${drawText}[fg]`;
  return [
    "[0:v]split=2[bg][fg]",
    `[bg]${scaleBg},${cropBg},${blur}[bg]`,
    fgChain,
    "[bg][fg]overlay=0:0,scale=540:960[vout]"
  ].join(";");
};

export const POST = async (request: Request) => {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      clientId?: string;
      videoId?: string;
      caption?: string;
      fontPath?: string;
      fontSize?: number;
      removeWatermark?: boolean;
    };
    const clientId = payload.clientId;
    const videoId = payload.videoId;
    if (!clientId || !videoId) {
      return NextResponse.json(
        { ok: false, error: "clientId and videoId are required" },
        { status: 400 }
      );
    }
    const baseDir = path.join(
      process.cwd(),
      "storage",
      "videos",
      "customer",
      clientId,
      videoId
    );
    const rawPath = path.join(baseDir, "raw.mp4");
    if (!existsSync(rawPath)) {
      return NextResponse.json({ ok: false, error: "raw file not found" }, { status: 404 });
    }
    const hasVideo = await probeHasVideo(rawPath);
    if (!hasVideo) {
      const svg = [
        "<svg xmlns='http://www.w3.org/2000/svg' width='540' height='960'>",
        "<rect width='100%' height='100%' fill='#111827'/>",
        "<rect x='40' y='120' width='460' height='720' rx='24' fill='#1f2937'/>",
        "<text x='270' y='460' fill='#f9fafb' font-size='28' font-family='sans-serif' text-anchor='middle'>",
        "오디오 전용 파일",
        "</text>",
        "<text x='270' y='510' fill='#9ca3af' font-size='20' font-family='sans-serif' text-anchor='middle'>",
        "미리보기 없음",
        "</text>",
        "</svg>"
      ].join("");
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
      return NextResponse.json({ ok: true, dataUrl, placeholder: true });
    }
    const caption = payload.caption?.trim() || "미리보기";
    const filterComplex = buildFilter(
      caption,
      payload.fontPath,
      payload.fontSize,
      payload.removeWatermark
    );
    const previewDir = path.join(process.cwd(), "storage", "previews");
    await fs.mkdir(previewDir, { recursive: true });
    const previewPath = path.join(previewDir, `${videoId}-${Date.now()}.jpg`);

    await run("ffmpeg", [
      "-y",
      "-ss",
      "0",
      "-i",
      rawPath,
      "-frames:v",
      "1",
      "-filter_complex",
      filterComplex,
      "-map",
      "[vout]",
      "-q:v",
      "3",
      previewPath
    ]);

    const buffer = await fs.readFile(previewPath);
    const dataUrl = `data:image/jpeg;base64,${buffer.toString("base64")}`;
    return NextResponse.json({ ok: true, dataUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
