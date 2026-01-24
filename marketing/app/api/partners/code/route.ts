import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";

export const runtime = "nodejs";

export const GET = async () => {
  const filePath = path.join(process.cwd(), "scripts", "yt_downloader.py");
  const code = await fs.readFile(filePath, "utf-8");
  return NextResponse.json({ code });
};
