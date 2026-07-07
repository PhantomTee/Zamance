/**
 * @file routes.ts
 * @description Dashboard-facing HTTP surface, mounted as Bolt customRoutes alongside the OAuth
 * install routes (see ../index.ts). Concerns here: "Sign in with Slack" (OIDC) issuing a
 * dashboard JWT, read-only JSON endpoints the DeLog frontend polls, and the two treasury
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
import {
  getTeam,
  listPayouts,
  listPayrollRuns,
  setTeamTreasury,
  getVerifiedOwnerSlackIds,
  upsertVerifiedOwner,
  registerWallet,
  getWalletAddress,
  logAudit,
} from "../db/repository";
import { getBotSignerAddress, getSafeOwners, getSafeThreshold, buildApproveCall, buildWrapCall, proposeSafeTransaction } from "../chain/safe";
import { usdcInterface, wrapperInterface, getUsdcAddress, getWrapperAddress } from "../chain/token";
import { requireTeamTreasury, TREASURY_NOT_CONFIGURED_MESSAGE } from "../slack/teamConfig";

function frontendUrl(path: string): string {
  const base = process.env.DASHBOARD_ORIGIN ?? "http://localhost:3000";
  return `${base}${path}`;
}

/**
 * The exact message a wallet must sign to prove ownership of `address` for POST
 * /api/team/verify-owner. Built entirely from server-known values (session teamId/userId, the
 * address the client claims) - never from anything else the client supplies - so the signature
 * this recovers against can't be steered by a malicious request body.
 */
function buildVerifyOwnerMessage(teamId: string, userId: string, address: string): string {
  return `DeLog: verify Safe ownership\nTeam: ${teamId}\nSlack user: ${userId}\nAddress: ${address}`;
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
      const [team, walletAddress] = await Promise.all([
        getTeam(session.teamId),
        getWalletAddress(session.teamId, session.userId),
      ]);
      sendJson(res, 200, {
        teamId: session.teamId,
        userId: session.userId,
        teamName: team?.name ?? null,
        walletAddress,
      });
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
    path: "/api/team/register-wallet",
    method: ["POST", "OPTIONS"],
    handler: async (req, res) => {
      if (req.method === "OPTIONS") return handlePreflight(res);
      const session = requireSession(req, res);
      if (!session) return;

      let body: { address?: string };
      try {
        body = await readJsonBody(req);
      } catch {
        return sendJson(res, 400, { error: "Invalid request body." });
      }

      const address = body.address?.trim();
      if (!address || !ethers.isAddress(address)) {
        return sendJson(res, 400, { error: "address must be a valid Ethereum address." });
      }

      const checksummed = ethers.getAddress(address);
      await registerWallet(session.teamId, session.userId, checksummed);
      await logAudit(session.teamId, session.userId, "register_wallet", `slack=${session.userId} eth=${checksummed}`);

      sendJson(res, 200, { walletAddress: checksummed });
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
      let threshold: number;
      try {
        [owners, threshold] = await Promise.all([getSafeOwners(safeAddress), getSafeThreshold(safeAddress)]);
      } catch (err) {
        return sendJson(res, 400, {
          error: `Could not read that address as a Safe on Sepolia: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      const botAddress = getBotSignerAddress();
      if (!owners.some((o) => o.toLowerCase() === botAddress.toLowerCase())) {
        return sendJson(res, 400, {
          error: `DeLog (${botAddress}) is not an owner of that Safe yet. Add it as a co-signing owner (threshold >= 2-of-N) first.`,
        });
      }

      // A 1-of-N Safe would let the bot's own co-signature alone reach the threshold and
      // execute - defeating the entire "bot can propose but never execute alone" guarantee.
      if (threshold < 2) {
        return sendJson(res, 400, {
          error: `That Safe's threshold is ${threshold}-of-${owners.length}. DeLog requires threshold >= 2 so the bot can never execute alone - raise the threshold in Safe{Wallet} first.`,
        });
      }

      const checksummed = ethers.getAddress(safeAddress);
      await setTeamTreasury(session.teamId, checksummed);
      await logAudit(session.teamId, session.userId, "treasury_configured", `safe=${checksummed}`);

      sendJson(res, 200, { safeAddress: checksummed });
    },
  },
  {
    path: "/api/team/verify-owner",
    method: ["POST", "OPTIONS"],
    handler: async (req, res) => {
      if (req.method === "OPTIONS") return handlePreflight(res);
      const session = requireSession(req, res);
      if (!session) return;

      const treasury = await requireTeamTreasury(session.teamId);
      if (!treasury) return sendJson(res, 400, { error: TREASURY_NOT_CONFIGURED_MESSAGE });

      let body: { address?: string; signature?: string };
      try {
        body = await readJsonBody(req);
      } catch {
        return sendJson(res, 400, { error: "Invalid request body." });
      }

      const address = body.address?.trim();
      if (!address || !ethers.isAddress(address)) {
        return sendJson(res, 400, { error: "address must be a valid Ethereum address." });
      }
      if (!body.signature) {
        return sendJson(res, 400, { error: "signature is required." });
      }

      const checksummed = ethers.getAddress(address);

      // No point verifying an address that isn't even a current Safe owner - reject early with
      // a clear reason instead of silently accepting a signature for an irrelevant address.
      const owners = await getSafeOwners(treasury.safeAddress);
      if (!owners.some((o) => o.toLowerCase() === checksummed.toLowerCase())) {
        return sendJson(res, 400, { error: "That address is not currently an owner of this team's Safe." });
      }

      const message = buildVerifyOwnerMessage(session.teamId, session.userId, checksummed);
      let recovered: string;
      try {
        recovered = ethers.verifyMessage(message, body.signature);
      } catch {
        return sendJson(res, 400, { error: "Invalid signature." });
      }
      if (recovered.toLowerCase() !== checksummed.toLowerCase()) {
        return sendJson(res, 400, { error: "Signature does not match the claimed address." });
      }

      await upsertVerifiedOwner(session.teamId, session.userId, checksummed);
      await logAudit(session.teamId, session.userId, "owner_verified", `address=${checksummed}`);

      sendJson(res, 200, { ethAddress: checksummed });
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

      // Signature-verified owner check - NOT the self-reported register-wallet table. Anyone
      // could register a real owner's address via POST /api/team/register-wallet without
      // controlling its key; this grants a real capability (proposing a Safe transaction), so
      // it must be backed by a proven signature, not a claim. See POST /api/team/verify-owner.
      const owners = await getSafeOwners(treasury.safeAddress);
      const ownerSlackIds = await getVerifiedOwnerSlackIds(session.teamId, owners);
      if (!ownerSlackIds.includes(session.userId)) {
        return sendJson(res, 403, {
          error: "Only a verified Safe owner can fund the treasury. Verify your wallet on the dashboard first.",
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
      // approve() must target the real USDC contract (not the Safe's own address) - the Safe
      // approves the wrapper to pull USDC from it, then wrap() actually pulls it.
      const approveCall = buildApproveCall(getUsdcAddress(), usdcInterface, wrapperAddress, amount);
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
