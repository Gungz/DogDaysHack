# DogeVault Stylist

AI dog stylist + autonomous shopper for the Dog Days hackathon. Upload a dog photo, get a YouCam studio portrait, hear an ElevenLabs stylist reaction, fetch real products through Apify MCP, and approve a budget-limited USDC transfer on Solana devnet.

## Stack

- Next.js 16 + TypeScript + Tailwind (`apps/web`)
- Anchor 0.32.1 Solana program (`programs/doge_vault`)
- YouCam Perfect Corp API: photo enhance, background replacement, and **human** virtual try-on (`cloth-v3`, `hat`, `shoes` — YouCam is human-only)
- Gemini: dog profile, stylist script, and product search planning (text only; free-tier keys have no image-generation quota)
- Qwen / Alibaba DashScope (`qwen-image-3.0-pro`): **dog** virtual try-on via image editing with reference images (preferred when `DASHSCOPE_API_KEY` is set)
- Apify MCP: `apify/e-commerce-scraping-tool`
- ElevenLabs: stylist voice
- Supabase: dog image storage + NFT receipt metadata (Metaplex cNFT points to the metadata URI)

## Repository layout

```
apps/web                  Next.js app
  src/lib                 Server/client libraries
  src/app/api/agent        Upload -> YouCam -> Gemini -> Apify orchestration
  src/app/api/voice        ElevenLabs text-to-speech
  src/components           DogeVault UI and Solana wallet flows
programs/doge_vault       Anchor vault program
PLAN.md                   Full hackathon plan and decisions
```

## Environment

Copy `.env.example` to `.env` and fill in keys.

Important values already configured for devnet:

- Program ID: `Cy1dnHEkJAw7HXBHLAwxVMCnVjX286jYPkKyzp3oRHF9`
- Devnet USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- Treasury: `2XefLYB2BRCCkRwY3VGEwuzBwqKXs9d77hn4kY26G1B3`

S3 is no longer used. Dog images and NFT metadata are stored in Supabase Storage.

Supabase is used for both image storage (`dogevault-images` bucket) and NFT receipt metadata (`dogevault-metadata` bucket). Without Supabase credentials the app still works and returns inline `data:` URLs/URIs for local testing. To enable hosted storage, set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `SUPABASE_IMAGES_BUCKET` / `SUPABASE_METADATA_BUCKET`. The service role key is used only server-side in `apps/web/src/lib/supabase.ts`.

### Image generation (dog virtual try-on)

Dog virtual try-on uses an image-generation model; the app prefers **Qwen / DashScope** when `DASHSCOPE_API_KEY` is configured, otherwise falls back to **Gemini** image generation when `GEMINI_API_KEY` is set. Gemini's free tier has **no image-generation quota**, so on a free Gemini key you will see a clear "image generation not enabled" message — set `DASHSCOPE_API_KEY` to enable dog try-on. The routing lives in `apps/web/src/lib/dogTryOn.ts` (`generateDogTryOn` → Qwen via `qwenTryOn.ts` when a DashScope key is present, else Gemini via `geminiTryOn.ts`).

- `DASHSCOPE_API_KEY` — Alibaba DashScope (百炼) API key for Qwen image generation. **Required to enable dog virtual try-on.**
- `QWEN_IMAGE_MODEL` — model id, defaults to `qwen-image-3.0-pro`.
- `DASHSCOPE_BASE_URL` — optional override; defaults to `https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`. Use your workspace/region URL if your key is not on the default China endpoint (e.g. `https://dashscope-intl.aliyuncs.com/...` for international, or `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/...`). Model, endpoint, and key must share a region.

## Develop

```bash
cd apps/web
pnpm install
pnpm dev
```

Open http://localhost:3000.

## Build

```bash
cd apps/web
pnpm build
pnpm start
```

## Solana program

The program is already deployed to devnet. To rebuild/deploy again:

```bash
cd programs/doge_vault
anchor build
anchor deploy --provider.cluster devnet
```

### Vault model

- `initialize_vault`: creates a PDA vault and program-owned USDC token account with hard spend limits.
- User funds the vault with a normal SPL USDC transfer.
- `approve_spend`: user signs; program transfers approved USDC from the vault token account to the treasury token account and enforces single-item and total spend limits.

## Agent flow

 1. Upload dog photo.
 2. YouCam File API -> **enhance** (sharpen/beautify) the original, then the enhanced result is re-uploaded and fed into **background replacement** (chained pipeline, not two independent passes). The final portrait is stored in Supabase.
 3. **Virtual try-on (hybrid)**. The Gemini profile tags the subject as `dog` or `human`. For a **human** photo, YouCam Virtual Try-On (`cloth-v3`, plus on-demand `hat`/`shoes`) is used with the selected Apify product image as the garment reference. For a **dog**, an image-generation model (Qwen preferred, Gemini fallback) edits the dog photo to wear the exact product, using the dog portrait + product image as reference images. The try-on result is stored in Supabase and used as NFT receipt art. The first product fetched is auto-tried; the UI also offers manual "Try as clothes / hat / shoes" buttons per selected product, each card linking to its product page ("Open product ↗").
 4. Gemini generates dog profile, stylist script, and product queries.
 5. Apify MCP calls `apify/e-commerce-scraping-tool`. That actor runs **asynchronously**: the app starts the run, polls `get-actor-run` until `SUCCEEDED`, then reads `get-dataset-items` and normalizes the product cards. On a real error it surfaces the error (it does **not** silently fall back to mocks).
 6. ElevenLabs converts the stylist script to audio. Free ElevenLabs plans cannot use library voices via the API (HTTP 402 `paid_plan_required`); in that case the UI automatically falls back to the browser's built-in free `SpeechSynthesis`. (Or create your own voice in the ElevenLabs dashboard and set `ELEVENLABS_VOICE_ID` to that custom voice id to use the API for free.)
