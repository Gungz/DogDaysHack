import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "../.env");
const envText = readFileSync(envPath, "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const buckets = [
  process.env.SUPABASE_IMAGES_BUCKET || "dogevault-images",
  process.env.SUPABASE_METADATA_BUCKET || "dogevault-metadata",
];

for (const bucket of buckets) {
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: bucket, public: true }),
  });
  const text = await res.text();
  if (res.ok) {
    console.log(`Bucket created: ${bucket}`);
  } else if (/already exists/i.test(text)) {
    console.log(`Bucket already exists: ${bucket}`);
  } else {
    console.error(`Bucket "${bucket}" error (${res.status}):`, text);
  }
}
