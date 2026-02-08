# iframe 임베드 가이드

## 📋 개요

우리 쇼핑몰 페이지(`/shop`)를 다른 웹사이트에 iframe으로 임베드하는 방법입니다.

## ✅ 가능 여부

**기술적으로 가능합니다!** 다만 몇 가지 설정이 필요합니다.

### 현재 상태
- Next.js 기본 설정에서는 iframe 임베드가 **차단되지 않음**
- 쇼핑몰 페이지는 iframe으로 표시 가능
- 단, 보안 헤더 설정이 필요할 수 있음

## 🔧 설정 방법

### 1. Next.js 설정 (next.config.mjs)

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // 쇼핑몰 페이지만 iframe 허용
        source: '/shop/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN' // 또는 'ALLOWALL' (보안 주의)
          },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://your-domain.com https://*.your-domain.com"
          }
        ],
      },
    ];
  },
};

export default nextConfig;
```

### 2. 쇼핑몰 레이아웃 수정 (선택사항)

`app/shop/layout.tsx`에 메타 태그 추가:

```tsx
export const metadata = {
  title: "광고 쇼핑몰",
  description: "유튜브·틱톡에서 들어오는 전용 쇼핑몰 페이지",
  other: {
    'X-Frame-Options': 'SAMEORIGIN',
  }
};
```

## 📝 사용 예시

### 다른 웹사이트에서 iframe으로 임베드

```html
<!DOCTYPE html>
<html>
<head>
  <title>내 웹사이트</title>
</head>
<body>
  <h1>쇼핑몰 미리보기</h1>
  
  <!-- iframe으로 쇼핑몰 임베드 -->
  <iframe 
    src="http://localhost:3000/shop/mall-001"
    width="100%"
    height="800px"
    frameborder="0"
    allowfullscreen
    style="border: 1px solid #ccc; border-radius: 8px;"
  ></iframe>
</body>
</html>
```

### 반응형 iframe

```html
<div style="position: relative; width: 100%; padding-bottom: 100%; height: 0; overflow: hidden;">
  <iframe 
    src="http://localhost:3000/shop/mall-001"
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
    allowfullscreen
  ></iframe>
</div>
```

## ⚠️ 주의사항

### 1. 보안 고려사항

**X-Frame-Options 설정:**
- `SAMEORIGIN`: 같은 도메인에서만 iframe 허용 (권장)
- `ALLOWALL`: 모든 도메인에서 허용 (보안 위험)
- `DENY`: iframe 완전 차단

**Content-Security-Policy:**
- 특정 도메인만 허용하도록 설정 권장
- 예: `frame-ancestors 'self' https://trusted-domain.com`

### 2. 외부 쇼핑몰(쿠팡) iframe 제한

**중요:** 쿠팡 등 외부 쇼핑몰은 iframe 차단 정책이 있습니다.

```
❌ 불가능: iframe으로 쿠팡 상품 페이지 직접 표시
✅ 가능: 우리 쇼핑몰 페이지를 iframe으로 표시
   → 사용자가 "바로 구매하기" 클릭 시 새 창에서 쿠팡으로 이동
```

### 3. 파트너스 링크 동작

iframe 내에서도 파트너스 링크는 정상 작동합니다:

```tsx
// ProductCard.tsx
<a
  href={link}              // 파트너스 링크
  target="_blank"          // ← 새 창에서 열림 (iframe 밖으로)
  rel="noreferrer"
>
  바로 구매하기 →
</a>
```

**동작:**
1. iframe 내에서 "바로 구매하기" 클릭
2. `target="_blank"`로 인해 새 창/탭에서 열림
3. 파트너스 링크로 쿠팡 이동
4. 파트너 추적 정상 작동

## 🎯 실제 사용 시나리오

### 시나리오 1: 블로그에 임베드

```html
<!-- 블로그 포스트 -->
<article>
  <h2>추천 헬스용품</h2>
  <p>아래 쇼핑몰에서 확인하세요:</p>
  
  <iframe 
    src="https://your-domain.com/shop/mall-001"
    width="100%"
    height="600px"
    style="border: 1px solid #ddd; border-radius: 8px;"
  ></iframe>
</article>
```

