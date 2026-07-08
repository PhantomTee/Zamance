/**
 * @file keepAlive.ts
 * @description Pings this service's own public /healthz endpoint on an interval. Render's free
 * tier spins the whole container down after ~15 minutes without inbound HTTP traffic, which kills
 * the Socket Mode WebSocket Slack commands depend on - the container then needs to cold-boot
 * (30s+) before it can respond, well past Slack's 3-second command-ack window, producing "the app
 * did not respond". A self-ping is real inbound traffic through Render's edge (not a local
 * loopback call), so it counts toward keeping the free tier warm.
 */

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes - comfortably under Render's ~15min idle window
const DEFAULT_SELF_URL = "https://zamance-bot.onrender.com/healthz";

export function startKeepAlivePing(): () => void {
  const url = process.env.SELF_URL ?? DEFAULT_SELF_URL;
  const intervalMs = Number(process.env.KEEP_ALIVE_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);

  const timer = setInterval(() => {
    fetch(url).catch((err) => console.error("[keep-alive] ping failed", err));
  }, intervalMs);

  console.log(`[keep-alive] started, pinging ${url} every ${intervalMs}ms`);
  return () => clearInterval(timer);
}
