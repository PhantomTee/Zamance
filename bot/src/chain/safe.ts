/**
 * @file safe.ts
 * @description Safe multisig integration: the bot proposes payout transactions (co-signing as
 * one of each team's Safe owners), then a human owner from that team must add the second
 * signature via the Safe UI before anything executes. The bot alone can never move funds.
 * The bot uses ONE global signer key across every team's Safe - being an "owner" is just an
 * on-chain permission grant, so the same bot address can be added as a co-signer on many
 * different teams' Safes without needing per-team secrets.
 */

import Safe from "@safe-global/protocol-kit";
import SafeApiKit from "@safe-global/api-kit";
import { OperationType } from "@safe-global/types-kit";
import type { MetaTransactionData, SafeMultisigTransactionResponse } from "@safe-global/types-kit";
import { ethers } from "ethers";

const SEPOLIA_CHAIN_ID = 11155111n;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** The bot's own address as derived from its (global, cross-team) Safe-owner private key. */
export function getBotSignerAddress(): string {
  return new ethers.Wallet(requireEnv("BOT_SAFE_SIGNER_PRIVATE_KEY")).address;
}

async function getBotSafe(safeAddress: string): Promise<Safe> {
  return Safe.init({
    provider: requireEnv("RPC_URL"),
    signer: requireEnv("BOT_SAFE_SIGNER_PRIVATE_KEY"),
    safeAddress,
  });
}

function getApiKit(): SafeApiKit {
  return new SafeApiKit({
    chainId: SEPOLIA_CHAIN_ID,
    apiKey: requireEnv("SAFE_API_KEY"),
  });
}

/** Builds a MetaTransactionData call to ConfidentialUSDCWrapper.confidentialTransfer(to, handle, proof) - the private payout path. */
export function buildConfidentialTransferCall(
  wrapperAddress: string,
  wrapperInterface: ethers.Interface,
  to: string,
  encHandle: string,
  encInputProof: string,
): MetaTransactionData {
  const data = wrapperInterface.encodeFunctionData("confidentialTransfer(address,bytes32,bytes)", [
    to,
    encHandle,
    encInputProof,
  ]);
  return { to: wrapperAddress, value: "0", data, operation: OperationType.Call };
}

/**
 * Builds a MetaTransactionData call to real USDC.transfer(to, amount) - the public, transparent
 * payout path. `amount` is plaintext on-chain calldata; only use this when the toggle is
 * explicitly set to public.
 */
export function buildPlainTransferCall(
  usdcAddress: string,
  usdcInterface: ethers.Interface,
  to: string,
  amount: bigint,
): MetaTransactionData {
  const data = usdcInterface.encodeFunctionData("transfer(address,uint256)", [to, amount]);
  return { to: usdcAddress, value: "0", data, operation: OperationType.Call };
}

/** Builds a MetaTransactionData call to real USDC.approve(spender, amount) - used before wrap(). */
export function buildApproveCall(
  usdcAddress: string,
  usdcInterface: ethers.Interface,
  spender: string,
  amount: bigint,
): MetaTransactionData {
  const data = usdcInterface.encodeFunctionData("approve(address,uint256)", [spender, amount]);
  return { to: usdcAddress, value: "0", data, operation: OperationType.Call };
}

/**
 * Builds a MetaTransactionData call to ConfidentialUSDCWrapper.wrap(to, amount) - pulls `amount`
 * of real USDC from msg.sender (the Safe) and mints a confidential balance to `to`. `amount` is
 * plaintext on-chain calldata (wrap() has no encrypted-amount overload), so this is a visible
 * treasury-funding step, not a private per-payout call - see the dashboard's "fund treasury"
 * action (bot/src/http/routes.ts's POST /api/team/fund).
 */
export function buildWrapCall(
  wrapperAddress: string,
  wrapperInterface: ethers.Interface,
  to: string,
  amount: bigint,
): MetaTransactionData {
  const data = wrapperInterface.encodeFunctionData("wrap(address,uint256)", [to, amount]);
  return { to: wrapperAddress, value: "0", data, operation: OperationType.Call };
}

export interface ProposedTransaction {
  safeTxHash: string;
}

/**
 * Proposes one or more calls as a single Safe transaction against `safeAddress` (multiple calls
 * are automatically MultiSend-batched by protocol-kit's createTransaction, so a payroll run
 * either all succeeds or all fails atomically). The bot signs as its own owner slot - this is
 * one signature toward the threshold, never the whole threshold by itself.
 */
export async function proposeSafeTransaction(
  safeAddress: string,
  transactions: MetaTransactionData[],
): Promise<ProposedTransaction> {
  if (transactions.length === 0) throw new Error("transactions must not be empty");

  const safe = await getBotSafe(safeAddress);
  const apiKit = getApiKit();

  const safeTransaction = await safe.createTransaction({ transactions });
  const safeTxHash = await safe.getTransactionHash(safeTransaction);
  const signature = await safe.signHash(safeTxHash);
  const resolvedSafeAddress = await safe.getAddress();

  await apiKit.proposeTransaction({
    safeAddress: resolvedSafeAddress,
    safeTransactionData: safeTransaction.data,
    safeTxHash,
    senderAddress: getBotSignerAddress(),
    senderSignature: signature.data,
  });

  return { safeTxHash };
}

/** Fetches current confirmation state for a proposed transaction from the Safe Transaction Service. */
export async function getTransactionStatus(safeTxHash: string): Promise<SafeMultisigTransactionResponse> {
  return getApiKit().getTransaction(safeTxHash);
}

/**
 * Submits the on-chain execution once enough owner signatures are collected. Any address can
 * call execTransaction once the threshold is met - the executor does not need to be an owner -
 * but we use the bot's key since it already holds Sepolia gas.
 */
export async function executeSafeTransaction(
  safeAddress: string,
  safeTxHash: string,
): Promise<{ transactionHash: string }> {
  const apiKit = getApiKit();
  const txResponse = await apiKit.getTransaction(safeTxHash);
  if ((txResponse.confirmations?.length ?? 0) < txResponse.confirmationsRequired) {
    throw new Error(
      `Not enough confirmations yet: ${txResponse.confirmations?.length ?? 0}/${txResponse.confirmationsRequired}`,
    );
  }

  const safe = await getBotSafe(safeAddress);
  const result = await safe.executeTransaction(txResponse);
  return { transactionHash: result.hash };
}

/** Reads the Safe's current on-chain owners (used to resolve which Slack users to notify). */
export async function getSafeOwners(safeAddress: string): Promise<string[]> {
  const provider = new ethers.JsonRpcProvider(requireEnv("RPC_URL"));
  const safeReadOnly = new ethers.Contract(safeAddress, ["function getOwners() view returns (address[])"], provider);
  return safeReadOnly.getOwners();
}
