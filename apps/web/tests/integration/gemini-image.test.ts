import { describe, it, expect } from "vitest";
import { GoogleGenAI, Modality } from "@google/genai";

// Run with: RUN_LIVE=1 pnpm exec vitest run tests/integration/gemini-image.test.ts
// Gate check: confirm the GEMINI_API_KEY can perform image generation (needed for dog try-on).
const runLive = process.env.RUN_LIVE === "1";
const apiKey = process.env.GEMINI_API_KEY;

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe.skipIf(!runLive || !apiKey)("gemini image generation (live gate)", () => {
  it("returns an inline image from a text prompt", async () => {
    const ai = new GoogleGenAI({ apiKey: apiKey! });
    const models = [process.env.GEMINI_TRYON_MODEL || "gemini-2.5-flash-image", "gemini-3.1-flash-image"];
    let lastErr: unknown;
    for (const model of models) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: "Generate a small red circle on a plain white background.",
          config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
        });
        const part = res.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData);
        expect(part?.inlineData?.data).toBeTruthy();
        const bytes = Buffer.from(part!.inlineData!.data as string, "base64");
        console.log(`OK model=${model} mime=${part!.inlineData!.mimeType} bytes=${bytes.length}`);
        return;
      } catch (e) {
        lastErr = e;
        console.log(`model failed: ${model} -> ${(e as Error).message}`);
      }
    }
    throw lastErr;
  });

  it("accepts a reference image (dog + product) as inlineData input", async () => {
    const ai = new GoogleGenAI({ apiKey: apiKey! });
    const model = process.env.GEMINI_TRYON_MODEL || "gemini-2.5-flash-image";
    const res = await ai.models.generateContent({
      model,
      contents: [
        { inlineData: { mimeType: "image/png", data: PNG_1X1 } },
        { inlineData: { mimeType: "image/png", data: PNG_1X1 } },
        { text: "These are placeholder references. Output a neutral gray square image." },
      ],
      config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
    });
    const part = res.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data?: string } }) => p.inlineData);
    expect(part?.inlineData?.data).toBeTruthy();
    console.log("multi-image input OK, bytes:", Buffer.from(part!.inlineData!.data as string, "base64").length);
  });
});
