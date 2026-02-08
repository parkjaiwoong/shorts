/**
 * 이미지 기능 테스트 스크립트
 * - 썸네일 자동
 * - 카테고리 이미지
 * - AI 이미지 생성
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

async function testThumbnail() {
  console.log("\n=== 썸네일 자동 테스트 ===");
  const testUrl = "https://www.coupang.com/vp/products/9327700120";
  
  try {
    const response = await fetch(`${BASE_URL}/api/admin/ads/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: testUrl })
    });
    const payload = await response.json();
    console.log("응답:", JSON.stringify(payload, null, 2));
    if (payload.ok && payload.imageUrl) {
      console.log("✅ 썸네일 자동 성공:", payload.imageUrl);
      return true;
    } else {
      console.log("❌ 썸네일 자동 실패:", payload.error);
      return false;
    }
  } catch (error) {
    console.log("❌ 썸네일 자동 오류:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function testCategoryImage() {
  console.log("\n=== 카테고리 이미지 테스트 ===");
  
  try {
    const response = await fetch(`${BASE_URL}/api/admin/ads/config`, {
      cache: "no-store"
    });
    const payload = await response.json();
    console.log("응답:", JSON.stringify(payload, null, 2));
    
    if (payload.ok && payload.data?.defaultCategoryImages) {
      const images = payload.data.defaultCategoryImages;
      console.log(`✅ 카테고리 이미지 로드 성공: ${images.length}개`);
      images.forEach((img: { category: string; imageUrl: string }) => {
        console.log(`  - ${img.category}: ${img.imageUrl}`);
      });
      return true;
    } else {
      console.log("❌ 카테고리 이미지 로드 실패:", payload.error || "데이터 없음");
      return false;
    }
  } catch (error) {
    console.log("❌ 카테고리 이미지 오류:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function testAiImage() {
  console.log("\n=== AI 이미지 생성 테스트 ===");
  
  const testProductId = `test-${Date.now()}`;
  const testPrompt = "헬스/피트니스 대표 이미지, 깔끔한 스튜디오 제품 사진, 고품질";
  
  try {
    const response = await fetch(`${BASE_URL}/api/admin/ads/image-gen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: testProductId,
        prompt: testPrompt
      })
    });
    const payload = await response.json();
    console.log("응답:", JSON.stringify(payload, null, 2));
    
    if (payload.ok && payload.imageUrl) {
      console.log("✅ AI 이미지 생성 성공:", payload.imageUrl);
      return true;
    } else {
      console.log("❌ AI 이미지 생성 실패:", payload.error);
      return false;
    }
  } catch (error) {
    console.log("❌ AI 이미지 생성 오류:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function main() {
  console.log("이미지 기능 테스트 시작...");
  console.log(`Base URL: ${BASE_URL}`);
  
  const results = {
    thumbnail: await testThumbnail(),
    category: await testCategoryImage(),
    ai: await testAiImage()
  };
  
  console.log("\n=== 테스트 결과 요약 ===");
  console.log(`썸네일 자동: ${results.thumbnail ? "✅ 성공" : "❌ 실패"}`);
  console.log(`카테고리 이미지: ${results.category ? "✅ 성공" : "❌ 실패"}`);
  console.log(`AI 이미지 생성: ${results.ai ? "✅ 성공" : "❌ 실패"}`);
  
  const allPassed = Object.values(results).every((r) => r);
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
