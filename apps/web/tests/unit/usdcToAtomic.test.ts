import { describe, expect, it } from "vitest";
import { usdcToAtomic } from "@/lib/dogeVault";

describe("usdcToAtomic", () => {
  it("converts USD to 6-decimal atomic units", () => {
    expect(usdcToAtomic(1)).toBe(1_000_000);
    expect(usdcToAtomic(25)).toBe(25_000_000);
  });

  it("rounds to whole atomic units", () => {
    expect(usdcToAtomic(0.1234567)).toBe(123_457);
  });
});
