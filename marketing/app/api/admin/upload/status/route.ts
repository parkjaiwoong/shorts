import { NextResponse } from "next/server";

import { readSchedulerLastRun, readUploadLogs } from "@/lib/uploader/uploadLogReader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async () => {
  const logs = await readUploadLogs(50);
  const successCount = logs.filter((log) => log.result === "SUCCESS").length;
  const failedCount = logs.filter((log) => log.result === "FAILED").length;
  const lastRunAt = await readSchedulerLastRun();

  return NextResponse.json({
    ok: true,
    lastRunAt,
    successCount,
    failedCount,
    totalCount: logs.length
  });
};
