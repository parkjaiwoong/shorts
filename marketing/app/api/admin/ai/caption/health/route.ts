import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async () => {
  const model =
    process.env.HF_CAPTION_MODEL || "HuggingFaceTB/SmolLM3-3B";
  const token = process.env.HF_API_TOKEN || "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(`https://router.huggingface.co/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "테스트" }],
        stream: false,
        max_tokens: 8
      })
    });
    const body = await response.text().catch(() => "");
    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      model,
      tokenPresent: Boolean(token),
      body: body.trim().slice(0, 400)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message, model, tokenPresent: Boolean(token) },
      { status: 500 }
    );
  }
};
