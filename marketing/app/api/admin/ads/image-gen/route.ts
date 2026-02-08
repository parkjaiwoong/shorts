import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_MODEL =
  process.env.HF_IMAGE_MODEL || "stabilityai/stable-diffusion-2-1";

export const POST = async (request: Request) => {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      productId?: string;
      prompt?: string;
    };
    const productId = payload.productId?.trim();
    const prompt = payload.prompt?.trim();
    if (!productId || !prompt) {
      return NextResponse.json(
        { ok: false, error: "productId and prompt are required" },
        { status: 400 }
      );
    }
    const token = process.env.HF_API_TOKEN || "";
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "HF_API_TOKEN is missing" },
        { status: 400 }
      );
    }
    // Try multiple HuggingFace API endpoints
    let buffer: Buffer | null = null;
    let lastError = "";
    
    const extractImageFromResponse = async (response: Response): Promise<Buffer | null> => {
      const contentType = response.headers.get("content-type") || "";
      
      // Check if response is JSON (base64 encoded image)
      if (contentType.includes("application/json")) {
        try {
          const json = await response.json();
          // Handle different response formats
          if (json.image) {
            // Base64 string
            return Buffer.from(json.image, "base64");
          } else if (json.generated_image) {
            return Buffer.from(json.generated_image, "base64");
          } else if (Array.isArray(json) && json[0]?.image) {
            return Buffer.from(json[0].image, "base64");
          }
        } catch {
          // Not JSON, try as binary
        }
      }
      
      // Try as binary image data
      try {
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > 0) {
          return Buffer.from(arrayBuffer);
        }
      } catch {
        // Failed to read as binary
      }
      
      return null;
    };
    
    // Endpoint 1: router.huggingface.co/inference/models/{model}
    try {
      const response1 = await fetch(
        `https://router.huggingface.co/inference/models/${IMAGE_MODEL}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: { num_inference_steps: 20, guidance_scale: 7 }
          })
        }
      );
      if (response1.ok) {
        const extracted = await extractImageFromResponse(response1);
        if (extracted) {
          buffer = extracted;
        } else {
          lastError = `router/inference: 응답 형식을 파싱할 수 없습니다`;
        }
      } else {
        const text = await response1.text().catch(() => "");
        lastError = `router/inference: ${response1.status} ${text.slice(0, 200)}`;
      }
    } catch (e) {
      lastError = `router/inference: ${e instanceof Error ? e.message : "unknown"}`;
    }
    
    // Endpoint 2: api-inference.huggingface.co/models/{model} (fallback)
    if (!buffer) {
      try {
        const response2 = await fetch(
          `https://api-inference.huggingface.co/models/${IMAGE_MODEL}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              inputs: prompt,
              parameters: { num_inference_steps: 20, guidance_scale: 7 }
            })
          }
        );
        if (response2.ok) {
          const extracted = await extractImageFromResponse(response2);
          if (extracted) {
            buffer = extracted;
          } else {
            const text = await response2.text().catch(() => "");
            lastError = `api-inference: 응답 형식을 파싱할 수 없습니다: ${text.slice(0, 200)}`;
          }
        } else {
          const text = await response2.text().catch(() => "");
          lastError = `api-inference: ${response2.status} ${text.slice(0, 200)}`;
        }
      } catch (e) {
        lastError = `api-inference: ${e instanceof Error ? e.message : "unknown"}`;
      }
    }
    
    if (!buffer) {
      return NextResponse.json(
        { ok: false, error: `hf_error: ${lastError}` },
        { status: 400 }
      );
    }
    const outDir = path.join(process.cwd(), "public", "shop-images");
    await fs.mkdir(outDir, { recursive: true });
    const fileName = `${productId}.png`;
    const outPath = path.join(outDir, fileName);
    await fs.writeFile(outPath, buffer);
    return NextResponse.json({ ok: true, imageUrl: `/shop-images/${fileName}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