7. User connects Phantom/Solflare on devnet, initializes/funds vault, and approves a product.
8. Anchor program transfers approved USDC to treasury.
9. App stores NFT receipt metadata (portrait/try-on, dog profile, product, tx reference) in Supabase and shows the metadata URI.

## MCP configuration

The Next.js backend calls the Apify MCP server directly using `APIFY_TOKEN`. If you also want coding-agent MCP support, add the Apify and YouCam MCP servers to your client config and restart the client. That is not required for the app itself to run.

## Notes

- All Solana actions are on devnet only.
- The app does not complete real retail purchases; approval simulates funding by transferring devnet USDC to the configured treasury.
- YouCam and Apify calls require credits/tokens.
- The agent streams progress to the UI in real time: the `/api/agent?stream=1` SSE endpoint emits `step` events (profiling → products → enhance → background → try-on), each carrying a `data` payload, that the UI renders as a live stepper **and** progressively (the enhanced portrait, dog profile, Apify product grid, and try-on image each appear as their step lands — before the final result). The product auto-used for the first try-on is highlighted with an emerald ring + "Used for try-on" badge. Buttons are disabled while the agent is busy.

## Debugging

The app logs each API step (input/output) only when debug mode is on, so production stays quiet:

```bash
DEBUG=dogevault pnpm dev
# or
LOG_LEVEL=debug pnpm dev
```

Logs are tagged `[dogevault:debug]` and emitted for: Supabase (image/metadata uploads), YouCam (each task start/result), Gemini (profile), Apify (query, run id, dataset id, item count), and ElevenLabs (tts start/result/error). Use this to trace exactly where a provider call fails.

## Testing

### Unit tests (offline, mocked)

`pnpm test` runs Vitest with one test file per external API, all using mocks so they need no network or keys:

- `tests/unit/apify.test.ts` — `normalizeProducts` (real Apify item shape, including array `offers`) and the async run→poll→dataset flow via a mocked MCP client.
- `tests/unit/youcam.test.ts` — upload / enhance / bg-replace / try-on with a mocked `fetch`.
- `tests/unit/gemini.test.ts` — profile normalization (incl. `subjectType` dog/human detection) + missing-key fallback.
- `tests/unit/geminiTryOn.test.ts` — Gemini dog try-on fallback behavior (missing key, quota, product-reference fetch).
- `tests/unit/qwenTryOn.test.ts` — Qwen image-editing request shape, reference-image handling, and graceful auth/quota errors.
- `tests/unit/supabase.test.ts` — image/metadata storage with a mocked client.
- `tests/unit/nft.test.ts` — Bubblegum V2 `mplx bg nft create` command construction.

### Live integration test (real APIs)

`tests/integration/live.test.ts` runs the full `runDogAgent` pipeline against the real providers. It is skipped unless you opt in:

```bash
RUN_LIVE=1 pnpm test tests/integration/live.test.ts
# optionally supply your own dog photo:
SAMPLE_IMAGE_PATH=/path/to/dog.jpg RUN_LIVE=1 pnpm test tests/integration/live.test.ts
# ElevenLabs live test (lists voices via GET /v1/voices, picks a free voice, synthesizes speech):
RUN_LIVE=1 ELEVENLABS_API_KEY=... pnpm test tests/integration/elevenlabs.test.ts
# YouCam try-on against a real photo (youcam-tryon.test.ts uses your own photo):
SAMPLE_IMAGE_PATH=/path/to/photo.jpg RUN_LIVE=1 pnpm test tests/integration/youcam-tryon.test.ts
# Gemini image-generation gate (confirms the key can do image generation):
RUN_LIVE=1 pnpm test tests/integration/gemini-image.test.ts
# Qwen dog try-on (needs DASHSCOPE_API_KEY; optionally QWEN_TEST_PRODUCT_URL and SAMPLE_IMAGE_PATH):
RUN_LIVE=1 DASHSCOPE_API_KEY=sk-... pnpm test tests/integration/qwen-tryon.test.ts
```

### Prerequisites

