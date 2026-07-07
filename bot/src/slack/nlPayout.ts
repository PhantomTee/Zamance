/**
 * @file nlPayout.ts
 * @description DM-based natural-language payout flow: "pay Sarah 500" instead of /payout. Only
 * listens in direct messages to the bot (never channels), parses intent via Groq
 * (../ai/parsePayoutIntent), resolves each recipient to a real Slack user
 * (../ai/resolveRecipient), then always shows a Block Kit confirm/cancel message before
 * proposing anything to the Safe - a misparsed recipient or amount must never reach the Safe
 * without a human looking at it first. The confirm button's value carries only
 * {slackUserId, amount} pairs (not resolved addresses), so wallet addresses are re-looked-up
 * fresh at confirm time rather than trusting a value that could go stale between propose and
 * click.
 */

import type { AllMiddlewareArgs, BlockButtonAction, SlackActionMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { parsePayoutIntent } from "../ai/parsePayoutIntent";
import { resolveRecipient } from "../ai/resolveRecipient";
import { getWalletAddress } from "../db/repository";
import { requireTeamTreasury, TREASURY_NOT_CONFIGURED_MESSAGE } from "./teamConfig";
import { proposeSinglePayout, proposeBatchPayroll } from "./payoutEngine";

const CONFIRM_ACTION_ID = "nl_payout_confirm";
const CANCEL_ACTION_ID = "nl_payout_cancel";

interface PendingItem {
  i: string; // slackUserId
  m: string; // amount, as a string
}

export async function handleNaturalLanguageMessage({
  message,
  client,
  context,
}: SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs): Promise<void> {
  if (message.subtype !== undefined) return; // ignore edits, joins, bot messages, etc.
  if (message.channel_type !== "im") return; // DM only - never react in channels
  if (!("text" in message) || !message.text?.trim()) return;
  if ("bot_id" in message && message.bot_id) return;

  const teamId = context.teamId;
  const requesterId = message.user;
  if (!teamId || !requesterId) return;

  const treasury = await requireTeamTreasury(teamId);
  if (!treasury) {
    await client.chat.postMessage({ channel: message.channel, text: TREASURY_NOT_CONFIGURED_MESSAGE });
    return;
  }

  const intent = await parsePayoutIntent(message.text);

  if (intent.type === "not_a_payout") {
    await client.chat.postMessage({
      channel: message.channel,
      text: "I understand payout requests like \"pay Sarah 500\" or \"pay <@U123> 200 and <@U456> 300\". Try one of those, or use /payout for the guided form.",
    });
    return;
  }

  if (intent.type === "unclear") {
    await client.chat.postMessage({ channel: message.channel, text: intent.clarification });
    return;
  }

  const resolvedItems: Array<{ slackUserId: string; displayName: string; amount: bigint }> = [];
  for (const item of intent.items) {
    let amount: bigint;
    try {
      amount = BigInt(item.amount);
      if (amount <= 0n) throw new Error("non-positive");
    } catch {
      await client.chat.postMessage({
        channel: message.channel,
        text: `"${item.amount}" isn't a valid amount for ${item.recipient} - amounts must be a positive whole number.`,
      });
      return;
    }

    const resolved = await resolveRecipient(client, item.recipient);
    if (resolved.status === "not_found") {
      await client.chat.postMessage({
        channel: message.channel,
        text: `I couldn't find a Slack member matching "${item.recipient}". Try @-mentioning them directly.`,
      });
      return;
    }
    if (resolved.status === "ambiguous") {
      await client.chat.postMessage({
        channel: message.channel,
        text: `"${item.recipient}" matches more than one person: ${resolved.matches.join(", ")}. Try @-mentioning the right one directly.`,
      });
      return;
    }

    const addr = await getWalletAddress(teamId, resolved.slackUserId);
    if (!addr) {
      await client.chat.postMessage({
        channel: message.channel,
        text: `<@${resolved.slackUserId}> hasn't registered a payout wallet on the dashboard yet, so they can't receive a payout.`,
      });
      return;
    }

    resolvedItems.push({ slackUserId: resolved.slackUserId, displayName: resolved.displayName, amount });
  }

  const pendingItems: PendingItem[] = resolvedItems.map((r) => ({ i: r.slackUserId, m: r.amount.toString() }));
  const summary = resolvedItems.map((r) => `<@${r.slackUserId}> - ${r.amount.toString()}`).join("\n");
  const noun = pendingItems.length > 1 ? "payroll run" : "payout";
  const visibility = intent.isPrivate ? "private (encrypted)" : "public (normal USDC)";

  await client.chat.postMessage({
    channel: message.channel,
    text: `Confirm this ${noun}? (${visibility})\n${summary}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*Confirm this ${noun}?* _(${visibility})_\n${summary}` } },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Confirm" },
            style: "primary",
            action_id: CONFIRM_ACTION_ID,
            value: JSON.stringify({ teamId, items: pendingItems, isPrivate: intent.isPrivate }),
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Cancel" },
            action_id: CANCEL_ACTION_ID,
            value: "cancel",
          },
        ],
      },
    ],
  });
}

export async function handleNlPayoutConfirm({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockButtonAction> & AllMiddlewareArgs): Promise<void> {
  await ack();
  const action = body.actions?.[0];
  if (!action || !("value" in action) || !action.value) return;

  const { teamId, items, isPrivate } = JSON.parse(action.value) as {
    teamId: string;
    items: PendingItem[];
    isPrivate: boolean;
  };
  const requesterId = body.user.id;

  await updateOriginalMessage(client, body, "Confirmed - resolving current wallet addresses...");

  const treasury = await requireTeamTreasury(teamId);
  if (!treasury) {
    await client.chat.postMessage({ channel: body.channel?.id ?? requesterId, text: TREASURY_NOT_CONFIGURED_MESSAGE });
    return;
  }

  const resolved = [];
  for (const item of items) {
    const address = await getWalletAddress(teamId, item.i);
    if (!address) {
      await client.chat.postMessage({
        channel: body.channel?.id ?? requesterId,
        text: `<@${item.i}> no longer has a registered wallet - cancelled.`,
      });
      return;
    }
    resolved.push({ slackUserId: item.i, address, amount: BigInt(item.m) });
  }

  if (resolved.length === 1) {
    await proposeSinglePayout(client, teamId, requesterId, treasury, resolved[0], isPrivate);
  } else {
    await proposeBatchPayroll(client, teamId, requesterId, treasury, resolved, isPrivate);
  }
}

export async function handleNlPayoutCancel({
  ack,
  body,
  client,
}: SlackActionMiddlewareArgs<BlockButtonAction> & AllMiddlewareArgs): Promise<void> {
  await ack();
  await updateOriginalMessage(client, body, "Cancelled.");
}

async function updateOriginalMessage(client: WebClient, body: { channel?: { id: string }; message?: { ts: string } }, text: string) {
  if (!body.channel?.id || !body.message?.ts) return;
  await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text, blocks: [] });
}

export { CONFIRM_ACTION_ID, CANCEL_ACTION_ID };
