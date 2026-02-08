import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_PATH = path.join(process.cwd(), "storage", "shops", "ads.json");

type PartnerLink = {
  id: string;
  name: string;
  baseUrl: string;
  partnerCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

type AdsConfig = {
  ctaTemplates: string[];
  defaultCategoryImages: Array<{ category: string; imageUrl: string }>;
  partnerLinks: PartnerLink[];
};

const ensureStore = async () => {
  if (!existsSync(DATA_PATH)) {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(
      DATA_PATH,
      JSON.stringify({ ctaTemplates: [], partnerLinks: [] }, null, 2),
      "utf-8"
    );
  }
};

const readStore = async (): Promise<AdsConfig> => {
  await ensureStore();
  const raw = await fs.readFile(DATA_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  return {
    ctaTemplates: Array.isArray(parsed?.ctaTemplates) ? parsed.ctaTemplates : [],
    defaultCategoryImages: Array.isArray(parsed?.defaultCategoryImages)
      ? parsed.defaultCategoryImages
      : [],
    partnerLinks: Array.isArray(parsed?.partnerLinks) ? parsed.partnerLinks : []
  };
};

const writeStore = async (data: AdsConfig) => {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
};

export const GET = async () => {
  try {
    const data = await readStore();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};

export const POST = async (request: Request) => {
  try {
    const payload = (await request.json().catch(() => ({}))) as AdsConfig;
    const data: AdsConfig = {
      ctaTemplates: Array.isArray(payload.ctaTemplates) ? payload.ctaTemplates : [],
    defaultCategoryImages: Array.isArray(payload.defaultCategoryImages)
      ? payload.defaultCategoryImages
      : [],
      partnerLinks: Array.isArray(payload.partnerLinks) ? payload.partnerLinks : []
    };
    await writeStore(data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
