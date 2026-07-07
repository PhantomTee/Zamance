import type { Metadata } from "next";
import { LandingPageShell } from "@/components/landing/LandingPageShell";

export const metadata: Metadata = { title: "Docs - DeLog" };

const COMMANDS = [
  { cmd: "/payout", body: "Opens a modal to propose a single payout, with a Private/Public toggle (private by default)." },
  { cmd: "/payroll", body: "Opens a modal for a batch payroll run with the same toggle, bundled into one atomic Safe transaction." },
];

const STEPS = [
  { title: "Sign in with Slack", body: "Installs automatically on first sign-in if your workspace hasn't added DeLog yet - each workspace gets its own isolated data." },
  { title: "Create a Safe", body: "At app.safe.global - add DeLog's bot signer address (shown on the dashboard) as an owner, threshold >= 2-of-N." },
  { title: "Connect it", body: "Sign in to the dashboard and connect your Safe address there - admin only, nothing to deploy." },
  { title: "Get testnet USDC", body: "Send the Safe some real Sepolia USDC, e.g. from Circle's faucet." },
  { title: "Register your wallet", body: "On the dashboard, connect the wallet you want to send and receive payouts with - everyone who sends or receives a payout needs this, including Safe owners." },
  { title: "Shield and pay", body: "From the dashboard, shield part of the Safe's USDC for private payouts. Then use /payout or /payroll in Slack - toggle Private or Public per run." },
];

export default function DocsPage() {
  return (
    <LandingPageShell>
      <h1 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
        Docs
      </h1>
      <p className="mt-4 opacity-70">
        DeLog is self-hosted per workspace right now - there's no shared multi-team backend to
        sign up for beyond installing the Slack app. The full setup guide (running the bot
        backend, the Slack app manifest, Hardhat deployment) lives in the repo README; this page
        covers the parts relevant once it's already running.
      </p>

      <h2 className="mt-12 text-xl font-semibold">Onboarding a workspace</h2>
      <ol className="mt-4 space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="font-mono text-sm" style={{ color: "#7342E2" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="font-medium">{s.title}</p>
              <p className="text-sm opacity-70">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="mt-12 text-xl font-semibold">Slash commands</h2>
      <div className="mt-4 space-y-4">
        {COMMANDS.map((c) => (
          <div key={c.cmd} className="panel rounded-xl p-4">
            <code className="text-sm font-semibold" style={{ color: "#7342E2" }}>
              {c.cmd}
            </code>
            <p className="mt-1 text-sm opacity-70">{c.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-12 text-sm opacity-50">
        Full source, contract details, and deploy scripts:{" "}
        <a href="https://github.com/PhantomTee/DeLog" className="underline">
          github.com/PhantomTee/DeLog
        </a>
        .
      </p>
    </LandingPageShell>
  );
}
