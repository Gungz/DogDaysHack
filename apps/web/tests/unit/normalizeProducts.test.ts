import { describe, expect, it } from "vitest";
import { normalizeProducts } from "@/lib/apifyMcp";

describe("normalizeProducts", () => {
  it("maps a raw Apify-style array into Product[]", () => {
    const raw = [
      {
        title: "Cool Dog Collar",
        url: "https://shop.example/p/1",
        image: "https://img.example/1.jpg",
        price: "$19.99",
        rating: "4.5",
        reviews: "200",
        source: "Shop",
      },
      {
        name: "Chew Toy",
        productUrl: "https://shop.example/p/2",
        thumbnail: "https://img.example/2.jpg",
        offers: { price: "14,50", priceCurrency: "EUR" },
      },
    ];

    const products = normalizeProducts(raw, "dog collar", 5);

    expect(products).toHaveLength(2);
    expect(products[0].title).toBe("Cool Dog Collar");
    expect(products[0].priceAmount).toBe(19.99);
    expect(products[0].currency).toBe("USD");
    expect(products[0].rating).toBe(4.5);
    expect(products[0].reviewCount).toBe(200);
    expect(products[0].queryUsed).toBe("dog collar");
    expect(products[1].priceAmount).toBe(14.5);
    expect(products[1].currency).toBe("EUR");
    expect(products[1].id).toBeTruthy();
  });

  it("slices to max and fills defaults", () => {
    const raw = Array.from({ length: 10 }, (_, i) => ({ title: `Item ${i}` }));
    const products = normalizeProducts(raw, "q", 3);
    expect(products).toHaveLength(3);
    expect(products[0].url).toContain("http");
    expect(products[0].source).toBe("apify");
  });

  it("handles nested items/products keys", () => {
    const raw = { products: [{ title: "Nested", url: "https://x/y" }] };
    const products = normalizeProducts(raw, "q", 5);
    expect(products).toHaveLength(1);
    expect(products[0].title).toBe("Nested");
  });
});
