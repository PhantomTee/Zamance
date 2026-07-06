import { Navbar } from "@/components/landing/Navbar";
import { HeroBackground } from "@/components/landing/HeroBackground";
import { Hero } from "@/components/landing/Hero";
import { Footer } from "@/components/Footer";

const FEATURES = [
  {
    title: "Real USDC, toggle the privacy",
    body: "Every payout can go out as encrypted, confidential USDC via Zama's FHEVM (ERC-7984), or as a normal transparent USDC transfer - private by default, public when you say so.",
  },
  {
    title: "Slack-native, private by default",
    body: "Every response is ephemeral or DM-only. Amounts and recipients never get posted to a public channel - not even by accident.",
  },
  {
    title: "Single or batch payouts",
    body: "Run a one-off /payout, or bundle a whole payroll run into one atomic Safe MultiSend transaction with /payroll.",
  },
];

const STEPS = [
  { title: "Add Zamance to Slack", body: "Install via OAuth - each workspace gets its own isolated installation." },
  {
    title: "Connect your treasury",
    body: "Create a Safe, add Zamance as a co-signing owner, then connect it from the dashboard - no token to deploy, Zamance pays out in real Sepolia USDC.",
  },
  { title: "Pay your team", body: "Use /payout or /payroll from Slack, toggling Private or Public. A second Safe owner signs, Zamance executes and DMs both sides." },
];

export default function Home() {
  return (
    <main className="flex-1">
      <div className="relative overflow-hidden">
        <HeroBackground />
        <Navbar />
        <Hero />
      </div>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
          Features
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="panel rounded-2xl p-6">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm opacity-70">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
          How it works
        </h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="panel rounded-2xl p-6">
              <span className="text-sm font-mono" style={{ color: "#7342E2" }}>
                0{i + 1}
              </span>
              <h3 className="mt-2 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm opacity-70">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
          No single point of failure
        </h2>
        <p className="mt-4 max-w-2xl text-sm opacity-70">
          Zamance is one signer on your team&apos;s Gnosis Safe. It can propose a payout and
          co-sign, but a human owner must always add the second signature before anything
          executes - the bot alone can never move funds.
        </p>
        <a href="/security" className="mt-4 inline-block text-sm underline" style={{ color: "#7342E2" }}>
          Full security model &rarr;
        </a>
      </section>

      <Footer />
    </main>
  );
}
