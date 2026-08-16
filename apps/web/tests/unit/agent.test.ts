import { describe, expect, it } from "vitest";
import { categoryFromText } from "@/lib/apifyMcp";
import { tryOnKindForProduct } from "@/lib/agent";

describe("categoryFromText", () => {
  it("detects shoes", () => {
    expect(categoryFromText("dog shoes boots")).toBe("shoes");
    expect(categoryFromText("paw wear sneakers")).toBe("shoes");
  });
  it("detects hat", () => {
    expect(categoryFromText("dog hat cap")).toBe("hat");
    expect(categoryFromText("beanie headwear")).toBe("hat");
  });
  it("detects clothes", () => {
    expect(categoryFromText("luxury dog collar")).toBe("clothes");
    expect(categoryFromText("dog sweater harness")).toBe("clothes");
  });
  it("returns unknown when no keyword matches", () => {
    expect(categoryFromText("premium chew toy")).toBe("unknown");
  });
});

describe("tryOnKindForProduct", () => {
  it("prefers the product category tag", () => {
    expect(tryOnKindForProduct({ category: "hat", title: "anything", queryUsed: "q" })).toBe("hat");
    expect(tryOnKindForProduct({ category: "shoes", title: "anything", queryUsed: "q" })).toBe("shoes");
  });
  it("falls back to title/query keywords", () => {
    expect(tryOnKindForProduct({ category: "unknown", title: "running shoe", queryUsed: "q" })).toBe("shoes");
    expect(tryOnKindForProduct({ category: "unknown", title: "sun hat", queryUsed: "q" })).toBe("hat");
  });
  it("defaults to clothes when nothing matches", () => {
    expect(tryOnKindForProduct({ category: "unknown", title: "premium chew toy", queryUsed: "chew" })).toBe("clothes");
    expect(tryOnKindForProduct({ category: undefined, title: "weird item", queryUsed: "x" })).toBe("clothes");
  });
});
