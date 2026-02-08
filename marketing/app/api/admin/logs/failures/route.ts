import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PATH = path.join(process.cwd(), "storage", "logs", "failures.json");

type FailLog = {
  id: string;
  title: string;
  thumbnailUrl?: string;
  stage: "PROCESSING" | "UPLOADING";
  platform: "YouTube" | "TikTok" | "Instagram";
  reason: string;
  failedAt: string;
  status: "ACTIVE" | "IGNORED";
  errorDetail: string;
  videoId: string;
};

const readLogs = async (): Promise<FailLog[]> => {
  try {
    const raw = await fs.readFile(LOG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FailLog[]) : [];
  } catch {
    return [];
  }
};

const writeLogs = async (logs: FailLog[]) => {
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.writeFile(LOG_PATH, JSON.stringify(logs, null, 2), "utf-8");
};

export const GET = async () => {
  const logs = await readLogs();
  return NextResponse.json({ ok: true, logs });
};

export const POST = async (request: Request) => {
  const payload = (await request.json().catch(() => ({}))) as Partial<FailLog>;
  if (!payload.title || !payload.reason || !payload.errorDetail || !payload.videoId) {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
  }
  const logs = await readLogs();
  const entry: FailLog = {
    id: randomUUID(),
    title: payload.title,
    thumbnailUrl: payload.thumbnailUrl,
    stage: payload.stage || "PROCESSING",
    platform: payload.platform || "YouTube",
    reason: payload.reason,
    failedAt: new Date().toISOString(),
    status: "ACTIVE",
    errorDetail: payload.errorDetail,
    videoId: payload.videoId
  };
  logs.unshift(entry);
  await writeLogs(logs);
  return NextResponse.json({ ok: true, log: entry });
};

export const PATCH = async (request: Request) => {
  const payload = (await request.json().catch(() => ({}))) as {
    id?: string;
    status?: "ACTIVE" | "IGNORED";
  };
  if (!payload.id || !payload.status) {
    return NextResponse.json({ ok: false, error: "id and status required" }, { status: 400 });
  }
  const logs = await readLogs();
  const next = logs.map((item) =>
    item.id === payload.id ? { ...item, status: payload.status } : item
  );
  await writeLogs(next);
  return NextResponse.json({ ok: true });
};
