/**
 * 네이버 이미지 검색을 통해 카테고리별 대표 이미지 다운로드
 */

import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

const ADS_JSON_PATH = path.join(process.cwd(), "storage", "shops", "ads.json");
const CATEGORY_IMAGES_DIR = path.join(process.cwd(), "public", "shop", "category-images");

interface CategoryImage {
  category: string;
  imageUrl: string;
}

interface AdsConfig {
  defaultCategoryImages: CategoryImage[];
  ctaTemplates: string[];
  partnerLinks: unknown[];
}

/**
 * 카테고리명을 파일명으로 변환 (특수문자 제거)
 */
function sanitizeFileName(category: string): string {
  return category
    .replace(/\//g, "-") // 슬래시를 하이픈으로
    .replace(/[^\w가-힣-]/g, "") // 영문, 한글, 하이픈만 유지
    .trim();
}

/**
 * 네이버 이미지 검색에서 이미지 URL 추출
 */
async function searchNaverImage(query: string): Promise<string | null> {
  try {
    const searchUrl = `https://search.naver.com/search.naver?where=image&query=${encodeURIComponent(query)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://www.naver.com/"
      }
    });

    if (!response.ok) {
      console.error(`네이버 검색 실패 (${response.status}): ${query}`);
      return null;
    }

    const html = await response.text();
    
    // 네이버 이미지 검색 결과에서 이미지 URL 추출
    // 네이버는 JSON-LD나 data 속성에 이미지 URL을 포함
    const patterns = [
      // data-lazy-src 속성
      /data-lazy-src="([^"]+)"/gi,
      // _imageUrl 속성
      /"_imageUrl":"([^"]+)"/gi,
      // img 태그의 src
      /<img[^>]+src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi,
      // background-image URL
      /background-image:\s*url\(["']?([^"')]+\.(?:jpg|jpeg|png|webp)[^"')]*)["']?\)/gi
    ];

    for (const pattern of patterns) {
      const matches = Array.from(html.matchAll(pattern));
      for (const match of matches) {
        const imageUrl = match[1];
        // 유효한 이미지 URL인지 확인
        if (
          imageUrl &&
          (imageUrl.includes("naver") || imageUrl.includes("postfiles") || imageUrl.startsWith("http"))
        ) {
          // 썸네일이 아닌 원본 이미지 URL 필터링
          if (!imageUrl.includes("thumb") && !imageUrl.includes("thumbnail")) {
            return imageUrl;
          }
        }
      }
    }

    // 첫 번째 이미지라도 반환
    const firstMatch = html.match(/https:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/i);
    if (firstMatch) {
      return firstMatch[0];
    }

    return null;
  } catch (error) {
    console.error(`네이버 이미지 검색 오류 (${query}):`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * 이미지 다운로드 및 저장
 */
async function downloadImage(imageUrl: string, filePath: string): Promise<boolean> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://search.naver.com/"
      }
    });

    if (!response.ok) {
      console.error(`이미지 다운로드 실패 (${response.status}): ${imageUrl}`);
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 디렉토리 생성
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // 파일 저장
    await fs.writeFile(filePath, buffer);

    return true;
  } catch (error) {
    console.error(`이미지 다운로드 오류 (${imageUrl}):`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * 파일 확장자 자동 감지
 */
function detectExtension(imageUrl: string): string {
  const urlLower = imageUrl.toLowerCase();
  if (urlLower.includes(".jpg") || urlLower.includes(".jpeg")) return "jpg";
  if (urlLower.includes(".png")) return "png";
  if (urlLower.includes(".webp")) return "webp";
  if (urlLower.includes(".gif")) return "gif";
  return "jpg"; // 기본값
}

/**
 * 메인 함수
 */
async function main() {
  console.log("=== 카테고리 이미지 다운로드 시작 ===\n");

  // ads.json 읽기
  if (!existsSync(ADS_JSON_PATH)) {
    console.error(`ads.json 파일을 찾을 수 없습니다: ${ADS_JSON_PATH}`);
    process.exit(1);
  }

  const adsContent = await fs.readFile(ADS_JSON_PATH, "utf-8");
  const adsConfig: AdsConfig = JSON.parse(adsContent);

  if (!adsConfig.defaultCategoryImages || adsConfig.defaultCategoryImages.length === 0) {
    console.error("카테고리 이미지가 없습니다.");
    process.exit(1);
  }

  console.log(`총 ${adsConfig.defaultCategoryImages.length}개 카테고리 처리 시작...\n`);

  const results: Array<{ category: string; success: boolean; localPath?: string; error?: string }> = [];

  // 각 카테고리별로 이미지 다운로드
  for (const categoryImage of adsConfig.defaultCategoryImages) {
    const { category } = categoryImage;
    console.log(`[${category}] 처리 중...`);

    try {
      // 검색어 생성 (슬래시 제거)
      const searchQuery = category.replace(/\//g, " ");
      console.log(`  검색어: ${searchQuery}`);

      // 네이버 이미지 검색
      const imageUrl = await searchNaverImage(searchQuery);

      if (!imageUrl) {
        console.log(`  ❌ 이미지를 찾을 수 없습니다.`);
        results.push({ category, success: false, error: "이미지를 찾을 수 없습니다" });
        continue;
      }

      console.log(`  이미지 URL 발견: ${imageUrl.substring(0, 80)}...`);

      // 파일명 생성
      const fileName = `${sanitizeFileName(category)}.${detectExtension(imageUrl)}`;
      const filePath = path.join(CATEGORY_IMAGES_DIR, fileName);
      const publicPath = `/shop/category-images/${fileName}`;

      // 이미지 다운로드
      const success = await downloadImage(imageUrl, filePath);

      if (success) {
        console.log(`  ✅ 다운로드 완료: ${publicPath}`);
        results.push({ category, success: true, localPath: publicPath });
      } else {
        console.log(`  ❌ 다운로드 실패`);
        results.push({ category, success: false, error: "다운로드 실패" });
      }
    } catch (error) {
      console.error(`  ❌ 오류:`, error instanceof Error ? error.message : String(error));
      results.push({
        category,
        success: false,
        error: error instanceof Error ? error.message : "알 수 없는 오류"
      });
    }

    console.log(""); // 빈 줄
  }

  // 결과 요약
  console.log("=== 다운로드 결과 ===");
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  console.log(`성공: ${successCount}개`);
  console.log(`실패: ${failCount}개\n`);

  // 성공한 항목들의 ads.json 업데이트
  const updatedImages = adsConfig.defaultCategoryImages.map((item) => {
    const result = results.find((r) => r.category === item.category);
    if (result?.success && result.localPath) {
      return { ...item, imageUrl: result.localPath };
    }
    return item; // 실패한 경우 기존 URL 유지
  });

  // ads.json 업데이트
  const updatedConfig: AdsConfig = {
    ...adsConfig,
    defaultCategoryImages: updatedImages
  };

  await fs.writeFile(ADS_JSON_PATH, JSON.stringify(updatedConfig, null, 2), "utf-8");
  console.log("✅ ads.json 업데이트 완료");

  // 상세 결과 출력
  console.log("\n=== 상세 결과 ===");
  results.forEach((result) => {
    if (result.success) {
      console.log(`✅ ${result.category}: ${result.localPath}`);
    } else {
      console.log(`❌ ${result.category}: ${result.error || "실패"}`);
    }
  });

  if (failCount > 0) {
    console.log(`\n⚠️  ${failCount}개 항목이 실패했습니다. 수동으로 확인해주세요.`);
    process.exit(1);
  } else {
    console.log("\n✅ 모든 이미지 다운로드 완료!");
  }
}

main().catch((error) => {
  console.error("치명적 오류:", error);
  process.exit(1);
});
