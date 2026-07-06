/**
 * @file token.ts
 * @description Every team shares two global, protocol-level contracts on Sepolia (not something
 * a team deploys or configures - only the Safe address is per-team, connected via the dashboard):
 * Circle's real USDC, and one
 * ConfidentialUSDCWrapper wrapping it. A payout either moves real USDC directly (public,
 * transparent) or moves the Safe's already-wrapped confidential balance via the wrapper's
 * confidentialTransfer (private, encrypted) - see chain/safe.ts for the call builders and
 * slack/payoutEngine.ts for how the toggle picks between them.
 */

import { ethers } from "ethers";

export const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export const WRAPPER_ABI = [
  "function wrap(address to, uint256 amount) returns (bytes32)",
  "function confidentialTransfer(address to, bytes32 encAmount, bytes inputProof) returns (bytes32)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function underlying() view returns (address)",
];

export const usdcInterface = new ethers.Interface(USDC_ABI);
export const wrapperInterface = new ethers.Interface(WRAPPER_ABI);

/** Circle's real Sepolia USDC - shared across every team, not per-team configurable. */
export function getUsdcAddress(): string {
  const value = process.env.USDC_ADDRESS;
  if (!value) throw new Error("USDC_ADDRESS is not set");
  return value;
}

/** The single shared ConfidentialUSDCWrapper deployment - see contracts/scripts/deployWrapper.ts. */
export function getWrapperAddress(): string {
  const value = process.env.WRAPPER_ADDRESS;
  if (!value) throw new Error("WRAPPER_ADDRESS is not set");
  return value;
}

export function getProvider(): ethers.JsonRpcProvider {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL is not set");
  return new ethers.JsonRpcProvider(rpcUrl);
}

export function getReadOnlyUsdc(): ethers.Contract {
  return new ethers.Contract(getUsdcAddress(), USDC_ABI, getProvider());
}

export function getReadOnlyWrapper(): ethers.Contract {
  return new ethers.Contract(getWrapperAddress(), WRAPPER_ABI, getProvider());
}
