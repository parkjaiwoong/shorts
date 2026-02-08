import fs from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();
const VIDEOS_DIR = path.join(ROOT_DIR, "storage", "videos");
const CUSTOMER_ROOT = path.join(VIDEOS_DIR, "customer");
const CUSTOMER_ID = "customer_001";
const CUSTOMER_DIR = path.join(CUSTOMER_ROOT, CUSTOMER_ID);
const META_PATH = path.join(CUSTOMER_DIR, "meta.json");

const main = async () => {
  await fs.mkdir(CUSTOMER_DIR, { recursive: true });

  const payload = {
    videoId: "video_001",
    customerId: CUSTOMER_ID,
    originalFilePath: "storage/videos/customer/customer_001/raw.mp4",
    processedFilePath: null,
    status: "READY",
    createdAt: new Date().toISOString()
  };

  await fs.writeFile(META_PATH, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`video meta created: ${META_PATH}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
