import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { getServerEnv } from "./env";
import type { Product, ProductCategory } from "./types";

export function categoryFromText(text: string): ProductCategory {
  const t = text.toLowerCase();
  if (/(shoe|boot|sneaker|paw ?wear|sandal|sock)/.test(t)) return "shoes";
  if (/(hat|cap|beanie|headwear|headband)/.test(t)) return "hat";
  if (/(cloth|shirt|sweater|harness|collar|jacket|costume|outfit|apparel|dress|hoodie)/.test(t)) return "clothes";
  return "unknown";
}

const mockProducts: Product[] = [
  {
    id: "mock-collar",
    title: "Mock Luxury Dog Collar",
    url: "https://example.com/products/luxury-dog-collar",
    imageUrl: "https://placehold.co/600x400/png?text=Luxury+Dog+Collar",
    priceText: "$18.99",
    priceAmount: 18.99,
    currency: "USD",
    rating: 4.8,
    reviewCount: 1240,
    source: "mock",
    queryUsed: "luxury dog collar",
  },
  {
    id: "mock-chew",
    title: "Mock Indestructible Chew Toy",
    url: "https://example.com/products/indestructible-chew-toy",
    imageUrl: "https://placehold.co/600x400/png?text=Chew+Toy",
    priceText: "$14.50",
    priceAmount: 14.5,
    currency: "USD",
    rating: 4.7,
    reviewCount: 980,
    source: "mock",
    queryUsed: "durable dog chew toy",
  },
  {
    id: "mock-harness",
    title: "Mock Comfort Harness",
    url: "https://example.com/products/comfort-dog-harness",
    imageUrl: "https://placehold.co/600x400/png?text=Dog+Harness",
    priceText: "$24.00",
    priceAmount: 24,
    currency: "USD",
    rating: 4.6,
    reviewCount: 640,
    source: "mock",
    queryUsed: "comfortable dog harness",
  },
];

function parsePrice(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[^0-9.,]/g, "").replace(/,(?=\d{3}\b)/g, "");
  if (!cleaned) return undefined;
  const normalized = cleaned.includes(",") && !cleaned.includes(".") ? cleaned.replace(",", ".") : cleaned;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of ["items", "results", "products", "data"]) {
      const nested = record[key];
      if (Array.isArray(nested)) return asRecordArray(nested);
    }
  }
  return [];
}

export function normalizeProducts(raw: unknown, queryUsed: string, max: number, category: ProductCategory = "unknown"): Product[] {
  return asRecordArray(raw)
    .slice(0, max)
    .map((item, index) => {
      const rawOffers = (item as Record<string, unknown>).offers;
      const firstOffer =
        Array.isArray(rawOffers) && rawOffers.length
          ? (rawOffers[0] as Record<string, unknown>)
          : typeof rawOffers === "object" && rawOffers !== null
            ? (rawOffers as Record<string, unknown>)
            : {};
      const title = pickString(item, ["title", "name", "productName"]) || `Product ${index + 1}`;
      const url =
        pickString(item, ["url", "productUrl", "link", "href", "canonicalUrl", "webUrl", "buyUrl", "productLink", "offerUrl", "productUrl"]) ||
        pickString(firstOffer as Record<string, unknown>, ["url", "link", "href"]) ||
        "https://example.com";
      const priceText =
        pickString(item, ["price", "priceText", "currentPrice"]) ||
        (typeof firstOffer.price === "string" ? firstOffer.price : undefined);
      const priceAmount = parsePrice(priceText ?? firstOffer.price ?? item.priceAmount);
      const rating = parsePrice(item.rating ?? item.averageRating);
      const reviewCount = parsePrice(item.reviewCount ?? item.reviews);
      return {
        id: pickString(item, ["id", "asin", "sku"]) || `${queryUsed.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${index}`,
        title,
        url,
        imageUrl: pickString(item, ["image", "imageUrl", "thumbnail", "img"]),
        priceText,
        priceAmount,
        currency:
          pickString(item, ["currency", "priceCurrency"]) ||
          (typeof firstOffer.priceCurrency === "string" ? firstOffer.priceCurrency : "USD"),
        rating,
        reviewCount: reviewCount ? Math.round(reviewCount) : undefined,
        source: pickString(item, ["source", "merchant", "store"]) || "apify",
        queryUsed,
        category,
      } satisfies Product;
    });
}

type ApifyRun = {
  products: Product[];
  status: "ok" | "error";
  query: string;
  note?: string;
};

