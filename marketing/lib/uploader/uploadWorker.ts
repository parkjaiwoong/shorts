import fs from "node:fs/promises";
import path from "node:path";

import { YouTubeUploader } from "./YouTubeUploader";
import { logStep, logUploadResult } from "./logger";
import { FAILED_DIR, DONE_DIR, PROCESSED_DIR, UPLOADING_DIR, VIDEO_DIRS } from "./videoPaths";
import { delay, ensureDir, fileExists, listFiles, safeMove } from "./utils";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 30_000;

const getRetryPath = (fileName: string) =>
  path.join(UPLOADING_DIR, `${fileName}.retry.json`);

const readRetryCount = async (retryPath: string) => {
  try {
    const raw = await fs.readFile(retryPath, "utf-8");
    const parsed = JSON.parse(raw) as { count?: number };
    return typeof parsed.count === "number" ? parsed.count : 0;
  } catch {
    return 0;
  }
};

const writeRetryCount = async (retryPath: string, count: number) => {
  await fs.writeFile(retryPath, JSON.stringify({ count }, null, 2), "utf-8");
};

const deleteRetryFile = async (retryPath: string) => {
  try {
    await fs.unlink(retryPath);
  } catch {
    // ignore missing file
  }
};

export const handleSingleVideo = async (
  filePath: string,
  uploader: YouTubeUploader
): Promise<"LIMIT_REACHED" | "DONE"> => {
  const fileName = path.basename(filePath);
  const uploadingPath = path.join(UPLOADING_DIR, fileName);
  const donePath = path.join(DONE_DIR, fileName);
  const failedPath = path.join(FAILED_DIR, fileName);

  logStep("START", fileName);

  if (fileExists(uploadingPath) || fileExists(donePath)) {
    logStep("SKIP", `${fileName} already uploading/done`);
    return "DONE";
  }

  if (!fileExists(filePath)) {
    logStep("SKIP", `${fileName} missing in processed`);
    return "DONE";
  }

  logStep("MOVE", `${fileName} processed -> uploading`);
  await safeMove(filePath, uploadingPath);

  const retryPath = getRetryPath(fileName);
  let currentRetry = await readRetryCount(retryPath);

  for (let attempt = currentRetry + 1; attempt <= MAX_RETRIES; attempt += 1) {
    logStep("UPLOADING", `${fileName} attempt ${attempt}/${MAX_RETRIES}`);
    const result = await uploader.upload(uploadingPath);
    if (result.success) {
      logUploadResult({
        filename: fileName,
        attempt,
        result: "SUCCESS"
      });
      logStep("MOVE", `${fileName} uploading -> done`);
      await safeMove(uploadingPath, donePath);
      await deleteRetryFile(retryPath);
      return "DONE";
    }

    const normalizedMessage = result.message?.toLowerCase() || "";
    if (
      normalizedMessage.includes("daily limit reached") ||
      normalizedMessage.includes("quota")
    ) {
      logUploadResult({
        filename: fileName,
        attempt,
        result: "LIMIT_REACHED",
        error: "daily limit reached"
      });
      logStep("MOVE", `${fileName} uploading -> processed (limit reached)`);
      await safeMove(uploadingPath, filePath);
      return "LIMIT_REACHED";
    }

    await writeRetryCount(retryPath, attempt);
    logUploadResult({
      filename: fileName,
      attempt,
      result: "FAILED",
      error: result.message
    });
    if (attempt < MAX_RETRIES) {
      logStep("WAIT", `${fileName} retry in ${RETRY_DELAY_MS / 1000}s`);
      await delay(RETRY_DELAY_MS);
    }
  }

  logStep("MOVE", `${fileName} uploading -> failed`);
  await safeMove(uploadingPath, failedPath);
  await deleteRetryFile(retryPath);
  return "DONE";
};

export const uploadWorker = async () => {
  await Promise.all(VIDEO_DIRS.map((dir) => ensureDir(dir)));

  const uploader = new YouTubeUploader();
  const processedFiles = await listFiles(PROCESSED_DIR);

  if (processedFiles.length === 0) {
    logStep("IDLE", "no videos in processed");
    return;
  }

  for (const filePath of processedFiles) {
    try {
      const result = await handleSingleVideo(filePath, uploader);
      if (result === "LIMIT_REACHED") {
        logStep("STOP", "daily limit reached, stopping worker");
        return;
      }
    } catch (error) {
      logStep(
        "ERROR",
        `${path.basename(filePath)} worker error: ${(error as Error).message}`
      );
    }
  }
};
