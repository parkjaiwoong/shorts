import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_SECONDS = 15;
const MAX_SECONDS = 30;
const FAILURE_LOG_PATH = path.join(process.cwd(), "storage", "logs", "failures.json");

const getTsxCommand = () => {
  const binName = process.platform === "win32" ? "tsx.cmd" : "tsx";
  const localBin = path.join(process.cwd(), "node_modules", ".bin", binName);
  if (existsSync(localBin)) {
    return { command: localBin, isLocal: true };
  }
  return { command: process.platform === "win32" ? "npx.cmd" : "npx", isLocal: false };
};

const runGenerator = (
  inputPath: string,
  caption: string,
  fontPath?: string,
  fontSize?: number,
  removeWatermark?: boolean
) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const safeCaption = String(caption ?? "");
    const { command, isLocal } = getTsxCommand();
    const scriptPath = path.join(process.cwd(), "scripts", "run-shorts-generator.ts");
    const isWindows = process.platform === "win32";
    const sizeArg =
      typeof fontSize === "number" && Number.isFinite(fontSize)
        ? String(fontSize)
        : "";
    const watermarkArg = removeWatermark ? "1" : "";
    let child;
    if (isWindows) {
      const commandLine = isLocal
        ? `"${command}" "${scriptPath}" "${inputPath}" "${safeCaption}"`
        : `"${command}" tsx "${scriptPath}" "${inputPath}" "${safeCaption}"`;
      const withFont = fontPath ? `${commandLine} "${fontPath}"` : commandLine;
      const withSize = sizeArg ? `${withFont} "${sizeArg}"` : withFont;
      const withWatermark = watermarkArg ? `${withSize} "${watermarkArg}"` : withSize;
      const wrapped = `chcp 65001>nul & ${withWatermark}`;
      child = spawn("cmd.exe", ["/d", "/s", "/c", wrapped], {
        cwd: process.cwd(),
        windowsVerbatimArguments: true
      });
    } else {
      const args = isLocal
        ? [scriptPath, inputPath, safeCaption]
        : ["tsx", scriptPath, inputPath, safeCaption];
      if (fontPath) args.push(fontPath);
      if (sizeArg) args.push(sizeArg);
      if (watermarkArg) args.push(watermarkArg);
      child = spawn(command, args, { cwd: process.cwd() });
    }
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error) => {
      reject(new Error(`spawn failed: ${command} (${error.code || "unknown"})`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      } else {
        reject(new Error(stderr || `exit ${code ?? 0}`));
      }
    });
  });

const runPython = (args: string[]) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn("python", args, { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error) => {
      reject(new Error(`spawn failed: python (${error.code || "unknown"})`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `exit ${code ?? 0}`));
      }
    });
  });

const runProbe = (args: string[]) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn("ffprobe", args, { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error) => {
      reject(new Error(`spawn failed: ffprobe (${error.code || "unknown"})`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `exit ${code ?? 0}`));
      }
    });
  });

const buildCaption = (client: {
  name: string;
  phone?: string;
  location?: string;
  default_cta?: string;
}) => {
  const parts = [client.name];
  if (client.phone) parts.push(client.phone);
  if (client.location) parts.push(client.location);
  if (client.default_cta) parts.push(client.default_cta);
  return parts.join(" · ");
};

const extractOutputPath = (stdout: string) => {
  const line = stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.startsWith("OUTPUT="));
  return line ? line.replace("OUTPUT=", "").trim() : "";
};

type QcResult = {
  passed: boolean;
  durationSeconds: number;
  durationValid: boolean;
  audioPresent: boolean;
  resolution: { width: number; height: number };
  resolutionValid: boolean;
  failedReasons: string[];
};

