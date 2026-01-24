import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";

export const POST = async (request: Request) => {
  try {
    const body = await request.json();
    const runId = String(body?.runId ?? "").trim();

    if (!runId) {
      return NextResponse.json({ error: "runId가 필요합니다." }, { status: 400 });
    }

    const publicRoot = path.join(process.cwd(), "public");
    const statusPath = path.join(publicRoot, "runs", runId, "status.json");

    if (!existsSync(statusPath)) {
      return NextResponse.json({ error: "상태를 찾을 수 없습니다." }, { status: 404 });
    }

    const status = JSON.parse(await fs.readFile(statusPath, "utf-8"));
    const topic = status?.topic;
    const jobId = status?.jobId;

    if (!topic || !jobId) {
      return NextResponse.json({ error: "상태 정보가 불완전합니다." }, { status: 400 });
    }

    void runPipeline(topic, { confirmBeforeRender: false, runId, jobId }).catch(
      () => null
    );

    return NextResponse.json({ ok: true, runId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
