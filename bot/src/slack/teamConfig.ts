/**
 * @file teamConfig.ts
 * @description Shared helper every payout-moving command uses to load a team's treasury config,
 * with a consistent "not set up yet" message pointing at the dashboard - treasury connection and
 * funding are website actions (see bot/src/http/routes.ts's /api/team/treasury and /api/team/fund),
 * not Slack commands, so an admin who hasn't connected a Safe yet needs to be pointed there instead
 * of at a slash command. A team only needs a Safe address - the underlying USDC and the shared
 * ConfidentialUSDCWrapper are global, protocol-level constants (USDC_ADDRESS / WRAPPER_ADDRESS env
 * vars), not per-team choices.
 */

import { getTeam } from "../db/repository";

export interface TeamTreasury {
  safeAddress: string;
}

export async function requireTeamTreasury(teamId: string): Promise<TeamTreasury | null> {
  const team = await getTeam(teamId);
  if (!team?.safeAddress) return null;
  return { safeAddress: team.safeAddress };
}

export const TREASURY_NOT_CONFIGURED_MESSAGE =
  "This workspace hasn't connected a treasury yet. An admin needs to sign in to the Zamance dashboard and connect a Safe first.";
