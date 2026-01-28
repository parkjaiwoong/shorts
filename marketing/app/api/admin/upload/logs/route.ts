import { NextResponse } from "next/server";

import { readUploadLogs } from "@/lib/uploader/uploadLogReader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") || "20");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 20;
  const logs = await readUploadLogs(limit);

  return NextResponse.json({ ok: true, logs });
};
