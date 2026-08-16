import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const here = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(here, "../.env"), "utf8");
const env = {};
for (const line of envText.split("\n")) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const client = new Client({ name: "probe", version: "0.1.0" }, { capabilities: {} });
const transport = new StreamableHTTPClientTransport(new URL(env.APIFY_MCP_URL), { requestInit: { headers: { Authorization: `Bearer ${env.APIFY_TOKEN}` } } });
await client.connect(transport);
const listed = await client.listTools();
const ecom = listed.tools.find((c) => /e-commerce|ecommerce|apify/i.test(c.name));
const runResult = await client.callTool({ name: ecom.name, arguments: { searchEngineKeyword: "dog collar", countryCode: "us", scrapeMode: "AUTO", additionalProperties: false, additionalPropertiesSearchEngine: false, maxSearchEngineProducts: 10, maxSearchEngineResults: 10, maxProductResults: 10 } });
const runText = runResult.content?.find((c) => c.type === "text")?.text;
const run = runText ? JSON.parse(runText) : runResult;
console.log("RUN STATUS:", run.status, "datasetId:", run.storages?.datasets?.default?.id);
const datasetId = run.storages?.datasets?.default?.id;
let status = run.status;
for (let i = 0; i < 15 && status === "RUNNING"; i++) { await new Promise((r) => setTimeout(r, 3000)); const rr = await client.callTool({ name: "get-actor-run", arguments: { runId: run.runId, waitSecs: 30 } }); const rt = rr.content?.find((c) => c.type === "text")?.text; const r = rt ? JSON.parse(rt) : rr; status = r.status; console.log(`poll ${i}: ${status}`); }
const itemsRes = await client.callTool({ name: "get-dataset-items", arguments: { datasetId, limit: 10, clean: true } });
const itText = itemsRes.content?.find((c) => c.type === "text")?.text;
const parsed = itText ? JSON.parse(itText) : itemsRes;
console.log("TOTAL ITEMS:", parsed.totalItemCount, "itemCount:", parsed.itemCount);
console.log("FIRST ITEM:", JSON.stringify(parsed.items?.[0]).slice(0, 800));
await transport.close().catch(() => undefined);
