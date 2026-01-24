import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMPORTS_DIR = path.join(process.cwd(), "storage", "imports");

const isMp4 = (filename: string) => filename.toLowerCase().endsWith(".mp4");

export const GET = async () => {
  try {
    if (!existsSync(IMPORTS_DIR)) {
      return NextResponse.json(
        { ok: false, error: "imports 폴더를 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    const entries = await fs.readdir(IMPORTS_DIR, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && isMp4(entry.name))
        .map(async (entry) => {
          const fullPath = path.join(IMPORTS_DIR, entry.name);
          const stat = await fs.stat(fullPath);
          return {
            name: entry.name,
            fullPath,
            size: stat.size,
            createdAt: stat.birthtime.toISOString()
          };
        })
    );
    return NextResponse.json({ ok: true, files });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