async function runApifyQuery(
  client: Client,
  tools: { ecommerce: string; run: string; items: string },
  query: string,
): Promise<ApifyRun> {
  try {
    // The e-commerce tool runs an Apify actor asynchronously and returns a run object
    // (status RUNNING/SUCCEEDED) plus the default dataset id. We must poll the run to
    // completion, then read the dataset items.
    const started = await client.callTool({
      name: tools.ecommerce,
      arguments: {
        searchEngineKeyword: query,
        countryCode: "us",
        scrapeMode: "AUTO",
        additionalProperties: false,
        additionalPropertiesSearchEngine: false,
        maxSearchEngineProducts: 10,
        maxSearchEngineResults: 10,
        maxProductResults: 10,
      },
    });
    const startedText = (started as { content?: Array<{ type: string; text?: string }> }).content?.find((c) => c.type === "text")?.text;
    const run = startedText ? JSON.parse(startedText) : started;
    const runId: string | undefined = run.runId || run.id;
    let datasetId: string | undefined = run.storages?.datasets?.default?.id;
    if (!runId) throw new Error("Apify e-commerce tool did not return a run id");

    let status: string = run.status || "RUNNING";
    for (let attempt = 0; attempt < 4 && status === "RUNNING"; attempt++) {
      const rr = await client.callTool({ name: tools.run, arguments: { runId, waitSecs: 30 } });
      const rt = (rr as { content?: Array<{ type: string; text?: string }> }).content?.find((c) => c.type === "text")?.text;
      const r = rt ? JSON.parse(rt) : rr;
      status = r.status || status;
      datasetId = datasetId || r.storages?.datasets?.default?.id || r.defaultDatasetId;
    }
    if (status === "RUNNING") throw new Error(`Apify run ${runId} still running after polling`);
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify run ${runId} ended with status ${status}`);
    }

    if (!datasetId) throw new Error(`Apify run ${runId} produced no dataset`);

    const itemsRes = await client.callTool({ name: tools.items, arguments: { datasetId, limit: 10, clean: true } });
    const itemsText = (itemsRes as { content?: Array<{ type: string; text?: string }> }).content?.find((c) => c.type === "text")?.text;
    const itemsPayload = itemsText ? JSON.parse(itemsText) : itemsRes;
    const category = categoryFromText(query);
    const products = normalizeProducts(itemsPayload?.items ?? itemsPayload, query, 10, category);
    if (!products.length) throw new Error("Apify MCP returned no products");
    return { products, status: "ok", query };
  } catch (error) {
    return {
      products: [],
      status: "error",
      query,
      note: error instanceof Error ? error.message : "Unknown Apify MCP error.",
    };
  }
}

export async function searchProductsWithApify(queries: string[]): Promise<{ products: Product[]; status: "ok" | "missing_key" | "error"; note?: string }> {
  const env = getServerEnv();
  if (!env.apifyToken) return { products: mockProducts, status: "missing_key", note: "APIFY_TOKEN missing; returned mock products." };

  const queriesToRun = (queries.filter((q) => q?.trim()).length ? queries : ["luxury dog collar"])
    .map((q) => q.trim())
    .slice(0, 3);
  const client = new Client({ name: "dogevault-stylist", version: "0.1.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(env.apifyMcpUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${env.apifyToken}`,
      },
    },
  });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const ecommerce = listed.tools.find((candidate) => /e-commerce|ecommerce|apify/i.test(candidate.name));
    if (!ecommerce) {
      throw new Error(`No Apify e-commerce MCP tool found. Tools: ${listed.tools.map((item) => item.name).join(", ")}`);
    }
    const runTool = listed.tools.find((c) => c.name === "get-actor-run");
    const itemsTool = listed.tools.find((c) => c.name === "get-dataset-items");
    if (!runTool || !itemsTool) {
      throw new Error("Apify get-actor-run / get-dataset-items tools not available");
    }

    const results = await Promise.all(
      queriesToRun.map((query) => runApifyQuery(client, { ecommerce: ecommerce.name, run: runTool.name, items: itemsTool.name }, query)),
    );

    const products = results.flatMap((r) => r.products);
    const notes = results.filter((r) => r.note).map((r) => `${r.query}: ${r.note}`);
    if (!products.length) {
      const firstNote = notes[0] || "Apify MCP returned no products";
      return { products: [], status: "error", note: firstNote };
    }
    return { products, status: "ok", note: notes.length ? notes.join(" | ") : undefined };
  } catch (error) {
    // Only fall back to mocks when there is no key. On a real error we surface it
    // instead of hiding it behind mock data.
    return {
      products: [],
      status: "error",
      note: error instanceof Error ? error.message : "Unknown Apify MCP error.",
    };
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export function buildProductId(product: Product) {
  return (
    randomUUID().slice(0, 8) +
    "-" +
    product.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36)
  );
}