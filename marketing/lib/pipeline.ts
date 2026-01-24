import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { z } from "zod";
import { nanoid } from "nanoid";
import { openai } from "./openai";
import { generateGeminiContent } from "./gemini";
import { saveBase64Png, saveBuffer, toPublicPath } from "./storage";
import { renderShortForm, type SceneAsset } from "./remotion/render";

const ScriptSchema = z.object({
  title: z.string().min(3),
  scenes: z
    .array(
      z.object({
        narration: z.string().min(10),
        imagePrompt: z.string().min(10),
        subtitle: z.string().min(3)
      })
    )
    .min(5)
    .max(5)
});

const GeminiScriptSchema = z.object({
  hook: z.string().min(5),
  full_script: z.string().min(20),
  scenes: z
    .array(
      z.object({
        text: z.string().min(5),
        image_prompt: z.string().min(10)
      })
    )
    .min(5)
    .max(5),
  video_title: z.string().min(5)
});

export type ScriptOutput = z.infer<typeof ScriptSchema>;

export type PipelineResult = {
  jobId: string;
  runId: string;
  videoUrl?: string;
  script: ScriptOutput;
  runDir: string;
};

type StepState = "pending" | "running" | "done" | "error";

type StepStatus = {
  state: StepState;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
};

export type RunStatus = {
  jobId: string;
  runId: string;
  topic: string;
  stage:
    | "script"
    | "images"
    | "narration"
    | "thumbnail"
    | "render"
    | "awaiting_step"
    | "awaiting_confirm"
    | "done"
    | "error";
  mode: "auto" | "step";
  waitingStep?: "script" | "images" | "narration" | "thumbnail" | "render";
  steps: {
    script: StepStatus;
    images: StepStatus;
    narration: StepStatus;
    thumbnail: StepStatus;
    render: StepStatus;
  };
  createdAt: string;
  updatedAt: string;
  confirmBeforeRender: boolean;
  geminiScript?: z.infer<typeof GeminiScriptSchema>;
  script?: ScriptOutput;
  images?: string[];
  audio?: string[];
  thumbnail?: string;
  videoUrl?: string;
  error?: string;
};

type PipelineOptions = {
  confirmBeforeRender?: boolean;
  runId?: string;
  jobId?: string;
  mode?: "auto" | "step";
};

