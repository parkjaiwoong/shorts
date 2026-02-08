import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export type Product = {
  id: string;
  name: string;
  imageUrl?: string;
  baseUrl: string;
  coupaIframe?: string;
};

export type Mall = {
  id: string;
  name: string;
  description?: string;
  partnerCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  products?: Product[];
};

const DATA_PATH = path.join(process.cwd(), "storage", "shops", "malls.json");

export const readMalls = async (): Promise<Mall[]> => {
  if (!existsSync(DATA_PATH)) {
    return [];
  }
  const raw = await fs.readFile(DATA_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed?.malls) ? parsed.malls : [];
};

export const buildPartnerUrl = (
  baseUrl: string,
  partnerCode?: string,
  utm?: { source?: string; medium?: string; campaign?: string }
) => {
  try {
    const url = new URL(baseUrl);
    if (partnerCode) {
      url.searchParams.set("subId", partnerCode);
    }
    if (utm?.source) url.searchParams.set("utm_source", utm.source);
    if (utm?.medium) url.searchParams.set("utm_medium", utm.medium);
    if (utm?.campaign) url.searchParams.set("utm_campaign", utm.campaign);
    return url.toString();
  } catch {
    return baseUrl;
  }
};
