import { NextResponse } from "next/server";
import { spawn } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runPython = (args: string[]) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("python", args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
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
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      } else {
        reject(new Error(stderr || `exit ${code ?? 0}`));
      }
    });
  });

export const POST = async () => {
  try {
    const { stdout, stderr } = await runPython(["youtube_upload_once.py"]);
    return NextResponse.json({
      ok: true,
      log: stdout,
      error: stderr || null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
