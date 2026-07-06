"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/useSession";
import { api, ApiError, type Me, type Team, type PayoutSummary, type PayrollRunSummary } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { SlackButton } from "@/components/SlackButton";
import { StatusBadge } from "@/components/StatusBadge";
import { SLACK_LOGIN_URL } from "@/lib/config";
import { Copy, Check, Link2, ShieldCheck, ArrowUpRight, Layers, Lock, Unlock, ExternalLink } from "lucide-react";

function short(addr: string | null): string {
  if (!addr) return "-";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function etherscanTx(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

function etherscanAddress(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}

interface ActivityItem {
  id: string;
  kind: "payout" | "payroll";
  label: string;
  isPrivate: boolean;
  status: string;
  txHash: string | null;
  createdAt: string;
}

export default function DashboardPage() {
  const { token, clear } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [payouts, setPayouts] = useState<PayoutSummary[]>([]);
  const [runs, setRuns] = useState<PayrollRunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [safeInput, setSafeInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [fundAmount, setFundAmount] = useState("");
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [fundTxHash, setFundTxHash] = useState<string | null>(null);

  function loadDashboard() {
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
  }

  useEffect(loadDashboard, [token, clear]);

  async function connectTreasury() {
    if (!token || !safeInput.trim()) return;
    setConnecting(true);
    setConnectError(null);
    try {
      await api.connectTreasury(token, safeInput.trim());
      setSafeInput("");
      loadDashboard();
    } catch (err) {
      setConnectError(err instanceof ApiError ? err.message : "Could not connect the treasury.");
    } finally {
      setConnecting(false);
    }
  }

  async function fundTreasury() {
    if (!token || !fundAmount.trim()) return;
    setFunding(true);
    setFundError(null);
    setFundTxHash(null);
    try {
      const { safeTxHash } = await api.fundTreasury(token, fundAmount.trim());
      setFundTxHash(safeTxHash);
      setFundAmount("");
    } catch (err) {
      setFundError(err instanceof ApiError ? err.message : "Could not propose the wrap transaction.");
    } finally {
      setFunding(false);
    }
  }

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

  const activity: ActivityItem[] = [
    ...payouts.map(
      (p): ActivityItem => ({
        id: p.id,
        kind: "payout",
        label: `<@${p.recipientId}>`,
        isPrivate: p.isPrivate,
        status: p.status,
        txHash: p.txHash,
        createdAt: p.createdAt,
      }),
    ),
    ...runs.map(
      (r): ActivityItem => ({
        id: r.id,
        kind: "payroll",
        label: `${r.recipientCount} recipient${r.recipientCount === 1 ? "" : "s"}`,
        isPrivate: r.isPrivate,
        status: r.status,
        txHash: r.txHash,
        createdAt: r.createdAt,
      }),
    ),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold sm:text-2xl">{team?.name ?? me?.teamName ?? "Dashboard"}</h1>
            <p className="text-sm text-foreground/50">Signed in as {me?.userId}</p>
          </div>
          <button
            onClick={clear}
            className="flex-shrink-0 rounded-full border border-border px-4 py-2 text-sm hover:border-accent-soft"
          >
            Sign out
          </button>
        </div>

        {error && <p className="mt-6 rounded-lg bg-red-500/10 p-4 text-sm text-red-600">{error}</p>}
        {loading && <p className="mt-6 text-sm text-foreground/50">Loading...</p>}

        {team && (
          <div className="panel mt-8 rounded-2xl p-5 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-foreground/50">Treasury</p>
                <p className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>
                  {team.treasuryConfigured ? "Connected" : "Not connected"}
                </p>
                <p className="mt-1 max-w-sm text-sm text-foreground/60">
                  {team.treasuryConfigured
                    ? "Payouts move real Sepolia USDC through this Safe, either transparently or through the shared confidential wrapper."
                    : "Connect a Safe below to start sending payouts."}
                </p>
              </div>

              <div className="grid w-full gap-2 sm:w-64 sm:flex-shrink-0">
                <AddressRow label="Safe" value={team.safeAddress} href={team.safeAddress ? `https://app.safe.global/home?safe=sep:${team.safeAddress}` : undefined} />
                <AddressRow label="Confidential wrapper" value={team.wrapperAddress} href={team.wrapperAddress ? etherscanAddress(team.wrapperAddress) : undefined} />
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-6">
              <p className="text-xs uppercase tracking-widest text-foreground/50">Zamance bot signer address</p>
              <p className="mt-2 text-sm text-foreground/60">
                Add this address as a co-signing owner on your Safe (threshold 2-of-N or higher) before
                connecting it below.
              </p>
              <CopyableFullAddress value={team.botSignerAddress} />
            </div>
          </div>
        )}

        {team && !team.treasuryConfigured && (
          <div className="panel mt-6 rounded-2xl p-5 sm:p-6">
            <ActionHeader icon={<Link2 size={16} />} title="Connect your Safe" />
            <p className="mt-2 text-sm text-foreground/70">
              Workspace admins only. Payouts move real Sepolia USDC, either as a plain transfer or
              privately through the shared confidential wrapper - there&apos;s no token to deploy.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={safeInput}
                onChange={(e) => setSafeInput(e.target.value)}
                placeholder="0xYourSafeAddress"
                className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
                style={{ fontFamily: "var(--font-data)" }}
              />
              <button
                onClick={connectTreasury}
                disabled={connecting || !safeInput.trim()}
                className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ background: "#7342E2" }}
              >
                {connecting ? "Connecting..." : "Connect Safe"}
              </button>
            </div>
            {connectError && <p className="mt-2 text-sm text-red-600">{connectError}</p>}
          </div>
        )}

        {team && team.treasuryConfigured && (
          <div className="panel mt-6 rounded-2xl p-5 sm:p-6">
            <ActionHeader icon={<ShieldCheck size={16} />} title="Fund the confidential balance" />
            <p className="mt-2 text-sm text-foreground/70">
              Registered Safe owners only. Shields this much of the Safe&apos;s real USDC into its
              confidential balance, so private payouts have encrypted balance to draw from. The Safe
              must already hold at least this much real Sepolia USDC. A second Safe owner still has to
              sign and execute the resulting transaction in Safe{"{"}Wallet{"}"}.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                placeholder="Amount (USDC base units)"
                inputMode="numeric"
                className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
              />
              <button
                onClick={fundTreasury}
                disabled={funding || !fundAmount.trim()}
                className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ background: "#7342E2" }}
              >
                {funding ? "Proposing..." : "Shield into privacy"}
              </button>
            </div>
            {fundError && <p className="mt-2 text-sm text-red-600">{fundError}</p>}
            {fundTxHash && (
              <p className="mt-2 text-sm text-foreground/70">
                Proposed - tx{" "}
                <a href={etherscanTx(fundTxHash)} target="_blank" rel="noreferrer" className="underline">
                  {short(fundTxHash)}
                </a>
                . Sign and execute it in Safe{"{"}Wallet{"}"} to complete the shield.
              </p>
            )}
          </div>
        )}

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Activity</h2>
          <div className="panel mt-4 overflow-hidden rounded-2xl">
            {activity.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-foreground/50">No payouts yet.</p>
            )}
            {activity.map((item) => (
              <ActivityRow key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function ActionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: "rgba(115,66,226,0.12)", color: "#7342E2" }}
      >
        {icon}
      </span>
      <p className="text-sm font-semibold">{title}</p>
    </div>
  );
}

