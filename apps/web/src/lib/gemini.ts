import { GoogleGenAI, type ContentListUnion } from "@google/genai";
import type { DogProfile } from "./types";
import { debugStep } from "./log";

const fallbackProfile: DogProfile = {
  breedGuess: "Distinguished rescue mix",
  size: "unknown",
  vibe: "polished but playful",
  colorPalette: ["warm cream", "tan", "espresso"],
  stylistSummary: "A studio-worthy pup with understated luxury energy.",
  voiceScript:
    "Oh, what a distinguished little icon. Clean backdrop, confident eyes, excellent coat energy. I am fetching tasteful accessories with maximum comfort and absolutely zero fashion disasters.",
  productQueries: ["luxury dog clothes", "dog shoes boots", "dog hat cap"],
  subjectType: "unknown",
};

function stripJsonFence(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeProfile(value: unknown): DogProfile {
  const candidate = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const stringValue = (key: keyof DogProfile, fallback: string) => {
    const raw = candidate[key];
    return typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
  };
  const arrayValue = (key: keyof DogProfile, fallback: string[]) => {
    const raw = candidate[key];
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : fallback;
  };
  const size = stringValue("size", "unknown");
  const subjectRaw = stringValue("subjectType", fallbackProfile.subjectType).toLowerCase();
  const subjectType: DogProfile["subjectType"] = subjectRaw.includes("human")
    ? "human"
    : subjectRaw.includes("dog") || subjectRaw.includes("pet")
      ? "dog"
      : "unknown";
  return {
    breedGuess: stringValue("breedGuess", fallbackProfile.breedGuess),
    size: size === "small" || size === "medium" || size === "large" ? size : "unknown",
    vibe: stringValue("vibe", fallbackProfile.vibe),
    colorPalette: arrayValue("colorPalette", fallbackProfile.colorPalette).slice(0, 5),
    stylistSummary: stringValue("stylistSummary", fallbackProfile.stylistSummary),
    voiceScript: stringValue("voiceScript", fallbackProfile.voiceScript).slice(0, 700),
    productQueries: arrayValue("productQueries", fallbackProfile.productQueries).slice(0, 4),
    subjectType,
  };
}

export type GenerateDogProfileInput = {
  fileName: string;
  buffer: Buffer;
  contentType: string;
};

export async function generateDogProfile(input: GenerateDogProfileInput): Promise<{ profile: DogProfile; status: "ok" | "missing_key" | "error" }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { profile: fallbackProfile, status: "missing_key" };

  const prompt = `You are the reasoning layer for DogeVault Stylist, a dog-themed AI personal shopper. The attached image is the user's photo named "${input.fileName}". Carefully analyze the subject from the image. Return only JSON with keys: breedGuess, size (small|medium|large|unknown), vibe, colorPalette (array of strings), stylistSummary, voiceScript, productQueries, subjectType. subjectType MUST be one of "dog", "human", or "unknown" — what the photo predominantly shows. breedGuess should describe the main subject (dog breed, or "Person" if human). productQueries MUST be exactly 3 short e-commerce search phrases (one for each category): 1) dog clothes/outfit/collar/harness, 2) dog shoes/boots, 3) dog hat/cap. CRITICAL: every query MUST be tailored to THIS specific dog by embedding its breedGuess, its size (small|medium|large), and a color taken from colorPalette. Never use generic phrases like "dog clothes". Examples of the required format: "small french bulldog red knit sweater", "large golden retriever blue rain boots", "medium poodle pink sun hat". Keep the voice script under 90 words, premium-pet-stylist tone, funny but kind. Do not claim medical or veterinary advice.`;

  const contents: ContentListUnion = [
    {
      inlineData: {
        mimeType: input.contentType || "image/png",
        data: input.buffer.toString("base64"),
      },
    },
    { text: prompt },
  ];

  const ai = new GoogleGenAI({ apiKey });
  const modelsToTry = [process.env.GEMINI_MODEL || "gemini-2.5-pro", "gemini-2.5-flash"];

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({ model, contents });
      const text = typeof response.text === "string" ? response.text : "";
      const profile = normalizeProfile(JSON.parse(stripJsonFence(text)));
      debugStep("gemini:generate", { model, fileName: input.fileName }, { status: "ok", breedGuess: profile.breedGuess, queries: profile.productQueries });
      return { profile, status: "ok" };
    } catch (error) {
      debugStep("gemini:generate", { model }, { status: "error", message: error instanceof Error ? error.message : "unknown" });
    }
  }

  return { profile: fallbackProfile, status: "error" };
}
