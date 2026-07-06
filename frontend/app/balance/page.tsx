"use client";

import { useState } from "react";
import { BrowserProvider, JsonRpcProvider, Contract, ZeroHash } from "ethers";
import { AppShell } from "@/components/AppShell";
import { useFhevmInstance } from "@/lib/useFhevmInstance";
import { WRAPPER_ADDRESS, SEPOLIA_RPC_URL } from "@/lib/config";

const WRAPPER_ABI = ["function confidentialBalanceOf(address account) view returns (bytes32)"];

type Status = "idle" | "connecting" | "reading" | "signing" | "decrypting" | "done" | "error";

/**
 * Public demo page - connect any Sepolia wallet and decrypt YOUR OWN confidential USDC balance
 * from the shared ConfidentialUSDCWrapper, entirely client-side. Every other FHE operation in
 * Zamance happens server-side inside the Slack bot (see bot/src/chain/fheEncrypt.ts); this page
 * exists so the encrypt/decrypt step is visible and triable in a browser without needing Slack,
 * a Safe, or an install - useful for demoing the core Zama FHEVM mechanic on its own.
 */
export default function BalancePage() {
  const { instance, error: instanceError } = useFhevmInstance();
  const [status, setStatus] = useState<Status>("idle");
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connectAndDecrypt() {
    setError(null);
    setBalance(null);
    setEmpty(false);

    if (!instance) {
      setError(instanceError ?? "FHE runtime is still initializing - try again in a moment.");
      return;
    }
    const eth = (window as unknown as { ethereum?: import("ethers").Eip1193Provider }).ethereum;
    if (!eth) {
      setError("No wallet found - install MetaMask or another injected wallet.");
      return;
    }

    try {
      setStatus("connecting");
      const provider = new BrowserProvider(eth);
      const [account] = await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      setAddress(account);

      setStatus("reading");
      const readProvider = new JsonRpcProvider(SEPOLIA_RPC_URL);
      const wrapper = new Contract(WRAPPER_ADDRESS, WRAPPER_ABI, readProvider);
      const handle: string = await wrapper.confidentialBalanceOf(account);

      /* An uninitialized handle (zero bytes32) means "never received a private payout or wrap"
       * - distinct from a decrypted value of 0n, which means "shielded but currently zero". See
       * anti-patterns.md #27: encrypted zero and the zero handle are not the same state. */
      if (handle === ZeroHash) {
        setEmpty(true);
        setStatus("done");
        return;
      }

      setStatus("signing");
      const keypair = instance.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000);
      const durationDays = 1;
      const eip712 = instance.createEIP712(keypair.publicKey, [WRAPPER_ADDRESS], startTimestamp, durationDays);
      const { EIP712Domain: _omit, ...typesWithoutDomain } = eip712.types;
      const signature = await signer.signTypedData(
        eip712.domain,
        typesWithoutDomain as unknown as Record<string, Array<{ name: string; type: string }>>,
        eip712.message,
      );

      setStatus("decrypting");
      const results = await instance.userDecrypt(
        [{ handle, contractAddress: WRAPPER_ADDRESS }],
        keypair.privateKey,
        keypair.publicKey,
        signature,
        [WRAPPER_ADDRESS],
        account,
        startTimestamp,
        durationDays,
      );
      const value = results[handle as `0x${string}`];
      if (typeof value !== "bigint") throw new Error("Unexpected decrypt result type.");

      setBalance(value);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-2xl flex-1 px-6 py-20 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Decrypt your confidential balance</h1>
        <p className="mt-4 text-foreground/70">
          Connect a Sepolia wallet and decrypt your own encrypted USDC balance from Zamance&apos;s
          shared confidential wrapper - entirely in your browser, via Zama&apos;s FHE relayer. This
          is the same confidential balance a private <code>/payout</code> moves; nothing here goes
          through Slack.
        </p>

        <div className="panel mt-10 rounded-2xl p-8">
          {!address && (
            <button
              onClick={connectAndDecrypt}
              disabled={status === "connecting" || status === "reading"}
              className="rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:shadow-lg active:scale-95 disabled:opacity-50"
              style={{ background: "#7342E2" }}
            >
              Connect wallet and decrypt
            </button>
          )}

          {address && (
            <div className="text-left">
              <p className="text-xs uppercase tracking-widest text-foreground/50">Connected wallet</p>
              <p className="mt-1 font-mono text-sm">{address}</p>

              <div className="mt-6 border-t border-border pt-6">
                {status === "reading" && <p className="text-sm text-foreground/60">Reading your encrypted balance handle...</p>}
                {status === "signing" && <p className="text-sm text-foreground/60">Waiting for your EIP-712 signature in your wallet...</p>}
                {status === "decrypting" && <p className="text-sm text-foreground/60">Decrypting via the Zama relayer...</p>}

                {status === "done" && empty && (
                  <p className="text-sm text-foreground/70">
                    You have no confidential balance yet - it&apos;s only created the first time you
                    receive a private payout, or your team shields USDC into privacy from the
                    dashboard.
                  </p>
                )}

                {status === "done" && !empty && balance !== null && (
                  <>
                    <p className="text-xs uppercase tracking-widest text-foreground/50">Confidential balance</p>
                    <p className="mt-1 text-2xl font-semibold">{balance.toString()} <span className="text-sm font-normal text-foreground/50">USDC base units</span></p>
                  </>
                )}

                {status === "error" && error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  onClick={connectAndDecrypt}
                  className="mt-6 rounded-full border border-border px-5 py-2 text-sm hover:border-accent-soft"
                >
                  Refresh
                </button>
              </div>
            </div>
          )}

          {!address && status === "error" && error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          {!address && instanceError && <p className="mt-4 text-sm text-red-600">{instanceError}</p>}
        </div>
      </main>
    </AppShell>
  );
}
