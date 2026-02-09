import OpenAI from "openai";

let _openai: OpenAI | null = null;

/** Lazy-initialized so build can succeed without OPENAI_API_KEY; key is required at runtime when APIs are called. */
function getOpenAI(): OpenAI {
  if (!_openai) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "The OPENAI_API_KEY environment variable is missing or empty; either provide it, or instantiate the OpenAI client with an apiKey option."
      );
    }
    _openai = new OpenAI({ apiKey: key });
  }
  return _openai;
}

export const openai = new Proxy({} as OpenAI, {
  get(_, prop) {
    return (getOpenAI() as Record<string, unknown>)[prop as string];
  }
});
