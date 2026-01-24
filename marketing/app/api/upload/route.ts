import { NextResponse } from "next/server";
import { exec } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runPython = () =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    exec(
      "python python/upload_runner.py",
      { cwd: process.cwd(), env: { ...process.env, PYTHONIOENCODING: "utf-8" } },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });

export const POST = async () => {
  try {
    console.log("[API] UPLOAD ENTER");
    const { stdout, stderr } = await runPython();
    if (stderr) {
      console.error(stderr);
    }
    if (stdout) {
      console.log(stdout);
    }
    return NextResponse.json({ message: "upload finished" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
