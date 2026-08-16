import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const here = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(here, "../.env"), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const client = new Client({ name: "probe", version: "0.1.0" }, { capabilities: {} });
const transport = new StreamableHTTPClientTransport(new URL(env.APIFY_MCP_URL), {
  requestInit: { headers: { Authorization: `Bearer ${env.APIFY_TOKEN}` } },
});

await client.connect(transport);
const listed = await client.listTools();
const ecom = listed.tools.find((c) => /e-commerce|ecommerce|apify/i.test(c.name));
console.log("ECOM INPUT SCHEMA:", JSON.stringify(ecom.inputSchema, null, 2).slice(0, 2000));

const runResult = await client.callTool({
  name: ecom.name,
  arguments: {
    searchEngineKeyword: "luxury dog collar",
    countryCode: "us",
    scrapeMode: "AUTO",
    additionalProperties: false,
    additionalPropertiesSearchEngine: false,
    maxSearchEngineProducts: 3,
    maxSearchEngineResults: 3,
    maxProductResults: 3,
  },
});
const runText = runResult.content?.find((c) => c.type === "text")?.text;
const run = runText ? JSON.parse(runText) : runResult;
console.log("RUN STATUS:", run.status, "runId:", run.runId, "datasetId:", run.storages?.datasets?.default?.id);

const datasetId = run.storages?.datasets?.default?.id;
const runTool = listed.tools.find((c) => c.name === "get-actor-run");
const itemsTool = listed.tools.find((c) => c.name === "get-dataset-items");
console.log("GET-ACTOR-RUN SCHEMA:", JSON.stringify(runTool?.inputSchema));
console.log("GET-DATASET-ITEMS SCHEMA:", JSON.stringify(itemsTool?.inputSchema));

// poll run status
let status = run.status;
for (let i = 0; i < 10 && status === "RUNNING"; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const rr = await client.callTool({ name: "get-actor-run", arguments: { runId: run.runId } });
  const rt = rr.content?.find((c) => c.type === "text")?.text;
  const r = rt ? JSON.parse(rt) : rr;
  status = r.status;
  console.log(`poll ${i}: ${status}`);
}

const itemsRes = await client.callTool({ name: "get-dataset-items", arguments: { datasetId, limit: 5 } });
const itText = itemsRes.content?.find((c) => c.type === "text")?.text;
console.log("DATASET ITEMS (first 1500):", itText?.slice(0, 1500));
await transport.close().catch(() => undefined);
