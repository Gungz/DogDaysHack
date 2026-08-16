import { describe, expect, it, vi, beforeEach } from "vitest";

const fetchMock = vi.fn(async (url: string | URL | Request, init?: { method?: string }) => {
  const u = String(url);
  if (u.includes("/s2s/v2.0/file")) {
    return new Response(
      JSON.stringify({ data: { files: [{ file_id: "fid", requests: [{ method: "PUT", url: "https://upload.example/x", headers: {} }] }] } }),
      { status: 200 },
    );
  }
  if (u === "https://upload.example/x") {
    return new Response(null, { status: 200 });
  }
  if (u.includes("/s2s/v2.0/task/")) {
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ data: { task_id: "tid" } }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ data: { task_status: "success", results: { url: "https://result.example/o.jpg" } } }),
      { status: 200 },
    );
  }
  return new Response(JSON.stringify({ error: "unexpected" }), { status: 404 });
});

vi.stubGlobal("fetch", fetchMock);

import { uploadDogImage, enhanceDogPortrait, replaceDogBackground, tryOnProduct } from "@/lib/youcam";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("youcam", () => {
  beforeEach(() => {
    process.env.YOUCAM_API_KEY = "test-key";
    process.env.YOUCAM_API_BASE_URL = "https://yce-api-01.makeupar.com";
    fetchMock.mockClear();
  });

  const bytes = Buffer.from(PNG_BASE64, "base64");

  it("uploads an image and returns a fileId", async () => {
    const res = await uploadDogImage("dog.png", "image/png", bytes);
    expect(res.fileId).toBe("fid");
  });

  it("enhances a portrait", async () => {
    const url = await enhanceDogPortrait("fid");
    expect(url).toBe("https://result.example/o.jpg");
  });

  it("replaces the background", async () => {
    const url = await replaceDogBackground("fid");
    expect(url).toBe("https://result.example/o.jpg");
  });

  it("runs a virtual try-on for clothes", async () => {
    const url = await tryOnProduct("clothes", "https://src.example/dog.jpg", "https://ref.example/shirt.jpg");
    expect(url).toBe("https://result.example/o.jpg");
  });
});
