import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const extractMetaImage = (html: string) => {
  const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (og?.[1]) return og[1];
  const tw = html.match(/name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
  if (tw?.[1]) return tw[1];
  return "";
};

const extractCoupangImage = (html: string) => {
  const candidates = [
    /"imageUrl"\s*:\s*"([^"]+)"/i,
    /"thumbnailImage"\s*:\s*"([^"]+)"/i,
    /"thumbnail"\s*:\s*"([^"]+)"/i,
    /"image"\s*:\s*"([^"]+\.jpg[^"]*)"/i
  ];
  for (const pattern of candidates) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/");
    }
  }
  return "";
};

const findImageUrlFromJson = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") {
    if (value.startsWith("http") && value.match(/\.(jpg|jpeg|png|webp)/i)) {
      return value;
    }
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageUrlFromJson(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const preferredKeys = [
      "imageUrl",
      "image",
      "thumbnailImage",
      "originalImage",
      "imageUrls",
      "images"
    ];
    for (const key of preferredKeys) {
      if (obj[key]) {
        const found = findImageUrlFromJson(obj[key]);
        if (found) return found;
      }
    }
    for (const key of Object.keys(obj)) {
      const found = findImageUrlFromJson(obj[key]);
      if (found) return found;
    }
  }
  return "";
};

const extractCoupangIds = (url: string) => {
  const match = url.match(/\/vp\/products\/(\d+)/);
  if (!match) return null;
  const productId = match[1];
  try {
    const parsed = new URL(url);
    const itemId = parsed.searchParams.get("itemId") || "";
    return { productId, itemId };
  } catch {
    return { productId, itemId: "" };
  }
};

export const POST = async (request: Request) => {
  try {
    const payload = (await request.json().catch(() => ({}))) as { url?: string };
    const url = payload.url?.trim();
    if (!url) {
      return NextResponse.json({ ok: false, error: "url is required" }, { status: 400 });
    }
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"
      }
    });
    if (!response.ok) {
      if (response.status !== 403) {
        return NextResponse.json(
          {
            ok: false,
            error: `fetch failed (${response.status})`,
            status: response.status,
            finalUrl: response.url
          },
          { status: 400 }
        );
      }
    }
    const html = response.ok ? await response.text() : "";
    const finalUrl = response.url || url;
    let imageUrl = extractMetaImage(html) || extractCoupangImage(html);
    if (!imageUrl && finalUrl !== url) {
      const fallbackResponse = await fetch(finalUrl, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"
        }
      });
      if (fallbackResponse.ok) {
        const fallbackHtml = await fallbackResponse.text();
        imageUrl = extractMetaImage(fallbackHtml) || extractCoupangImage(fallbackHtml);
      }
    }
    if (!imageUrl) {
      const jinaUrl = `https://r.jina.ai/http://${finalUrl.replace(/^https?:\/\//, "")}`;
      const jinaResponse = await fetch(jinaUrl, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (jinaResponse.ok) {
        const jinaHtml = await jinaResponse.text();
        imageUrl = extractMetaImage(jinaHtml) || extractCoupangImage(jinaHtml);
      }
    }
    let jsonStatus: number | null = null;
    let jsonUrlTried = "";
    let mobileStatus: number | null = null;
    let mobileUrlTried = "";
    if (!imageUrl) {
      const ids = extractCoupangIds(finalUrl);
      if (ids) {
        const jsonUrl = ids.itemId
          ? `https://m.coupang.com/vm/v1/products/${ids.productId}?itemId=${ids.itemId}`
          : `https://m.coupang.com/vm/v1/products/${ids.productId}`;
        jsonUrlTried = jsonUrl;
        const jsonResponse = await fetch(jsonUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
            Accept: "application/json"
          }
        });
        jsonStatus = jsonResponse.status;
        if (jsonResponse.ok) {
          const json = await jsonResponse.json().catch(() => null);
          imageUrl = findImageUrlFromJson(json);
        }
      }
    }
    if (!imageUrl) {
      const ids = extractCoupangIds(finalUrl);
      if (ids) {
        const mobileUrl = ids.itemId
          ? `https://m.coupang.com/vm/products/${ids.productId}?itemId=${ids.itemId}`
          : `https://m.coupang.com/vm/products/${ids.productId}`;
        mobileUrlTried = mobileUrl;
        const mobileResponse = await fetch(mobileUrl, {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"
          }
        });
        mobileStatus = mobileResponse.status;
        if (mobileResponse.ok) {
          const mobileHtml = await mobileResponse.text();
          imageUrl = extractMetaImage(mobileHtml) || extractCoupangImage(mobileHtml);
        }
      }
    }
    if (!imageUrl) {
      const snippet = html.trim().slice(0, 200);
      return NextResponse.json(
        {
          ok: false,
          error: "og:image not found (coupang detail may block)",
          finalUrl,
          snippet,
          jsonStatus,
          jsonUrl: jsonUrlTried,
          mobileStatus,
          mobileUrl: mobileUrlTried
        },
        { status: 404 }
      );
    }
    if (imageUrl.startsWith("//")) {
      imageUrl = `https:${imageUrl}`;
    } else if (imageUrl.startsWith("/")) {
      const base = new URL(finalUrl || url);
      imageUrl = `${base.origin}${imageUrl}`;
    }
    return NextResponse.json({ ok: true, imageUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
