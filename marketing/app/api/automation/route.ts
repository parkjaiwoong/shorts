import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { spawn } from "node:child_process";

export const runtime = "nodejs";

const LOG_DIR = path.join(process.cwd(), "public", "automation_logs");

const appendLog = async (logPath: string, message: string) => {
  await fs.appendFile(logPath, message);
};

export const POST = async (request: Request) => {
  try {
    const body = await request.json().catch(() => ({}));
    const requested = Number(body?.count ?? 3);
    const count =
      Number.isFinite(requested) && requested > 0
        ? Math.min(Math.floor(requested), 20)
        : 3;

    await fs.mkdir(LOG_DIR, { recursive: true });
    const jobId = nanoid();
    const logPath = path.join(LOG_DIR, `${jobId}.log`);
    await fs.writeFile(logPath, `START auto pipeline count=${count}\n`);

    const child = spawn(
      "python",
      ["pipeline.py", "--auto", "--count", String(count)],
      {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONUNBUFFERED: "1" }
      }
    );

    child.stdout.on("data", (data) => {
      void appendLog(logPath, data.toString());
    });
    child.stderr.on("data", (data) => {
      void appendLog(logPath, data.toString());
    });
    child.on("close", (code) => {
      void appendLog(logPath, `\nDONE exit=${code ?? 0}\n`);
    });

    return NextResponse.json({ jobId, count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId가 필요합니다." }, { status: 400 });
  }

  const logPath = path.join(LOG_DIR, `${jobId}.log`);
  if (!existsSync(logPath)) {
    return NextResponse.json({ error: "로그를 찾을 수 없습니다." }, { status: 404 });
  }

  const log = await fs.readFile(logPath, "utf-8");
  const done = log.includes("DONE exit=");
  return NextResponse.json({ log, done });
};
