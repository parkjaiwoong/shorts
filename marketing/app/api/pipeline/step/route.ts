import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { runPipeline } from "@/lib/pipeline";

const STEP_ORDER = ["script", "images", "narration", "thumbnail", "render"];

export const runtime = "nodejs";

export const POST = async (request: Request) => {
  try {
    const body = await request.json();
    const runId = String(body?.runId ?? "").trim();
    const action = String(body?.action ?? "next");
    const step = String(body?.step ?? "");

    if (!runId) {
      return NextResponse.json({ error: "runId가 필요합니다." }, { status: 400 });
    }

    const publicRoot = path.join(process.cwd(), "public");
    const runRoot = path.join(publicRoot, "runs", runId);
    const statusPath = path.join(runRoot, "status.json");

    if (!existsSync(statusPath)) {
      return NextResponse.json({ error: "상태를 찾을 수 없습니다." }, { status: 404 });
    }

    const status = JSON.parse(await fs.readFile(statusPath, "utf-8"));
    const topic = status?.topic;
    const jobId = status?.jobId;

    if (!topic || !jobId) {
      return NextResponse.json({ error: "상태 정보가 불완전합니다." }, { status: 400 });
    }

    if (action === "rerun") {
      if (!STEP_ORDER.includes(step)) {
        return NextResponse.json({ error: "step이 필요합니다." }, { status: 400 });
      }
      await resetFromStep(runRoot, statusPath, status, step);
    }

    void runPipeline(topic, {
      confirmBeforeRender: false,
      runId,
      jobId,
      mode: "step"
    }).catch(() => null);

    return NextResponse.json({ ok: true, runId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

const resetFromStep = async (
  runRoot: string,
  statusPath: string,
  status: Record<string, unknown>,
  step: string
) => {
  const outputRoot = path.join(runRoot, "output");
  const imagesRoot = path.join(outputRoot, "images");
  const audioRoot = path.join(outputRoot, "audio");
  const scriptJson = path.join(outputRoot, "script.json");
  const thumbnailPath = path.join(outputRoot, "thumbnail.png");
  const finalVideo = path.join(outputRoot, "final.mp4");

  const cleanupMap: Record<string, string[]> = {
    script: [scriptJson],
    images: [imagesRoot],
    narration: [audioRoot],
    thumbnail: [thumbnailPath],
    render: [finalVideo]
  };

  const startIndex = STEP_ORDER.indexOf(step);
  const targets = STEP_ORDER.slice(startIndex).flatMap(
    (item) => cleanupMap[item] ?? []
  );

  for (const target of targets) {
    if (existsSync(target)) {
      await fs.rm(target, { recursive: true, force: true });
    }
  }

  const resetSteps: Record<string, { state: string }> = {};
  STEP_ORDER.slice(startIndex).forEach((item) => {
    resetSteps[item] = { state: "pending" };
  });

  const next = {
    ...status,
    stage: "awaiting_step",
    waitingStep: step,
    steps: {
      ...(status as { steps?: Record<string, unknown> }).steps,
      ...resetSteps
    },
    updatedAt: new Date().toISOString()
  };

  await fs.writeFile(statusPath, JSON.stringify(next, null, 2));
};
