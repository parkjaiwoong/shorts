import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

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

const QUEUE_DIR = path.join(process.cwd(), "storage", "videos", "processed");

const ensureQueueDir = async () => {
  await fs.mkdir(QUEUE_DIR, { recursive: true });
};

const resolveQueuePath = async (fileName: string) => {
  let target = path.join(QUEUE_DIR, fileName);
  if (!existsSync(target)) {
    return target;
  }
  const { name, ext } = path.parse(fileName);
  for (let index = 2; index < 100; index += 1) {
    target = path.join(QUEUE_DIR, `${name}_${index}${ext}`);
    if (!existsSync(target)) {
      return target;
    }
  }
  return path.join(QUEUE_DIR, `${name}_${Date.now()}${ext}`);
};

const stageCustomerVideos = async (customerId: string) => {
  const output = await runPython(["processed_video_api.py", "list"]);
  const payload = JSON.parse(output) as {
    items?: Array<{
      client_id: string;
      processed_path: string;
      raw_filename: string;
      status: string;
    }>;
  };
  const items =
    payload.items?.filter(
      (item) =>
        item.client_id === customerId &&
        item.status === "PROCESSED" &&
        item.processed_path
    ) ?? [];
  if (!items.length) {
    return 0;
  }
  await ensureQueueDir();
  let count = 0;
  for (const item of items) {
    if (!existsSync(item.processed_path)) {
      continue;
    }
    const fileName = path.basename(item.processed_path);
    const target = await resolveQueuePath(fileName);
    await fs.copyFile(item.processed_path, target);
    count += 1;
  }
  return count;
};

export const POST = async (request: Request) => {
  const payload = (await request.json().catch(() => ({}))) as {
    customerId?: string;
  };
  if (payload.customerId) {
    try {
      await stageCustomerVideos(payload.customerId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }
  const batPath = path.join(process.cwd(), "run_upload_worker.bat");
  if (!existsSync(batPath)) {
    return NextResponse.json(
      { ok: false, error: "run_upload_worker.bat not found" },
      { status: 404 }
    );
  }

  const child = spawn("cmd", ["/c", batPath], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore"
  });
  child.unref();

  return NextResponse.json({ ok: true, started: true });
};
