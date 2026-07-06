/**
 * @file routes.ts
 * @description Dashboard-facing HTTP surface, mounted as Bolt customRoutes alongside the OAuth
 * install routes (see ../index.ts). Concerns here: "Sign in with Slack" (OIDC) issuing a
 * dashboard JWT, read-only JSON endpoints the Zamance frontend polls, and the two treasury
 * write actions (connect a Safe, shield USDC into the confidential balance) - both of those now
 * live on the website instead of as Slack slash commands, so the same admin/owner authorization
 * checks that used to run against Slack's `command.user_id` here run against the JWT session's
 * `userId` instead. No endpoint here ever returns a payout amount - see the comment on the
 * Payout model in prisma/schema.prisma.
 */

import type { CustomRoute } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import { ethers } from "ethers";
import { buildAuthorizeUrl, exchangeCodeForUserInfo } from "./slackOidc";
import { signOAuthState, verifyOAuthState, signSession } from "./jwt";
import { sendJson, handlePreflight, getQuery, requireSession, readJsonBody } from "./helpers";
import { getTeam, listPayouts, listPayrollRuns, setTeamTreasury, getRegisteredOwnerSlackIds, logAudit } from "../db/repository";
import { getBotSignerAddress, getSafeOwners, buildApproveCall, buildWrapCall, proposeSafeTransaction } from "../chain/safe";
import { usdcInterface, wrapperInterface, getWrapperAddress } from "../chain/token";
import { requireTeamTreasury, TREASURY_NOT_CONFIGURED_MESSAGE } from "../slack/teamConfig";

function frontendUrl(path: string): string {
  const base = process.env.DASHBOARD_ORIGIN ?? "http://localhost:3000";
  return `${base}${path}`;
}

