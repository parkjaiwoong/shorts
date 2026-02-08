import { NextResponse } from "next/server";

import { readUploadLogs } from "@/lib/uploader/uploadLogReader";
import { spawn } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runPython = (args: string[]) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn("python", args, { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `exit ${code ?? 0}`));
      }
    });
  });

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") || "20");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 20;
  const logs = await readUploadLogs(limit);
  const successLogs = logs.filter((log) => log.result === "SUCCESS");
  for (const log of successLogs) {
    try {
      await runPython(["processed_video_api.py", "update-status", "--filename", log.filename, "--status", "UPLOADED"]);
    } catch {
      // ignore update errors to avoid breaking log fetch
    }
  }

  return NextResponse.json({ ok: true, logs });
};
