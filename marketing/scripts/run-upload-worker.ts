import { uploadWorker } from "../lib/uploader/uploadWorker";

uploadWorker().catch((error) => {
  console.error("[UPLOAD][FATAL]", error);
  process.exit(1);
});
