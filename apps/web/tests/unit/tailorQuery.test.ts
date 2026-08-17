import { describe, expect, it } from "vitest";
import { tailorQuery } from "@/lib/agent";
import type { DogProfile } from "@/lib/types";

const profile: DogProfile = {
  breedGuess: "French Bulldog",
  size: "small",
  vibe: "playful",
  colorPalette: ["red"],
  stylistSummary: "cute",
  voiceScript: "hi",
  productQueries: [],
  subjectType: "dog",
};

describe("tailorQuery", () => {
  it("appends missing breed, size, and color", () => {
    expect(tailorQuery("knit sweater", profile)).toBe("knit sweater small French Bulldog red");
  });

  it("does not duplicate attributes already present", () => {
    expect(tailorQuery("small French Bulldog red rain boots", profile)).toBe("small French Bulldog red rain boots");
  });

  it("skips unknown size", () => {
    expect(tailorQuery("sun hat", { ...profile, size: "unknown" })).toBe("sun hat French Bulldog red");
  });
});
