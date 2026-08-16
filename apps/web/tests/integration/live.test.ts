import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

// Run with: RUN_LIVE=1 pnpm test tests/integration/live.test.ts
// Provide your own dog photo with SAMPLE_IMAGE_PATH=/path/to/dog.jpg
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const runLive = process.env.RUN_LIVE === "1";

describe.skipIf(!runLive)("live agent pipeline", () => {
  it("runs the full pipeline against real APIs", async () => {
    const { runDogAgent } = await import("@/lib/agent");
    const bytes = process.env.SAMPLE_IMAGE_PATH
      ? await readFile(process.env.SAMPLE_IMAGE_PATH)
      : Buffer.from(PNG_BASE64, "base64");
    const file = new File([bytes], "dog.png", { type: "image/png" });

    const result = await runDogAgent(file);
    console.log("providerStatus:", result.providerStatus);
    console.log("products:", result.products.length, "tryOn:", result.tryOnImageUrl);
    console.log("notes:", result.notes);

    expect(result.originalImageUrl).toBeTruthy();
    expect(Array.isArray(result.products)).toBe(true);
    expect(result.products.length).toBeGreaterThan(0);

    // Gemini should have analyzed the actual image (not the random fallback).
    expect(result.dogProfile.productQueries).toHaveLength(3);
    expect(result.dogProfile.breedGuess).not.toBe("Distinguished rescue mix");

    // Supabase upload must be a real, retrievable object (not a data: URL fallback).
    expect(result.originalImageUrl.startsWith("https://")).toBe(true);
    expect(result.originalImageUrl.startsWith("data:")).toBe(false);

    const res = await fetch(result.originalImageUrl);
    expect(res.status).toBe(200);
    expect((res.headers.get("content-type") || "").startsWith("image/")).toBe(true);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.byteLength).toBeGreaterThan(0);
    console.log("uploaded original bytes:", buf.byteLength);
  });
});