1. Install dependencies: `pnpm install` (in `apps/web` or repo root).
2. Copy `.env.example` to `.env` and fill what you have.
   - **Dog virtual try-on requires `DASHSCOPE_API_KEY` (Qwen / DashScope).** It is the preferred dog try-on engine — without it the app falls back to Gemini image generation, which on a free Gemini key has no quota and returns a clear "image generation not enabled" message (YouCam human try-on still works). See **Image generation (dog virtual try-on)** for `DASHSCOPE_API_KEY`, `QWEN_IMAGE_MODEL`, and `DASHSCOPE_BASE_URL` (region must match your key).
   - The app runs with other missing keys using fallbacks:
     - Missing `GEMINI_API_KEY`: dog profile/script use a built-in mock.
     - Missing `APIFY_TOKEN`: product cards use a mock list (only when the key is absent; a real API *error* is surfaced instead of mocked).
     - Missing `YOUCAM_API_KEY` or a YouCam upload/API failure: the agent **stops and surfaces the error to the user** (it no longer silently falls back to the original image). YouCam network calls time out after 30s with a clear message.
     - Missing Supabase vars: NFT metadata returns an inline `data:` URI.
     - Missing S3 vars: images use base64 data URLs.
     - ElevenLabs 402 (free plan, library voice): UI falls back to browser `SpeechSynthesis`.
3. Use a Solana devnet wallet (Phantom/Solflare). Airdrop devnet SOL and devnet USDC to your wallet before funding the vault.

### Run locally

```bash
pnpm dev
# open http://localhost:3000
```

### Manual end-to-end test

1. Click **Connect Wallet** (devnet) and ensure it shows your pubkey.
2. Choose a dog photo (PNG/JPG/WEBP) and click **Run Dog Agent**.
    - Expect an enhanced portrait, dog profile chips, a voice button, and Apify product cards (each with an image, price/source/rating, an "Open product ↗" link, and an approve button).
     - The agent auto-runs a virtual try-on; manual "Try as …" buttons (labeled **Clothes** / **Hat** / **Shoes**) appear for the selected product, and the product auto-used for the first try-on is highlighted with an emerald ring + "Used for try-on" badge. For a dog, this uses Qwen/Gemini image generation; for a human, YouCam.
     - Results stream in progressively: the enhanced portrait, dog profile, product grid, and try-on image each appear as their step completes.
     - Provider status badges show `ok` / `missing_key` / `error`.
3. Click **Generate ElevenLabs voice** to hear the stylist line.
4. Click **1) Initialize vault**, then **2) Fund 25 USDC**.
   - Vault PDA and last transaction link appear.
5. Select a product card and click **3) Approve selected**.
   - The Anchor program transfers approved USDC to the treasury.
   - After approval, an **NFT metadata (Supabase)** link appears with the stored receipt JSON.
6. If Supabase is not configured, the metadata link is an inline `data:` URI you can open to inspect the JSON.

### With real Supabase

1. Create a Supabase project.
2. Create two **public** Storage buckets:
   - `dogevault-images` (or set `SUPABASE_IMAGES_BUCKET`) for original/enhanced dog photos.
   - `dogevault-metadata` (or set `SUPABASE_METADATA_BUCKET`) for receipt JSON.
3. Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` to `.env`.
4. Repeat the approval step; the metadata link should point to `https://<project>.supabase.co/storage/v1/object/public/dogevault-metadata/receipts/...`.

### cNFT receipt (Bubblegum V2)

The cNFT mint uses **Metaplex Bubblegum V2**, which requires a **Core collection** and a **V2 tree** (V1 trees are incompatible). Create both with the Metaplex CLI using the same devnet keypair:

```bash
# 1. Core collection (required for V2 trees)
npx @metaplex-foundation/cli bg collection create \
  --name "DogeVault Receipts" \
  --uri "https://example.com/collection.json" \
  --keypair /Users/user/my-solana-wallet/id.json \
  --rpc https://api.devnet.solana.com

# 2. V2 tree
npx @metaplex-foundation/cli bg tree create \
  --maxDepth 14 --maxBufferSize 64 --canopyDepth 8 \
  --name "dogevault" \
  --keypair /Users/user/my-solana-wallet/id.json \
  --rpc https://api.devnet.solana.com
```

Copy the printed tree address into `.env` as `NEXT_PUBLIC_BUBBLEGUM_TREE` and the collection address as `NEXT_PUBLIC_CORE_COLLECTION`. Set `MINTER_KEYPAIR_PATH` to the same keypair.

The **Mint cNFT receipt** button calls `POST /api/mint`, which invokes `mplx bg nft create` server-side (the server keypair is the tree creator). The UI then shows the asset address and explorer link. Without both env vars the mint returns a clear error.

### Full happy-path test

1. Connect devnet wallet (airdropped SOL + USDC).
2. Run Dog Agent -> voice -> initialize vault -> fund 25 USDC.
3. Select a product -> Approve selected.
4. Confirm Supabase metadata URI appears.
5. Click Mint cNFT receipt and verify the mint on Solana Explorer (devnet).

### Build, lint, and tests

```bash
pnpm build
pnpm lint
pnpm test          # Vitest unit/adapter/integration tests (see TEST_PLAN.md)
```

### Solana program

The program is already deployed to devnet. To rebuild/deploy:

```bash
cd programs/doge_vault
anchor build
anchor deploy --provider.cluster devnet
```
