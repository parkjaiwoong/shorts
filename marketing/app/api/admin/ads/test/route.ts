import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 이미지 기능 테스트 API
 * GET /api/admin/ads/test
 */
export const GET = async () => {
  const results: Record<string, unknown> = {};

  // 1. 카테고리 이미지 로드 테스트
  try {
    const adsPath = path.join(process.cwd(), "storage", "shops", "ads.json");
    if (existsSync(adsPath)) {
      const raw = await fs.readFile(adsPath, "utf-8");
      const parsed = JSON.parse(raw);
      const images = parsed?.defaultCategoryImages || [];
      results.categoryImages = {
        ok: true,
        count: images.length,
        categories: images.map((img: { category: string }) => img.category),
        sample: images[0] || null
      };
    } else {
      results.categoryImages = { ok: false, error: "ads.json 파일이 없습니다." };
    }
  } catch (error) {
    results.categoryImages = {
      ok: false,
      error: error instanceof Error ? error.message : "알 수 없는 오류"
    };
  }

  // 2. HF_API_TOKEN 확인
  results.hfToken = {
    present: Boolean(process.env.HF_API_TOKEN),
    length: process.env.HF_API_TOKEN?.length || 0
  };

  // 3. HF_IMAGE_MODEL 확인
  results.hfImageModel = {
    model: process.env.HF_IMAGE_MODEL || "stabilityai/stable-diffusion-2-1",
    default: !process.env.HF_IMAGE_MODEL
  };

  // 4. public/shop-images 디렉토리 확인
  try {
    const shopImagesDir = path.join(process.cwd(), "public", "shop-images");
    const exists = existsSync(shopImagesDir);
    results.shopImagesDir = {
      ok: exists,
      path: shopImagesDir,
      writable: exists
    };
  } catch (error) {
    results.shopImagesDir = {
      ok: false,
      error: error instanceof Error ? error.message : "알 수 없는 오류"
    };
  }

  return NextResponse.json({ ok: true, results });
};
