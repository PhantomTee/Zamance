/**
 * @file payoutEngine.ts
 * @description Shared "propose payout(s) to the Safe" logic. Given already-resolved (Slack user,
 * address, amount) pairs and a public/private toggle, builds the right call(s), proposes the Safe
 * transaction, persists it, and DMs the requester + Safe owners. Used by both the modal-based
 * /payout and /payroll commands and the natural-language DM flow (see nlPayout.ts) - one code path
 * for the part that actually moves toward moving funds, so a change to ACL/encoding/notification
 * logic only has to happen once.
 *
 * Private (default): the amount is encrypted and moved via the shared ConfidentialUSDCWrapper's
 * confidentialTransfer, drawing down the Safe's already-wrapped confidential balance (funded via
 * the dashboard's "fund treasury" action, not Slack) - fully encrypted on-chain, nothing about the
 * amount is ever public.
 * Public: a plain, transparent USDC.transfer() straight from the Safe - the amount is plaintext
 * calldata, same as any normal ERC20 transfer.
 */

import type { WebClient } from "@slack/web-api";
import {
  createPendingPayout,
  createPayrollRun,
  attachSafeTx,
  attachPayrollSafeTx,
  markPayoutFailed,
  logAudit,
  getRegisteredOwnerSlackIds,
} from "../db/repository";
import { prisma } from "../db/client";
import { buildEncryptedAmount } from "../chain/fheEncrypt";
import {
  buildConfidentialTransferCall,
  buildPlainTransferCall,
  proposeSafeTransaction,
  getSafeOwners,
} from "../chain/safe";
import { usdcInterface, wrapperInterface, getUsdcAddress, getWrapperAddress } from "../chain/token";
import type { MetaTransactionData } from "@safe-global/types-kit";
import { dmUser } from "./dm";
import type { TeamTreasury } from "./teamConfig";

export interface ResolvedRecipient {
  slackUserId: string;
  address: string;
  amount: bigint;
}

async function buildPayoutCall(
  treasury: TeamTreasury,
  recipient: ResolvedRecipient,
  isPrivate: boolean,
): Promise<{ call: MetaTransactionData; amountHandle?: string }> {
  if (isPrivate) {
    // The Safe is msg.sender when the transfer executes on-chain, so the encrypted input
    // must be bound to the Safe's address, not the bot's own key.
    const wrapperAddress = getWrapperAddress();
    const { handle, inputProof } = await buildEncryptedAmount(wrapperAddress, treasury.safeAddress, recipient.amount);
    const call = buildConfidentialTransferCall(wrapperAddress, wrapperInterface, recipient.address, handle, inputProof);
    return { call, amountHandle: handle };
  }
  const call = buildPlainTransferCall(getUsdcAddress(), usdcInterface, recipient.address, recipient.amount);
  return { call };
}

export async function proposeSinglePayout(
  client: WebClient,
  teamId: string,
  requesterId: string,
  treasury: TeamTreasury,
  recipient: ResolvedRecipient,
  isPrivate = true,
): Promise<void> {
  const payout = await createPendingPayout({
    teamId,
    requesterId,
    recipientId: recipient.slackUserId,
    recipientAddr: recipient.address,
    isPrivate,
  });

  try {
    const { call, amountHandle } = await buildPayoutCall(treasury, recipient, isPrivate);
    const { safeTxHash } = await proposeSafeTransaction(treasury.safeAddress, [call]);

    await attachSafeTx(payout.id, safeTxHash, amountHandle);
    await logAudit(teamId, requesterId, "payout_proposed", `payoutId=${payout.id} safeTxHash=${safeTxHash} private=${isPrivate}`);
    const visibility = isPrivate ? "private" : "public";
    await notifyProposed(
      client,
      teamId,
      treasury.safeAddress,
      requesterId,
      `Payout ${payout.id} (${visibility}) proposed to the Safe (tx ${safeTxHash}). Waiting for a second owner to sign in Safe{Wallet}.`,
      `A ${visibility} payout to <@${recipient.slackUserId}> is awaiting your signature. Open Safe{Wallet} and sign tx ${safeTxHash}. (Details are intentionally not posted here or in any channel.)`,
    );
  } catch (err) {
    await markPayoutFailed(payout.id);
    await dmUser(
      client,
      requesterId,
      `Payout ${payout.id} failed to propose: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function proposeBatchPayroll(
  client: WebClient,
  teamId: string,
  requesterId: string,
  treasury: TeamTreasury,
  recipients: ResolvedRecipient[],
  isPrivate = true,
): Promise<void> {
  const run = await createPayrollRun(teamId, requesterId, isPrivate);
  for (const item of recipients) {
    await createPendingPayout({
      teamId,
      requesterId,
      recipientId: item.slackUserId,
      recipientAddr: item.address,
      isPrivate,
      payrollRunId: run.id,
    });
  }

  try {
    const calls: MetaTransactionData[] = [];
    for (const item of recipients) {
      const { call } = await buildPayoutCall(treasury, item, isPrivate);
      calls.push(call);
    }

    const { safeTxHash } = await proposeSafeTransaction(treasury.safeAddress, calls);
    await attachPayrollSafeTx(run.id, safeTxHash);
    await logAudit(
      teamId,
      requesterId,
      "payroll_proposed",
      `runId=${run.id} safeTxHash=${safeTxHash} count=${recipients.length} private=${isPrivate}`,
    );
    const visibility = isPrivate ? "private" : "public";
    await notifyProposed(
      client,
      teamId,
      treasury.safeAddress,
      requesterId,
      `Payroll run ${run.id} (${visibility}, ${recipients.length} recipients) proposed to the Safe (tx ${safeTxHash}). Waiting for a second owner to sign.`,
      `A ${visibility} payroll run of ${recipients.length} recipients is awaiting your signature. Open Safe{Wallet} and sign tx ${safeTxHash}.`,
    );
  } catch (err) {
    await prisma.payrollRun.update({ where: { id: run.id }, data: { status: "failed" } });
    await prisma.payout.updateMany({ where: { payrollRunId: run.id }, data: { status: "failed" } });
    await dmUser(
      client,
      requesterId,
      `Payroll run ${run.id} failed to propose: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function notifyProposed(
  client: WebClient,
  teamId: string,
  safeAddress: string,
  requesterId: string,
  requesterMessage: string,
  ownerMessage: string,
): Promise<void> {
  await dmUser(client, requesterId, requesterMessage);
  const owners = await getSafeOwners(safeAddress);
  const ownerSlackIds = await getRegisteredOwnerSlackIds(teamId, owners);
  for (const ownerId of ownerSlackIds.filter((id) => id !== requesterId)) {
    await dmUser(client, ownerId, ownerMessage);
  }
}
