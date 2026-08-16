import { describe, expect, it } from "vitest";
import { buildNftMetadata } from "@/lib/supabase";
import type { DogProfile, Product } from "@/lib/types";

const dogProfile: DogProfile = {
  breedGuess: "Shiba Inu",
  size: "medium",
  vibe: "distinguished senior-pup energy",
  colorPalette: ["cream", "tan"],
  stylistSummary: "A regal companion.",
  voiceScript: "Hello.",
  productQueries: ["luxury dog collar"],
};

const product: Product = {
  id: "p1",
  title: "Luxury Dog Collar",
  url: "https://shop.example/p/1",
  imageUrl: "https://img.example/1.jpg",
  priceText: "$19.99",
  priceAmount: 19.99,
  currency: "USD",
  rating: 4.8,
  reviewCount: 1240,
  source: "Shop",
  queryUsed: "luxury dog collar",
};

describe("buildNftMetadata", () => {
  it("builds attributes from profile and product", () => {
    const meta = buildNftMetadata({
      dogProfile,
      product,
      enhancedImageUrl: "https://img.example/enhanced.jpg",
      txSignature: "sig123",
    });

    expect(meta.name).toContain("Luxury Dog Collar");
    expect(meta.image).toBe("https://img.example/enhanced.jpg");
    expect(meta.tx_signature).toBe("sig123");
    const traits = Object.fromEntries(meta.attributes.map((a) => [a.trait_type, a.value]));
    expect(traits["Breed Guess"]).toBe("Shiba Inu");
    expect(traits["Size"]).toBe("medium");
    expect(traits["Energy/Style"]).toBe("distinguished senior-pup energy");
    expect(traits["Product"]).toBe("Luxury Dog Collar");
  });

  it("falls back to Unknown for missing fields", () => {
    const minimalProfile: DogProfile = {
      breedGuess: "",
      size: "unknown",
      vibe: "",
      colorPalette: [],
      stylistSummary: "",
      voiceScript: "",
      productQueries: [],
    };
    const minimalProduct: Product = { id: "x", title: "T", url: "https://u", source: "s", queryUsed: "q" };
    const meta = buildNftMetadata({ dogProfile: minimalProfile, product: minimalProduct, enhancedImageUrl: "" });
    const traits = Object.fromEntries(meta.attributes.map((a) => [a.trait_type, a.value]));
    expect(traits["Breed Guess"]).toBe("Unknown");
    expect(traits["Size"]).toBe("unknown");
    expect(meta.tx_signature).toBeUndefined();
  });
});
