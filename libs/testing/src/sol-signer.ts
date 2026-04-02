/**
 * Minimal Solana transaction signer for test purposes.
 * Uses @solana/web3.js to send SOL transfers on Devnet.
 *
 * The test funder wallet is deterministic (hardcoded private key).
 * Fund it via `solana airdrop` before running tests.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

// ---- Constants ----

export const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";

/** SPL USDC mint on Solana Devnet (Circle's official devnet token). */
export const SOL_DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/** Placeholder USDT mint on Solana Devnet (no official token). */
export const SOL_DEVNET_USDT_MINT = "11111111111111111111111111111111";

/**
 * Deterministic test funder wallet for Solana Devnet.
 * Generated from seed: sha256("rabbithole-treasury-test-sol-funder-v1")
 * This is an Ed25519 keypair (64 bytes: 32 secret + 32 public).
 *
 * To fund this wallet:
 *   solana config set --url devnet
 *   solana airdrop 2 A3N3odocG5GR2JiQvhzgwKJJBXXQRHE5Zar9NDkDzWxC
 */
export const TEST_SOL_FUNDER_SECRET_KEY = new Uint8Array([
  194, 188, 125, 154, 14, 181, 189, 95, 66, 216, 227, 96, 36, 178, 168, 247,
  96, 183, 27, 26, 41, 118, 190, 235, 237, 104, 76, 226, 140, 3, 80, 118,
  134, 84, 36, 181, 146, 17, 101, 121, 159, 185, 244, 143, 68, 95, 113, 79,
  212, 203, 106, 117, 95, 190, 128, 166, 45, 76, 172, 0, 12, 203, 8, 157,
]);

export const TEST_SOL_FUNDER_ADDRESS =
  "A3N3odocG5GR2JiQvhzgwKJJBXXQRHE5Zar9NDkDzWxC";

// ---- Functions ----

/**
 * Send SOL from the test funder to a destination address on Devnet.
 * Returns the transaction signature.
 */
export async function fundWithSol(
  toAddress: string,
  lamports: bigint,
): Promise<string> {
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const funder = Keypair.fromSecretKey(TEST_SOL_FUNDER_SECRET_KEY);
  const recipient = new PublicKey(toAddress);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: funder.publicKey,
      toPubkey: recipient,
      lamports: Number(lamports),
    }),
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [funder], {
    commitment: "confirmed",
  });

  return signature;
}

/**
 * Get SOL balance for an address on Devnet.
 */
export async function getSolBalance(address: string): Promise<bigint> {
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const balance = await connection.getBalance(new PublicKey(address));
  return BigInt(balance);
}
