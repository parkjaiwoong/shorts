import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const CUSTOMER_ID = "customer_001";
const BASE_DIR = path.join(
  process.cwd(),
  "storage",
  "videos",
  "customer",
  CUSTOMER_ID
);
const INPUT_PATH = path.join(BASE_DIR, "raw.mp4");
const OUTPUT_PATH = path.join(BASE_DIR, "processed.mp4");
const META_PATH = path.join(BASE_DIR, "meta.json");

const runFfmpeg = (args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: "inherit" });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exit ${code ?? 0}`));
      }
    });
  });

const updateMeta = async (status: "PROCESSED" | "FAILED", error?: string) => {
  const raw = await fs.readFile(META_PATH, "utf-8");
  const meta = JSON.parse(raw) as {
    videoId: string;
    customerId: string;
    originalFilePath: string;
    processedFilePath: string | null;
    status: string;
    createdAt: string;
  };
  meta.status = status;
  meta.processedFilePath = status === "PROCESSED" ? OUTPUT_PATH : null;
  if (error) {
    (meta as { error?: string }).error = error;
  }
  await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2), "utf-8");
};

const main = async () => {
  const filter =
    "scale=1080:1920:force_original_aspect_ratio=increase," +
    "crop=1080:1920," +
    "drawtext=text='지금 문의하세요!':x=(w-text_w)/2:y=h-text_h-80";

  const args = [
    "-y",
    "-i",
    INPUT_PATH,
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    OUTPUT_PATH
  ];

  try {
    await runFfmpeg(args);
    await updateMeta("PROCESSED");
    console.log(`[PROCESS] ${CUSTOMER_ID} processed.mp4 생성 완료`);
  } catch (error) {
    await updateMeta("FAILED", error instanceof Error ? error.message : "unknown error");
    console.error(`[ERROR] ${CUSTOMER_ID} 처리 실패`);
    throw error;
  }
};

main().catch(() => {
  process.exit(1);
});
