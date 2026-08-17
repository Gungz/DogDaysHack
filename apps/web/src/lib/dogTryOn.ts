import type { TryOnKind } from "./youcam";
import { generateDogTryOnGemini, type TryOnResult } from "./geminiTryOn";
import { generateDogTryOnQwen } from "./qwenTryOn";

export type { TryOnResult };

export type DogTryOnInput = {
  dogImage: { buffer: Buffer; contentType: string };
  product: { imageUrl?: string; title: string; kind: TryOnKind };
};

// Routes dog virtual try-on to whichever image-generation provider key is configured.
// Qwen (DashScope) is preferred when available; otherwise Gemini.
export async function generateDogTryOn(input: DogTryOnInput): Promise<TryOnResult> {
  if (process.env.DASHSCOPE_API_KEY) {
    return generateDogTryOnQwen(input);
  }
  if (process.env.GEMINI_API_KEY) {
    return generateDogTryOnGemini(input);
  }
  return { url: null, engine: "qwen", status: "missing_key", note: "No image-generation API key configured (set DASHSCOPE_API_KEY or GEMINI_API_KEY)." };
}
