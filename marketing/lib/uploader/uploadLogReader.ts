import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export type UploadLogEntry = {
  timestamp: string;
  filename: string;
  attempt: number;
  result: "SUCCESS" | "FAILED" | "LIMIT_REACHED";
  error?: string;
};

const LOG_DIR = path.join(process.cwd(), "storage", "logs");
const UPLOAD_LOG_PREFIX = "upload-";
const UPLOAD_LOG_SUFFIX = ".log";
const SCHEDULER_LOG = path.join(LOG_DIR, "scheduler.log");

const parseUploadLine = (line: string): UploadLogEntry | null => {
  const timestampMatch = line.match(/^(\S+)/);
  if (!timestampMatch) {
    return null;
  }
  const timestamp = timestampMatch[1];

  if (line.includes("|")) {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 4) {
      return null;
    }
    const filename = parts[1] || "";
    const attemptMatch = parts[2]?.match(/(\d+)/);
    const resultMatch = parts[3]?.match(/(SUCCESS|FAILED|LIMIT_REACHED)/);
    if (!filename || !attemptMatch || !resultMatch) {
      return null;
    }
    const error = parts[4] ? parts.slice(4).join(" | ").trim() : undefined;
    return {
      timestamp,
      filename,
      attempt: Number(attemptMatch[1]),
      result: resultMatch[1] as "SUCCESS" | "FAILED" | "LIMIT_REACHED",
      error
    };
  }

  if (line.includes("result=")) {
    const filenameMatch = line.match(/filename=(.*?)\s+attempt=/);
    const attemptMatch = line.match(/attempt=(\d+)/);
    const resultMatch = line.match(/result=(SUCCESS|FAILED|LIMIT_REACHED)/);
    const errorMatch = line.match(/\s+error=(.*)$/);
    if (!filenameMatch || !attemptMatch || !resultMatch) {
      return null;
    }
    return {
      timestamp,
      filename: filenameMatch[1],
      attempt: Number(attemptMatch[1]),
      result: resultMatch[1] as "SUCCESS" | "FAILED" | "LIMIT_REACHED",
      error: errorMatch?.[1]
    };
  }

  return null;
};

export const readUploadLogs = async (limit: number) => {
  if (!existsSync(LOG_DIR)) {
    return [];
  }
  const entries = (await fs.readdir(LOG_DIR)).filter(
    (name) => name.startsWith(UPLOAD_LOG_PREFIX) && name.endsWith(UPLOAD_LOG_SUFFIX)
  );
  if (entries.length === 0) {
    return [];
  }

  const stats = await Promise.all(
    entries.map(async (name) => {
      const fullPath = path.join(LOG_DIR, name);
      const stat = await fs.stat(fullPath).catch(() => null);
      return stat ? { name, fullPath, mtimeMs: stat.mtimeMs } : null;
    })
  );

  const latest = stats
    .filter((value): value is { name: string; fullPath: string; mtimeMs: number } => Boolean(value))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];

  if (!latest) {
    return [];
  }

  const content = await fs.readFile(latest.fullPath, "utf-8").catch(() => "");
  if (!content) {
    return [];
  }
  const lines = content.split(/\r?\n/).filter(Boolean);
  const recent = lines.slice(-limit);
  return recent
    .map((line) => parseUploadLine(line))
    .filter((value): value is UploadLogEntry => Boolean(value))
    .reverse();
};

export const readSchedulerLastRun = async () => {
  if (!existsSync(SCHEDULER_LOG)) {
    return null;
  }
  const content = await fs.readFile(SCHEDULER_LOG, "utf-8").catch(() => "");
  if (!content) {
    return null;
  }
  const lines = content.split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const match = line.match(/^\[(.+?)\]\s+RUN_UPLOAD_WORKER_(START|END)/);
    if (match) {
      return match[1];
    }
  }
  return null;
};
