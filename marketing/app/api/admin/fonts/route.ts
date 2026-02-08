import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FONT_DIR = "C:/Windows/Fonts";
const FONT_EXT = [".ttf", ".otf", ".ttc"];

export const GET = async () => {
  try {
    if (!existsSync(FONT_DIR)) {
      return NextResponse.json({ ok: true, fonts: [] });
    }
    const entries = await fs.readdir(FONT_DIR);
    const fonts = entries
      .filter((entry) => FONT_EXT.includes(path.extname(entry).toLowerCase()))
      .map((entry) => ({
        name: path.basename(entry, path.extname(entry)),
        path: path.join(FONT_DIR, entry)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ ok: true, fonts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
