"use client";

import { useEffect, useState } from "react";
import type { FhevmInstance } from "@zama-fhe/relayer-sdk/web";

const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7"; // 11155111

interface Eip1193Like {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

/**
 * SepoliaConfig bakes in Sepolia-specific addresses for the ACL / KMS verifier / input verifier
 * contracts. createInstance() reads from those addresses on whatever chain the wallet is
 * currently connected to - it never asks the wallet to switch networks itself. If the wallet is
 * sitting on a different chain (e.g. Mainnet, which is MetaMask's common default), those reads
 * hit addresses with no contract deployed and fail with ethers' BAD_DATA ("could not decode
 * result data", value "0x") on calls like eip712Domain(). Forcing a switch to Sepolia first
 * avoids that class of error entirely.
 */
async function ensureSepolia(eth: Eip1193Like): Promise<void> {
  const currentChainId = await eth.request({ method: "eth_chainId" });
  if (currentChainId === SEPOLIA_CHAIN_ID_HEX) return;

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (switchErr) {
    const code = (switchErr as { code?: number })?.code;
    if (code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID_HEX,
            chainName: "Sepolia",
            nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
    } else {
      throw new Error("Please switch your wallet to the Ethereum Sepolia network and try again.");
    }
  }
}

/**
 * Lazily initializes the relayer SDK's WASM runtime and a Sepolia FhevmInstance, gated behind
 * useEffect so it never runs during Next.js server-side prerender. A *static* top-level import of
 * `@zama-fhe/relayer-sdk/web` still gets evaluated during Next.js's server render pass even inside
 * a "use client" file (the module graph is loaded in Node to produce the initial HTML), and the
 * bundle references the browser global `self` at module-evaluation time, crashing SSR with
 * `ReferenceError: self is not defined`. A dynamic `import()` inside useEffect defers loading the
 * module until the browser actually runs this effect, so Node's SSR pass never touches it.
 */
export function useFhevmInstance(): { instance: FhevmInstance | null; error: string | null } {
  const [instance, setInstance] = useState<FhevmInstance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { createInstance, initSDK, SepoliaConfig } = await import("@zama-fhe/relayer-sdk/web");
        await initSDK();
        const eth = (window as unknown as { ethereum?: Eip1193Like }).ethereum;
        if (!eth) {
          if (!cancelled) setError("No wallet found - install MetaMask or another injected wallet.");
          return;
        }
        await ensureSepolia(eth);
        const inst = await createInstance({ ...SepoliaConfig, network: eth as never });
        if (!cancelled) setInstance(inst);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to initialize the FHE runtime.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { instance, error };
}
