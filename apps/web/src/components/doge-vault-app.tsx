"use client";

import type { Wallet as AnchorWallet } from "@coral-xyz/anchor";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { Transaction } from "@solana/web3.js";
import { useMemo, useState } from "react";
import {
  buildApproveSpendTransaction,
  buildFundVaultTransaction,
  buildInitializeVaultTransaction,
  findVaultPda,
  TREASURY_WALLET,
  USDC_MINT,
} from "@/lib/dogeVault";
import { type TryOnKind } from "@/lib/youcam";
import { getPublicSolanaConfig } from "@/lib/env";
import type { AgentResult, AgentStep, Product } from "@/lib/types";

function statusTone(status: string) {
  if (status === "ok") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (status === "missing_key") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-rose-700 bg-rose-50 border-rose-200";
}

function stepTone(status: string) {
  if (status === "done") return "text-emerald-700";
  if (status === "error") return "text-rose-700";
  if (status === "start") return "text-orange-600 animate-pulse";
  return "text-slate-400";
}

function stepIcon(status: string) {
  if (status === "done") return "✓";
  if (status === "error") return "✕";
  if (status === "start") return "●";
  return "○";
}

function explorerTx(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function DogeVaultApp() {
  const solanaConfig = useMemo(() => getPublicSolanaConfig(), []);
  const { connection } = useConnection();
  const wallet = useWallet();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [metadataUri, setMetadataUri] = useState<string | null>(null);
  const [mintResult, setMintResult] = useState<{ mintAddress: string; signature: string } | null>(null);
  const [tryOnUrls, setTryOnUrls] = useState<Record<string, string | null>>({});
  const [tryOnBusy, setTryOnBusy] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);

  const selectedProduct = result?.products.find((product) => product.id === selectedProductId) ?? null;
  const vaultAddress = wallet.publicKey ? findVaultPda(wallet.publicKey).toBase58() : null;

  async function sendBuiltTransaction(transaction: Transaction) {
    if (!wallet.connected || !wallet.sendTransaction) throw new Error("Connect a wallet first.");
    const signature = await wallet.sendTransaction(transaction, connection);
    await connection.confirmTransaction(signature, "confirmed");
    setLastTx(signature);
    return signature;
  }

  async function runAgent() {
    if (!file) {
      setError("Choose a dog photo first.");
      return;
    }
    setBusy("agent");
    setError(null);
    setVoiceUrl(null);
    setMetadataUri(null);
    setMintResult(null);
    setTryOnUrls({});
    setTryOnBusy(null);
    setSteps([]);
    try {
      const formData = new FormData();
      formData.set("image", file);
      const response = await fetch("/api/agent?stream=1", { method: "POST", body: formData });
      if (!response.ok || !response.body) throw new Error(`Agent request failed (${response.status})`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: AgentResult | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data:")) continue;
          const payload = JSON.parse(line.slice(5).trim()) as
            | { type: "step"; step: AgentStep }
            | { type: "result"; result: AgentResult }
            | { type: "error"; message: string };
          if (payload.type === "step") {
            setSteps((prev) => {
              const next = [...prev];
              const idx = next.findIndex((s) => s.name === payload.step.name);
              if (idx >= 0) next[idx] = payload.step;
              else next.push(payload.step);
              return next;
            });
          } else if (payload.type === "result") {
            finalResult = payload.result;
          } else if (payload.type === "error") {
            throw new Error(payload.message);
          }
        }
      }

      if (!finalResult) throw new Error("Agent finished without a result");
      setResult(finalResult);
      setSelectedProductId(finalResult.products[0]?.id ?? null);
    } catch (agentError) {
      setError(agentError instanceof Error ? agentError.message : "Agent failed");
    } finally {
      setBusy(null);
    }
  }

  async function playStylistVoice() {
    if (!result) return;
    setBusy("voice");
    setError(null);
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: result.dogProfile.voiceScript }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
        // Free ElevenLabs plans can't use library voices via the API. Fall back to the
        // browser's built-in (free) SpeechSynthesis so the stylist still talks.
        if (data.code === "paid_plan_required" && typeof window !== "undefined" && "speechSynthesis" in window) {
          const utter = new SpeechSynthesisUtterance(result.dogProfile.voiceScript);
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
          setVoiceUrl(null);
          return;
        }
        throw new Error(data.error || "Voice failed");
      }
      const blob = await response.blob();
      setVoiceUrl(URL.createObjectURL(blob));
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : "Voice failed");
    } finally {
      setBusy(null);
    }
  }

  async function initializeVault() {
    setBusy("initialize");
    setError(null);
    try {
      const tx = await buildInitializeVaultTransaction(connection, wallet as unknown as AnchorWallet, {
        maxTotalUsd: 100,
        maxSingleUsd: 50,
      });
      await sendBuiltTransaction(tx);
    } catch (txError) {
      setError(txError instanceof Error ? txError.message : "Vault initialization failed");
    } finally {
      setBusy(null);
    }
  }

  async function fundVault() {
    if (!wallet.publicKey) {
      setError("Connect a wallet first.");
      return;
    }
    setBusy("fund");
    setError(null);
    try {
      const tx = await buildFundVaultTransaction(connection, wallet.publicKey, 25);
      await sendBuiltTransaction(tx);
    } catch (txError) {
      setError(txError instanceof Error ? txError.message : "Funding failed");
    } finally {
      setBusy(null);
    }
  }

  async function approveSelectedProduct(product: Product) {
    setBusy(`approve-${product.id}`);
    setError(null);
    try {
      const amountUsd = product.priceAmount && product.priceAmount > 0 ? product.priceAmount : 10;
      const tx = await buildApproveSpendTransaction(connection, wallet as unknown as AnchorWallet, {
        amountUsd,
        productId: product.id,
      });
      const signature = await sendBuiltTransaction(tx);
      if (result) {
        try {
            const receiptResponse = await fetch("/api/receipt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dogProfile: result.dogProfile,
              product,
              enhancedImageUrl: result.tryOnImageUrl || result.enhancedImageUrl,
              txSignature: signature,
            }),
          });
          const receiptData = (await receiptResponse.json()) as { metadataUri?: string; error?: string };
          if (receiptResponse.ok && receiptData.metadataUri) {
            setMetadataUri(receiptData.metadataUri);
          } else if (receiptData.error) {
            setError(`Receipt metadata: ${receiptData.error}`);
          }
        } catch (receiptError) {
          setError(receiptError instanceof Error ? receiptError.message : "Receipt metadata failed");
        }
      }
    } catch (txError) {
      setError(txError instanceof Error ? txError.message : "Approval failed");
    } finally {
      setBusy(null);
    }
  }

  async function mintReceipt() {
    if (!metadataUri || !wallet.publicKey) return;
    setBusy("mint");
    setError(null);
    try {
      const response = await fetch("/api/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadataUri,
          name: "DogeVault Receipt",
          owner: wallet.publicKey?.toBase58(),
        }),
      });
      const data = (await response.json()) as { mintAddress?: string; signature?: string; error?: string };
      if (!response.ok || !data.mintAddress) throw new Error(data.error || "Mint failed");
      setMintResult({ mintAddress: data.mintAddress, signature: data.signature ?? "" });
    } catch (mintError) {
      setError(mintError instanceof Error ? mintError.message : "Mint failed");
    } finally {
      setBusy(null);
    }
  }

  async function runTryOn(kind: TryOnKind) {
    if (!selectedProduct?.imageUrl) {
      setError("Select a product with an image first.");
      return;
    }
    const src = result?.tryOnImageUrl || result?.enhancedImageUrl || result?.originalImageUrl;
    if (!src) return;
    setTryOnBusy(kind);
    setError(null);
    try {
      const response = await fetch("/api/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          srcImageUrl: src,
          refImageUrl: selectedProduct.imageUrl,
          kind,
        }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "Try-on failed");
      setTryOnUrls((prev) => ({ ...prev, [kind]: data.url ?? null }));
    } catch (tryError) {
      setError(tryError instanceof Error ? tryError.message : "Try-on failed");
    } finally {
      setTryOnBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7ed_0,#f8fafc_36%,#eef2ff_100%)] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-xl shadow-orange-100/60 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-600">Dog Days Hackathon</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">DogeVault Stylist</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Upload your dog. Get the studio portrait. Hear the stylist. Fetch products with Apify MCP. Approve a
              budget-limited USDC transfer on Solana devnet.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <WalletMultiButton className="!rounded-full !bg-slate-950 !font-bold" />
            <p className="text-xs text-slate-500">Program: {solanaConfig.programId.slice(0, 4)}…{solanaConfig.programId.slice(-4)}</p>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-xl shadow-indigo-100/60">
            <h2 className="text-2xl font-extrabold">1. Portrait & agent loop</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <label className="text-sm font-bold text-slate-700">Dog photo</label>
                <input
                  className="mt-3 block w-full text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-orange-500 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-orange-600"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <button
                  className="mt-4 rounded-full bg-slate-950 px-5 py-2 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={runAgent}
                  disabled={busy !== null}
                >
                  {busy === "agent" ? "Running agent…" : "Run Dog Agent"}
                </button>
                {busy === "agent" ? (
                  <div className="mt-4 rounded-3xl border border-orange-200 bg-orange-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-orange-600">Processing your dog…</p>
                    <ul className="mt-3 space-y-2">
                      {steps.length === 0 ? (
                        <li className="text-sm text-orange-600 animate-pulse">Starting…</li>
                      ) : (
                        steps.map((step) => (
                          <li key={step.name} className="flex items-start gap-2 text-sm">
                            <span className={`font-bold ${stepTone(step.status)}`}>{stepIcon(step.status)}</span>
                            <span className={stepTone(step.status)}>
                              {step.label}
                              {step.detail ? <span className="ml-1 text-xs text-slate-500">({step.detail})</span> : null}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
                {result?.enhancedImageUrl ? (
                  <img src={result.enhancedImageUrl} alt="Enhanced dog portrait" className="h-64 w-full object-cover" />
                ) : file ? (
                  <img src={URL.createObjectURL(file)} alt="Dog preview" className="h-64 w-full object-cover" />
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-slate-500">Portrait preview</div>
                )}
              </div>
            </div>

            {result ? (
              <div className="mt-5 grid gap-4 md:grid-cols-[1fr_220px]">
                <div className="rounded-3xl bg-slate-950 p-5 text-white">
                  <p className="text-xs font-bold uppercase tracking-[0.25em] text-orange-300">Stylist profile</p>
                  <h3 className="mt-2 text-xl font-extrabold">{result.dogProfile.breedGuess}</h3>
                  <p className="mt-2 text-sm text-white/80">{result.dogProfile.stylistSummary}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs">{result.dogProfile.vibe}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs">size: {result.dogProfile.size}</span>
                    {result.dogProfile.colorPalette.map((color) => (
                      <span key={color} className="rounded-full bg-white/10 px-3 py-1 text-xs">
                        {color}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <button
                    className="w-full rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={playStylistVoice}
                    disabled={busy !== null}
                  >
                    {busy === "voice" ? "Generating voice…" : "Generate ElevenLabs voice"}
                  </button>
                  {voiceUrl ? <audio className="mt-4 w-full" controls src={voiceUrl} /> : null}
                  <div className="mt-4 rounded-3xl bg-slate-950 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-300">YouCam virtual try-on</p>
                    {result?.tryOnImageUrl ? (
                      <img src={result.tryOnImageUrl} alt="Dog in outfit" className="mt-3 h-48 w-full rounded-2xl object-cover" />
                    ) : (
                      <p className="mt-3 text-sm text-white/70">Clothes try-on will appear here after the agent runs (needs a product image).</p>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        className="rounded-full bg-emerald-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                        onClick={() => runTryOn("hat")}
                        disabled={tryOnBusy !== null || !selectedProduct?.imageUrl}
                      >
                        {tryOnBusy === "hat" ? "Trying…" : "Try as hat"}
                      </button>
                      <button
                        className="rounded-full bg-emerald-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                        onClick={() => runTryOn("shoes")}
                        disabled={tryOnBusy !== null || !selectedProduct?.imageUrl}
                      >
                        {tryOnBusy === "shoes" ? "Trying…" : "Try as shoes"}
                      </button>
                    </div>
                    {tryOnUrls.hat ? (
                      <img src={tryOnUrls.hat} alt="Dog in hat" className="mt-3 h-40 w-full rounded-2xl object-cover" />
                    ) : null}
                    {tryOnUrls.shoes ? (
                      <img src={tryOnUrls.shoes} alt="Dog in shoes" className="mt-3 h-40 w-full rounded-2xl object-cover" />
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {result ? (
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {Object.entries(result.providerStatus).map(([provider, status]) => (
                  <span key={provider} className={`rounded-full border px-3 py-1 font-bold ${statusTone(status)}`}>
                    {provider}: {status}
                  </span>
                ))}
                {result.notes.map((note) => (
                  <span key={note} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                    {note}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-xl shadow-orange-100/60">
            <h2 className="text-2xl font-extrabold">2. Solana devnet vault</h2>
            <div className="mt-4 rounded-3xl bg-indigo-950 p-4 text-sm text-indigo-50">
              <p>
                <span className="font-bold">Owner:</span> {wallet.publicKey ? wallet.publicKey.toBase58() : "not connected"}
              </p>
              <p className="mt-1 break-all">
                <span className="font-bold">Vault PDA:</span> {vaultAddress ?? "connect wallet"}
              </p>
              <p className="mt-1 break-all">
                <span className="font-bold">USDC mint:</span> {USDC_MINT.toBase58()}
              </p>
              <p className="mt-1 break-all">
                <span className="font-bold">Treasury:</span> {TREASURY_WALLET.toBase58()}
              </p>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold transition hover:border-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={initializeVault}
                disabled={busy !== null || !wallet.connected}
              >
                {busy === "initialize" ? "Initializing…" : "1) Initialize vault"}
              </button>
              <button
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold transition hover:border-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={fundVault}
                disabled={busy !== null || !wallet.connected}
              >
                {busy === "fund" ? "Funding…" : "2) Fund 25 USDC"}
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Funding is a normal devnet USDC transfer into the program-owned vault token account. Approval calls the
              deployed Anchor program and transfers the approved amount to the treasury.
            </p>
            {lastTx ? (
              <a className="mt-3 block text-sm font-bold text-indigo-700 underline" href={explorerTx(lastTx)} target="_blank" rel="noreferrer">
                View last transaction on Solana Explorer
              </a>
            ) : null}
            {metadataUri ? (
              <a className="mt-2 block break-all text-sm font-bold text-emerald-700 underline" href={metadataUri} target="_blank" rel="noreferrer">
                NFT metadata (Supabase): {metadataUri.slice(0, 48)}…
              </a>
            ) : null}
            {metadataUri ? (
              <button
                className="mt-3 w-full rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={mintReceipt}
                disabled={busy !== null || !wallet.connected}
              >
                {busy === "mint" ? "Minting cNFT…" : "4) Mint cNFT receipt"}
              </button>
            ) : null}
            {mintResult ? (
              <div className="mt-2 text-sm">
                <p className="font-bold text-emerald-800">cNFT minted</p>
                <a className="block break-all underline" href={`https://explorer.solana.com/address/${mintResult.mintAddress}?cluster=devnet`} target="_blank" rel="noreferrer">
                  Mint: {mintResult.mintAddress.slice(0, 8)}…
                </a>
                <a className="mt-1 block break-all underline" href={explorerTx(mintResult.signature)} target="_blank" rel="noreferrer">
                  View mint tx
                </a>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-xl shadow-lime-100/60">
          <h2 className="text-2xl font-extrabold">3. Apify product fetch & approval</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {result?.products.map((product) => {
              const selected = product.id === selectedProductId;
              return (
                <article
                  key={product.id}
                  className={`rounded-3xl border p-4 transition ${selected ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-white"}`}
                >
                  <button className="block w-full text-left" onClick={() => setSelectedProductId(product.id)}>
                    <div className="overflow-hidden rounded-2xl bg-slate-100">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.title} className="h-40 w-full object-cover" />
                      ) : (
                        <div className="flex h-40 items-center justify-center text-sm text-slate-500">No image</div>
                      )}
                    </div>
                    <h3 className="mt-3 line-clamp-2 text-sm font-extrabold">{product.title}</h3>
                    <p className="mt-1 text-sm font-bold text-orange-700">{product.priceText ?? "price unknown"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {product.source} · rating {product.rating ?? "n/a"} · reviews {product.reviewCount ?? "n/a"}
                    </p>
                  </button>
                  <button
                    className="mt-4 w-full rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => approveSelectedProduct(product)}
                    disabled={busy !== null || !wallet.connected || !selected}
                  >
                    {busy === `approve-${product.id}` ? "Approving…" : "3) Approve selected"}
                  </button>
                </article>
              );
            }) ?? (
              <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-sm text-slate-500 md:col-span-3">
                Run the dog agent to fetch product cards through Apify MCP.
              </div>
            )}
          </div>
          {selectedProduct ? (
            <p className="mt-4 text-sm text-slate-600">
              Selected: <span className="font-bold">{selectedProduct.title}</span>
            </p>
          ) : null}
          {error ? <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p> : null}
        </section>
      </section>
    </main>
  );
}