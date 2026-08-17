import { storeImage } from "./supabase";
import { debugStep } from "./log";
import type { TryOnKind } from "./youcam";
import type { TryOnResult } from "./geminiTryOn";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const DEFAULT_MODEL = "qwen-image-3.0-pro";

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /quota|Resource.*exhausted|429|rate.?limit|exceeded|InvalidApiKey|No API-key/i.test(msg);
}

async function fetchImageBytes(url: string, timeoutMs = 15_000): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DogeVaultStylist/1.0)" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/") || buffer.length === 0) return null;
    return { buffer, contentType };
  } catch {
    return null;
  }
}

export async function generateDogTryOnQwen(input: {
  dogImage: { buffer: Buffer; contentType: string };
  product: { imageUrl?: string; title: string; kind: TryOnKind };
}): Promise<TryOnResult> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return { url: null, engine: "qwen", status: "missing_key", note: "DASHSCOPE_API_KEY missing; Qwen dog try-on unavailable." };
  }

  const baseUrl = process.env.DASHSCOPE_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.QWEN_IMAGE_MODEL || DEFAULT_MODEL;

  const kindLabel = input.product.kind;
  const prompt =
    `Edit the FIRST image: it is a photo of a dog. Keep the dog's breed, face, fur color, pose, and background exactly as in the original photo. ` +
    `Put the exact product shown in the SECOND image (${kindLabel}: ${input.product.title}) onto the dog, matching its color, pattern, logo, and material as closely as possible. ` +
    `Make the fit look natural and comfortable. Keep a photorealistic, studio-quality look with consistent lighting and shadows. Do not change the dog's identity or expression. Output only the edited image.`;

  const content: Array<{ image: string } | { text: string }> = [
    { image: `data:${input.dogImage.contentType || "image/png"};base64,${input.dogImage.buffer.toString("base64")}` },
  ];

  if (input.product.imageUrl) {
    const productImg = await fetchImageBytes(input.product.imageUrl);
    if (productImg) {
      content.push({ image: `data:${productImg.contentType};base64,${productImg.buffer.toString("base64")}` });
    }
  }
  content.push({ text: prompt });

  const body = {
    model,
    input: { messages: [{ role: "user", content }] },
    parameters: { prompt_extend: true },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    debugStep("qwen:tryon:start", { model, hasProductImg: content.length > 2 });
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await res.json()) as {
      output?: { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> };
      code?: string;
      message?: string;
    };
    if (!res.ok || !json.output?.choices?.[0]?.message?.content) {
      const msg = json.message || `Qwen image generation failed (${res.status})`;
      if (isQuotaError(msg) || res.status === 429 || res.status === 401) {
        return { url: null, engine: "qwen", status: "image_gen_unavailable", note: `Qwen image generation unavailable: ${msg}` };
      }
      return { url: null, engine: "qwen", status: "error", note: msg };
    }
    const imageItem = json.output.choices[0].message!.content!.find((c) => c.image);
    if (!imageItem?.image) {
      return { url: null, engine: "qwen", status: "error", note: "Qwen returned no image" };
    }
    const imgRes = await fetch(imageItem.image);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const url = await storeImage(imgBuffer, "image/png", "dogevault/tryon");
    debugStep("qwen:tryon:done", { bytes: imgBuffer.length }, url);
    return { url, engine: "qwen", status: "ok" };
  } catch (err) {
    if (isQuotaError(err) || (err instanceof Error && err.name === "AbortError")) {
      return { url: null, engine: "qwen", status: "image_gen_unavailable", note: `Qwen image generation unavailable: ${(err as Error).message}` };
    }
    debugStep("qwen:tryon:error", {}, (err as Error).message);
    return { url: null, engine: "qwen", status: "error", note: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
