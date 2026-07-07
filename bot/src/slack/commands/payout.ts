/**
 * @file payout.ts
 * @description /payout opens a modal (recipient + amount); on submit, resolves the recipient's
 * registered address and hands off to payoutEngine to propose the Safe transaction and notify
 * everyone involved - no public channel messages.
 */

import type { SlackCommandMiddlewareArgs, AllMiddlewareArgs, SlackViewMiddlewareArgs } from "@slack/bolt";
import { getWalletAddress } from "../../db/repository";
import { requireTeamTreasury, TREASURY_NOT_CONFIGURED_MESSAGE } from "../teamConfig";
import { proposeSinglePayout } from "../payoutEngine";

export const PAYOUT_CALLBACK_ID = "payout_modal";

export async function openPayoutModal({
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
      callback_id: PAYOUT_CALLBACK_ID,
      private_metadata: JSON.stringify({ teamId: command.team_id, requesterId: command.user_id }),
      title: { type: "plain_text", text: "New payout" },
      submit: { type: "plain_text", text: "Propose" },
      close: { type: "plain_text", text: "Cancel" },
      blocks: [
        {
          type: "input",
          block_id: "recipient",
          label: { type: "plain_text", text: "Recipient" },
          element: { type: "users_select", action_id: "recipient_user" },
        },
        {
          type: "input",
          block_id: "amount",
          label: { type: "plain_text", text: "Amount (USDC base units)" },
          element: { type: "plain_text_input", action_id: "amount_input" },
        },
        {
          type: "input",
          block_id: "visibility",
          label: { type: "plain_text", text: "Visibility" },
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

export async function handlePayoutSubmission({
  ack,
  view,
  client,
}: SlackViewMiddlewareArgs & AllMiddlewareArgs): Promise<void> {
  const { teamId, requesterId } = JSON.parse(view.private_metadata) as { teamId: string; requesterId: string };
  const recipientId = view.state.values.recipient.recipient_user.selected_user;
  const amountRaw = view.state.values.amount.amount_input.value?.trim();
  const isPrivate = (view.state.values.visibility.visibility_input.selected_option?.value ?? "private") === "private";

  if (!recipientId) {
    await ack({ response_action: "errors", errors: { recipient: "Choose a recipient" } });
    return;
  }

  let amount: bigint;
  try {
    amount = BigInt(amountRaw ?? "");
    if (amount <= 0n) throw new Error("non-positive");
  } catch {
    await ack({ response_action: "errors", errors: { amount: "Enter a positive whole number" } });
    return;
  }

  const recipientAddr = await getWalletAddress(teamId, recipientId);
  if (!recipientAddr) {
    await ack({
      response_action: "errors",
      errors: { recipient: "This user has not registered a payout wallet on the dashboard yet" },
    });
    return;
  }

  const treasury = await requireTeamTreasury(teamId);
  if (!treasury) {
    await ack({ response_action: "errors", errors: { recipient: TREASURY_NOT_CONFIGURED_MESSAGE } });
    return;
  }

  await ack();

  await proposeSinglePayout(
    client,
    teamId,
    requesterId,
    treasury,
    { slackUserId: recipientId, address: recipientAddr, amount },
    isPrivate,
  );
}
