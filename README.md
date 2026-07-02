# Zamance

**Live:** https://zamance.vercel.app (frontend only for now - see "Run the bot
backend" below; the dashboard needs a deployed `bot/` host to be functional).

A Slack-first bot for processing team payments privately on Ethereum Sepolia,
with a public dashboard (like the bot dashboards you'd see for Discord bots).
Amounts are encrypted on-chain via a Zama FHEVM confidential ERC-7984 token;
custody sits in each team's own Gnosis Safe multisig, where Zamance is one
signer among several - the bot alone can never move funds.

Zamance is multi-tenant: any Slack workspace can install it via OAuth
("Add to Slack"), and each installation is fully isolated - its own DB rows,
its own treasury (Safe + token), its own dashboard login. Zamance does not
(and cannot) deploy a Safe or a token on a team's behalf; a team admin
deploys their own treasury and connects it with `/setup-treasury`.

## Repo layout

```
contracts/   Hardhat project - ConfidentialPayoutToken (ERC-7984 / FHEVM v0.11)
bot/         Slack Bolt backend (Socket Mode + OAuth install + dashboard API)
frontend/    Next.js marketing site + "Add to Slack" + live dashboard
```

## 1. Create the Slack app

Manifest (Settings -> App Manifest):

```yaml
display_information:
  name: Zamance
features:
  bot_user:
    display_name: zamance
    always_online: true
  slash_commands:
    - command: /register-wallet
      description: Register your Sepolia payout address
      usage_hint: "0x..."
    - command: /setup-treasury
      description: Connect your team's Safe + confidential token (admin only)
      usage_hint: "<safeAddress> <tokenAddress>"
    - command: /payout
      description: Propose a single private payout
    - command: /payroll
      description: Propose a batch payroll run
    - command: /payout-status
      description: Check a payout or payroll run's status
      usage_hint: "<id>"
    - command: /fund-treasury
      description: Mint encrypted supply into the Safe (owners only)
      usage_hint: "<amount>"
oauth_config:
  redirect_urls:
    - https://<your-bot-host>/slack/oauth_redirect
  scopes:
    bot:
      - commands
      - chat:write
      - im:write
      - users:read
settings:
  interactivity:
    is_enabled: true
  socket_mode_enabled: true
  org_deploy_enabled: false
  token_rotation_enabled: false
```

Then:
- Enable **public distribution** (Manage Distribution) so any workspace can
  install it, not just yours.
- Enable **Sign in with Slack** (OpenID Connect) under App Home / OAuth, and
  set the OIDC redirect URL to `https://<your-bot-host>/auth/slack/callback`.
- Generate an app-level token with `connections:write` for Socket Mode
  (`SLACK_APP_TOKEN`).
- Note the Client ID / Client Secret (`SLACK_CLIENT_ID` /
  `SLACK_CLIENT_SECRET`) and signing secret (`SLACK_SIGNING_SECRET`).

## 2. Run the bot backend

```bash
cd bot
npm install
cp .env.example .env   # fill in Slack app credentials, RPC_URL, BOT_SAFE_SIGNER_PRIVATE_KEY, SAFE_API_KEY, JWT_SECRET
npx prisma migrate deploy
npm run dev             # or: npm run build && npm start
```

This starts Socket Mode (all installed workspaces' events over one
connection) plus a small HTTP server (`PORT`, default 3001) for the OAuth
install/redirect routes and the dashboard API (`bot/src/http/routes.ts`).

The bot's `BOT_SAFE_SIGNER_PRIVATE_KEY` is a single global key reused as a
co-signing owner across every installed team's Safe - being a Safe "owner"
is just an on-chain permission grant, so no per-team secrets are needed.

## 3. Run the frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_BOT_API_URL -> your bot host
npm run dev
```

## 4. Per-team onboarding (what an installing team actually does)

1. Click **Add to Slack** on the Zamance site (real OAuth install).
2. Deploy their own `ConfidentialPayoutToken` on Sepolia:
   ```bash
   cd contracts
   npm install
   cp .env.example .env   # PRIVATE_KEY (one-time deployer), RPC_URL
   npx hardhat compile
   npx hardhat run scripts/deploy.ts --network sepolia
   ```
3. Create a Safe at https://app.safe.global, add Zamance's bot address
   (shown in the dashboard, or ask an admin to run `/setup-treasury` once
   with a placeholder to see the expected address in the error message) as
   an owner, threshold >= 2-of-N.
4. Transfer token ownership to the Safe:
   ```bash
   SAFE_ADDRESS=0x... npx hardhat run scripts/transferOwnershipToSafe.ts --network sepolia
   ```
5. In Slack, run `/setup-treasury <safeAddress> <tokenAddress>` (workspace
   admin only).
6. `/fund-treasury <amount>` to mint encrypted supply, then sign + execute
   the mint in Safe{Wallet}.
7. Everyone who sends or receives payouts runs `/register-wallet 0x...`
   once - including the Safe owners themselves (Zamance resolves Safe
   owner addresses back to Slack IDs via this table to know who to DM for
   approvals).

## Verification (end-to-end on Sepolia)

1. Install via the real "Add to Slack" OAuth flow into a test workspace.
2. Complete onboarding steps 2-7 above with two test Slack accounts.
3. `/payout @testuser 10` - confirm all responses are ephemeral/DM only,
   never posted to a channel.
4. Sign the proposed transaction with the second Safe owner in Safe{Wallet}.
   Within `APPROVAL_POLL_INTERVAL_MS`, the bot executes it and DMs both
   sides.
5. Confirm the recipient's encrypted balance actually changed by decrypting
   it (`bot/src/chain/fheEncrypt.ts`'s `decryptEuint64`) - do not just trust
   the "executed" status.
6. Sign in to the dashboard via "Sign in with Slack" and confirm the payout
   shows up with correct status and no amount ever displayed.
7. Repeat with `/payroll` and 2+ recipients; confirm atomic MultiSend
   execution.

## Security notes

- The bot's own Safe-signer key can propose and co-sign but never reaches
  the signature threshold alone.
- Payout amounts are never persisted in plaintext, never logged, and never
  returned by the dashboard API - only the on-chain ciphertext handle is
  stored (see the comments in `bot/prisma/schema.prisma`).
- Every DB table is scoped by `teamId`; one workspace's data is never
  reachable from another's session.
- The `fhevm-skill` bundle installed under `.claude/skills/fhevm-skill` was
  sourced from `zunmax/fhevm-skill` (npm `@zunxbt/fhevm-skill`). That GitHub
  account also publishes unrelated wallet-drainer-style repos
  (`antidrain-wallet-extension`, `btc-seedphrase-recovery`). The skill's own
  contents were reviewed line-by-line before use (SKILL.md, the installer
  CLI, the linter script) and are a plain file-copier with no network calls
  - but treat future updates to that package with the same scrutiny before
  upgrading.
