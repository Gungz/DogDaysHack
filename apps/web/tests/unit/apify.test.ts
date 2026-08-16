import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    async connect() {}
    async close() {}
    async listTools() {
      return { tools: [{ name: "apify--e-commerce-scraping-tool" }, { name: "get-actor-run" }, { name: "get-dataset-items" }] };
    }
    async callTool(args: { name: string; arguments?: Record<string, unknown> }) {
      if (args.name === "apify--e-commerce-scraping-tool") {
        return {
          content: [{ type: "text", text: JSON.stringify({ runId: "run1", status: "SUCCEEDED", storages: { datasets: { default: { id: "ds1" } } } }) }],
        };
      }
      if (args.name === "get-actor-run") {
        return { content: [{ type: "text", text: JSON.stringify({ status: "SUCCEEDED" }) }] };
      }
      if (args.name === "get-dataset-items") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                items: [
                  {
                    name: "Test Collar",
                    image: "https://img/collar.jpg",
                    rating: 4.5,
                    reviewCount: 10,
                    offers: [{ price: "$19.99", priceCurrency: "$", url: "https://x/c" }],
                  },
                ],
              }),
            },
          ],
        };
      }
      return { content: [] };
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class {
    constructor(url?: unknown, opts?: unknown) {
      void url;
      void opts;
    }
    async close() {}
  },
}));

import { normalizeProducts, searchProductsWithApify } from "@/lib/apifyMcp";

const rawItem = {
  name: "Capri Leather Collar & Leash Set",
  image: "https://example.com/img.jpg",
  rating: 4.5,
  reviewCount: 120,
  offers: [{ seller: "Store", url: "https://store/collar", price: "78.00", priceCurrency: "$", rating: null }],
};

describe("normalizeProducts", () => {
  it("maps the real Apify e-commerce item shape", () => {
    const [p] = normalizeProducts([rawItem], "luxury dog collar", 5);
    expect(p.title).toBe("Capri Leather Collar & Leash Set");
    expect(p.imageUrl).toBe("https://example.com/img.jpg");
    expect(p.priceAmount).toBe(78);
    expect(p.currency).toBe("$");
    expect(p.rating).toBe(4.5);
    expect(p.reviewCount).toBe(120);
    expect(p.source).toBe("apify");
    expect(p.queryUsed).toBe("luxury dog collar");
  });

  it("returns [] when given a non-array run object", () => {
    expect(normalizeProducts({ status: "RUNNING" }, "q", 5)).toEqual([]);
  });
});

describe("searchProductsWithApify (mocked MCP)", () => {
  beforeEach(() => {
    process.env.APIFY_TOKEN = "test-token";
    process.env.APIFY_MCP_URL = "https://mcp.apify.com/?tools=apify/e-commerce-scraping-tool";
  });

  it("polls the run and reads dataset items", async () => {
    const res = await searchProductsWithApify(["luxury dog collar"]);
    expect(res.status).toBe("ok");
    expect(res.products).toHaveLength(1);
    expect(res.products[0].title).toBe("Test Collar");
    expect(res.products[0].priceAmount).toBe(19.99);
  });
});
