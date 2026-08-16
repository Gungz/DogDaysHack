import { Buffer } from "buffer";
import { AnchorProvider, BN, Idl, Program, Wallet as AnchorWallet } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import dogeVaultIdl from "./doge_vault_idl.json";
import { getPublicSolanaConfig } from "./env";

const solanaConfig = getPublicSolanaConfig();

export const DOGE_VAULT_PROGRAM_ID = new PublicKey(solanaConfig.programId);
export const USDC_MINT = new PublicKey(solanaConfig.usdcMint);
export const TREASURY_WALLET = new PublicKey(solanaConfig.treasury);
export const USDC_DECIMALS = 6;

const VAULT_SEED = Buffer.from("vault");
const VAULT_TOKEN_SEED = Buffer.from("vault-token");

export function usdcToAtomic(amountUsd: number) {
  return Math.round(amountUsd * 10 ** USDC_DECIMALS);
}

export function findVaultPda(owner: PublicKey) {
  return PublicKey.findProgramAddressSync([VAULT_SEED, owner.toBuffer()], DOGE_VAULT_PROGRAM_ID)[0];
}

export function findVaultTokenPda(vault: PublicKey) {
  return PublicKey.findProgramAddressSync([VAULT_TOKEN_SEED, vault.toBuffer()], DOGE_VAULT_PROGRAM_ID)[0];
}

export function getUserUsdcAta(owner: PublicKey) {
  return getAssociatedTokenAddressSync(USDC_MINT, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
}

export function getTreasuryUsdcAta() {
  return getAssociatedTokenAddressSync(TREASURY_WALLET, TREASURY_WALLET, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
}

export function getDogeVaultProgram(connection: Connection, wallet: AnchorWallet) {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new Program(dogeVaultIdl as unknown as Idl, provider);
}

async function withBlockhash(connection: Connection, feePayer: PublicKey, transaction: Transaction) {
  transaction.feePayer = feePayer;
  transaction.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  return transaction;
}

export async function buildInitializeVaultTransaction(
  connection: Connection,
  wallet: AnchorWallet,
  options?: { maxTotalUsd?: number; maxSingleUsd?: number },
) {
  if (!wallet.publicKey) throw new Error("Connect a wallet first.");
  const owner = wallet.publicKey;
  const vault = findVaultPda(owner);
  const vaultTokenAccount = findVaultTokenPda(vault);
  const program = getDogeVaultProgram(connection, wallet);
  const maxTotalUsd = options?.maxTotalUsd ?? 100;
  const maxSingleUsd = options?.maxSingleUsd ?? 50;

  const transaction = await program.methods
    .initializeVault(new BN(usdcToAtomic(maxTotalUsd)), new BN(usdcToAtomic(maxSingleUsd)), TREASURY_WALLET)
    .accounts({
      owner,
      usdcMint: USDC_MINT,
      vault,
      vaultTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .transaction();

  return withBlockhash(connection, owner, transaction);
}

export async function buildFundVaultTransaction(connection: Connection, owner: PublicKey, amountUsd: number) {
  const vault = findVaultPda(owner);
  const vaultTokenAccount = findVaultTokenPda(vault);
  const ownerAta = getUserUsdcAta(owner);

  const transaction = new Transaction();
  transaction.add(
    createAssociatedTokenAccountIdempotentInstruction(
      owner,
      ownerAta,
      owner,
      USDC_MINT,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
  );
  transaction.add(
    createTransferCheckedInstruction(
      ownerAta,
      USDC_MINT,
      vaultTokenAccount,
      owner,
      usdcToAtomic(amountUsd),
      USDC_DECIMALS,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  return withBlockhash(connection, owner, transaction);
}

export async function buildApproveSpendTransaction(
  connection: Connection,
  wallet: AnchorWallet,
  options: { amountUsd: number; productId: string },
) {
  if (!wallet.publicKey) throw new Error("Connect a wallet first.");
  const owner = wallet.publicKey;
  const vault = findVaultPda(owner);
  const vaultTokenAccount = findVaultTokenPda(vault);
  const treasuryTokenAccount = getTreasuryUsdcAta();
  const program = getDogeVaultProgram(connection, wallet);

  const transaction = new Transaction();
  transaction.add(
    createAssociatedTokenAccountIdempotentInstruction(
      owner,
      treasuryTokenAccount,
      TREASURY_WALLET,
      USDC_MINT,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
  );

  const approveInstruction = await program.methods
    .approveSpend(new BN(usdcToAtomic(options.amountUsd)), options.productId.slice(0, 64))
    .accounts({
      owner,
      usdcMint: USDC_MINT,
      vault,
      vaultTokenAccount,
      treasuryTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  transaction.add(approveInstruction);

  return withBlockhash(connection, owner, transaction);
}