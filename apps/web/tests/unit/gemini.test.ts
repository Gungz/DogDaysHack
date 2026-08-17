import { describe, expect, it, vi, beforeEach } from "vitest";

const generateContent = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
    constructor(_opts: unknown) {}
  },
}));

import { generateDogProfile } from "@/lib/gemini";

function mockProfile(over: Record<string, unknown> = {}) {
  generateContent.mockResolvedValue({
    text: JSON.stringify({
      breedGuess: "Poodle",
      size: "small",
      vibe: "chic",
      colorPalette: ["white", "cream"],
      stylistSummary: "Very chic.",
      voiceScript: "Hello there, fashion icon.",
      productQueries: ["luxury dog collar", "dog harness"],
      subjectType: "dog",
      ...over,
    }),
  });
}

describe("generateDogProfile", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContent.mockReset();
    mockProfile();
  });

  it("returns a normalized profile from Gemini", async () => {
    const { profile, status } = await generateDogProfile({ fileName: "rex.png", buffer: Buffer.from("x"), contentType: "image/png" });
    expect(status).toBe("ok");
    expect(profile.breedGuess).toBe("Poodle");
    expect(profile.size).toBe("small");
    expect(profile.subjectType).toBe("dog");
    expect(profile.productQueries).toHaveLength(2);
  });

  it("normalizes subjectType from free-form text", async () => {
    mockProfile({ breedGuess: "Person", subjectType: "This is a photo of a HUMAN" });
    const { profile } = await generateDogProfile({ fileName: "person.png", buffer: Buffer.from("x"), contentType: "image/png" });
    expect(profile.subjectType).toBe("human");
  });

  it("falls back with missing_key when no API key", async () => {
    delete process.env.GEMINI_API_KEY;
    const { status, profile } = await generateDogProfile({ fileName: "rex.png", buffer: Buffer.from("x"), contentType: "image/png" });
    expect(status).toBe("missing_key");
    expect(profile.subjectType).toBe("unknown");
    expect(profile.productQueries.length).toBeGreaterThan(0);
  });
});
