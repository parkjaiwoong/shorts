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

export const GET = async () => {
  try {
    const data = await readStore();
    return NextResponse.json({ ok: true, malls: data.malls });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};

export const POST = async (request: Request) => {
  try {
    const payload = (await request.json().catch(() => ({}))) as Mall;
    if (!payload.id || !payload.name) {
      return NextResponse.json(
        { ok: false, error: "id and name are required" },
        { status: 400 }
      );
    }
    const data = await readStore();
    if (data.malls.find((mall) => mall.id === payload.id)) {
      return NextResponse.json({ ok: false, error: "id already exists" }, { status: 400 });
    }
    const next: Mall = {
      id: payload.id,
      name: payload.name,
      description: payload.description || "",
      partnerCode: payload.partnerCode || "",
      utmSource: payload.utmSource || "",
      utmMedium: payload.utmMedium || "",
      utmCampaign: payload.utmCampaign || "",
      products: Array.isArray(payload.products) ? payload.products : []
    };
    data.malls.unshift(next);
    await writeStore(data);
    return NextResponse.json({ ok: true, mall: next });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
