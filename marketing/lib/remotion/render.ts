import path from "node:path";
import fs from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";

export type SceneAsset = {
  narration: string;
  subtitle: string;
  imagePath: string;
  audioPath: string;
  durationInSeconds: number;
};

type RenderInput = {
  jobId: string;
  scenes: SceneAsset[];
  outputPath: string;
  title?: string;
  bgmPath?: string;
  commentPrompt?: string;
};

let bundleLocationPromise: Promise<string> | null = null;

const getBundleLocation = async () => {
  if (!bundleLocationPromise) {
    bundleLocationPromise = bundle({
      entryPoint: path.join(process.cwd(), "remotion", "Root.tsx"),
      outDir: path.join(process.cwd(), ".remotion-bundle"),
      overwrite: true
    });
  }
  return bundleLocationPromise;
};

export const renderShortForm = async ({
  scenes,
  outputPath,
  title,
  bgmPath,
  commentPrompt
}: RenderInput) => {
  const bundleLocation = await getBundleLocation();
  const publicDir = path.join(process.cwd(), "public");
  await syncRunAssetsToBundlePublic(bundleLocation, outputPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const compositions = await getCompositions(bundleLocation, {
    inputProps: { scenes, title, bgmPath, commentPrompt },
    publicDir
  });
  const composition = compositions.find((item) => item.id === "ShortForm");

  if (!composition) {
    throw new Error("Remotion composition을 찾을 수 없습니다.");
  }

  console.log("[렌더] 이미지와 오디오 결합 중...");
  console.log("[렌더] 자막 레이어 생성 중...");
  console.log("[렌더] 최종 렌더링 및 파일 저장 중...");

  let lastLoggedSecond = -1;
  const startedAt = Date.now();

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    inputProps: { scenes, title, bgmPath, commentPrompt },
    publicDir,
    outputLocation: outputPath,
    overwrite: true,
    onProgress: ({ renderedFrames, encodedFrames }) => {
      const totalFrames = composition.durationInFrames;
      const doneFrames = Math.max(renderedFrames, encodedFrames);
      const progress = totalFrames > 0 ? doneFrames / totalFrames : 0;
      const elapsedMs = Date.now() - startedAt;
      const fps = elapsedMs > 0 ? doneFrames / (elapsedMs / 1000) : 0;
      const remainingMs =
        fps > 0 ? Math.max(0, (totalFrames - doneFrames) / fps) * 1000 : 0;

      const currentSecond = Math.floor(elapsedMs / 1000);
      if (currentSecond !== lastLoggedSecond) {
        lastLoggedSecond = currentSecond;
        const percent = Math.min(100, Math.round(progress * 100));
        const etaSeconds = Math.ceil(remainingMs / 1000);
        const bar = buildProgressBar(percent);
        console.log(
          `[렌더] ${bar} ${percent}% | 프레임 ${doneFrames}/${totalFrames} | ETA ${etaSeconds}s`
        );
      }
    }
  });
};

const buildProgressBar = (percent: number) => {
  const width = 24;
  const filled = Math.round((percent / 100) * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
};

const syncRunAssetsToBundlePublic = async (
  bundleLocation: string,
  outputPath: string
) => {
  const runRoot = path.join(process.cwd(), "public", "runs");
  const normalized = path.normalize(outputPath);
  const segments = normalized.split(path.sep);
  const runsIndex = segments.lastIndexOf("runs");
  const runId = runsIndex >= 0 ? segments[runsIndex + 1] : null;
  if (!runId) {
    return;
  }
  const source = path.join(runRoot, runId);
  const target = path.join(bundleLocation, "public", "runs", runId);
  if (!await exists(source)) {
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true });
};

const exists = async (targetPath: string) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};