export const runPipeline = async (
  topic: string,
  options: PipelineOptions = {}
): Promise<PipelineResult> => {
  const jobId = options.jobId ?? nanoid();
  const runId = options.runId ?? createRunId();
  const publicRoot = path.join(process.cwd(), "public");
  const runRoot = path.join(publicRoot, "runs", runId);
  const outputRoot = path.join(runRoot, "output");
  const outputImagesRoot = path.join(outputRoot, "images");
  const outputAudioRoot = path.join(outputRoot, "audio");
  const scriptJsonPath = path.join(outputRoot, "script.json");
  const statusPath = path.join(runRoot, "status.json");
  const confirmBeforeRender = options.confirmBeforeRender ?? false;

  await fs.mkdir(outputImagesRoot, { recursive: true });
  await fs.mkdir(outputAudioRoot, { recursive: true });

  const status = await initStatus({
    topic,
    jobId,
    runId,
    confirmBeforeRender,
    statusPath,
    mode: options.mode ?? "auto"
  });

  try {
  const mode = options.mode ?? status.mode;
    const startStep: StepOrder =
      status.stage === "awaiting_step" && status.waitingStep
        ? status.waitingStep
        : "script";
    const shouldRunStep = (step: StepOrder) =>
      STEP_ORDER.indexOf(step) >= STEP_ORDER.indexOf(startStep);
    const shouldPauseAfter = async (step: StepOrder) => {
      if (mode !== "step") {
        return false;
      }
      const nextStep = nextStepAfter(step);
      if (!nextStep) {
        return false;
      }
      await updateStatus(status, statusPath, {
        stage: "awaiting_step",
        waitingStep: nextStep
      });
      return true;
    };

    await delayApi();
    let geminiScript: z.infer<typeof GeminiScriptSchema>;
    if (existsSync(scriptJsonPath)) {
      const cached = JSON.parse(await fs.readFile(scriptJsonPath, "utf-8"));
      geminiScript = GeminiScriptSchema.parse(cached);
      await markStep(status, statusPath, "script", "done", { geminiScript });
    } else {
      if (shouldRunStep("script")) {
        await markStep(status, statusPath, "script", "running");
        geminiScript = await withGeminiFallback(
          async () => generateScriptWithGemini(topic),
          async () =>
            withExponentialBackoff(() => generateScriptWithOpenAI(topic))
        );
        await fs.writeFile(
          scriptJsonPath,
          JSON.stringify(geminiScript, null, 2)
        );
        await markStep(status, statusPath, "script", "done", {
          geminiScript
        });
        if (await shouldPauseAfter("script")) {
          return {
            jobId,
            runId,
            script: normalizeGeminiScript(geminiScript),
            runDir: `/runs/${runId}`
          };
        }
      } else {
        geminiScript = GeminiScriptSchema.parse(
          JSON.parse(await fs.readFile(scriptJsonPath, "utf-8"))
        );
      }
    }

    const script = normalizeGeminiScript(geminiScript);
    await updateStatus(status, statusPath, {
      script,
      geminiScript,
      stage: "images"
    });

    const sceneAssets: SceneAsset[] = [];
    const images: string[] = [];
    const audio: string[] = [];

    if (shouldRunStep("images")) {
      await markStep(status, statusPath, "images", "running");
      for (let index = 0; index < script.scenes.length; index += 1) {
        const scene = script.scenes[index];
        const sceneNumber = index + 1;
        const imagePath = path.join(
          outputImagesRoot,
          `scene-${sceneNumber}.png`
        );

        if (!existsSync(imagePath)) {
          await delayApi();
          await delayImageGeneration();
          const image = await withExponentialBackoff(() =>
            generateImage(scene.imagePrompt)
          );
          await saveBase64Png(image, imagePath);
        }
        const publicImagePath = toPublicPath(imagePath);
        images.push(publicImagePath);
        await updateStatus(status, statusPath, { images });
      }
      await markStep(status, statusPath, "images", "done", { images });
      if (await shouldPauseAfter("images")) {
        return {
          jobId,
          runId,
          script,
          runDir: `/runs/${runId}`
        };
      }
    }

    if (shouldRunStep("narration")) {
      await markStep(status, statusPath, "narration", "running");
      for (let index = 0; index < script.scenes.length; index += 1) {
        const scene = script.scenes[index];
        const sceneNumber = index + 1;
        const audioPath = path.join(outputAudioRoot, `scene-${sceneNumber}.mp3`);

        if (!existsSync(audioPath)) {
          await delayApi();
          const audioBuffer = await withExponentialBackoff(() =>
            generateNarration(scene.narration)
          );
          await saveBuffer(Buffer.from(audioBuffer), audioPath);
        }
        const publicAudioPath = toPublicPath(audioPath);
        audio.push(publicAudioPath);
        await updateStatus(status, statusPath, { audio });
      }
      await markStep(status, statusPath, "narration", "done", { audio });
      if (await shouldPauseAfter("narration")) {
        return {
          jobId,
          runId,
          script,
          runDir: `/runs/${runId}`
        };
      }
    }

    const thumbnailPath = path.join(outputRoot, "thumbnail.png");
    if (shouldRunStep("thumbnail")) {
      await markStep(status, statusPath, "thumbnail", "running");
      if (!existsSync(thumbnailPath)) {
        await delayApi();
        await delayImageGeneration();
        const prompt = buildThumbnailPrompt(script.title);
        const image = await withExponentialBackoff(() =>
          generateImage(prompt)
        );
        await saveBase64Png(image, thumbnailPath);
      }
      const publicThumbnail = toPublicPath(thumbnailPath);
      await markStep(status, statusPath, "thumbnail", "done", {
        thumbnail: publicThumbnail
      });
      if (await shouldPauseAfter("thumbnail")) {
        return {
          jobId,
          runId,
          script,
          runDir: `/runs/${runId}`
        };
      }
    }

    for (let index = 0; index < script.scenes.length; index += 1) {
      const scene = script.scenes[index];
      const sceneNumber = index + 1;
      const imagePath = path.join(outputImagesRoot, `scene-${sceneNumber}.png`);
      const audioPath = path.join(outputAudioRoot, `scene-${sceneNumber}.mp3`);

      const durationInSeconds = await getAudioDurationInSeconds(audioPath);
      const imagePublicPath = toPublicPath(imagePath);
      const audioPublicPath = toPublicPath(audioPath);

      sceneAssets.push({
        narration: scene.narration,
        subtitle: scene.subtitle,
        imagePath: imagePublicPath,
        audioPath: audioPublicPath,
        durationInSeconds: Math.max(durationInSeconds, 1)
      });
    }

    if (confirmBeforeRender && mode !== "step") {
      await updateStatus(status, statusPath, {
        stage: "awaiting_confirm",
        images,
        audio,
        script,
        thumbnail: toPublicPath(thumbnailPath)
      });
      return {
        jobId,
        runId,
        script,
        runDir: `/runs/${runId}`
      };
    }

    const outputPath = path.join(outputRoot, "final.mp4");
    const videoUrl = `/runs/${runId}/output/final.mp4`;

    const bgmPath = resolveBgmPath("bgm/phonk-loop.mp3");
    if (shouldRunStep("render")) {
      await markStep(status, statusPath, "render", "running");
      await renderShortForm({
        jobId,
        scenes: sceneAssets,
        outputPath,
        title: script.title,
        bgmPath,
        commentPrompt: "이거 말고 더 좋은 AI 아는 사람?"
      });
      await markStep(status, statusPath, "render", "done", { videoUrl });
    }

    return {
      jobId,
      runId,
      videoUrl,
      script,
      runDir: `/runs/${runId}`
    };
  } catch (error) {
    await updateStatus(status, statusPath, {
      stage: "error",
      error: error instanceof Error ? error.message : "알 수 없는 오류"
    });
    throw error;
  }
};

