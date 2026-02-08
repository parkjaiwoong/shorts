import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const RAW_DIR = path.join(process.cwd(), "storage", "videos", "raw");
const PROCESSED_DIR = path.join(process.cwd(), "storage", "videos", "processed");
const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;
const MIN_SECONDS = 15;
const MAX_SECONDS = 30;
const DEFAULT_TEXT = "지금 문의하세요";
const DEFAULT_FONT_PATH = "C:/Windows/Fonts/malgun.ttf";
const BGM_PATH = path.join(process.cwd(), "storage", "bgm", "bgm.mp3");
const DEFAULT_FONT_SIZE = 56;
const MAX_LINES = 2;
const MAX_CHARS_PER_LINE = 16;
const WATERMARK_BOX = { width: 180, height: 80, margin: 32 };

const run = (cmd: string, args: string[]) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      if (stderr.trim()) {
        console.error(stderr.trim());
      }
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      } else {
        reject(new Error(stderr || `exit ${code ?? 0}`));
      }
    });
  });

const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const findInputFile = async (inputArg?: string) => {
  if (inputArg) {
    const resolved = path.resolve(inputArg);
    if (!existsSync(resolved)) {
      throw new Error(`input not found: ${resolved}`);
    }
    return resolved;
  }
  if (!existsSync(RAW_DIR)) {
    throw new Error(`raw dir not found: ${RAW_DIR}`);
  }
  const entries = await fs.readdir(RAW_DIR, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp4"))
    .map((entry) => path.join(RAW_DIR, entry.name));
  if (candidates.length === 0) {
    throw new Error("no mp4 found in storage/videos/raw");
  }
  return candidates[0];
};

const probeDuration = async (inputPath: string) => {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath
  ]);
  const duration = Number(stdout);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("ffprobe duration invalid");
  }
  return duration;
};

const probeAudioExists = async (inputPath: string) => {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=codec_name",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath
  ]);
  return Boolean(stdout.trim());
};

const probeResolution = async (inputPath: string) => {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0:s=x",
    inputPath
  ]);
  const [width, height] = stdout.trim().split("x").map((value) => Number(value));
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("ffprobe resolution invalid");
  }
  return { width, height };
};

const wrapCaption = (caption: string) => {
  const trimmed = caption.trim();
  if (trimmed.length <= MAX_CHARS_PER_LINE) return trimmed;

  const parts = trimmed.split(" · ").map((part) => part.trim()).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const part of parts) {
    const next = current ? `${current} · ${part}` : part;
    if (next.length <= MAX_CHARS_PER_LINE) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
      current = part;
    } else {
      lines.push(part.slice(0, MAX_CHARS_PER_LINE));
      current = part.slice(MAX_CHARS_PER_LINE);
    }
    if (lines.length >= MAX_LINES) break;
  }
  if (current && lines.length < MAX_LINES) {
    lines.push(current);
  }
  if (lines.length === 1 && trimmed.length > MAX_CHARS_PER_LINE) {
    const midpoint = Math.ceil(trimmed.length / 2);
    return `${trimmed.slice(0, midpoint)}\n${trimmed.slice(midpoint)}`;
  }
  return lines.slice(0, MAX_LINES).join("\n");
};

const escapeDrawtext = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n");

const resolveFontPath = (fontPath?: string) => {
  if (fontPath && existsSync(fontPath)) {
    return fontPath;
  }
  return DEFAULT_FONT_PATH;
};

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
  const resolvedFont = resolveFontPath(fontPath);
  const resolvedSize = resolveFontSize(fontSize);
  const fontfile = resolvedFont.replace(/\\/g, "/").replace(/:/g, "\\:");
  const blur = "gblur=sigma=30";
  const scaleBg = `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase`;
  const cropBg = `crop=${TARGET_WIDTH}:${TARGET_HEIGHT}`;
  const scaleFg = `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease`;
  const padFg = `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2`;
  const wmX = TARGET_WIDTH - WATERMARK_BOX.width - WATERMARK_BOX.margin;
  const wmY = WATERMARK_BOX.margin;
  const delogo = `delogo=x=${wmX}:y=${wmY}:w=${WATERMARK_BOX.width}:h=${WATERMARK_BOX.height}:show=0`;
  const drawText =
    "drawtext=" +
    `fontfile='${fontfile}':` +
    "fontcolor=white:" +
    `fontsize=${resolvedSize}:` +
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
    "[bg][fg]overlay=0:0[vout]"
  ].join(";");
};

