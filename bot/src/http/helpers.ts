/**
 * @file helpers.ts
 * @description Small helpers for writing JSON responses and applying CORS on Bolt's raw
 * CustomRoute handlers (req: ParamsIncomingMessage, res: ServerResponse) - there is no Express
 * app here, just the underlying Node http primitives Bolt exposes.
 */

import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse } from "node:http";
import { verifySession, type DashboardSession } from "./jwt";

function dashboardOrigin(): string {
  return process.env.DASHBOARD_ORIGIN ?? "*";
}

export function withCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", dashboardOrigin());
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  withCors(res);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export function handlePreflight(res: ServerResponse): void {
  withCors(res);
  res.writeHead(204);
  res.end();
}

export function getQuery(req: ParamsIncomingMessage): URLSearchParams {
  return new URL(req.url ?? "/", "http://internal").searchParams;
}

/** Reads and JSON-parses a POST body from Bolt's raw CustomRoute request stream. */
export function readJsonBody<T>(req: ParamsIncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    req.on("error", reject);
  });
}

export function requireSession(req: ParamsIncomingMessage, res: ServerResponse): DashboardSession | null {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  const session = token ? verifySession(token) : null;
  if (!session) {
    sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }
  return session;
}
