import type { Metadata } from "next";
import { LandingPageShell } from "@/components/landing/LandingPageShell";

export const metadata: Metadata = { title: "Privacy Policy - DeLog" };

export default function PrivacyPage() {
  return (
    <LandingPageShell>
      <h1 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm opacity-50">
        This describes what the DeLog software actually stores and processes, generated
        directly from its implementation. It is a starting point, not legal advice - have it
        reviewed before relying on it for a production Slack Directory submission.
      </p>

      <h2 className="mt-10 text-lg font-semibold">What we collect</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm opacity-70">
        <li>Slack workspace (team) ID, workspace name, and bot access token, when a workspace installs DeLog.</li>
        <li>Slack user IDs of anyone who registers a payout wallet on the dashboard, paired with the Ethereum address they registered.</li>
        <li>Payout and payroll metadata: requester, recipient, status, on-chain transaction hashes, and timestamps.</li>
        <li>The on-chain encrypted-amount handle (ciphertext reference) for each payout - never the amount itself.</li>
      </ul>

      <h2 className="mt-10 text-lg font-semibold">What we deliberately do not collect</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm opacity-70">
        <li>Payout amounts, in any form. Amounts are encrypted client-side before DeLog's backend ever holds them, and are not logged.</li>
        <li>Message content from channels DeLog is not explicitly invoked in.</li>
        <li>Private keys belonging to your team or its members. DeLog's own signer key is never derived from or shared with your workspace.</li>
      </ul>

      <h2 className="mt-10 text-lg font-semibold">How it's used</h2>
      <p className="mt-3 text-sm opacity-70">
        Solely to operate the bot: resolving Slack users to wallet addresses, proposing and
        tracking Safe transactions, and rendering your workspace&apos;s own dashboard. Data from
        one workspace is never used to serve another (see{" "}
        <a href="/security" className="underline">
          Security
        </a>
        ).
      </p>

      <h2 className="mt-10 text-lg font-semibold">Third parties</h2>
      <p className="mt-3 text-sm opacity-70">
        Slack (to operate the bot and Sign in with Slack), an Ethereum RPC provider and the Safe
        Transaction Service (to read and propose on-chain transactions), and the Zama relayer (to
        build encrypted inputs). Each sees only what&apos;s inherently necessary to perform its
        function - none of them receive plaintext payout amounts from DeLog.
      </p>

      <h2 className="mt-10 text-lg font-semibold">Retention and deletion</h2>
      <p className="mt-3 text-sm opacity-70">
        Data is retained for as long as your workspace has DeLog installed. Uninstalling
        removes the workspace&apos;s installation record; contact us (see{" "}
        <a href="/support" className="underline">
          Support
        </a>
        ) to request deletion of the remaining wallet and payout metadata.
      </p>
    </LandingPageShell>
  );
}
