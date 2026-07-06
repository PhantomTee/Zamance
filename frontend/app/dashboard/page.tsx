"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/useSession";
import { api, ApiError, type Me, type Team, type PayoutSummary, type PayrollRunSummary } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { SlackButton } from "@/components/SlackButton";
import { StatusBadge } from "@/components/StatusBadge";
import { SLACK_LOGIN_URL } from "@/lib/config";
import { Copy, Check } from "lucide-react";

function short(addr: string | null): string {
  if (!addr) return "-";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function DashboardPage() {
  const { token, clear } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [payouts, setPayouts] = useState<PayoutSummary[]>([]);
  const [runs, setRuns] = useState<PayrollRunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyBotAddress() {
    if (!team?.botSignerAddress) return;
    navigator.clipboard.writeText(team.botSignerAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    Promise.all([api.me(token), api.team(token), api.payouts(token), api.payrollRuns(token)])
      .then(([meRes, teamRes, payoutsRes, runsRes]) => {
        setMe(meRes);
        setTeam(teamRes);
        setPayouts(payoutsRes);
        setRuns(runsRes);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clear();
        } else {
          setError("Could not reach the Zamance API. Is the bot backend running?");
        }
      })
      .finally(() => setLoading(false));
  }, [token, clear]);

  if (!token) {
    return (
      <AppShell>
        <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-6 py-32 text-center">
          <h1 className="text-2xl font-semibold">Sign in with Slack</h1>
          <p className="mt-3 text-foreground/70">
            Your dashboard shows payout history for your workspace only - amounts are never
            included, only status and timestamps.
          </p>
          <div className="mt-8">
            <SlackButton href={SLACK_LOGIN_URL} label="Sign in with Slack" />
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
    <main className="mx-auto max-w-5xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{team?.name ?? me?.teamName ?? "Dashboard"}</h1>
          <p className="text-sm text-foreground/50">Signed in as {me?.userId}</p>
        </div>
        <button
          onClick={clear}
          className="rounded-full border border-border px-4 py-2 text-sm hover:border-accent-soft"
        >
          Sign out
        </button>
      </div>

      {error && <p className="mt-6 rounded-lg bg-red-500/10 p-4 text-sm text-red-600">{error}</p>}
      {loading && <p className="mt-6 text-sm text-foreground/50">Loading...</p>}

      {team && (
        <div className="panel mt-8 rounded-2xl p-5">
          <p className="text-xs uppercase tracking-widest text-foreground/50">
            Zamance bot signer address
          </p>
          <p className="mt-2 text-sm text-foreground/70">
            Add this address as a co-signing owner on your Safe (threshold 2-of-N or higher) before
            running <code>/setup-treasury</code>.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-muted/60 px-3 py-2 text-sm">
              {team.botSignerAddress}
            </code>
            <button
              onClick={copyBotAddress}
              aria-label="Copy bot signer address"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border hover:border-accent-soft"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      )}

      {team && (
        <section className="mt-4 grid gap-4 sm:grid-cols-3">
          <Stat label="Treasury" value={team.treasuryConfigured ? "Configured" : "Not set up"} />
          <Stat label="Safe" value={short(team.safeAddress)} />
          <Stat label="Confidential wrapper" value={short(team.wrapperAddress)} />
        </section>
      )}

      {team && !team.treasuryConfigured && (
        <p className="panel mt-6 rounded-lg p-4 text-sm text-foreground/70">
          Run <code>/setup-treasury &lt;safeAddress&gt;</code> in Slack to connect your
          team&apos;s Safe - payouts move real Sepolia USDC, either as a plain transfer or
          privately through the shared confidential wrapper.
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Payouts</h2>
        <div className="panel mt-4 overflow-hidden rounded-2xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-foreground/50">
              <tr>
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Visibility</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Tx</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {payouts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-foreground/50">
                    No payouts yet.
                  </td>
                </tr>
              )}
              {payouts.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    &lt;@{p.recipientId}&gt;
                  </td>
                  <td className="px-4 py-3 text-foreground/70">{p.isPrivate ? "Private" : "Public"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground/50">{short(p.txHash)}</td>
                  <td className="px-4 py-3 text-foreground/50">{new Date(p.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Payroll runs</h2>
        <div className="panel mt-4 overflow-hidden rounded-2xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-foreground/50">
              <tr>
                <th className="px-4 py-3 font-medium">Recipients</th>
                <th className="px-4 py-3 font-medium">Visibility</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Tx</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-foreground/50">
                    No payroll runs yet.
                  </td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">{r.recipientCount}</td>
                  <td className="px-4 py-3 text-foreground/70">{r.isPrivate ? "Private" : "Public"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground/50">{short(r.txHash)}</td>
                  <td className="px-4 py-3 text-foreground/50">{new Date(r.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel rounded-2xl p-5">
      <p className="text-xs uppercase tracking-widest text-foreground/50">{label}</p>
      <p className="mt-2 font-mono text-sm">{value}</p>
    </div>
  );
}
