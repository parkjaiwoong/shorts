import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

type VideoStatus = "READY" | "PROCESSED" | "FAILED";

type VideoMeta = {
  videoId: string;
  customerId: string;
  originalFilePath: string;
  processedFilePath: string | null;
  status: VideoStatus;
  createdAt: string;
};

const ROOT_DIR = path.join(process.cwd(), "videos");

const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const writeMeta = async (dirPath: string, meta: VideoMeta) => {
  const metaPath = path.join(dirPath, "meta.json");
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
};

const copyRaw = async (sourcePath: string, destPath: string) => {
  await fs.copyFile(sourcePath, destPath);
};

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

const resolveCustomerId = async (input: string) => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const payload = await runPython(["client_api.py", "list"]);
  const parsed = JSON.parse(payload) as {
    clients?: Array<{ id: string; name: string }>;
  };
  const clients = parsed.clients ?? [];
  if (uuidRegex.test(input)) {
    const found = clients.find((client) => client.id === input);
    if (!found) {
      throw new Error(`customerId not found: ${input}`);
    }
    return found.id;
  }
  const name = input.trim();
  const found = clients.find((client) => client.name === name);
  if (!found) {
    throw new Error(`customer name not found: ${name}`);
  }
  return found.id;
};

const main = async () => {
  const customerIdOrName = process.argv[2];
  const inputPath = process.argv[3];
  if (!customerIdOrName || !inputPath) {
    throw new Error(
      "Usage: npx tsx scripts/video-manager.ts <customerId|customerName> <inputMp4>"
    );
  }

  const customerId = await resolveCustomerId(customerIdOrName);
  const sourcePath = path.resolve(inputPath);
  if (!existsSync(sourcePath)) {
    throw new Error(`Input not found: ${sourcePath}`);
  }

  const customerDir = path.join(ROOT_DIR, customerId);
  await ensureDir(customerDir);
  const rawPath = path.join(customerDir, "raw.mp4");
  await copyRaw(sourcePath, rawPath);

  const meta: VideoMeta = {
    videoId: randomUUID(),
    customerId,
    originalFilePath: rawPath,
    processedFilePath: null,
    status: "READY",
    createdAt: new Date().toISOString()
  };
  await writeMeta(customerDir, meta);

  console.log(`CREATED=${customerDir}`);
};

main().catch((error) => {
  console.error(`ERROR=${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
