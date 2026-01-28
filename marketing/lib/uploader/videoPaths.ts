import path from "node:path";

export const VIDEO_ROOT = path.join(process.cwd(), "storage", "videos");
export const PROCESSED_DIR = path.join(VIDEO_ROOT, "processed");
export const UPLOADING_DIR = path.join(VIDEO_ROOT, "uploading");
export const DONE_DIR = path.join(VIDEO_ROOT, "done");
export const FAILED_DIR = path.join(VIDEO_ROOT, "failed");

export const VIDEO_DIRS = [PROCESSED_DIR, UPLOADING_DIR, DONE_DIR, FAILED_DIR];
