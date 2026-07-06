import type { Metadata } from "next";
import { LandingPageShell } from "@/components/landing/LandingPageShell";

export const metadata: Metadata = { title: "Security - DeLog" };

const PRINCIPLES = [
  {
    title: "No single point of failure",
    body: "DeLog is one signer on your team's Gnosis Safe, never the sole owner. It can propose a payout and co-sign, but a human owner must always add the second signature before anything executes on-chain.",
  },
  {
    title: "One key, many treasuries",
    body: "The bot uses a single global Safe-signer key reused as a co-signing owner across every installed team's Safe. Being an owner is just an on-chain permission grant, so no per-team private keys are ever generated or stored.",
  },
  {
    title: "Amounts never touch plaintext storage",
    body: "Payout amounts are encrypted client-side (Zama FHEVM, ERC-7984) before they ever reach the chain. The database only stores the resulting ciphertext handle - an opaque value that discloses nothing without the recipient's own decryption credentials.",
  },
  {
    title: "Tenant isolation",
    body: "Every database row is scoped by Slack team ID. One workspace's payout history, wallet registrations, and treasury config are never reachable from another workspace's session.",
  },
  {
    title: "Private by default in Slack",
    body: "Every bot response is ephemeral or a direct message. Amounts and recipients are never posted to a public channel.",
  },
];

export default function SecurityPage() {
  return (
    <LandingPageShell>
      <h1 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
        Security
      </h1>
      <p className="mt-4 opacity-70">
        The confidential-token contract was self-reviewed against a documented FHEVM audit
        checklist before deployment (
        <a
          href="https://github.com/PhantomTee/DeLog/blob/master/contracts/SECURITY_REVIEW.md"
          className="underline"
        >
          full write-up
        </a>
        ). The principles below cover the system as a whole.
      </p>

      <div className="mt-10 space-y-8">
        {PRINCIPLES.map((p) => (
          <div key={p.title}>
            <h2 className="font-semibold">{p.title}</h2>
            <p className="mt-2 text-sm opacity-70">{p.body}</p>
          </div>
        ))}
      </div>

      <div className="panel mt-12 rounded-xl p-5">
        <p className="text-sm opacity-70">
          Found an issue? Please report it privately rather than filing a public GitHub issue -
          see the <a href="/support" className="underline">Support</a> page for how to reach us.
        </p>
      </div>
    </LandingPageShell>
  );
}
