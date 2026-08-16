import { execFileSync } from "child_process";
import { getPublicSolanaConfig } from "./env";

export interface MintCnftInput {
  metadataUri: string;
  name: string;
  symbol?: string;
  owner?: string;
}

export interface MintCnftResult {
  mintAddress: string;
  signature: string;
  raw: string;
}

/**
 * Mints a Metaplex Bubblegum V2 compressed NFT (cNFT) by invoking the
 * Metaplex CLI server-side. V2 trees require a Core collection, so both
 * NEXT_PUBLIC_BUBBLEGUM_TREE and NEXT_PUBLIC_CORE_COLLECTION must be set.
 *
 * The mint is performed by the server keypair (the tree creator), not the
 * user's wallet — the user already approved the spend; this just issues the
 * receipt. Uses `npx @metaplex-foundation/cli` so we don't have to resolve the
 * umi 0.9/1.5 peer conflict inside the app.
 */
export function mintCnftReceipt(input: MintCnftInput): MintCnftResult {
  const { metadataUri, name, owner } = input;
  const config = getPublicSolanaConfig();
  const tree = process.env.NEXT_PUBLIC_BUBBLEGUM_TREE;
  const collection = process.env.NEXT_PUBLIC_CORE_COLLECTION;
  const keypair = process.env.MINTER_KEYPAIR_PATH || "/Users/user/my-solana-wallet/id.json";

  if (!tree) {
    throw new Error("Missing NEXT_PUBLIC_BUBBLEGUM_TREE. Create a V2 tree with `mplx bg tree create`.");
  }
  if (!collection) {
    throw new Error("Missing NEXT_PUBLIC_CORE_COLLECTION. Create a Core collection with `mplx bg collection create`.");
  }

  const args = [
    "@metaplex-foundation/cli",
    "bg",
    "nft",
    "create",
    tree,
    "--name",
    name,
    "--uri",
    metadataUri,
    "--collection",
    collection,
    "--keypair",
    keypair,
    "--rpc",
    config.rpcUrl,
  ];

  if (owner) {
    args.push("--owner", owner);
  }

  const raw = execFileSync("npx", args, { encoding: "utf8", timeout: 240_000 });

  const base58 = raw.match(/[1-9A-HJ-NP-Za-km-z]{32,88}/g) ?? [];
  const signature = base58.find((s) => s.length >= 64) ?? base58[0] ?? "";
  const mintAddress = base58.find((s) => s.length >= 32 && s.length < 64) ?? signature;

  return { mintAddress, signature, raw };
}