type StepOrder = "script" | "images" | "narration" | "thumbnail" | "render";

const STEP_ORDER: StepOrder[] = [
  "script",
  "images",
  "narration",
  "thumbnail",
  "render"
];

const nextStepAfter = (step: StepOrder): RunStatus["waitingStep"] => {
  const index = STEP_ORDER.indexOf(step);
  const next = STEP_ORDER[index + 1];
  return next ?? undefined;
};

const delayApi = async () => {
  const delayMs = 1000 + Math.floor(Math.random() * 1000);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const delayImageGeneration = async () => {
  await new Promise((resolve) => setTimeout(resolve, 12000));
};

const getAudioDurationInSeconds = async (filePath: string) => {
  const module = (await import("music-metadata")) as {
    parseFile?: (path: string) => Promise<{ format?: { duration?: number } }>;
    default?: {
      parseFile?: (path: string) => Promise<{ format?: { duration?: number } }>;
    };
  };
  const parseFile = module.parseFile ?? module.default?.parseFile;
  if (!parseFile) {
    return 1;
  }
  const metadata = await parseFile(filePath);
  return metadata.format?.duration ?? 1;
};

const delayGemini = async () => {
  const delayMs = 600 + Math.floor(Math.random() * 500);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const withGeminiFallback = async <T>(
  task: () => Promise<T>,
  fallback: () => Promise<T>
): Promise<T> => {
  try {
    return await task();
  } catch (error) {
    if (isGeminiQuotaError(error)) {
      return await fallback();
    }
    throw error;
  }
};

const isGeminiQuotaError = (error: unknown) => {
  const message =
    error instanceof Error ? error.message : JSON.stringify(error);
  return (
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("Quota") ||
    message.includes("429")
  );
};

export const createRunId = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(
    now.getSeconds()
  )}`;
  return `${date}_${time}`;
};

const initStatus = async ({
  topic,
  jobId,
  runId,
  confirmBeforeRender,
  statusPath,
  mode
}: {
  topic: string;
  jobId: string;
  runId: string;
  confirmBeforeRender: boolean;
  statusPath: string;
  mode: "auto" | "step";
}): Promise<RunStatus> => {
  if (existsSync(statusPath)) {
    const cached = JSON.parse(await fs.readFile(statusPath, "utf-8"));
    return cached as RunStatus;
  }

  const now = new Date().toISOString();
  const status: RunStatus = {
    jobId,
    runId,
    topic,
    stage: "script",
    createdAt: now,
    updatedAt: now,
    confirmBeforeRender,
    mode,
    steps: {
      script: { state: "pending" },
      images: { state: "pending" },
      narration: { state: "pending" },
      thumbnail: { state: "pending" },
      render: { state: "pending" }
    }
  };

  await fs.writeFile(statusPath, JSON.stringify(status, null, 2));
  return status;
};

const updateStatus = async (
  status: RunStatus,
  statusPath: string,
  patch: Partial<RunStatus>
) => {
  const next: RunStatus = {
    ...status,
    ...patch,
    steps: patch.steps ? { ...status.steps, ...patch.steps } : status.steps,
    updatedAt: new Date().toISOString()
  };
  Object.assign(status, next);
  await fs.writeFile(statusPath, JSON.stringify(next, null, 2));
};

const markStep = async (
  status: RunStatus,
  statusPath: string,
  key: keyof RunStatus["steps"],
  state: StepState,
  patch?: Partial<RunStatus>
) => {
  const now = new Date();
  const step = status.steps[key];
  let nextStep: StepStatus = step;

  if (state === "running") {
    nextStep = {
      state,
      startedAt: now.toISOString()
    };
  } else if (state === "done" || state === "error") {
    const startedAt = step.startedAt ? new Date(step.startedAt) : now;
    nextStep = {
      ...step,
      state,
      endedAt: now.toISOString(),
      durationMs: now.getTime() - startedAt.getTime()
    };
  }

  await updateStatus(status, statusPath, {
    ...(patch ?? {}),
    stage:
      key === "render" && state === "done"
        ? "done"
        : patch?.stage ?? status.stage,
    steps: {
      ...status.steps,
      [key]: nextStep
    }
  });
};

const withExponentialBackoff = async <T>(
  task: () => Promise<T>,
  options?: {
    retries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  }
): Promise<T> => {
  const retries = options?.retries ?? 5;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 20000;
  let attempt = 0;

  while (true) {
    try {
      return await task();
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status !== 429 || attempt >= retries) {
        throw error;
      }
      const delayMs = Math.min(
        maxDelayMs,
        baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 250)
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt += 1;
    }
  }
};

const generateScriptWithOpenAI = async (
  topic: string
): Promise<z.infer<typeof GeminiScriptSchema>> => {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "너는 숏폼 알고리즘을 지배하는 콘텐츠 디렉터다. 반드시 JSON만 출력한다."
      },
      {
        role: "user",
        content: `다음 JSON 형식으로만 출력:
{
  "hook": "첫 3초 자극적인 멘트",
  "full_script": "TTS용 전체 대본 (구어체)",
  "scenes": [
    {"text": "장면1 대사", "image_prompt": "DALL-E용 영어 묘사"}
  ],
  "video_title": "유튜브 업로드용 제목 (해시태그 포함)"
}

조건:
- [후킹 - 본론1,2,3 - 반전/결론 - CTA] 구조를 강제.
- 문장 연결을 긴박하게.
- 각 scenes.text는 대본 흐름과 정확히 매칭.
- image_prompt는 영어로 작성하고 끝에 "Cinematic, High Quality, Vibrant"를 반드시 포함.
- image_prompt에 "3D Render, Pixar Style, High-tech and Minimalist"를 반드시 포함.
- scenes는 5개.

주제: ${topic}`
      }
    ]
  });

  const text = response.choices[0]?.message?.content ?? "{}";
  const parsed = GeminiScriptSchema.parse(JSON.parse(text));
  return parsed;
};

const generateScriptWithGemini = async (
  topic: string
): Promise<z.infer<typeof GeminiScriptSchema>> => {
  await delayGemini();
  const result = await generateGeminiContent({
    systemInstruction:
      "너는 숏폼 알고리즘을 지배하는 콘텐츠 디렉터다. 10~40대 시청자에게 확 꽂히는 톤으로 빠르고 임팩트 있게 전달한다.",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `다음 형식으로만 JSON을 출력해줘.
{
  "hook": "첫 3초 자극적인 멘트",
  "full_script": "TTS용 전체 대본 (구어체)",
  "scenes": [
    {"text": "장면1 대사", "image_prompt": "DALL-E용 영어 묘사"}
  ],
  "video_title": "유튜브 업로드용 제목 (해시태그 포함)"
}

조건:
- [후킹 - 본론1,2,3 - 반전/결론 - CTA] 구조를 강제.
- 시청자가 중간에 이탈할 틈이 없도록 문장 사이 연결을 긴박하게.
- 한국어 신조어와 이모지를 적절히 섞어서 맛깔나게.
- full_script에 [자막: 내용] 형태 편집 포인트 최소 3개 이상 포함.
- scenes는 5개.
- image_prompt는 영어로 작성하고 끝에 "Cinematic, High Quality, Vibrant"를 반드시 포함.
- image_prompt에 "3D Render, Pixar Style, High-tech and Minimalist"를 반드시 포함.

주제: ${topic}`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7
    }
  });
  await delayGemini();
  const text =
    result.candidates?.[0]?.content?.parts?.map((part) => part.text).join("") ??
    "{}";
  const parsed = GeminiScriptSchema.parse(JSON.parse(extractJson(text)));
  return parsed;
};

const normalizeGeminiScript = (
  geminiScript: z.infer<typeof GeminiScriptSchema>
): ScriptOutput => {
  const scenes = geminiScript.scenes.slice(0, 5).map((scene) => ({
    narration: scene.text,
    imagePrompt: ensureImageStyle(scene.image_prompt),
    subtitle: makeSubtitle(scene.text)
  }));

  return {
    title: geminiScript.video_title,
    scenes: ensureSceneCount(scenes, geminiScript)
  };
};

const ensureSceneCount = (
  scenes: ScriptOutput["scenes"],
  source: z.infer<typeof GeminiScriptSchema>
) => {
  if (scenes.length >= 5) {
    return scenes;
  }
  const fallbackText = source.hook || source.full_script;
  const fallbackPrompt =
    source.scenes[0]?.image_prompt ??
    "Cinematic, High Quality, Vibrant portrait of a modern creator studio";
  const fill = Array.from({ length: 5 - scenes.length }, () => ({
    narration: fallbackText,
    imagePrompt: fallbackPrompt,
    subtitle: makeSubtitle(fallbackText)
  }));
  return [...scenes, ...fill];
};

const makeSubtitle = (text: string) => {
  const cleaned = text.replace(/\[자막:[^\]]+\]/g, "").trim();
  const short = cleaned.split(/[\n.!?]/)[0]?.trim() ?? cleaned;
  return short.slice(0, 24) || "핵심 포인트";
};

const ensureImageStyle = (prompt: string) => {
  const base = prompt.trim();
  const prefix =
    "Modern Korean webtoon art style, vibrant and warm colors, set in Seoul South Korea, East Asian characters with trendy Korean fashion, highly detailed, urban Korean background with Hangul signage visible, K-drama cinematography, 8k resolution";
  const personaHint =
    "Korean webtoon artist and trendy K-drama cinematographer vibe";
  const style = "3D Render, Pixar Style, High-tech and Minimalist";
  const cinematic = "Cinematic, High Quality, Vibrant";
  const cyberpunk =
    "Cyberpunk, Cinematic Lighting, 8k Resolution, Unreal Engine 5 Render";
  const needsClockDetail = /clock|watch|시계/i.test(base);
  const needsOfficeDetail = /office|사무실|desk|work/i.test(base);
  const needsPerson =
    /person|people|man|woman|character|인물|사람/i.test(base);

  const parts = [prefix, personaHint, base];

  if (needsPerson && !/Korean office worker|Seoulite/i.test(base)) {
    parts.push("Korean office worker or Seoulite");
  }
  if (needsOfficeDetail) {
    parts.push("office interior with Namsan Tower visible through the window");
    parts.push("computer monitor showing Hangul text");
  }
  if (needsClockDetail) {
    parts.push("Detailed Clock Face with clear hands");
  }
  parts.push(style, cinematic, cyberpunk);
  return parts.join(", ");
};

const extractJson = (raw: string) => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    const withoutFence = trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
    return withoutFence.trim();
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
};

const generateImage = async (prompt: string) => {
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt,
    size: "1024x1024",
    quality: "standard",
    style: "natural",
    response_format: "b64_json"
  });

  const image = response.data?.[0]?.b64_json;
  if (!image) {
    throw new Error("이미지 생성 실패");
  }
  return image;
};

const generateNarration = async (text: string) => {
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "alloy",
    response_format: "mp3",
    input: text
  });

  return Buffer.from(await response.arrayBuffer());
};

const buildThumbnailPrompt = (title: string) => {
  return `${title}. 자극적인 대형 텍스트 포함, 선명한 색감, 숏폼 클릭률을 높이는 디자인, thumbnail, high contrast, clean composition.`;
};

const resolveBgmPath = (relativePath: string) => {
  const absolutePath = path.join(process.cwd(), "public", relativePath);
  return existsSync(absolutePath) ? relativePath : undefined;
};
