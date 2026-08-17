import { GoogleGenAI, Modality, type ContentListUnion } from "@google/genai";
import { storeImage } from "./supabase";
import { debugStep } from "./log";
import type { TryOnKind } from "./youcam";

export type TryOnResult = {
  url: string | null;
  engine: "gemini" | "youcam" | "qwen";
  status: "ok" | "missing_key" | "image_gen_unavailable" | "error";
  note?: string;
};

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /quota|RESOURCE_EXHAUSTED|429|rate.?limit|exceeded/i.test(msg);
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

export async function generateDogTryOnGemini(input: {
  dogImage: { buffer: Buffer; contentType: string };
  product: { imageUrl?: string; title: string; kind: TryOnKind };
}): Promise<TryOnResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { url: null, engine: "gemini", status: "missing_key", note: "GEMINI_API_KEY missing; dog try-on unavailable." };
  }

  const productImg = input.product.imageUrl ? await fetchImageBytes(input.product.imageUrl) : null;
  const productNote = input.product.imageUrl && !productImg ? " (product image could not be fetched; using description only)" : "";

  const kindLabel = input.product.kind;
  const prompt = `You are a pet fashion stylist. The FIRST image is a photo of a dog. The SECOND image (if present) is a high-fidelity reference of an exact product (${kindLabel}: ${input.product.title}). Generate a single photorealistic image of THE SAME dog wearing this exact ${kindLabel}. Preserve the dog's breed, face, fur color, and pose exactly. Match the product's color, pattern, logo, and material as closely as possible. Apply natural lighting and shadows consistent with the first image. Output only the image.${productNote}`;

  const contents: ContentListUnion = [
    { inlineData: { mimeType: input.dogImage.contentType || "image/png", data: input.dogImage.buffer.toString("base64") } },
  ];
  if (productImg) {
    contents.push({ inlineData: { mimeType: productImg.contentType, data: productImg.buffer.toString("base64") } });
  }
  contents.push({ text: prompt });

  const ai = new GoogleGenAI({ apiKey });
  const modelsToTry = [process.env.GEMINI_TRYON_MODEL || "gemini-2.5-flash-image", "gemini-3.1-flash-image"];

  for (const model of modelsToTry) {
    try {
      debugStep("gemini:tryon:start", { model, kind: kindLabel, hasProductImg: !!productImg });
      const res = await ai.models.generateContent({
        model,
        contents,
        config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
      });
      const part = res.candidates?.[0]?.content?.parts?.find(
        (p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData,
      );
      if (!part?.inlineData?.data) {
        debugStep("gemini:tryon:noresult", { model }, null);
        continue;
      }
      const imgBuffer = Buffer.from(part.inlineData.data, "base64");
      const url = await storeImage(imgBuffer, part.inlineData.mimeType || "image/png", "dogevault/tryon");
      debugStep("gemini:tryon:done", { model, bytes: imgBuffer.length }, url);
      return { url, engine: "gemini", status: "ok" };
    } catch (err) {
      if (isQuotaError(err)) {
        debugStep("gemini:tryon:quota", { model }, (err as Error).message);
        return {
          url: null,
          engine: "gemini",
          status: "image_gen_unavailable",
          note: "Gemini image generation is not enabled on this API key (free-tier quota). Enable image generation or provide an image-gen capable key to unlock dog try-on.",
        };
      }
      debugStep("gemini:tryon:error", { model }, (err as Error).message);
    }
  }
  return { url: null, engine: "gemini", status: "error", note: "Gemini try-on failed to produce an image." };
}
