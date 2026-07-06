"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AppShell } from "@/components/AppShell";
import { Logo } from "@/components/Logo";
import { BOT_API_URL, SLACK_LOGIN_URL } from "@/lib/config";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 60_000;

type Phase = "waking" | "ready" | "timeout";

/**
 * Sits between "Sign in with Slack" and the actual redirect. The bot backend runs on a free
 * Render instance that spins down after 15 minutes idle - the first request after that can take
 * up to ~40s to wake, and without this page that wait happens as a blank browser tab mid-OAuth-
 * redirect, which reads as broken rather than slow. This page shows a real loading state on
 * fast, always-warm Vercel, polls /healthz until the backend responds, then redirects - so the
 * actual Slack redirect only ever fires once it'll resolve immediately.
 */
export default function ConnectingPage() {
  const [phase, setPhase] = useState<Phase>("waking");
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch(`${BOT_API_URL}/healthz`, { cache: "no-store" });
          if (res.ok) {
            if (!cancelled) {
              setPhase("ready");
              window.location.href = SLACK_LOGIN_URL;
            }
            return;
          }
        } catch {
          // Backend still waking up (or genuinely down) - keep polling until the timeout.
        }
        if (Date.now() - startedAt.current > TIMEOUT_MS) {
          if (!cancelled) setPhase("timeout");
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell>
      <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 py-32 text-center">
        <motion.div
          animate={phase === "waking" ? { scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] } : { scale: 1, opacity: 1 }}
          transition={phase === "waking" ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : undefined}
        >
          <Logo color="#7342E2" />
        </motion.div>

        {phase !== "timeout" ? (
          <>
            <h1 className="mt-6 text-xl font-semibold">Connecting to Slack...</h1>
            <p className="mt-3 text-sm text-foreground/60">
              Waking up the backend - this can take up to a minute on the first request after a
              while. You&apos;ll be redirected automatically the moment it&apos;s ready.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-xl font-semibold">Taking longer than expected</h1>
            <p className="mt-3 text-sm text-foreground/60">
              The backend still isn&apos;t responding. It might just need a moment longer, or it
              could be temporarily down.
            </p>
            <a
              href={SLACK_LOGIN_URL}
              className="mt-6 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-white transition hover:shadow-lg"
              style={{ background: "#7342E2" }}
            >
              Try anyway
            </a>
          </>
        )}
      </main>
    </AppShell>
  );
}
