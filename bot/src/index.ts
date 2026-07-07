/**
 * @file index.ts
 * @description DeLog Slack Bolt app bootstrap. Socket Mode handles events/commands for every
 * installed workspace over one WebSocket connection (no public events endpoint needed); a small
 * HTTP server (spun up by SocketModeReceiver whenever OAuth options are present) serves the
 * install/OAuth-redirect routes plus the dashboard API in ./http/routes.ts.
 */

import "dotenv/config";
import { App } from "@slack/bolt";
import { prismaInstallationStore } from "./slack/installationStore";
import { dashboardRoutes } from "./http/routes";
import { openPayoutModal, handlePayoutSubmission, PAYOUT_CALLBACK_ID } from "./slack/commands/payout";
import { openPayrollModal, handlePayrollSubmission, PAYROLL_CALLBACK_ID } from "./slack/commands/payroll";
import {
  handleNaturalLanguageMessage,
  handleNlPayoutConfirm,
  handleNlPayoutCancel,
  CONFIRM_ACTION_ID,
  CANCEL_ACTION_ID,
} from "./slack/nlPayout";
import { startApprovalPoller } from "./workers/approvalPoller";

// im:history is required to read the text of DMs sent to the bot (see nlPayout.ts). Existing
// installs need to re-authorize once this ships - Slack requires reinstall on scope changes.
const BOT_SCOPES = ["commands", "chat:write", "im:write", "im:history", "users:read"];

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  stateSecret: process.env.SLACK_STATE_SECRET,
  scopes: BOT_SCOPES,
  installationStore: prismaInstallationStore,
  installerOptions: {
    redirectUriPath: "/slack/oauth_redirect",
    port: Number(process.env.PORT ?? 3001),
    // After a fresh "Add to Slack" install, drop straight into the OIDC sign-in
    // flow instead of Bolt's default "Success!" page, so install -> dashboard
    // is one continuous hop regardless of which button the user started from.
    callbackOptions: {
      success: (_installation, _options, _req, res) => {
        res.writeHead(302, { Location: "/auth/slack/login" });
        res.end();
      },
    },
  },
  customRoutes: dashboardRoutes,
});

app.command("/payout", openPayoutModal);
app.command("/payroll", openPayrollModal);

app.view(PAYOUT_CALLBACK_ID, handlePayoutSubmission);
app.view(PAYROLL_CALLBACK_ID, handlePayrollSubmission);

app.message(handleNaturalLanguageMessage);
app.action(CONFIRM_ACTION_ID, handleNlPayoutConfirm);
app.action(CANCEL_ACTION_ID, handleNlPayoutCancel);

async function main() {
  await app.start();
  console.log("[bot] DeLog running in Socket Mode; OAuth + dashboard API on port", process.env.PORT ?? 3001);

  const stopPoller = startApprovalPoller();
  process.on("SIGTERM", () => {
    stopPoller();
    process.exit(0);
  });
  process.on("SIGINT", () => {
    stopPoller();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[bot] fatal startup error", err);
  process.exitCode = 1;
});
