# DeLog

**Live:** https://delog-app.vercel.app (frontend only for now - see "Run the bot
backend" below; the dashboard needs a deployed `bot/` host to be functional).

**Deployed contracts (Sepolia, verified on Etherscan):**
- [`ConfidentialUSDCWrapper`](https://sepolia.etherscan.io/address/0xBF525F705d2190BF4A58B82f07DD8676c65a9e9D#code) - `0xBF525F705d2190BF4A58B82f07DD8676c65a9e9D`, wraps Circle's real Sepolia USDC (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`) into a confidential ERC-7984 balance
- [`ConfidentialPayoutToken`](https://sepolia.etherscan.io/address/0x0E9885Ab2BaE630ff57Aa8a1D547D7067f81eA0F#code) - `0x0E9885Ab2BaE630ff57Aa8a1D547D7067f81eA0F`, the original standalone confidential token

A Slack-first bot for processing team payments on Ethereum Sepolia in real
Circle USDC, with a public dashboard (like the bot dashboards you'd see for
Discord bots). Every payout has a public/private toggle (private by
default): private payouts move an encrypted amount via a Zama FHEVM
confidential ERC-7984 wrapper around USDC (`ConfidentialUSDCWrapper`),
public payouts are a plain, transparent USDC transfer. Custody sits in each
team's own Gnosis Safe multisig, where DeLog is one signer among several -
the bot alone can never move funds.

DeLog is multi-tenant: any Slack workspace can install it via OAuth
("Add to Slack"), and each installation is fully isolated - its own DB rows,
its own treasury (just a Safe), its own dashboard login. DeLog does not
(and cannot) deploy a Safe on a team's behalf; a team admin creates their own
Safe and connects it from the **dashboard**, not Slack. Treasury setup,
funding, wallet registration, and payout status all live on the website
(`POST /api/team/treasury`, `POST /api/team/fund`,
`POST /api/team/register-wallet`, and the payout/payroll activity feed) -
Slack is kept for the actual payout mechanics only (`/payout`, `/payroll`,
and the natural-language DM flow). The USDC contract and the confidential
wrapper are shared, protocol-level constants (`USDC_ADDRESS` /
`WRAPPER_ADDRESS`) - not something each team deploys, since balances inside
the wrapper are already isolated per-Safe-address.

## Repo layout

```
contracts/   Hardhat project - ConfidentialUSDCWrapper, an ERC-7984 wrapper around real
             Sepolia USDC (FHEVM v0.11); deployed once, shared by every team
bot/         Slack Bolt backend (Socket Mode + OAuth install + dashboard API)
frontend/    Next.js marketing site + "Add to Slack" + live dashboard
```

## 1. Create the Slack app

Manifest (Settings -> App Manifest):

```yaml
display_information:
  name: DeLog
features:
  bot_user:
    display_name: delog
    always_online: true
  slash_commands:
    - command: /payout
      description: Propose a single payout (toggle private/public in the modal)
    - command: /payroll
      description: Propose a batch payroll run (toggle private/public in the modal)
oauth_config:
  redirect_urls:
    - https://<your-bot-host>/slack/oauth_redirect
    - https://<your-bot-host>/auth/slack/callback
  scopes:
    bot:
      - commands
      - chat:write
      - im:write
      - im:history
      - users:read
settings:
  event_subscriptions:
    bot_events:
      - message.im
  interactivity:
    is_enabled: true
  socket_mode_enabled: true
  org_deploy_enabled: false
  token_rotation_enabled: false
```

`im:history` + the `message.im` event subscription power the natural-language DM flow
(`bot/src/slack/nlPayout.ts`) - message someone "pay Sarah 500" instead of running
`/payout`. Adding these to an already-installed app requires reinstalling (Slack
requires reauthorization whenever bot scopes change).

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
cp .env.example .env   # fill in Slack app credentials, RPC_URL, USDC_ADDRESS, WRAPPER_ADDRESS, BOT_SAFE_SIGNER_PRIVATE_KEY, SAFE_API_KEY, JWT_SECRET
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

Treasury setup and funding happen on the **dashboard** (signed in via "Sign in
with Slack"), not as Slack commands - Slack is only for running payouts.

1. Click **Add to Slack** on the DeLog site (real OAuth install).
2. Sign in to the dashboard. It shows DeLog's bot signer address (with a
   copy button) - create a Safe at https://app.safe.global (Sepolia) and add
   that address as an owner, threshold >= 2-of-N.
3. Back on the dashboard, paste the Safe address into **Connect your Safe**
   (workspace admin only - checked server-side via the Slack API, same rule
   as the old `/setup-treasury` command). There's no token to deploy - every
   team pays out in real Sepolia USDC (`USDC_ADDRESS`) plus the one shared
   `ConfidentialUSDCWrapper` (`WRAPPER_ADDRESS`), both protocol-level
   constants the bot already knows.
4. Get the Safe some real Sepolia USDC (e.g. Circle's faucet at
   https://faucet.circle.com, network "Ethereum Sepolia").
5. Each Safe owner uses the dashboard's **Verify Safe ownership** to connect
   their wallet and sign a message proving they actually hold the key for an
   address that's a current Safe owner (no gas, no transaction - just a
   signature). This is deliberately separate from wallet registration (step
   6): registering a payout address is just "send my money here" and needs
   no proof, but the funding action below grants a real capability, so it's
   gated on a signature, not a self-reported claim.
6. On the dashboard, use **Fund the confidential balance** (verified Safe
   owners only, from step 5) to shield part of that USDC into the Safe's
   confidential balance, then sign + execute the resulting wrap transaction in
   Safe{Wallet}. Only needed if you plan to send private payouts - public
   payouts spend the Safe's plain USDC balance directly and need no wrapping
   step.
7. Everyone who sends or receives payouts uses the dashboard's **Register
   your payout wallet** once (connect wallet, no signature needed) -
   including the Safe owners themselves (DeLog resolves Safe owner addresses
   back to Slack IDs via this table to know who to DM for signature-request
   notifications; it does not by itself grant the funding capability - see
   step 5).
8. From here on, payouts happen in Slack: `/payout`, `/payroll`, or DM the
   bot in natural language ("pay Sarah 500"). Status and history for every
   payout live on the dashboard's Activity feed.

## Verification (end-to-end on Sepolia)

1. Install via the real "Add to Slack" OAuth flow into a test workspace.
2. Complete onboarding steps 2-8 above with two test Slack accounts.
3. `/payout @testuser 10` with **Private** selected - confirm all responses
   are ephemeral/DM only, never posted to a channel.
4. Sign the proposed transaction with the second Safe owner in Safe{Wallet}.
   Within `APPROVAL_POLL_INTERVAL_MS`, the bot executes it and DMs both
   sides.
5. Confirm the recipient's encrypted balance actually changed by decrypting
   it (`bot/src/chain/fheEncrypt.ts`'s `decryptEuint64`) against
   `WRAPPER_ADDRESS` - do not just trust the "executed" status.
6. Repeat `/payout @testuser 10` with **Public** selected - confirm the
   recipient's plain `USDC.balanceOf` increased by exactly 10 (this amount
   is genuinely public on-chain, unlike the private path).
7. Sign in to the dashboard via "Sign in with Slack" and confirm both
   payouts show up with correct status and visibility, and no amount ever
   displayed.
8. Repeat with `/payroll` and 2+ recipients; confirm atomic MultiSend
   execution for both visibility modes.
9. In a DM to the bot, try "pay @testuser 5" (should default to private) and
   "pay @testuser 5 publicly" (should go public) - confirm the confirmation
   message states the correct visibility before you click Confirm.
10. Sign in as a non-admin Slack member and confirm **Connect your Safe**
    rejects the request with a clear error.
11. Have a non-owner register a real Safe owner's address via **Register
    your payout wallet** (not their own wallet), then try **Fund the
    confidential balance** without verifying ownership - confirm it's
    rejected. Registering someone else's address is not proof of controlling
    it; only **Verify Safe ownership** (a signed message) grants the funding
    capability.

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
