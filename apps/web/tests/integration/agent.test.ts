import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/agent/route";

function pngFile(): File {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const buf = Buffer.from(base64, "base64");
  return new File([buf], "dog.png", { type: "image/png" });
}

describe("POST /api/agent", () => {
  beforeEach(() => {
    delete process.env.YOUCAM_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.APIFY_TOKEN;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("returns a valid AgentResult using fallbacks when provider keys are absent", async () => {
    const form = new FormData();
    form.set("image", pngFile());

    const req = new Request("http://localhost/api/agent", { method: "POST", body: form });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.originalImageUrl).toBe("string");
    expect(Array.isArray(data.products)).toBe(true);
    expect(data.products.length).toBeGreaterThan(0);
    expect(data.providerStatus.youcam).toBe("missing_key");
    expect(data.providerStatus.gemini).toBe("missing_key");
    expect(data.providerStatus.apify).toBe("missing_key");
    expect(data.tryOnImageUrl).toBeNull();
  });

  it("returns 400 when no image is provided", async () => {
    const form = new FormData();
    const req = new Request("http://localhost/api/agent", { method: "POST", body: form });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
