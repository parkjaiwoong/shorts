import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_PATH = path.join(process.cwd(), "storage", "shops", "malls.json");

type Product = {
  id: string;
  name: string;
  price?: string;
  imageUrl?: string;
  baseUrl: string;
  category?: string;
  coupaIframe?: string;
};

type Mall = {
  id: string;
  name: string;
  description?: string;
  partnerCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  products?: Product[];
};

const ensureStore = async () => {
  if (!existsSync(DATA_PATH)) {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify({ malls: [] }, null, 2), "utf-8");
  }
};

const readStore = async (): Promise<{ malls: Mall[] }> => {
  await ensureStore();
  const raw = await fs.readFile(DATA_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  return {
    malls: Array.isArray(parsed?.malls) ? parsed.malls : []
  };
};

const writeStore = async (data: { malls: Mall[] }) => {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
};

export const PATCH = async (
  request: Request,
  { params }: { params: { mallId: string } }
) => {
  try {
    const payload = (await request.json().catch(() => ({}))) as Partial<Mall>;
    const mallId = params.mallId;
    const data = await readStore();
    const next = data.malls.map((mall) =>
      mall.id === mallId
        ? {
            ...mall,
            name: payload.name ?? mall.name,
            description: payload.description ?? mall.description,
            partnerCode: payload.partnerCode ?? mall.partnerCode,
            utmSource: payload.utmSource ?? mall.utmSource,
            utmMedium: payload.utmMedium ?? mall.utmMedium,
            utmCampaign: payload.utmCampaign ?? mall.utmCampaign,
            products: Array.isArray(payload.products) ? payload.products : mall.products
          }
        : mall
    );
    await writeStore({ malls: next });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};

export const DELETE = async (
  _request: Request,
  { params }: { params: { mallId: string } }
) => {
  try {
    const mallId = params.mallId;
    const data = await readStore();
    const next = data.malls.filter((mall) => mall.id !== mallId);
    await writeStore({ malls: next });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
