import path from "node:path";

import { logStep } from "../lib/uploader/logger";
import { FAILED_DIR, PROCESSED_DIR, VIDEO_DIRS } from "../lib/uploader/videoPaths";
import { ensureDir, listFiles, safeMove } from "../lib/uploader/utils";

const retryFailed = async () => {
  await Promise.all(VIDEO_DIRS.map((dir) => ensureDir(dir)));

  const failedFiles = await listFiles(FAILED_DIR);
  if (failedFiles.length === 0) {
    logStep("IDLE", "no videos in failed");
    return;
  }

  for (const filePath of failedFiles) {
    const fileName = path.basename(filePath);
    const targetPath = path.join(PROCESSED_DIR, fileName);
    logStep("MOVE", `${fileName} failed -> processed`);
    await safeMove(filePath, targetPath);
  }
};

retryFailed().catch((error) => {
  logStep("ERROR", `retry-failed error: ${(error as Error).message}`);
  process.exit(1);
});
