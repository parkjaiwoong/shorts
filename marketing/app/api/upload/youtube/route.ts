import { NextResponse } from "next/server";
import { exec } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const extractJsonPayload = (stdout: string) => {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const jsonLine = [...lines].reverse().find((line) => line.startsWith("{") && line.endsWith("}"));
  if (jsonLine) {
    return JSON.parse(jsonLine);
  }
  const lastOpen = stdout.lastIndexOf("{");
  const lastClose = stdout.lastIndexOf("}");
  if (lastOpen !== -1 && lastClose > lastOpen) {
    const slice = stdout.slice(lastOpen, lastClose + 1);
    return JSON.parse(slice);
  }
  return null;
};

const runPython = (
  channelId?: string | null,
  manualPath?: string | null,
  payload?: {
    title?: string;
    description?: string;
    tags?: string[];
    privacyStatus?: string;
  }
) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const cwd = process.cwd();
    exec(
      "python youtube_upload_route.py",
      {
        cwd,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          YOUTUBE_CLIENT_SECRETS: `${cwd}\\python\\client_secret.json`,
          YOUTUBE_TOKEN_PATH: `${cwd}\\python\\token_shorts.pickle`,
          TARGET_CHANNEL_ID: channelId || "",
          MANUAL_UPLOAD_PATH: manualPath || "",
          YOUTUBE_TITLE: payload?.title || "",
          YOUTUBE_DESCRIPTION: payload?.description || "",
          YOUTUBE_TAGS_JSON: JSON.stringify(payload?.tags || []),
          YOUTUBE_PRIVACY_STATUS: payload?.privacyStatus || "private"
        }
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });

export const POST = async (request: Request) => {
  try {
    console.log("[UPLOAD][YOUTUBE] FUNCTION ENTERED");
    const { channelId, filePath, title, description, tags, privacyStatus } = (await request
      .json()
      .catch(() => ({}))) as {
      channelId?: string | null;
      filePath?: string | null;
      title?: string | null;
      description?: string | null;
      tags?: string[] | null;
      privacyStatus?: string | null;
    };
    const { stdout, stderr } = await runPython(channelId, filePath, {
      title: title ?? undefined,
      description: description ?? undefined,
      tags: tags ?? undefined,
      privacyStatus: privacyStatus ?? undefined
    });
    if (stderr) {
      console.error(`[UPLOAD][YOUTUBE] STDERR ${stderr}`);
    }
    if (stdout) {
      console.log(stdout);
    }
    const payload = stdout ? extractJsonPayload(stdout) : null;
    if (!payload) {
      return NextResponse.json({ message: "업로드 대상 없음" });
    }
    if (payload.ok === false) {
      const message =
        typeof payload.error === "string" ? payload.error : "업로드 실패";
      return NextResponse.json({ ok: false, error: message });
    }
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error(`[UPLOAD][YOUTUBE] ERROR ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
