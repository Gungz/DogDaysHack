#!/usr/bin/env node
// Creates the Metaplex Bubblegum V2 Core collection + tree on devnet.
// Run: node scripts/setup-onchain.mjs
// Requires `npx @metaplex-foundation/cli` available (it will be downloaded on first run).
import { execSync } from "node:child_process";

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const KEYPAIR = process.env.MINTER_KEYPAIR_PATH || "/Users/user/my-solana-wallet/id.json";
const COLLECTION_URI = process.env.COLLECTION_URI || "https://example.com/collection.json";

function run(cmd) {
  console.log("\n$ " + cmd);
  const out = execSync(cmd, { encoding: "utf8", stdio: "inherit" });
  return out;
}

console.log("Using keypair:", KEYPAIR);
console.log("Using RPC:", RPC);

run(
  `npx @metaplex-foundation/cli bg collection create --name "DogeVault Receipts" --uri "${COLLECTION_URI}" --keypair ${KEYPAIR} --rpc ${RPC}`,
);

run(
  `npx @metaplex-foundation/cli bg tree create --maxDepth 14 --maxBufferSize 64 --canopyDepth 8 --name "dogevault" --keypair ${KEYPAIR} --rpc ${RPC}`,
);

console.log("\nCopy the printed tree address -> NEXT_PUBLIC_BUBBLEGUM_TREE");
console.log("Copy the printed collection address -> NEXT_PUBLIC_CORE_COLLECTION");
