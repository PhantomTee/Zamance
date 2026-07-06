export const BOT_API_URL = process.env.NEXT_PUBLIC_BOT_API_URL ?? "http://localhost:3001";
export const SLACK_INSTALL_URL = `${BOT_API_URL}/slack/install`;
export const SLACK_LOGIN_URL = `${BOT_API_URL}/auth/slack/login`;

/* Public, non-secret chain config for the client-side balance-decrypt page - the wrapper address
 * and RPC URL are protocol-level constants, safe to expose (unlike a relayer API key). */
export const WRAPPER_ADDRESS = process.env.NEXT_PUBLIC_WRAPPER_ADDRESS ?? "";
export const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
