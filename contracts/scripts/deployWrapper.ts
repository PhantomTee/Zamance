/**
 * @file deployWrapper.ts
 * @description Deploys ConfidentialUSDCWrapper ONCE, globally - not per-team. It wraps a single
 * real ERC20 (Circle's Sepolia USDC by default); every team's Safe uses this same wrapper address,
 * since confidential balances inside it are already isolated per-holder-address. Set the resulting
 * address as WRAPPER_ADDRESS in the bot's env - it is a protocol-level constant, not something
 * teams configure themselves (they only ever connect a Safe address, via the dashboard).
 */

import { ethers, network, artifacts, run } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const CONTRACT_NAME = "ConfidentialUSDCWrapper";
const CIRCLE_SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const UNDERLYING_ADDRESS = process.env.UNDERLYING_USDC_ADDRESS || CIRCLE_SEPOLIA_USDC;
const TOKEN_NAME = process.env.WRAPPER_TOKEN_NAME || "Confidential USDC";
const TOKEN_SYMBOL = process.env.WRAPPER_TOKEN_SYMBOL || "cUSDC";
const TOKEN_URI = process.env.WRAPPER_CONTRACT_URI || "https://example.com/confidential-usdc.json";
const OUT_ROOT = resolve(__dirname, "..", "deployments");

async function main() {
  console.log(`[deploy-wrapper] network=${network.name} chainId=${network.config.chainId}`);
  if (network.name === "sepolia" && !ethers.isAddress(UNDERLYING_ADDRESS)) {
    throw new Error("UNDERLYING_USDC_ADDRESS is not a valid address");
  }

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`[deploy-wrapper] deployer=${deployer.address} balance=${ethers.formatEther(balance)} ETH`);
  if (balance === 0n && network.name !== "hardhat") {
    throw new Error("Deployer balance is 0; fund the account before deploying");
  }

  const factory = await ethers.getContractFactory(CONTRACT_NAME);
  const contract = await factory.deploy(UNDERLYING_ADDRESS, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_URI);
  const tx = contract.deploymentTransaction();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`[deploy-wrapper] ${CONTRACT_NAME} -> ${address}`);
  console.log(`[deploy-wrapper] underlying=${UNDERLYING_ADDRESS}`);
  console.log(`[deploy-wrapper] this is a GLOBAL, shared deployment - set WRAPPER_ADDRESS=${address} in the bot's env`);

  const artifact = await artifacts.readArtifact(CONTRACT_NAME);
  const record = {
    contractName: CONTRACT_NAME,
    address,
    underlying: UNDERLYING_ADDRESS,
    chainId: Number(network.config.chainId ?? 0),
    network: network.name,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    transactionHash: tx?.hash ?? null,
    constructorArgs: [UNDERLYING_ADDRESS, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_URI],
    abi: artifact.abi,
  };
  const outDir = join(OUT_ROOT, network.name);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${CONTRACT_NAME}.json`), JSON.stringify(record, null, 2));
  console.log(`[deploy-wrapper] wrote ${outDir}/${CONTRACT_NAME}.json`);

  const etherscanKey = process.env.ETHERSCAN_API_KEY?.trim();
  if (network.name === "sepolia" && etherscanKey && etherscanKey !== "your_etherscan_api_key") {
    console.log(`[deploy-wrapper] waiting 30s for Etherscan indexing before verify`);
    await new Promise((r) => setTimeout(r, 30_000));
    try {
      await run("verify:verify", {
        address,
        constructorArguments: [UNDERLYING_ADDRESS, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_URI],
      });
      console.log(`[deploy-wrapper] verified on Etherscan`);
    } catch (err: unknown) {
      console.log(`[deploy-wrapper] verify skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
