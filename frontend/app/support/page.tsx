import type { Metadata } from "next";
import { LandingPageShell } from "@/components/landing/LandingPageShell";

export const metadata: Metadata = { title: "Support - DeLog" };

const FAQ = [
  {
    q: "\"This workspace hasn't connected a treasury yet\"",
    a: "A workspace admin needs to sign in to the dashboard and connect a Safe address there - see the Docs page for the full onboarding flow.",
  },
  {
    q: "\"This user has not registered a payout wallet on the dashboard yet\"",
    a: "Both the sender and recipient of a payout need a registered wallet. Ask the missing party to sign in to the dashboard and use \"Register your payout wallet.\"",
  },
  {
    q: "A payout is stuck on \"awaiting_signatures\"",
    a: "A second Safe owner needs to sign the proposed transaction in Safe{Wallet}. DeLog never executes with only its own signature.",
  },
  {
    q: "The dashboard shows \"Could not reach the DeLog API\"",
    a: "The bot backend isn't reachable at the configured URL - check NEXT_PUBLIC_BOT_API_URL and that the backend is running.",
  },
];

export default function SupportPage() {
  return (
    <LandingPageShell>
      <h1 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
        Support
      </h1>
      <p className="mt-4 opacity-70">
        DeLog is open source. For bugs or feature requests, open an issue on GitHub. For
        anything sensitive - a security concern, or a question involving your workspace&apos;s
        data - reach out privately instead of posting publicly.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <a
          href="https://github.com/PhantomTee/DeLog/issues"
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-white"
          style={{ background: "#7342E2" }}
        >
          Open a GitHub issue
        </a>
        <a
          href="mailto:support@delog.app"
          className="rounded-full px-5 py-2.5 text-sm font-semibold"
          style={{ background: "var(--color-login-bg)", color: "var(--color-text)" }}
        >
          Email support@delog.app
        </a>
      </div>

      <h2 className="mt-12 text-lg font-semibold">Common issues</h2>
      <div className="mt-4 space-y-5">
        {FAQ.map((f) => (
          <div key={f.q}>
            <p className="font-medium">{f.q}</p>
            <p className="mt-1 text-sm opacity-70">{f.a}</p>
          </div>
        ))}
      </div>
    </LandingPageShell>
  );
}
