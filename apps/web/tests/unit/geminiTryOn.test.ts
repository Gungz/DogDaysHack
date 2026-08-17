import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({
  storeImage: vi.fn(async (_buffer: Buffer, _contentType: string) => "https://cdn.example.com/tryon.png"),
}));

const fakeGenerate = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: fakeGenerate };
    constructor(_opts: unknown) {}
  },
  Modality: { TEXT: "TEXT", IMAGE: "IMAGE" },
}));

import { generateDogTryOnGemini } from "@/lib/geminiTryOn";

function pngBuffer() {
  return Buffer.from("iVBORw0KGgo=", "base64");
}

describe("generateDogTryOn", () => {
  beforeEach(() => {
    fakeGenerate.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns missing_key when GEMINI_API_KEY is absent", async () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const result = await generateDogTryOnGemini({
      dogImage: { buffer: pngBuffer(), contentType: "image/png" },
      product: { imageUrl: "https://x/p.jpg", title: "Cap", kind: "hat" },
    });
    expect(result.status).toBe("missing_key");
    expect(result.url).toBeNull();
    process.env.GEMINI_API_KEY = prev;
  });

  it("returns ok and uploads when an image part is produced", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    fakeGenerate.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ inlineData: { data: pngBuffer().toString("base64"), mimeType: "image/png" } }] } }],
    });
    const result = await generateDogTryOnGemini({
      dogImage: { buffer: pngBuffer(), contentType: "image/png" },
      product: { imageUrl: "https://x/p.jpg", title: "Cap", kind: "hat" },
    });
    expect(result.status).toBe("ok");
    expect(result.url).toBe("https://cdn.example.com/tryon.png");
    expect(result.engine).toBe("gemini");
  });

  it("returns image_gen_unavailable on quota/RESOURCE_EXHAUSTED", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    fakeGenerate.mockRejectedValueOnce(new Error("429 RESOURCE_EXHAUSTED quota exceeded limit: 0"));
    const result = await generateDogTryOnGemini({
      dogImage: { buffer: pngBuffer(), contentType: "image/png" },
      product: { imageUrl: "https://x/p.jpg", title: "Cap", kind: "hat" },
    });
    expect(result.status).toBe("image_gen_unavailable");
    expect(result.url).toBeNull();
    expect(result.note).toMatch(/image generation/i);
  });

  it("fetches the product reference image and passes two inline parts", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => pngBuffer().buffer,
    });
    fakeGenerate.mockImplementationOnce(({ contents }: { contents: unknown[] }) => {
      expect(Array.isArray(contents)).toBe(true);
      expect(contents.length).toBe(3); // dog + product + text
      return {
        candidates: [{ content: { parts: [{ inlineData: { data: pngBuffer().toString("base64"), mimeType: "image/png" } }] } }],
      };
    });
    const result = await generateDogTryOnGemini({
      dogImage: { buffer: pngBuffer(), contentType: "image/png" },
      product: { imageUrl: "https://x/p.jpg", title: "Cap", kind: "hat" },
    });
    expect(result.status).toBe("ok");
  });
});
