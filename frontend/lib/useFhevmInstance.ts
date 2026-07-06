"use client";

import { useEffect, useState } from "react";
import type { FhevmInstance } from "@zama-fhe/relayer-sdk/web";

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
        const eth = (window as unknown as { ethereum?: unknown }).ethereum;
        if (!eth) {
          if (!cancelled) setError("No wallet found - install MetaMask or another injected wallet.");
          return;
        }
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
