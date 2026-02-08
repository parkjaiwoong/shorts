# 파트너스 링크 시스템 상세 가이드

## 📋 목차
1. [시스템 개요](#시스템-개요)
2. [데이터 구조](#데이터-구조)
3. [설정 방법](#설정-방법)
4. [링크 생성 로직](#링크-생성-로직)
5. [사용자 화면 흐름](#사용자-화면-흐름)
6. [실제 예시](#실제-예시)

---

## 🎯 시스템 개요

파트너스 링크 시스템은 **제휴 마케팅(Affiliate Marketing)**을 위한 자동 링크 생성 시스템입니다.

### 주요 구성 요소

```
┌─────────────────────────────────────────────────────────┐
│  관리자 설정 (Admin)                                    │
├─────────────────────────────────────────────────────────┤
│  1. 광고/링크 페이지 (/admin-lab/ads)                    │
│     - 파트너스 기본 정보 설정                            │
│     - 저장: storage/shops/ads.json                       │
│                                                          │
│  2. 쇼핑몰 관리 페이지 (/admin-lab/ads/mall)            │
│     - 쇼핑몰별 파트너 코드 설정                          │
│     - 상품별 기본 URL 설정                               │
│     - 저장: storage/shops/malls.json                    │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  자동 링크 생성 (buildPartnerUrl 함수)                   │
├─────────────────────────────────────────────────────────┤
│  상품 URL + 파트너 코드 + UTM 파라미터 결합             │
│  → 최종 파트너스 링크 생성                               │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  사용자 화면 (Public Shop)                              │
├─────────────────────────────────────────────────────────┤
│  /shop/[mallId] - 쇼핑몰 상품 목록                      │
│  - 상품 카드 클릭                                        │
│  - 자동 생성된 파트너스 링크로 이동                       │
│  - 클릭 로그 수집 (storage/logs/clicks.log)            │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 데이터 구조

### 1. 광고/링크 설정 (`storage/shops/ads.json`)

```json
{
  "ctaTemplates": ["지금 문의하세요", "무료 상담 가능합니다"],
  "partnerLinks": [
    {
      "id": "coupang-default",
      "name": "쿠팡 파트너스",
      "baseUrl": "https://link.coupang.com/a/dCPclr",
      "partnerCode": "AF5409541",
      "utmSource": "youtube",
      "utmMedium": "shorts",
      "utmCampaign": "default"
    }
  ]
}
```

**설명:**
- `partnerLinks`: 파트너스 기본 정보 (현재는 참고용, 실제 사용은 쇼핑몰별 설정 사용)
- `ctaTemplates`: CTA 문구 템플릿

### 2. 쇼핑몰 설정 (`storage/shops/malls.json`)

```json
{
  "malls": [
    {
      "id": "mall-001",
      "name": "샘플 쇼핑몰 A",
      "description": "영상에서 소개된 인기 상품 모음",
      "partnerCode": "AF5409541",        // 쇼핑몰별 파트너 코드
      "utmSource": "youtube",            // UTM 소스
      "utmMedium": "shorts",             // UTM 미디엄
      "utmCampaign": "mall-001",         // UTM 캠페인
      "products": [
        {
          "id": "p-001",
          "name": "샘플 상품 1",
          "imageUrl": "https://...",
          "baseUrl": "https://link.coupang.com/a/dIC0G8",  // 상품 기본 URL
          "category": "헬스/피트니스"
        }
      ]
    }
  ]
}
```

**설명:**
- `mall.partnerCode`: 해당 쇼핑몰의 파트너 코드 (모든 상품에 공통 적용)
- `mall.utmSource/Medium/Campaign`: UTM 추적 파라미터
- `product.baseUrl`: 각 상품의 기본 URL (파트너스 링크가 아닌 일반 URL)

---

## ⚙️ 설정 방법

### Step 1: 광고/링크 페이지에서 파트너스 정보 입력

**경로:** `/admin-lab/ads`

1. **파트너 링크 추가** 버튼 클릭
2. 다음 정보 입력:
   ```
   이름: 쿠팡 파트너스
   기본 URL: https://link.coupang.com/a/dCPclr
   파트너 코드: AF5409541
   UTM Source: youtube
   UTM Medium: shorts
   UTM Campaign: default
   ```
3. **저장** 버튼 클릭
   - → `storage/shops/ads.json`에 저장됨

**참고:** 이 설정은 참고용이며, 실제 파트너스 링크 생성에는 쇼핑몰별 설정이 사용됩니다.

### Step 2: 쇼핑몰 관리에서 쇼핑몰별 설정

**경로:** `/admin-lab/ads/mall`

#### 2-1. 쇼핑몰 생성 및 파트너 코드 설정

1. **신규 쇼핑몰 추가** 섹션에서:
   ```
   쇼핑몰 ID: mall-001
   쇼핑몰 이름: 헬스용품 전문몰
   설명: 운동용품 전문 쇼핑몰
   파트너 코드: AF5409541        ← 중요!
   UTM Source: youtube
   UTM Medium: shorts
   UTM Campaign: mall-001
   ```
2. **쇼핑몰 추가** 버튼 클릭

#### 2-2. 상품 추가 및 기본 URL 설정

1. 생성된 쇼핑몰의 **상품 추가** 버튼 클릭
2. 상품 정보 입력:
   ```
   상품명: 덤벨 세트
   카테고리: 헬스/피트니스
   이미지 URL: https://...
   상품 URL: https://link.coupang.com/a/dIC0G8  ← 중요! (파트너스 링크 아님)
   ```
3. **저장** 버튼 클릭

**중요:** 
- `상품 URL`은 파트너스 링크가 **아닌** 일반 상품 URL입니다.
- 시스템이 자동으로 파트너 코드와 UTM을 추가하여 최종 파트너스 링크를 생성합니다.

---

## 🔗 링크 생성 로직

### 코드 위치: `app/shop/data.ts`

```typescript
export const buildPartnerUrl = (
  baseUrl: string,              // 상품의 기본 URL
  partnerCode?: string,         // 쇼핑몰의 파트너 코드
  utm?: {                       // UTM 파라미터
    source?: string;
    medium?: string;
    campaign?: string;
  }
) => {
  try {
    const url = new URL(baseUrl);
    
    // 1. 파트너 코드 추가 (쿠팡의 경우 subId 파라미터)
    if (partnerCode) {
      url.searchParams.set("subId", partnerCode);
    }
    
    // 2. UTM 파라미터 추가
    if (utm?.source) url.searchParams.set("utm_source", utm.source);
    if (utm?.medium) url.searchParams.set("utm_medium", utm.medium);
    if (utm?.campaign) url.searchParams.set("utm_campaign", utm.campaign);
    
    return url.toString();
  } catch {
    return baseUrl;  // URL 파싱 실패 시 원본 반환
  }
};
```

### 생성 과정 예시

**입력:**
- `baseUrl`: `https://link.coupang.com/a/dIC0G8`
- `partnerCode`: `AF5409541`
- `utm`: `{ source: "youtube", medium: "shorts", campaign: "mall-001" }`

**처리 과정:**
```
1. URL 객체 생성
   → https://link.coupang.com/a/dIC0G8

2. 파트너 코드 추가
   → https://link.coupang.com/a/dIC0G8?subId=AF5409541

3. UTM 파라미터 추가
   → https://link.coupang.com/a/dIC0G8?subId=AF5409541&utm_source=youtube&utm_medium=shorts&utm_campaign=mall-001
```

**최종 결과:**
```
https://link.coupang.com/a/dIC0G8?subId=AF5409541&utm_source=youtube&utm_medium=shorts&utm_campaign=mall-001
```

---

## 👥 사용자 화면 흐름

### 1. 쇼핑몰 목록 페이지 (`/shop`)

```
사용자가 접속
  ↓
쇼핑몰 목록 표시 (malls.json에서 로드)
  ↓
쇼핑몰 카드 클릭
  ↓
/shop/[mallId] 페이지로 이동
```

### 2. 쇼핑몰 상품 페이지 (`/shop/[mallId]`)

**코드 위치:** `app/shop/[mallId]/page.tsx`

```typescript
// 1. 쇼핑몰 데이터 로드
const malls = await readMalls();
const mall = malls.find((item) => item.id === params.mallId);

// 2. UTM 파라미터 준비
const utm = {
  source: mall.utmSource,      // "youtube"
  medium: mall.utmMedium,      // "shorts"
  campaign: mall.utmCampaign    // "mall-001"
};

// 3. 각 상품에 대해 파트너스 링크 생성
{(mall.products || []).map((product) => {
  const link = buildPartnerUrl(
    product.baseUrl,           // 상품 기본 URL
    mall.partnerCode,          // 쇼핑몰 파트너 코드
    utm                        // UTM 파라미터
  );
  
  return <ProductCard product={product} link={link} />;
})}
```

### 3. 상품 카드 클릭 (`ProductCard.tsx`)

**코드 위치:** `app/shop/ProductCard.tsx`

```typescript
// 사용자가 상품 카드 클릭 시
<a
  href={link}              // 자동 생성된 파트너스 링크
  target="_blank"
  rel="noreferrer"
  onClick={handleClick}   // 클릭 로그 수집
>
  {/* 상품 카드 UI */}
</a>

// 클릭 로그 수집
const handleClick = () => {
  fetch("/api/shop/click", {
    method: "POST",
    body: JSON.stringify({
      mallId,
      productId: product.id,
      productName: product.name,
      url: link,              // 실제 이동한 파트너스 링크
      action: "click",
      referrer: document.referrer,
      userAgent: navigator.userAgent
    })
  });
};
```

### 4. 클릭 로그 저장

**API:** `app/api/shop/click/route.ts`

```typescript
// storage/logs/clicks.log에 저장
{
  "mallId": "mall-001",
  "productId": "p-001",
  "productName": "덤벨 세트",
  "url": "https://link.coupang.com/a/dIC0G8?subId=AF5409541&utm_source=youtube&utm_medium=shorts&utm_campaign=mall-001",
  "action": "click",
  "referrer": "https://youtube.com/watch?v=...",
  "userAgent": "Mozilla/5.0...",
  "timestamp": "2026-01-23T12:34:56.789Z"
}
```

### 5. 최종 이동

```
사용자가 "바로 구매하기" 버튼 클릭
  ↓
자동 생성된 파트너스 링크로 이동
  ↓
쿠팡 상품 페이지로 리다이렉트
  ↓
구매 시 파트너 수수료 발생 (쿠팡 파트너스 시스템에서 처리)
```

---

## 📝 실제 예시

### 예시 1: 쿠팡 파트너스 링크

**설정:**
- 쇼핑몰 ID: `mall-001`
- 파트너 코드: `AF5409541`
- 상품 URL: `https://link.coupang.com/a/dIC0G8`
- UTM: `source=youtube, medium=shorts, campaign=mall-001`

**생성된 링크:**
```
https://link.coupang.com/a/dIC0G8?subId=AF5409541&utm_source=youtube&utm_medium=shorts&utm_campaign=mall-001
```

**동작:**
1. 사용자가 상품 카드 클릭
2. 위 링크로 이동
3. 쿠팡이 `subId=AF5409541`을 인식하여 파트너 추적 시작
4. UTM 파라미터로 트래픽 소스 추적
5. 구매 완료 시 파트너 수수료 지급

### 예시 2: 다른 쇼핑몰 (예: 11번가)

**설정:**
- 쇼핑몰 ID: `mall-002`
- 파트너 코드: `11ST_PARTNER_123`
- 상품 URL: `https://www.11st.co.kr/products/1234567890`
- UTM: `source=tiktok, medium=reels, campaign=mall-002`

**생성된 링크:**
```
https://www.11st.co.kr/products/1234567890?partnerId=11ST_PARTNER_123&utm_source=tiktok&utm_medium=reels&utm_campaign=mall-002
```

**참고:** 11번가의 경우 파라미터 이름이 다를 수 있으므로 `buildPartnerUrl` 함수를 수정해야 할 수 있습니다.

---

## 🔍 주요 함수 및 파일 위치

### 1. 파트너스 URL 생성 함수
- **파일:** `app/shop/data.ts`
- **함수:** `buildPartnerUrl(baseUrl, partnerCode, utm)`
- **용도:** 상품 URL + 파트너 코드 + UTM 결합

### 2. 관리자 설정 페이지
- **파일:** `app/admin-lab/ads/page.tsx`
- **경로:** `/admin-lab/ads`
- **기능:** 파트너스 기본 정보 관리

### 3. 쇼핑몰 관리 페이지
- **파일:** `app/admin-lab/ads/mall/page.tsx`
- **경로:** `/admin-lab/ads/mall`
- **기능:** 쇼핑몰별 파트너 코드 및 상품 관리

### 4. 공개 쇼핑몰 페이지
- **파일:** `app/shop/[mallId]/page.tsx`
- **경로:** `/shop/[mallId]`
- **기능:** 상품 목록 표시 및 파트너스 링크 생성

### 5. 상품 카드 컴포넌트
- **파일:** `app/shop/ProductCard.tsx`
- **기능:** 상품 카드 UI 및 클릭 처리

### 6. 클릭 로그 API
- **파일:** `app/api/shop/click/route.ts`
- **경로:** `POST /api/shop/click`
- **기능:** 클릭 이벤트 로깅

### 7. 데이터 저장 위치
- **광고 설정:** `storage/shops/ads.json`
- **쇼핑몰 데이터:** `storage/shops/malls.json`
- **클릭 로그:** `storage/logs/clicks.log`
- **UTM 로그:** `storage/logs/utm.log`

---

## ⚠️ 주의사항

### 1. 파트너 코드 형식
- 쿠팡: `subId` 파라미터 사용
- 다른 쇼핑몰: 파라미터 이름이 다를 수 있음 (예: `partnerId`, `affiliateId`)
- 필요 시 `buildPartnerUrl` 함수 수정 필요

### 2. URL 형식
- `baseUrl`은 반드시 유효한 URL 형식이어야 함
- 상대 경로는 지원하지 않음 (절대 URL만 가능)

### 3. UTM 파라미터
- UTM 파라미터는 선택사항이지만, 트래픽 추적을 위해 권장
- Google Analytics 등에서 활용 가능

### 4. 클릭 로그
- 모든 클릭은 `storage/logs/clicks.log`에 기록됨
- 대용량 트래픽 시 로그 파일 관리 필요

---

## 🚀 확장 가능성

### 1. 여러 파트너사 지원
현재는 쿠팡 위주이지만, 다른 쇼핑몰도 추가 가능:
- 11번가
- G마켓
- 옥션
- 네이버 쇼핑
- 등등

### 2. 동적 파트너 코드
- 사용자별 또는 채널별로 다른 파트너 코드 사용 가능
- A/B 테스트를 위한 여러 파트너 코드 관리

### 3. 실시간 통계
- 클릭 로그를 기반으로 실시간 통계 대시보드 구축 가능
- 상품별, 쇼핑몰별 클릭률 분석

---

## 📞 문제 해결

### Q1: 파트너스 링크가 제대로 생성되지 않아요
**확인 사항:**
1. 쇼핑몰의 `partnerCode`가 설정되어 있는지 확인
2. 상품의 `baseUrl`이 유효한 URL인지 확인
3. 브라우저 콘솔에서 에러 메시지 확인

### Q2: 클릭 로그가 기록되지 않아요
**확인 사항:**
1. `storage/logs` 디렉토리가 존재하는지 확인
2. 파일 쓰기 권한 확인
3. 네트워크 탭에서 API 호출 확인

### Q3: UTM 파라미터가 추가되지 않아요
**확인 사항:**
1. 쇼핑몰 설정에서 UTM 파라미터가 입력되어 있는지 확인
2. `buildPartnerUrl` 함수가 올바르게 호출되는지 확인

---

이 가이드가 파트너스 링크 시스템 이해에 도움이 되길 바랍니다! 🎉
