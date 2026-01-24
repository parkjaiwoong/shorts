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

export const GET = async () => {
  try {
    const output = await runPython(["ui_api.py", "channels"]);
    return NextResponse.json(JSON.parse(output));
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

export const PATCH = async (request: Request) => {
  try {
    const body = await request.json();
    const channelId = body?.channelId;
    if (!channelId) {
      return NextResponse.json(
        { error: "channelId가 필요합니다." },
        { status: 400 }
      );
    }
    const payload = JSON.stringify({
      tone: body?.tone,
      subtitle_style: body?.subtitle_style,
      title_prefix: body?.title_prefix,
      hashtag_template: body?.hashtag_template
    });
    const output = await runPython([
      "ui_api.py",
      "update-channel",
      "--channel-id",
      String(channelId),
      "--payload",
      payload
    ]);
    return NextResponse.json(JSON.parse(output));
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