const getDurationSeconds = async (inputPath: string) => {
  const durationRaw = await runProbe([
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
  const durationSeconds = Number(durationRaw);
  if (!Number.isFinite(durationSeconds)) {
    throw new Error("duration probe failed");
  }
  return durationSeconds;
};

const runQc = async (
  inputPath: string,
  bounds: { minSeconds: number; maxSeconds: number }
): Promise<QcResult> => {
  const durationSeconds = await getDurationSeconds(inputPath);
  const durationValid =
    Number.isFinite(durationSeconds) &&
    durationSeconds >= bounds.minSeconds &&
    durationSeconds <= bounds.maxSeconds;

  const audioRaw = await runProbe([
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
  const audioPresent = Boolean(audioRaw.trim());

  const resolutionRaw = await runProbe([
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
  const [widthValue, heightValue] = resolutionRaw
    .trim()
    .split("x")
    .map((value) => Number(value));
  const resolution = { width: widthValue, height: heightValue };
  const resolutionValid = resolution.width === 1080 && resolution.height === 1920;

  const failedReasons: string[] = [];
  if (!durationValid) failedReasons.push("duration_out_of_range");
  if (!audioPresent) failedReasons.push("audio_missing");
  if (!resolutionValid) failedReasons.push("resolution_mismatch");

  return {
    passed: failedReasons.length === 0,
    durationSeconds,
    durationValid,
    audioPresent,
    resolution,
    resolutionValid,
    failedReasons
  };
};

const appendFailureLog = async (input: {
  title: string;
  reason: string;
  errorDetail: string;
  videoId: string;
}) => {
  const logEntry = {
    id: randomUUID(),
    title: input.title,
    stage: "PROCESSING",
    platform: "YouTube",
    reason: input.reason,
    failedAt: new Date().toISOString(),
    status: "ACTIVE",
    errorDetail: input.errorDetail,
    videoId: input.videoId
  };
  await fs.mkdir(path.dirname(FAILURE_LOG_PATH), { recursive: true });
  let existing: unknown = [];
  try {
    const raw = await fs.readFile(FAILURE_LOG_PATH, "utf-8");
    existing = JSON.parse(raw);
  } catch {
    existing = [];
  }
  const logs = Array.isArray(existing) ? existing : [];
  logs.unshift(logEntry);
  await fs.writeFile(FAILURE_LOG_PATH, JSON.stringify(logs, null, 2), "utf-8");
};

export const POST = async (request: Request) => {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      clientId?: string;
      videoId?: string;
      qcTest?: "audio_missing" | "resolution_mismatch";
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
    const metaPath = path.join(baseDir, "meta.json");
    if (!existsSync(rawPath)) {
      return NextResponse.json({ ok: false, error: "raw file not found" }, { status: 404 });
    }
    if (!existsSync(metaPath)) {
      return NextResponse.json({ ok: false, error: "meta not found" }, { status: 404 });
    }

    const clientOutput = await runPython([
      "client_api.py",
      "list",
    ]);
    const clientPayload = JSON.parse(clientOutput) as {
      clients?: Array<{
        id: string;
        name: string;
        phone?: string;
        location?: string;
        default_cta?: string;
      }>;
    };
    const client = clientPayload.clients?.find((item) => item.id === clientId);
    if (!client) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }
    const caption = payload.caption?.trim() || buildCaption(client);

    let processedPath = "";
    let qcResult: QcResult | null = null;
    const qcTest = payload.qcTest;
    const rawMeta = await fs.readFile(metaPath, "utf-8");
    const meta = JSON.parse(rawMeta) as {
      videoId: string;
      customerId: string;
      originalFilePath: string;
      processedFilePath: string | null;
      status: string;
      createdAt: string;
      qc?: QcResult;
      qcAt?: string;
    };
    try {
      const rawDuration = await getDurationSeconds(rawPath);
      const { stdout } = await runGenerator(
        rawPath,
        caption,
        payload.fontPath,
        payload.fontSize,
        payload.removeWatermark
      );
      processedPath = extractOutputPath(stdout);
      if (!processedPath || !existsSync(processedPath)) {
        throw new Error("processed file not found");
      }
      const maxAllowed = Math.min(MAX_SECONDS, rawDuration);
      const minAllowed = Math.min(MIN_SECONDS, maxAllowed);
      qcResult = await runQc(processedPath, {
        minSeconds: minAllowed,
        maxSeconds: maxAllowed
      });
      if (qcTest === "audio_missing") {
        qcResult.audioPresent = false;
        qcResult.failedReasons = Array.from(
          new Set([...qcResult.failedReasons, "audio_missing"])
        );
        qcResult.passed = false;
      }
      if (qcTest === "resolution_mismatch") {
        qcResult.resolutionValid = false;
        qcResult.failedReasons = Array.from(
          new Set([...qcResult.failedReasons, "resolution_mismatch"])
        );
        qcResult.passed = false;
      }
      meta.qc = qcResult;
      meta.qcAt = new Date().toISOString();
      if (!qcResult.passed) {
        throw new Error(`QC failed: ${qcResult.failedReasons.join(", ")}`);
      }
      meta.status = "PROCESSED";
      meta.processedFilePath = processedPath;
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
      const queueDir = path.join(process.cwd(), "storage", "videos", "processed");
      await fs.mkdir(queueDir, { recursive: true });
      if (processedPath && existsSync(processedPath)) {
        const queuePath = path.join(queueDir, path.basename(processedPath));
        if (!existsSync(queuePath)) {
          await fs.copyFile(processedPath, queuePath);
        }
      }
      await runPython([
        "processed_video_api.py",
        "create",
        "--payload",
        JSON.stringify({
          client_id: clientId,
          raw_filename: path.basename(rawPath),
          raw_path: rawPath,
          processed_path: processedPath,
          caption,
          status: "PROCESSED"
        })
      ]);
      return NextResponse.json({ ok: true, processedPath, caption });
    } catch (error) {
      const message = error instanceof Error ? error.message : "processing failed";
      meta.status = "FAILED";
      meta.processedFilePath = processedPath || null;
      if (qcResult) {
        meta.qc = qcResult;
        meta.qcAt = new Date().toISOString();
      }
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
      await appendFailureLog({
        title: path.basename(rawPath),
        reason: message,
        errorDetail: message,
        videoId
      });
      await runPython([
        "processed_video_api.py",
        "create",
        "--payload",
        JSON.stringify({
          client_id: clientId,
          raw_filename: path.basename(rawPath),
          raw_path: rawPath,
          processed_path: processedPath || null,
          caption,
          status: "FAILED",
          error_message: message
        })
      ]);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
