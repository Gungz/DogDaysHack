import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn(async () => ({
        text: JSON.stringify({
          breedGuess: "Poodle",
          size: "small",
          vibe: "chic",
          colorPalette: ["white", "cream"],
          stylistSummary: "Very chic.",
          voiceScript: "Hello there, fashion icon.",
          productQueries: ["luxury dog collar", "dog harness"],
        }),
      })),
    };
  },
}));

import { generateDogProfile } from "@/lib/gemini";

describe("generateDogProfile", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("returns a normalized profile from Gemini", async () => {
    const { profile, status } = await generateDogProfile({ fileName: "rex.png", buffer: Buffer.from("x"), contentType: "image/png" });
    expect(status).toBe("ok");
    expect(profile.breedGuess).toBe("Poodle");
    expect(profile.size).toBe("small");
    expect(profile.productQueries).toHaveLength(2);
  });

  it("falls back with missing_key when no API key", async () => {
    delete process.env.GEMINI_API_KEY;
    const { status, profile } = await generateDogProfile({ fileName: "rex.png", buffer: Buffer.from("x"), contentType: "image/png" });
    expect(status).toBe("missing_key");
    expect(profile.productQueries.length).toBeGreaterThan(0);
  });
});