### 시나리오 2: 랜딩 페이지에 임베드

```html
<!DOCTYPE html>
<html>
<head>
  <title>프로모션 페이지</title>
  <style>
    .shop-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    .shop-iframe {
      width: 100%;
      height: 800px;
      border: 2px solid #2563eb;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
  </style>
</head>
<body>
  <div class="shop-container">
    <h1>특별 할인 상품</h1>
    <iframe 
      class="shop-iframe"
      src="https://your-domain.com/shop/mall-001"
      allowfullscreen
    ></iframe>
  </div>
</body>
</html>
```

### 시나리오 3: 모바일 앱 WebView

```javascript
// React Native 예시
import { WebView } from 'react-native-webview';

function ShopScreen() {
  return (
    <WebView
      source={{ uri: 'https://your-domain.com/shop/mall-001' }}
      style={{ flex: 1 }}
      allowsFullscreenVideo
      javaScriptEnabled
    />
  );
}
```

## 🔍 테스트 방법

### 1. 로컬 테스트

```html
<!-- test-iframe.html -->
<!DOCTYPE html>
<html>
<head>
  <title>iframe 테스트</title>
</head>
<body>
  <h1>iframe 테스트</h1>
  <iframe 
    src="http://localhost:3000/shop/mall-001"
    width="100%"
    height="600px"
    style="border: 2px solid red;"
  ></iframe>
</body>
</html>
```

브라우저에서 `test-iframe.html` 파일을 열어 확인

### 2. 콘솔에서 확인

브라우저 개발자 도구 콘솔에서:

```javascript
// iframe이 로드되었는지 확인
const iframe = document.querySelector('iframe');
console.log('iframe src:', iframe?.src);
console.log('iframe contentWindow:', iframe?.contentWindow);
```

## 🚀 구현 단계

### Step 1: next.config.mjs 수정

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/shop/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN' // 또는 특정 도메인만 허용
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

### Step 2: 테스트

1. `npm run dev` 재시작
2. 테스트 HTML 파일 생성
3. 브라우저에서 iframe 로드 확인

### Step 3: 프로덕션 배포

프로덕션 환경에서도 동일하게 작동하는지 확인

## 📊 장단점

### 장점
- ✅ 다른 웹사이트에 쉽게 통합 가능
- ✅ 별도 페이지 이동 없이 쇼핑몰 표시
- ✅ 파트너스 링크 정상 작동 (새 창에서 열림)
- ✅ UTM 로깅 정상 작동

### 단점
- ⚠️ 보안 설정 필요 (X-Frame-Options)
- ⚠️ 모바일에서 스크롤 이슈 가능
- ⚠️ SEO에 불리할 수 있음 (iframe 내용은 크롤링 어려움)

## 💡 대안

### 1. 새 창으로 열기 (현재 방식)

```tsx
// 현재 구현된 방식
<a href="/shop/mall-001" target="_blank">
  쇼핑몰 보기
</a>
```

**장점:** 간단하고 안전  
**단점:** 페이지 이동 필요

### 2. 팝업 모달

```tsx
// 모달로 쇼핑몰 표시
<Modal>
  <iframe src="/shop/mall-001" />
</Modal>
```

**장점:** 페이지 이동 없음  
**단점:** 구현 복잡도 증가

### 3. API로 데이터 가져와서 표시

```tsx
// API로 상품 데이터만 가져와서 표시
const products = await fetch('/api/shop/mall-001');
// 커스텀 UI로 표시
```

**장점:** 완전한 커스터마이징 가능  
**단점:** 개발 시간 증가

## 🎉 결론

**iframe 임베드는 가능하며, 다음과 같이 사용할 수 있습니다:**

1. ✅ 우리 쇼핑몰 페이지(`/shop`)는 iframe으로 표시 가능
2. ✅ 파트너스 링크는 `target="_blank"`로 새 창에서 열려 정상 작동
3. ✅ 보안 설정(`X-Frame-Options`)만 추가하면 완료

**권장 사용:**
- 블로그 임베드
- 랜딩 페이지 통합
- 모바일 앱 WebView

**주의사항:**
- 보안 헤더 설정 필수
- 특정 도메인만 허용하도록 제한 권장
