import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({
  storeImage: vi.fn(async () => "https://cdn.example.com/tryon.png"),
}));

import { generateDogTryOnQwen } from "@/lib/qwenTryOn";

function pngBuffer() {
  return Buffer.from("iVBORw0KGgo=", "base64");
}

describe("generateDogTryOnQwen", () => {
  beforeEach(() => {
    process.env.DASHSCOPE_API_KEY = "test-qwen-key";
    vi.stubGlobal("fetch", vi.fn());
  });

  function mockQwen(ok = true, status = 200) {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("multimodal-generation")) {
        return {
          ok,
          status,
          json: async () =>
            ok
              ? { output: { choices: [{ message: { content: [{ image: "https://result.example/out.png" }] } }] } }
              : { code: "InvalidApiKey", message: "Invalid API-key" },
        };
      }
      return { ok: true, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => pngBuffer().buffer };
    });
  }

  it("returns ok and uploads when Qwen returns an image", async () => {
    mockQwen();
    const result = await generateDogTryOnQwen({
      dogImage: { buffer: pngBuffer(), contentType: "image/png" },
      product: { imageUrl: "https://x/p.jpg", title: "Cap", kind: "hat" },
    });
    expect(result.status).toBe("ok");
    expect(result.url).toBe("https://cdn.example.com/tryon.png");
    expect(result.engine).toBe("qwen");
  });

  it("passes both dog and product as reference images", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    let captured: { input: { messages: Array<{ content: Array<Record<string, unknown>> }> } } = {
      input: { messages: [{ content: [] }] },
    };
    fetchMock.mockImplementation(async (url: string, init?: { body?: string }) => {
      if (String(url).includes("multimodal-generation")) {
        captured = JSON.parse(init?.body ?? "{}") as typeof captured;
        return { ok: true, status: 200, json: async () => ({ output: { choices: [{ message: { content: [{ image: "https://result.example/out.png" }] } }] } }) };
      }
      return { ok: true, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => pngBuffer().buffer };
    });
    const result = await generateDogTryOnQwen({
      dogImage: { buffer: pngBuffer(), contentType: "image/png" },
      product: { imageUrl: "https://x/p.jpg", title: "Cap", kind: "hat" },
    });
    expect(result.status).toBe("ok");
    const images = captured.input.messages[0].content.filter((c) => "image" in c);
    expect(images.length).toBe(2);
  });

  it("returns image_gen_unavailable on auth/quota error", async () => {
    mockQwen(false, 401);
    const result = await generateDogTryOnQwen({
      dogImage: { buffer: pngBuffer(), contentType: "image/png" },
      product: { title: "Cap", kind: "hat" },
    });
    expect(result.status).toBe("image_gen_unavailable");
    expect(result.url).toBeNull();
  });

  it("returns missing_key without DASHSCOPE_API_KEY", async () => {
    delete process.env.DASHSCOPE_API_KEY;
    const result = await generateDogTryOnQwen({
      dogImage: { buffer: pngBuffer(), contentType: "image/png" },
      product: { title: "Cap", kind: "hat" },
    });
    expect(result.status).toBe("missing_key");
  });
});
