/**
 * @file verifyPayoutToken.ts
 * @description See verifyWrapper.ts for why this uses `run("verify:verify", ...)` from inside a
 * `hardhat run` script instead of the standalone `npx hardhat verify` CLI.
 */
import { run } from "hardhat";

async function main() {
  await run("verify:verify", {
    address: "0x0E9885Ab2BaE630ff57Aa8a1D547D7067f81eA0F",
    constructorArguments: [
      "Team Payout Token",
      "TPAY",
      "https://example.com/team-payout-token.json",
      "0xF76C23c2844d0626927135B6E945cd290cf773ef",
    ],
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
