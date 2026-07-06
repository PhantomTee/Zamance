import { AppShell } from "@/components/AppShell";
import { SlackButton } from "@/components/SlackButton";
import { SLACK_LOGIN_URL } from "@/lib/config";

const REQUIREMENTS = [
  "A workspace admin to approve the install the first time you sign in (Zamance requests commands, chat:write, im:write, users:read).",
  "A Gnosis Safe (2-of-N or higher) with Zamance added as one co-signing owner - no token to deploy, payouts move real Sepolia USDC.",
  "Some Sepolia testnet USDC in the Safe (e.g. from Circle's faucet) before running private or public payouts.",
];

export default function AddToSlackPage() {
  return (
    <AppShell>
    <main className="mx-auto max-w-2xl flex-1 px-6 py-20 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Sign in to add Zamance</h1>
      <p className="mt-4 text-foreground/70">
        There&apos;s no separate install step - sign in with Slack, and if your workspace hasn&apos;t
        added Zamance yet, you&apos;ll be walked through the OAuth install automatically, then
        dropped straight into your dashboard. Every workspace gets its own isolated install - a
        separate database row, a separate treasury, no data shared with any other team.
      </p>

      <div className="mt-10 flex justify-center">
        <SlackButton href={SLACK_LOGIN_URL} label="Sign in with Slack" />
      </div>

      <div className="panel mt-16 rounded-2xl p-6 text-left">
        <h2 className="font-semibold">Before you sign in, you&apos;ll need:</h2>
        <ul className="mt-4 space-y-3 text-sm text-foreground/70">
          {REQUIREMENTS.map((r) => (
            <li key={r} className="flex gap-3">
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
              {r}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-foreground/50">
          Zamance never deploys a Safe on your behalf - your team keeps full control over its own
          on-chain treasury. Once installed, sign in to the{" "}
          <a href="/dashboard" className="underline">
            dashboard
          </a>{" "}
          to connect it and (if you want private payouts) shield some USDC into privacy - Slack is
          just for running payouts.
        </p>
      </div>
    </main>
    </AppShell>
  );
}
