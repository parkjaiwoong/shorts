import fs from "node:fs/promises";
import path from "node:path";

import { ensureDir } from "./utils";

const LOG_DIR = path.join(process.cwd(), "storage", "logs");
const LOG_PREFIX = "upload";

const getLogPath = () => {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `${LOG_PREFIX}-${date}.log`);
};

const appendLog = async (line: string) => {
  await ensureDir(LOG_DIR);
  await fs.appendFile(getLogPath(), `${line}\n`, "utf-8");
};

const formatTimestamp = () => new Date().toISOString();

export const logStep = (stage: string, message: string) => {
  const line = `[UPLOAD][${stage}] ${message}`;
  console.log(line);
  void appendLog(line).catch(() => undefined);
};

export const logUploadResult = (params: {
  filename: string;
  attempt: number;
  result: "SUCCESS" | "FAILED" | "LIMIT_REACHED";
  error?: string;
}) => {
  const timestamp = formatTimestamp();
  const errorMessage = params.error ? ` | ${params.error}` : "";
  const line = `${timestamp} | ${params.filename} | ${params.attempt}회 | ${params.result}${errorMessage}`;
  console.log(line);
  void appendLog(line).catch(() => undefined);
};
