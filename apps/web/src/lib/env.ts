import type { SolanaClientConfig } from "./types";

const DEFAULT_RPC = "https://api.devnet.solana.com";
const DEFAULT_PROGRAM_ID = "Cy1dnHEkJAw7HXBHLAwxVMCnVjX286jYPkKyzp3oRHF9";
const DEFAULT_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const DEFAULT_TREASURY = "2XefLYB2BRCCkRwY3VGEwuzBwqKXs9d77hn4kY26G1B3";

export function getPublicSolanaConfig(): SolanaClientConfig {
  return {
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || DEFAULT_RPC,
    cluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet",
    programId: process.env.NEXT_PUBLIC_DOGE_VAULT_PROGRAM_ID || DEFAULT_PROGRAM_ID,
    usdcMint: process.env.NEXT_PUBLIC_SOLANA_USDC_MINT || process.env.SOLANA_USDC_MINT || DEFAULT_USDC_MINT,
    treasury:
      process.env.NEXT_PUBLIC_TREASURY_WALLET_ADDRESS ||
      process.env.TREASURY_WALLET_ADDRESS ||
      DEFAULT_TREASURY,
  };
}

export function getServerEnv() {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY,
    youcamApiKey: process.env.YOUCAM_API_KEY,
    youcamBaseUrl: process.env.YOUCAM_API_BASE_URL || "https://yce-api-01.makeupar.com",
    apifyToken: process.env.APIFY_TOKEN,
    apifyMcpUrl:
      process.env.APIFY_MCP_URL ||
      "https://mcp.apify.com/?tools=fetch-actor-details,apify/e-commerce-scraping-tool",
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID,
    elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5",
    s3Bucket: process.env.S3_BUCKET,
    s3Region: process.env.S3_REGION,
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
    s3Endpoint: process.env.S3_ENDPOINT,
    s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  };
}

export function hasS3Env(env: ReturnType<typeof getServerEnv>) {
  return Boolean(env.s3Bucket && env.s3Region);
}