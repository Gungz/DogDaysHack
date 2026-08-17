import { describe, expect, it, vi, beforeEach } from "vitest";

// supabase.ts reads env at module load, so set it before the import is evaluated.
vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.SUPABASE_IMAGES_BUCKET = "dogevault-images";
  process.env.SUPABASE_METADATA_BUCKET = "dogevault-metadata";
});

const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
vi.stubGlobal("fetch", fetchMock);

import { storeImage, buildNftMetadata, storeNftMetadata, type NftMetadata } from "@/lib/supabase";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("supabase", () => {
  beforeEach(() => {
    fetchMock.mockClear();
  });

  it("stores an image via the Storage REST API and returns a public URL", async () => {
    const url = await storeImage(Buffer.from(PNG_BASE64, "base64"), "image/png", "dogevault/originals");
    expect(url.startsWith("https://example.supabase.co/storage/v1/object/public/dogevault-images/")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toContain("/storage/v1/object/dogevault-images/");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer service-key");
  });

  it("stores NFT metadata JSON and reports stored=true", async () => {
    const meta: NftMetadata = {
      name: "Receipt",
      description: "d",
      image: "https://img",
      attributes: [],
      dog_profile: { breedGuess: "x", size: "unknown", vibe: "y", colorPalette: [], stylistSummary: "s", voiceScript: "v", productQueries: [], subjectType: "unknown" },
      product: { id: "1", title: "Collar", url: "u", imageUrl: "i", priceText: "$1", priceAmount: 1, currency: "USD", rating: 5, reviewCount: 1, source: "apify", queryUsed: "q" },
      created_at: new Date().toISOString(),
    };
    const { uri, stored } = await storeNftMetadata(meta);
    expect(stored).toBe(true);
    expect(uri.startsWith("https://example.supabase.co/storage/v1/object/public/dogevault-metadata/")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("builds metadata with attributes", () => {
    const meta = buildNftMetadata({
      dogProfile: { breedGuess: "Beagle", size: "medium", vibe: "happy", colorPalette: ["brown"], stylistSummary: "s", voiceScript: "v", productQueries: [], subjectType: "dog" },
      product: { id: "1", title: "Collar", url: "u", imageUrl: "i", priceText: "$9", priceAmount: 9, currency: "USD", source: "apify", queryUsed: "q" },
      enhancedImageUrl: "https://img",
    });
    expect(meta.name).toContain("Collar");
    expect(meta.attributes.find((a) => a.trait_type === "Breed Guess")?.value).toBe("Beagle");
  });
});
