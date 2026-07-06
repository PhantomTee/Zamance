/**
 * @file verifyWrapper.ts
 * @description Standalone `npx hardhat verify` failed with "Compiled contract deployment
 * bytecode does NOT match the transaction deployment bytecode" for this FHEVM contract, even
 * with identical source/settings - likely a compile-cache/pathway difference in how the
 * standalone verify CLI recompiles vs `hardhat run`. Calling `run("verify:verify", ...)` from
 * inside a `hardhat run` script (which recompiles via the same pathway `hardhat run` always
 * uses) verifies successfully. Keep this pattern for any future FHEVM contract that hits the
 * same standalone-CLI mismatch.
 */
import { run } from "hardhat";

async function main() {
  await run("verify:verify", {
    address: "0xBF525F705d2190BF4A58B82f07DD8676c65a9e9D",
    constructorArguments: [
      "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      "Confidential USDC",
      "cUSDC",
      "https://example.com/confidential-usdc.json",
    ],
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
