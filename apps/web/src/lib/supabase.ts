import { Buffer } from "buffer";
import type { DogProfile, Product } from "./types";
import { debugStep } from "./log";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const IMAGES_BUCKET = process.env.SUPABASE_IMAGES_BUCKET || "dogevault-images";
const METADATA_BUCKET = process.env.SUPABASE_METADATA_BUCKET || "dogevault-metadata";

export interface NftMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{ trait_type: string; value: string }>;
  dog_profile: DogProfile;
  product: Product;
  tx_signature?: string;
  created_at: string;
}

export function buildNftMetadata(input: {
  dogProfile: DogProfile;
  product: Product;
  enhancedImageUrl: string;
  txSignature?: string;
}): NftMetadata {
  const { dogProfile, product, enhancedImageUrl, txSignature } = input;
  return {
    name: `DogeVault Receipt — ${product.title}`,
    description: `AI dog stylist receipt for a ${dogProfile.breedGuess ?? "good dog"} with ${dogProfile.vibe ?? "great"} energy.`,
    image: enhancedImageUrl,
    attributes: [
      { trait_type: "Breed Guess", value: dogProfile.breedGuess || "Unknown" },
      { trait_type: "Size", value: dogProfile.size || "Unknown" },
      { trait_type: "Energy/Style", value: dogProfile.vibe || "Unknown" },
      { trait_type: "Color Palette", value: (dogProfile.colorPalette ?? []).join(", ") || "Unknown" },
      { trait_type: "Product", value: product.title || "Unknown" },
      { trait_type: "Product Price", value: product.priceText || "Unknown" },
    ],
    dog_profile: dogProfile,
    product,
    tx_signature: txSignature,
    created_at: new Date().toISOString(),
  };
}

function publicUrl(bucket: string, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

async function uploadBytes(bucket: string, path: string, body: Buffer | string, contentType: string): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const dataUrl =
      typeof body === "string"
        ? `data:${contentType};base64,${Buffer.from(body).toString("base64")}`
        : `data:${contentType};base64,${body.toString("base64")}`;
    return dataUrl;
  }

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: typeof body === "string" ? body : new Uint8Array(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase upload failed (${res.status}): ${text.slice(0, 300)}`);
  }

  return publicUrl(bucket, path);
}

export async function storeNftMetadata(meta: NftMetadata): Promise<{ uri: string; stored: boolean }> {
  const path = `receipts/${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  try {
    const uri = await uploadBytes(METADATA_BUCKET, path, JSON.stringify(meta), "application/json");
    debugStep("supabase:storeNftMetadata", { bucket: METADATA_BUCKET, path }, uri);
    return { uri, stored: true };
  } catch {
    const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(meta)).toString("base64")}`;
    return { uri, stored: false };
  }
}

function extFor(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

export async function storeImage(buffer: Buffer, contentType: string, prefix = "dogevault"): Promise<string> {
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extFor(contentType)}`;
  const uri = await uploadBytes(IMAGES_BUCKET, path, buffer, contentType);
  debugStep("supabase:storeImage", { bucket: IMAGES_BUCKET, prefix, bytes: buffer.length }, uri);
  return uri;
}
