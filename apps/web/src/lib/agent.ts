import { searchProductsWithApify, categoryFromText } from "./apifyMcp";
import { generateDogProfile } from "./gemini";
import { generateDogTryOn } from "./dogTryOn";
import { storeImage } from "./supabase";
import { debugStep } from "./log";
import type { AgentResult, AgentStep, ProductCategory } from "./types";
import {
  enhanceDogPortrait,
  replaceDogBackground,
  tryOnProduct,
  uploadDogImage,
  type TryOnKind,
} from "./youcam";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function toDataUrl(bytes: Buffer, contentType: string) {
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

function uniqueName(prefix: string, contentType: string) {
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

export function tryOnKindForProduct(product: { category?: ProductCategory; title: string; queryUsed: string }): TryOnKind {
  const category: ProductCategory =
    product.category && product.category !== "unknown"
      ? product.category
      : categoryFromText(`${product.title} ${product.queryUsed}`);
  return category === "shoes" || category === "hat" ? category : "clothes";
}

async function safe<T>(label: string, task: () => Promise<T>, notes: string[], onStep?: (step: AgentStep) => void, stepName?: string, stepLabel?: string): Promise<T | null> {
  if (stepName) onStep?.({ name: stepName, label: stepLabel ?? stepName, status: "start" });
  try {
    const value = await task();
    if (stepName) onStep?.({ name: stepName, label: stepLabel ?? stepName, status: "done" });
    return value;
  } catch (error) {
    notes.push(`${label}: ${error instanceof Error ? error.message : "unknown error"}`);
    if (stepName) onStep?.({ name: stepName, label: stepLabel ?? stepName, status: "error", detail: error instanceof Error ? error.message : "unknown error" });
    return null;
  }
}

export async function runDogAgent(file: File, onStep?: (step: AgentStep) => void): Promise<AgentResult> {
  const notes: string[] = [];
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image must be smaller than 10MB.");
  if (!file.type.startsWith("image/")) throw new Error("Please upload a JPG/PNG/WebP dog image.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const fallbackImageUrl = toDataUrl(bytes, file.type);

  debugStep("agent:start", { fileName: file.name, size: file.size, type: file.type });

  const storedOriginalUrl = await safe(
    "supabase-original",
    () => storeImage(bytes, file.type, "dogevault/originals"),
    notes,
    onStep,
    "original",
    "Storing original photo",
  );
  debugStep("supabase-original", { size: bytes.length }, storedOriginalUrl);

  // YouCam upload is mandatory for the portrait pipeline. A genuine upload failure
  // (network/API error, or missing key) must stop the agent and surface the error
  // to the user — we do NOT silently fall back to the original image here.
  let youcamUpload: { fileId: string } | null = null;
  try {
    onStep?.({ name: "upload", label: "Uploading photo to YouCam", status: "start" });
    youcamUpload = await uploadDogImage(file.name, file.type, bytes);
    onStep?.({ name: "upload", label: "Uploading photo to YouCam", status: "done" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "YouCam upload failed";
    notes.push(`youcam-upload: ${message}`);
    onStep?.({ name: "upload", label: "Uploading photo to YouCam", status: "error", detail: message });
    throw new Error(`YouCam upload failed: ${message}`);
  }
  debugStep("youcam-upload", { fileName: file.name }, youcamUpload);

  let enhancedUrl: string | null = null;
  let portraitUrl: string;

  onStep?.({ name: "portrait", label: "Enhancing & styling portrait", status: "start" });
  try {
    if (youcamUpload) {
      enhancedUrl = await safe("youcam-enhance", () => enhanceDogPortrait(youcamUpload.fileId), notes);
      debugStep("youcam-enhance", { fileId: youcamUpload.fileId }, enhancedUrl);

      if (enhancedUrl) {
        const enhancedRes = await fetch(enhancedUrl);
        const enhancedBytes = Buffer.from(await enhancedRes.arrayBuffer());
        const enhancedCt = enhancedRes.headers.get("content-type") || "image/png";
        const reupload = await safe(
          "youcam-reupload-enhanced",
          () => uploadDogImage(uniqueName("enhanced", enhancedCt), enhancedCt, enhancedBytes),
          notes,
        );
        debugStep("youcam-reupload-enhanced", { bytes: enhancedBytes.length }, reupload);

        if (reupload) {
          const bgUrl = await safe("youcam-bg-replace", () => replaceDogBackground(reupload.fileId), notes);
          debugStep("youcam-bg-replace", { fileId: reupload.fileId }, bgUrl);
          portraitUrl = bgUrl || enhancedUrl;
        } else {
          portraitUrl = enhancedUrl;
        }
      } else {
        portraitUrl = storedOriginalUrl || fallbackImageUrl;
      }
    } else {
      portraitUrl = storedOriginalUrl || fallbackImageUrl;
    }
    onStep?.({ name: "portrait", label: "Enhancing & styling portrait", status: "done", data: { enhancedImageUrl: portraitUrl } });
  } catch (error) {
    notes.push(`portrait: ${error instanceof Error ? error.message : "unknown error"}`);
    onStep?.({ name: "portrait", label: "Enhancing & styling portrait", status: "error", detail: error instanceof Error ? error.message : "unknown error" });
    portraitUrl = storedOriginalUrl || fallbackImageUrl;
  }

  let storedPortraitUrl: string | null = null;
  if (portraitUrl.startsWith("http")) {
    storedPortraitUrl = await safe(
      "supabase-portrait",
      async () => {
        const res = await fetch(portraitUrl);
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get("content-type") || "image/jpeg";
        return storeImage(buf, ct, "dogevault/portraits");
      },
      notes,
    );
  }
  debugStep("supabase-portrait", { portraitUrl }, storedPortraitUrl);
  if (!storedPortraitUrl) {
    storedPortraitUrl = await safe("supabase-portrait-original", () => storeImage(bytes, file.type, "dogevault/portraits"), notes);
  }

  const gemini = await safe(
    "gemini-profile",
    () => generateDogProfile({ fileName: file.name, buffer: bytes, contentType: file.type }),
    notes,
    onStep,
    "profile",
    "Profiling dog with Gemini",
  ) ?? { profile: { breedGuess: "Unknown", size: "unknown" as const, vibe: "", colorPalette: [], stylistSummary: "", voiceScript: "", productQueries: [], subjectType: "unknown" as const }, status: "error" as const };
  debugStep("gemini-profile", { fileName: file.name }, { status: gemini.status, profile: gemini.profile });
  onStep?.({ name: "profile", label: "Profiling dog with Gemini", status: "done", data: { dogProfile: gemini.profile } });

  const apify = await safe(
    "apify-products",
    async () => {
      const res = await searchProductsWithApify(gemini.profile.productQueries);
      if (res.note) notes.push(res.note);
      if (res.status === "error") throw new Error(res.note || "Apify search failed");
      return res;
    },
    notes,
    onStep,
    "products",
    "Searching products with Apify",
  ) ?? { products: [], status: "error" as const };
  debugStep("apify-products", { queries: gemini.profile.productQueries }, { status: apify.status, count: apify.products.length });
  onStep?.({ name: "products", label: "Searching products with Apify", status: "done", data: { products: apify.products } });

  // --- Category-aware virtual try-on ---
  // Detect what the first product actually is (from its category tag, falling back to
  // its title + query keywords) so we invoke the correct YouCam try-on endpoint.
  const firstProductWithImage = apify.products.find((p) => p.imageUrl);
  let tryOnImageUrl: string | null = null;
  let tryOnKind: TryOnKind | null = null;
  let tryOnEngine: "qwen/gemini" | "youcam" | null = null;

  if (firstProductWithImage?.imageUrl) {
    tryOnKind = tryOnKindForProduct(firstProductWithImage);
    const isHuman = gemini.profile.subjectType === "human";
    tryOnEngine = isHuman ? "youcam" : "qwen/gemini";
    onStep?.({ name: "tryon", label: `Virtual try-on (${tryOnEngine}): ${tryOnKind}`, status: "start", data: { tryOnProductId: firstProductWithImage?.id ?? null } });

    try {
      if (isHuman) {
        tryOnImageUrl = await tryOnProduct(tryOnKind as TryOnKind, portraitUrl, firstProductWithImage.imageUrl as string);
        if (tryOnImageUrl) {
          onStep?.({ name: "tryon", label: `Virtual try-on (YouCam): ${tryOnKind}`, status: "done", data: { tryOnImageUrl, tryOnProductId: firstProductWithImage?.id ?? null } });
        } else {
          onStep?.({ name: "tryon", label: `Virtual try-on (YouCam): ${tryOnKind}`, status: "error", detail: "YouCam returned no result (human try-on needs a clear upper-body photo).", data: { tryOnImageUrl: null, tryOnProductId: firstProductWithImage?.id ?? null } });
          notes.push(`tryon(${tryOnKind}): YouCam returned no result`);
        }
      } else {
        const result = await generateDogTryOn({
          dogImage: { buffer: bytes, contentType: file.type },
          product: {
            imageUrl: firstProductWithImage.imageUrl,
            title: firstProductWithImage.title,
            kind: tryOnKind as TryOnKind,
          },
        });
        tryOnImageUrl = result.url;
        if (result.status === "ok") {
          onStep?.({ name: "tryon", label: `Virtual try-on: ${tryOnKind}`, status: "done", data: { tryOnImageUrl, tryOnProductId: firstProductWithImage?.id ?? null } });
        } else {
          onStep?.({ name: "tryon", label: `Virtual try-on: ${tryOnKind}`, status: "error", detail: result.note, data: { tryOnImageUrl: null, tryOnProductId: firstProductWithImage?.id ?? null } });
          if (result.note) notes.push(`tryon(${tryOnKind}): ${result.note}`);
        }
      }
    } catch (error) {
      notes.push(`tryon(${tryOnKind}): ${error instanceof Error ? error.message : "error"}`);
      onStep?.({ name: "tryon", label: `Virtual try-on: ${tryOnKind}`, status: "error", detail: error instanceof Error ? error.message : "error", data: { tryOnImageUrl: null, tryOnProductId: firstProductWithImage?.id ?? null } });
    }
  } else {
    onStep?.({ name: "tryon", label: "Virtual try-on", status: "done", detail: "No product image available", data: { tryOnImageUrl: null, tryOnProductId: null } });
  }
  debugStep("agent:tryon", { engine: tryOnEngine, kind: tryOnKind, portraitUrl, product: firstProductWithImage?.imageUrl }, tryOnImageUrl);

  const youcamStatus = !process.env.YOUCAM_API_KEY
    ? "missing_key"
    : enhancedUrl
      ? "ok"
      : "error";

  return {
    originalImageUrl: storedOriginalUrl || fallbackImageUrl,
    enhancedImageUrl: storedPortraitUrl || portraitUrl,
    tryOnImageUrl: tryOnImageUrl ?? null,
    dogProfile: gemini.profile,
    products: apify.products,
    tryOnProductId: firstProductWithImage?.id ?? null,
    providerStatus: {
      youcam: youcamStatus,
      gemini: gemini.status,
      apify: apify.status,
    },
    notes,
  };
}
