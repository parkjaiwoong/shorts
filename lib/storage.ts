import fs from "node:fs/promises";
import path from "node:path";

export type SavedAsset = {
  absolutePath: string;
  publicPath: string;
};

export const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const saveBase64Png = async (
  base64: string,
  targetPath: string
): Promise<SavedAsset> => {
  const buffer = Buffer.from(base64, "base64");
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, buffer);

  return {
    absolutePath: targetPath,
    publicPath: toPublicPath(targetPath)
  };
};

export const saveBuffer = async (
  buffer: Buffer,
  targetPath: string
): Promise<SavedAsset> => {
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, buffer);

  return {
    absolutePath: targetPath,
    publicPath: toPublicPath(targetPath)
  };
};

export const toPublicPath = (absolutePath: string) => {
  const publicRoot = path.join(process.cwd(), "public");
  return absolutePath.replace(publicRoot, "").split(path.sep).join("/");
};
