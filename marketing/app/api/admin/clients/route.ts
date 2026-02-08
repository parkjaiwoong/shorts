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
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `exit ${code ?? 0}`));
      }
    });
  });

export const GET = async () => {
  try {
    const output = await runPython(["client_api.py", "list"]);
    return NextResponse.json(JSON.parse(output));
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};

export const POST = async (request: Request) => {
  try {
    const payload = await request.json();
    const output = await runPython([
      "client_api.py",
      "create",
      "--payload",
      JSON.stringify(payload),
    ]);
    return NextResponse.json(JSON.parse(output));
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};

export const PATCH = async (request: Request) => {
  try {
    const payload = await request.json();
    const clientId = payload?.id;
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }
    const output = await runPython([
      "client_api.py",
      "update",
      "--client-id",
      String(clientId),
      "--payload",
      JSON.stringify(payload),
    ]);
    return NextResponse.json(JSON.parse(output));
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};

export const DELETE = async (request: Request) => {
  try {
    const payload = await request.json().catch(() => ({}));
    const clientId = payload?.id;
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }
    const output = await runPython([
      "client_api.py",
      "delete",
      "--client-id",
      String(clientId),
    ]);
    return NextResponse.json(JSON.parse(output));
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
