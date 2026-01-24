import { NextResponse } from "next/server";
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
  try {
    const url = new URL(request.url);
    const channelId = url.searchParams.get("channelId");
    if (!channelId) {
      return NextResponse.json(
        { error: "channelId가 필요합니다." },
        { status: 400 }
      );
    }
    const output = await runPython([
      "ui_api.py",
      "queue",
      "--channel-id",
      channelId
    ]);
    return NextResponse.json(JSON.parse(output));
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
