import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env into process.env for tests (vitest does not do this automatically).
// Also strips trailing CR so values from CRLF files are not corrupted.
const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "..", ".env");

if (existsSync(envPath)) {
  const raw = readFileSync(envPath, "utf8").split("\n");
  for (const line of raw) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim().replace(/\r$/, "");
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
