type GeminiPart = {
  text: string;
};

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

type GeminiGenerationConfig = {
  responseMimeType?: string;
  temperature?: number;
};

type GeminiRequest = {
  systemInstruction?: string;
  contents: GeminiContent[];
  generationConfig?: GeminiGenerationConfig;
  models?: string[];
};

type GeminiResponse = {
  candidates?: {
    content?: {
      parts?: GeminiPart[];
    };
  }[];
};

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const apiBase = "https://generativelanguage.googleapis.com/v1/models";

if (!apiKey) {
  throw new Error("GOOGLE_GENERATIVE_AI_API_KEY 환경 변수를 설정하세요.");
}

export const DEFAULT_GEMINI_MODELS = [
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.0-flash"
];

export const generateGeminiContent = async ({
  systemInstruction,
  contents,
  generationConfig,
  models = DEFAULT_GEMINI_MODELS
}: GeminiRequest): Promise<GeminiResponse> => {
  let lastError: Error | null = null;

  for (const model of models) {
    const effectiveContents = systemInstruction
      ? [
          {
            role: "user",
            parts: [{ text: systemInstruction }]
          },
          ...contents
        ]
      : contents;

    const body = {
      contents: effectiveContents,
      ...(generationConfig
        ? {
            generationConfig: {
              ...(generationConfig.temperature !== undefined
                ? { temperature: generationConfig.temperature }
                : {})
            }
          }
        : {})
    };

    const response = await fetch(
      `${apiBase}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    );

    if (response.ok) {
      return (await response.json()) as GeminiResponse;
    }

    const errorText = await response.text();
    lastError = new Error(
      `Gemini ${model} 오류 (${response.status}): ${errorText}`
    );

    if (response.status === 401 || response.status === 403) {
      break;
    }
  }

  throw lastError ?? new Error("Gemini 호출 실패");
};
