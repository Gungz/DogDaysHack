import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tryOnProduct, uploadDogImage } from "@/lib/youcam";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("youcam adapter", () => {
  beforeEach(() => {
    process.env.YOUCAM_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.YOUCAM_API_KEY;
  });

  it("uploadDogImage uploads to presigned URL and returns fileId", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/s2s/v2.0/file")) {
        return jsonResponse({
          data: {
            files: [{ file_id: "fid123", requests: [{ method: "PUT", url: "https://put", headers: {} }] }],
          },
        });
      }
      return jsonResponse({}, 200);
    });
    vi.stubGlobal("fetch", fetchMock);

    const bytes = Buffer.from("fakeimage");
    const res = await uploadDogImage("dog.png", "image/png", bytes);
    expect(res.fileId).toBe("fid123");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tryOnProduct clothes polls to success and uses cloth-v3 path", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ data: { task_id: "task1" } });
      return jsonResponse({ data: { task_status: "success", results: { url: "https://result/img.png" } } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = await tryOnProduct("clothes", "https://src", "https://ref");
    expect(url).toBe("https://result/img.png");

    const postCall = fetchMock.mock.calls.find((c) => c[1]?.method === "POST");
    expect(String(postCall?.[0])).toContain("/s2s/v2.0/task/cloth-v3");
    const body = JSON.parse((postCall?.[1] as RequestInit).body as string);
    expect(body.garment_category).toBe("auto");
    expect(body.src_file_url).toBe("https://src");
    expect(body.ref_file_url).toBe("https://ref");
  });

  it("tryOnProduct maps hat/shoes and surfaces the task error (does not swallow it)", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ data: { task_id: "task1" } });
      return jsonResponse({ data: { task_status: "error", error_message: "no face" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    // Errors are propagated so callers (agent / API route) can surface the real reason
    // instead of returning a silent null.
    await expect(tryOnProduct("hat", "https://src", "https://ref")).rejects.toThrow(/no face/);

    const postCall = fetchMock.mock.calls.find((c) => c[1]?.method === "POST");
    expect(String(postCall?.[0])).toContain("/s2s/v2.0/task/hat");
    const body = JSON.parse((postCall?.[1] as RequestInit).body as string);
    expect(body.gender).toBe("female");
    expect(body.style).toBe("random");
  });
});