const main = async () => {
  const inputArg = process.argv[2];
  const captionArg = process.argv[3] || DEFAULT_TEXT;
  const fontArg = process.argv[4];
  const fontSizeArg = Number(process.argv[5]);
  const watermarkArg = process.argv[6];
  const removeWatermark = watermarkArg === "1" || watermarkArg === "true";
  const inputPath = await findInputFile(inputArg);
  const duration = await probeDuration(inputPath);
  const hasAudio = await probeAudioExists(inputPath);
  const cutSeconds = Math.min(MAX_SECONDS, duration);

  await ensureDir(PROCESSED_DIR);
  const outputName = `${path.parse(inputPath).name}__shorts.mp4`;
  const outputPath = path.join(PROCESSED_DIR, outputName);

  const filterComplex = buildFilter(captionArg, fontArg, fontSizeArg, removeWatermark);
  const bgmExists = existsSync(BGM_PATH);
  let audioMode = "UNKNOWN";
  const audioFilter = (() => {
    if (bgmExists && hasAudio) {
      audioMode = "ORIGINAL + BGM (ducking)";
      return [
        "[1:a]volume=0.35[bgm]",
        "[bgm][0:a]sidechaincompress=threshold=0.05:ratio=10:attack=10:release=200[ducked]",
        "[0:a][ducked]amix=inputs=2:duration=first:dropout_transition=2[aout]"
      ].join(";");
    }
    if (bgmExists) {
      audioMode = "BGM ONLY";
      return "[1:a]volume=0.35[aout]";
    }
    if (hasAudio) {
      audioMode = "ORIGINAL ONLY (volume 1.4)";
      return "[0:a]volume=1.4[aout]";
    }
    return "";
  })();

  if (!audioFilter) {
    throw new Error("audio stream missing and no bgm available");
  }
  console.log(`[AUDIO] ${audioMode}`);
  console.log(`[AUDIO] BGM_PATH=${BGM_PATH} exists=${bgmExists}`);

  const args = ["-y", "-ss", "0", "-t", cutSeconds.toFixed(2), "-i", inputPath];
  if (bgmExists) {
    args.push("-stream_loop", "-1", "-i", BGM_PATH);
  }
  const filters = `${filterComplex};${audioFilter}`;
  args.push(
    "-filter_complex",
    filters,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath
  );

  try {
    await run("ffmpeg", args);
  } catch (error) {
    throw new Error(`ffmpeg failed: ${(error as Error).message}`);
  }

  if (!existsSync(outputPath)) {
    throw new Error("output not created");
  }

  const outputDuration = await probeDuration(outputPath);
  if (Math.abs(outputDuration - cutSeconds) > 0.8) {
    throw new Error("output duration out of range");
  }
  const outputAudio = await probeAudioExists(outputPath);
  if (!outputAudio) {
    throw new Error("output audio missing");
  }
  const resolution = await probeResolution(outputPath);
  if (resolution.width !== TARGET_WIDTH || resolution.height !== TARGET_HEIGHT) {
    throw new Error("output resolution mismatch");
  }

  if (cutSeconds < MIN_SECONDS) {
    console.log(`[WARN] source duration ${duration.toFixed(2)}s below 15s`);
  }
  console.log(`OUTPUT=${outputPath}`);
};

main().catch((error) => {
  console.error(`ERROR=${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
