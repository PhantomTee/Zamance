/**
 * @file payroll.ts
 * @description /payroll opens a modal for a bulk list ("@user amount" or "USERID amount" per
 * line, one recipient per line - Slack plain_text_input does not expand @mention autocomplete,
 * so raw <@USERID> mention syntax or a bare Slack member ID both work). All recipients are
 * validated up front, then handed to payoutEngine to bundle into one atomic Safe MultiSend
 * transaction so the whole run succeeds or fails together.
 */

import type { SlackCommandMiddlewareArgs, AllMiddlewareArgs, SlackViewMiddlewareArgs } from "@slack/bolt";
import { getWalletAddress } from "../../db/repository";
import { requireTeamTreasury, TREASURY_NOT_CONFIGURED_MESSAGE } from "../teamConfig";
import { proposeBatchPayroll, type ResolvedRecipient } from "../payoutEngine";

export const PAYROLL_CALLBACK_ID = "payroll_modal";

const LINE_PATTERN = /^\s*<?@?([A-Z0-9]+)>?\s+(\d+)\s*$/i;

export async function openPayrollModal({
  command,
  ack,
  client,
  respond,
}: SlackCommandMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  await ack();

  const treasury = await requireTeamTreasury(command.team_id);
  if (!treasury) {
    await respond({ response_type: "ephemeral", text: TREASURY_NOT_CONFIGURED_MESSAGE });
    return;
  }

  await client.views.open({
    trigger_id: command.trigger_id,
    view: {
      type: "modal",
      callback_id: PAYROLL_CALLBACK_ID,
      private_metadata: JSON.stringify({ teamId: command.team_id, requesterId: command.user_id }),
      title: { type: "plain_text", text: "New payroll run" },
      submit: { type: "plain_text", text: "Propose" },
      close: { type: "plain_text", text: "Cancel" },
      blocks: [
        {
          type: "input",
          block_id: "lines",
          label: { type: "plain_text", text: "One recipient per line: <@USERID> amount (USDC base units)" },
          element: { type: "plain_text_input", action_id: "lines_input", multiline: true },
        },
        {
          type: "input",
          block_id: "visibility",
          label: { type: "plain_text", text: "Visibility (applies to the whole run)" },
          element: {
            type: "radio_buttons",
            action_id: "visibility_input",
            initial_option: { text: { type: "plain_text", text: "Private (encrypted)" }, value: "private" },
            options: [
              { text: { type: "plain_text", text: "Private (encrypted)" }, value: "private" },
              { text: { type: "plain_text", text: "Public (normal USDC)" }, value: "public" },
            ],
          },
        },
      ],
    },
  });
}

interface ParsedLine {
  slackUserId: string;
  amount: bigint;
}

function parseLines(raw: string): ParsedLine[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.map((line) => {
    const match = LINE_PATTERN.exec(line);
    if (!match) throw new Error(`Could not parse line: "${line}" (expected "<@USERID> amount")`);
    return { slackUserId: match[1], amount: BigInt(match[2]) };
  });
}

export async function handlePayrollSubmission({
  ack,
  view,
  client,
}: SlackViewMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  const { teamId, requesterId } = JSON.parse(view.private_metadata) as { teamId: string; requesterId: string };
  const raw = view.state.values.lines.lines_input.value ?? "";
  const isPrivate = (view.state.values.visibility.visibility_input.selected_option?.value ?? "private") === "private";

  let parsed: ParsedLine[];
  try {
    parsed = parseLines(raw);
    if (parsed.length === 0) throw new Error("Enter at least one recipient");
  } catch (err) {
    await ack({
      response_action: "errors",
      errors: { lines: err instanceof Error ? err.message : "Could not parse the recipient list" },
    });
    return;
  }

  const resolved: ResolvedRecipient[] = [];
  for (const line of parsed) {
    const addr = await getWalletAddress(teamId, line.slackUserId);
    if (!addr) {
      await ack({
        response_action: "errors",
        errors: { lines: `<@${line.slackUserId}> has not registered a payout wallet on the dashboard yet` },
      });
      return;
    }
    if (line.amount <= 0n) {
      await ack({ response_action: "errors", errors: { lines: `Amount for <@${line.slackUserId}> must be positive` } });
      return;
    }
    resolved.push({ slackUserId: line.slackUserId, address: addr, amount: line.amount });
  }

  const treasury = await requireTeamTreasury(teamId);
  if (!treasury) {
    await ack({ response_action: "errors", errors: { lines: TREASURY_NOT_CONFIGURED_MESSAGE } });
    return;
  }

  await ack();

  await proposeBatchPayroll(client, teamId, requesterId, treasury, resolved, isPrivate);
}
