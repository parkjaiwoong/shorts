import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = async () => {
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
