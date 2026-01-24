import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { nanoid } from "nanoid";
import { createRunId, runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";

export const POST = async (request: Request) => {
  try {
    const body = await request.json();
    const topic = String(body?.topic ?? "").trim();
    const confirmBeforeRender = Boolean(body?.confirmBeforeRender ?? false);
    const mode = body?.mode === "step" ? "step" : "auto";

    if (!topic) {
      return NextResponse.json(
        { error: "주제를 입력하세요." },
        { status: 400 }
      );
    }

    const runId = createRunId();
    const jobId = nanoid();

    void runPipeline(topic, { confirmBeforeRender, runId, jobId, mode }).catch(
      () => null
    );

    return NextResponse.json({
      jobId,
      runId,
      runDir: `/runs/${runId}`
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json({ error: "runId가 필요합니다." }, { status: 400 });
  }

  const publicRoot = path.join(process.cwd(), "public");
  const statusPath = path.join(publicRoot, "runs", runId, "status.json");

  if (!existsSync(statusPath)) {
    return NextResponse.json({ error: "상태를 찾을 수 없습니다." }, { status: 404 });
  }

  const status = JSON.parse(await fs.readFile(statusPath, "utf-8"));
  return NextResponse.json(status);
};
