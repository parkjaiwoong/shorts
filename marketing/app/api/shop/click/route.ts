import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PATH = path.join(process.cwd(), "storage", "logs", "clicks.log");

export const POST = async (request: Request) => {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      mallId?: string;
      productId?: string;
      productName?: string;
      url?: string;
      action?: string;
      referrer?: string;
      userAgent?: string;
    };
    const entry = {
      ...payload,
      timestamp: new Date().toISOString()
    };
    await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.appendFile(LOG_PATH, `${JSON.stringify(entry)}\n`, "utf-8");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
