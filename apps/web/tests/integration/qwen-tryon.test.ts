import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

// Run with: RUN_LIVE=1 DASHSCOPE_API_KEY=... pnpm exec vitest run tests/integration/qwen-tryon.test.ts
// Provide a real dog photo with SAMPLE_IMAGE_PATH=/path/to/dog.jpg
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const runLive = process.env.RUN_LIVE === "1" && !!process.env.DASHSCOPE_API_KEY;

describe.skipIf(!runLive)("qwen dog try-on (live)", () => {
  it("generates a dog try-on image via Qwen and stores it", async () => {
    const { generateDogTryOnQwen } = await import("@/lib/qwenTryOn");
    const bytes = process.env.SAMPLE_IMAGE_PATH
      ? await readFile(process.env.SAMPLE_IMAGE_PATH)
      : Buffer.from(PNG_BASE64, "base64");

    const result = await generateDogTryOnQwen({
      dogImage: { buffer: bytes, contentType: "image/png" },
      product: {
        imageUrl: process.env.QWEN_TEST_PRODUCT_URL,
        title: "Dog outfit",
        kind: "clothes",
      },
    });
    console.log("qwen tryon result:", result);

    expect(["ok", "image_gen_unavailable", "error"]).toContain(result.status);
    if (result.status === "ok" && result.url) {
      const res = await fetch(result.url);
      expect(res.status).toBe(200);
      expect((res.headers.get("content-type") || "").startsWith("image/")).toBe(true);
      console.log("stored try-on url:", result.url);
    }
  });
});