function AddressRow({ label, value, href }: { label: string; value: string | null; href?: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[0.65rem] uppercase tracking-wide text-foreground/50">{label}</p>
        {value && href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="truncate text-xs hover:underline"
            style={{ fontFamily: "var(--font-data)", display: "block" }}
          >
            {short(value)}
          </a>
        ) : (
          <p className="truncate text-xs" style={{ fontFamily: "var(--font-data)" }}>
            {short(value)}
          </p>
        )}
      </div>
      {value && (
        <button
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md hover:bg-muted"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      )}
    </div>
  );
}

function CopyableFullAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <code
        className="flex-1 overflow-x-auto rounded-lg bg-muted/60 px-3 py-2 text-sm"
        style={{ fontFamily: "var(--font-data)" }}
      >
        {value}
      </code>
      <button
        onClick={copy}
        aria-label="Copy bot signer address"
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border hover:border-accent-soft"
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted/60 text-accent">
          {item.kind === "payout" ? <ArrowUpRight size={16} /> : <Layers size={16} />}
        </span>
        <div>
          <p className="text-sm font-medium">{item.label}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-foreground/50">
            {item.isPrivate ? <Lock size={11} /> : <Unlock size={11} />}
            {item.isPrivate ? "Private" : "Public"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-12 sm:pl-0">
        <StatusBadge status={item.status} />
        {item.txHash ? (
          <a
            href={etherscanTx(item.txHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-foreground/50 hover:text-accent"
            style={{ fontFamily: "var(--font-data)" }}
          >
            {short(item.txHash)} <ExternalLink size={11} />
          </a>
        ) : (
          <span className="text-xs text-foreground/40" style={{ fontFamily: "var(--font-data)" }}>
            -
          </span>
        )}
        <span className="text-xs text-foreground/40">{formatDate(item.createdAt)}</span>
      </div>
    </div>
  );
}
