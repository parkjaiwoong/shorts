import { NextResponse } from "next/server";
import { spawn } from "node:child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runPython = (args: string[]) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn("python", args, { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(new Error(`spawn failed: python (${error.code ?? "unknown"})`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `exit ${code ?? 0}`));
      }
    });
  });

const buildCaption = (client: {
  name: string;
  phone?: string;
  location?: string;
  default_cta?: string;
}) => {
  const parts = [client.name];
  if (client.phone) parts.push(client.phone);
  if (client.location) parts.push(client.location);
  if (client.default_cta) parts.push(client.default_cta);
  return parts.join(" · ");
};

const tryHuggingFace = async (prompt: string) => {
  const model =
    process.env.HF_CAPTION_MODEL || "HuggingFaceTB/SmolLM3-3B";
  const token = process.env.HF_API_TOKEN || "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`https://router.huggingface.co/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      max_tokens: 80,
      temperature: 0.6
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const snippet = body.trim().slice(0, 200);
    throw new Error(`hf_error_${response.status}${snippet ? `: ${snippet}` : ""}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const generated = payload?.choices?.[0]?.message?.content?.trim() || "";
  if (!generated) {
    throw new Error("hf_empty");
  }
  return generated;
};

export const POST = async (request: Request) => {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      clientId?: string;
    };
    const clientId = payload.clientId;
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "clientId is required" }, { status: 400 });
    }
    const clientOutput = await runPython(["client_api.py", "list"]);
    const clientPayload = JSON.parse(clientOutput) as {
      clients?: Array<{
        id: string;
        name: string;
        phone?: string;
        location?: string;
        default_cta?: string;
      }>;
    };
    const client = clientPayload.clients?.find((item) => item.id === clientId);
    if (!client) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }
    const fallback = buildCaption(client);
    const prompt =
      `다음 정보를 참고해 한국어 광고 자막 1줄을 생성해줘. ` +
      `짧고 선명하게 작성하고 숫자는 유지해줘. ` +
      `정보: ${fallback}`;

    try {
      const generated = await tryHuggingFace(prompt);
      return NextResponse.json({ ok: true, caption: generated, source: "huggingface" });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      return NextResponse.json({
        ok: true,
        caption: fallback,
        source: "local",
        reason,
        model:
          process.env.HF_CAPTION_MODEL || "HuggingFaceTB/SmolLM3-3B",
        tokenPresent: Boolean(process.env.HF_API_TOKEN)
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
