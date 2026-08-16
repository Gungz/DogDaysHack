import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("child_process", () => ({
  execFileSync: vi.fn(() => "Signature: 4uQeVjRzabcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuvwxyz asset: 7nE9abcdefghijklmnopqrstuvwxyz123456"),
}));

import { mintCnftReceipt } from "@/lib/nft";

describe("mintCnftReceipt (V2 CLI)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BUBBLEGUM_TREE = "Tree111111111111111111111111111111111111";
    process.env.NEXT_PUBLIC_CORE_COLLECTION = "Coll111111111111111111111111111111111111";
    process.env.MINTER_KEYPAIR_PATH = "/tmp/minter.json";
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_BUBBLEGUM_TREE;
    delete process.env.NEXT_PUBLIC_CORE_COLLECTION;
    delete process.env.MINTER_KEYPAIR_PATH;
    vi.clearAllMocks();
  });

  it("builds the correct mplx bg nft create command", async () => {
    const { execFileSync } = await import("child_process");
    const result = mintCnftReceipt({ metadataUri: "https://x/meta.json", name: "Receipt" });

    expect(execFileSync).toHaveBeenCalled();
    const call = (execFileSync as unknown as Mock).mock.calls[0];
    expect(call[0]).toBe("npx");
    const args: string[] = call[1];
    expect(args).toContain("bg");
    expect(args).toContain("nft");
    expect(args).toContain("create");
    expect(args).toContain("Tree111111111111111111111111111111111111");
    expect(args).toContain("--collection");
    expect(args).toContain("Coll111111111111111111111111111111111111");
    expect(args).toContain("--uri");
    expect(args).toContain("https://x/meta.json");
    expect(typeof result.mintAddress).toBe("string");
  });

  it("throws if tree env missing", () => {
    delete process.env.NEXT_PUBLIC_BUBBLEGUM_TREE;
    expect(() => mintCnftReceipt({ metadataUri: "u", name: "n" })).toThrow(/NEXT_PUBLIC_BUBBLEGUM_TREE/);
  });

  it("throws if collection env missing", () => {
    delete process.env.NEXT_PUBLIC_CORE_COLLECTION;
    expect(() => mintCnftReceipt({ metadataUri: "u", name: "n" })).toThrow(/NEXT_PUBLIC_CORE_COLLECTION/);
  });
});