export const dashboardRoutes: CustomRoute[] = [
  {
    path: "/healthz",
    method: "GET",
    handler: (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    },
  },
  {
    path: "/auth/slack/login",
    method: "GET",
    handler: (_req, res) => {
      const state = signOAuthState();
      res.writeHead(302, { Location: buildAuthorizeUrl(state) });
      res.end();
    },
  },
  {
    path: "/auth/slack/callback",
    method: "GET",
    handler: async (req, res) => {
      const query = getQuery(req);
      const code = query.get("code");
      const state = query.get("state");

      if (!code || !state || !verifyOAuthState(state)) {
        res.writeHead(302, { Location: frontendUrl("/dashboard?error=invalid_state") });
        res.end();
        return;
      }

      try {
        const info = await exchangeCodeForUserInfo(code);
        const team = await getTeam(info.teamId);
        if (!team) {
          // Not installed yet - send them straight into the install flow instead of a
          // dead-end error. Bolt's post-install success callback (see ../index.ts) bounces
          // back here, so "Sign In" and "Add to Slack" converge on the same result either way.
          res.writeHead(302, { Location: "/slack/install" });
          res.end();
          return;
        }
        const token = signSession({ teamId: info.teamId, userId: info.userId });
        res.writeHead(302, { Location: frontendUrl(`/dashboard#token=${token}`) });
        res.end();
      } catch (err) {
        console.error("[oidc] callback failed", err);
        res.writeHead(302, { Location: frontendUrl("/dashboard?error=oidc_failed") });
        res.end();
      }
    },
  },
  {
    path: "/api/me",
    method: ["GET", "OPTIONS"],
    handler: async (req, res) => {
      if (req.method === "OPTIONS") return handlePreflight(res);
      const session = requireSession(req, res);
      if (!session) return;
      const team = await getTeam(session.teamId);
      sendJson(res, 200, { teamId: session.teamId, userId: session.userId, teamName: team?.name ?? null });
    },
  },
  {
    path: "/api/team",
    method: ["GET", "OPTIONS"],
    handler: async (req, res) => {
      if (req.method === "OPTIONS") return handlePreflight(res);
      const session = requireSession(req, res);
      if (!session) return;
      const team = await getTeam(session.teamId);
      if (!team) return sendJson(res, 404, { error: "Team not found" });
      sendJson(res, 200, {
        id: team.id,
        name: team.name,
        installedAt: team.installedAt,
        safeAddress: team.safeAddress,
        usdcAddress: process.env.USDC_ADDRESS ?? null,
        wrapperAddress: process.env.WRAPPER_ADDRESS ?? null,
        botSignerAddress: getBotSignerAddress(),
        treasuryConfigured: Boolean(team.safeAddress),
      });
    },
  },
  {
    path: "/api/team/treasury",
    method: ["POST", "OPTIONS"],
    handler: async (req, res) => {
      if (req.method === "OPTIONS") return handlePreflight(res);
      const session = requireSession(req, res);
      if (!session) return;

      const team = await getTeam(session.teamId);
      if (!team) return sendJson(res, 404, { error: "Team not found" });

      // Same admin-only check /setup-treasury used to do in Slack, just against the team's
      // stored bot token instead of Bolt's per-command client.
      const client = new WebClient(team.botToken);
      const userInfo = await client.users.info({ user: session.userId });
      if (!userInfo.user?.is_admin && !userInfo.user?.is_owner) {
        return sendJson(res, 403, { error: "Only a workspace admin can connect the treasury." });
      }

      let body: { safeAddress?: string };
      try {
        body = await readJsonBody(req);
      } catch {
        return sendJson(res, 400, { error: "Invalid request body." });
      }

      const safeAddress = body.safeAddress?.trim();
      if (!safeAddress || !ethers.isAddress(safeAddress)) {
        return sendJson(res, 400, { error: "safeAddress must be a valid Sepolia address." });
      }

      let owners: string[];
      try {
        owners = await getSafeOwners(safeAddress);
      } catch (err) {
        return sendJson(res, 400, {
          error: `Could not read owners from that Safe address: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      const botAddress = getBotSignerAddress();
      if (!owners.some((o) => o.toLowerCase() === botAddress.toLowerCase())) {
        return sendJson(res, 400, {
          error: `Zamance (${botAddress}) is not an owner of that Safe yet. Add it as a co-signing owner (threshold >= 2-of-N) first.`,
        });
      }

      const checksummed = ethers.getAddress(safeAddress);
      await setTeamTreasury(session.teamId, checksummed);
      await logAudit(session.teamId, session.userId, "treasury_configured", `safe=${checksummed}`);

      sendJson(res, 200, { safeAddress: checksummed });
    },
  },
  {
    path: "/api/team/fund",
    method: ["POST", "OPTIONS"],
    handler: async (req, res) => {
      if (req.method === "OPTIONS") return handlePreflight(res);
      const session = requireSession(req, res);
      if (!session) return;

      const treasury = await requireTeamTreasury(session.teamId);
      if (!treasury) return sendJson(res, 400, { error: TREASURY_NOT_CONFIGURED_MESSAGE });

      // Same registered-Safe-owner check /fund-treasury used to do in Slack.
      const owners = await getSafeOwners(treasury.safeAddress);
      const ownerSlackIds = await getRegisteredOwnerSlackIds(session.teamId, owners);
      if (!ownerSlackIds.includes(session.userId)) {
        return sendJson(res, 403, {
          error: "Only a registered Safe owner can fund the treasury. Register your wallet in Slack first with /register-wallet.",
        });
      }

      let body: { amount?: string };
      try {
        body = await readJsonBody(req);
      } catch {
        return sendJson(res, 400, { error: "Invalid request body." });
      }

      let amount: bigint;
      try {
        amount = BigInt(body.amount ?? "");
        if (amount <= 0n) throw new Error("non-positive");
      } catch {
        return sendJson(res, 400, { error: "amount must be a positive whole number (USDC base units)." });
      }

      const wrapperAddress = getWrapperAddress();
      const approveCall = buildApproveCall(treasury.safeAddress, usdcInterface, wrapperAddress, amount);
      const wrapCall = buildWrapCall(wrapperAddress, wrapperInterface, treasury.safeAddress, amount);
      const { safeTxHash } = await proposeSafeTransaction(treasury.safeAddress, [approveCall, wrapCall]);

      await logAudit(session.teamId, session.userId, "treasury_wrap_proposed", `safeTxHash=${safeTxHash}`);

      sendJson(res, 200, { safeTxHash });
    },
  },
  {
    path: "/api/payouts",
    method: ["GET", "OPTIONS"],
    handler: async (req, res) => {
      if (req.method === "OPTIONS") return handlePreflight(res);
      const session = requireSession(req, res);
      if (!session) return;
      const payouts = await listPayouts(session.teamId);
      sendJson(
        res,
        200,
        payouts.map((p) => ({
          id: p.id,
          requesterId: p.requesterId,
          recipientId: p.recipientId,
          isPrivate: p.isPrivate,
          status: p.status,
          safeTxHash: p.safeTxHash,
          txHash: p.txHash,
          createdAt: p.createdAt,
        })),
      );
    },
  },
  {
    path: "/api/payroll-runs",
    method: ["GET", "OPTIONS"],
    handler: async (req, res) => {
      if (req.method === "OPTIONS") return handlePreflight(res);
      const session = requireSession(req, res);
      if (!session) return;
      const runs = await listPayrollRuns(session.teamId);
      sendJson(
        res,
        200,
        runs.map((r) => ({
          id: r.id,
          requesterId: r.requesterId,
          isPrivate: r.isPrivate,
          status: r.status,
          safeTxHash: r.safeTxHash,
          txHash: r.txHash,
          recipientCount: r.items.length,
          createdAt: r.createdAt,
        })),
      );
    },
  },
];
