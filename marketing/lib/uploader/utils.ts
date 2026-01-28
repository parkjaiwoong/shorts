import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const fileExists = (filePath: string) => existsSync(filePath);

export const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const listFiles = async (dirPath: string) => {
  if (!existsSync(dirPath)) {
    return [];
  }
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dirPath, entry.name));
};

export const safeMove = async (sourcePath: string, targetPath: string) => {
  try {
    await fs.rename(sourcePath, targetPath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== "EXDEV") {
      throw error;
    }
    await fs.copyFile(sourcePath, targetPath);
    await fs.unlink(sourcePath);
  }
};
