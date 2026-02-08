// 파트너스 링크 생성 테스트
const buildPartnerUrl = (baseUrl, partnerCode, utm) => {
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

// mall-001 데이터로 테스트
const product = {
  baseUrl: "https://link.coupang.com/a/dIC0G8"
};

const mall = {
  partnerCode: "sample_partner",
  utmSource: "youtube",
  utmMedium: "shorts",
  utmCampaign: "mall-001"
};

const utm = {
  source: mall.utmSource,
  medium: mall.utmMedium,
  campaign: mall.utmCampaign
};

const finalLink = buildPartnerUrl(product.baseUrl, mall.partnerCode, utm);

console.log("=== 파트너스 링크 생성 테스트 ===");
console.log("입력:");
console.log("  상품 URL:", product.baseUrl);
console.log("  파트너 코드:", mall.partnerCode);
console.log("  UTM:", utm);
console.log("\n생성된 파트너스 링크:");
console.log(" ", finalLink);
console.log("\n✅ 사용자가 '바로 구매하기' 클릭 시 이 링크로 이동합니다!");
