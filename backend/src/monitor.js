/**
 * Umbra Protocol — Health Monitor
 *
 * This service runs continuously on the backend. It:
 *  1. Discovers all users who have ever deposited collateral (via on-chain events)
 *  2. Reads each user's position (collateral + debt) from UmbraVault
 *  3. Computes their health factor via UmbraOracle
 *  4. Calls vault.flagForLiquidation() for any position with health factor < 100
 *  5. Logs all activity for the frontend to surface
 *
 * Note: startAuction() on UmbraLiquidator requires msg.sender == vault address.
 * In a production upgrade, UmbraVault.flagForLiquidation() would call
 * liquidator.startAuction() internally. For this demo, the monitor flags
 * positions and the frontend reads LiquidationFlagged events directly.
 */

import { ethers } from "ethers";
import { readFileSync } from "fs";
import dotenv from "dotenv";

dotenv.config();

// ── Validate environment ───────────────────────────────────────────────
const REQUIRED_ENV = [
  "PRIVATE_KEY",
  "ORACLE_ADDRESS",
  "VAULT_ADDRESS",
  "LIQUIDATOR_ADDRESS",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(` Missing environment variable: ${key}`);
    console.error("   Check your .env file.");
    process.exit(1);
  }
}

// ── Contract addresses ─────────────────────────────────────────────────
const ADDRESSES = {
  oracle:     process.env.ORACLE_ADDRESS,
  vault:      process.env.VAULT_ADDRESS,
  liquidator: process.env.LIQUIDATOR_ADDRESS,
};

// ── Load ABIs from Hardhat artifacts ──────────────────────────────────
function loadABI(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")).abi;
  } catch {
    console.error(` Could not load ABI from: ${filePath}`);
    console.error("   Run: npx hardhat compile");
    process.exit(1);
  }
}

const oracleABI     = loadABI("./artifacts/contracts/UmbraOracle.sol/UmbraOracle.json");
const vaultABI      = loadABI("./artifacts/contracts/UmbraVault.sol/UmbraVault.json");
const liquidatorABI = loadABI("./artifacts/contracts/UmbraLiquidator.sol/UmbraLiquidator.json");

// ── Provider + wallet ──────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(
  process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc"
);

const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// ── Contract instances ─────────────────────────────────────────────────
const oracle     = new ethers.Contract(ADDRESSES.oracle,     oracleABI,     wallet);
const vault      = new ethers.Contract(ADDRESSES.vault,      vaultABI,      wallet);
const liquidator = new ethers.Contract(ADDRESSES.liquidator, liquidatorABI, wallet);

// ── State ──────────────────────────────────────────────────────────────
const knownUsers   = new Set();
const HEALTH_MIN   = 100n;
const POLL_MINUTES = 2;
const POLL_MS      = POLL_MINUTES * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function shortAddr(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ── Discover users from past CollateralDeposited events ────────────────
async function discoverUsers() {
  try {
    const filter = vault.filters.CollateralDeposited();
    const events = await vault.queryFilter(filter, 0, "latest");
    let newCount = 0;
    for (const event of events) {
      const user = event.args[0];
      if (!knownUsers.has(user)) {
        knownUsers.add(user);
        newCount++;
      }
    }
    if (newCount > 0) {
      log(`[Discovery] +${newCount} new users. Total known: ${knownUsers.size}`);
    }
  } catch (err) {
    log(`[Discovery] Error scanning events: ${err.message}`);
  }
}

// ── Check every known user's position ─────────────────────────────────
async function checkPositions() {
  if (knownUsers.size === 0) {
    log("[Monitor] No users with positions yet. Waiting...");
    return;
  }

  log(`[Monitor] Scanning ${knownUsers.size} position(s)...`);

  for (const user of knownUsers) {
    try {
      // Owner wallet can read any position (onlyPositionHolder allows owner)
      const [collateral, debt, , isLiquidatable] = await vault.getPosition(user);

      // Skip users with no debt — nothing to liquidate
      if (debt === 0n) continue;

      // Compute health factor via oracle
      const hf = await oracle.getHealthFactor(collateral, debt);

      const collateralETH = ethers.formatEther(collateral);
      const debtUSDC      = (Number(debt) / 1e6).toFixed(2);
      const hfDisplay     = hf === ethers.MaxUint256
        ? "∞ (no debt)"
        : hf.toString();

      log(
        `[Position] ${shortAddr(user)} | ` +
        `Collateral: ${collateralETH} ETH | ` +
        `Debt: ${debtUSDC} USDC | ` +
        `HF: ${hfDisplay}`
      );

      // ── Unhealthy and not yet flagged ──────────────────────────────
      if (hf < HEALTH_MIN && !isLiquidatable) {
        log(`   Health factor ${hf} < 100. Flagging for liquidation...`);
        try {
          const tx = await vault.flagForLiquidation(user);
          log(`  TX sent: ${tx.hash}`);
          await tx.wait();
          log(`   ${shortAddr(user)} flagged. Liquidators can now bid.`);
        } catch (txErr) {
          log(`   Flag TX failed: ${txErr.message}`);
        }
        continue;
      }

      // ── Unhealthy but already flagged ──────────────────────────────
      if (hf < HEALTH_MIN && isLiquidatable) {
        log(`  ${shortAddr(user)} already flagged. Awaiting liquidator bids.`);
        continue;
      }

      // ── Healthy ────────────────────────────────────────────────────
      log(`  ${shortAddr(user)} is healthy.`);

    } catch (err) {
      // getPosition reverts if caller is not owner or user
      // This should not happen since monitor runs as owner
      log(`  [Error] ${shortAddr(user)}: ${err.message}`);
    }
  }
}

// ── Listen for new depositors in real time ─────────────────────────────
function startEventListeners() {
  vault.on("CollateralDeposited", (user, amount) => {
    if (!knownUsers.has(user)) {
      knownUsers.add(user);
      log(`[Event] New depositor: ${user} deposited ${ethers.formatEther(amount)} ETH`);
    }
  });

  vault.on("LiquidationFlagged", (user) => {
    log(`[Event] LiquidationFlagged for: ${user}`);
  });

  liquidator.on("AuctionStarted", (borrower, endTime) => {
    const end = new Date(Number(endTime) * 1000).toISOString();
    log(`[Event] Auction started for ${shortAddr(borrower)}. Ends: ${end}`);
  });

  liquidator.on("BidSubmitted", (borrower, bidder) => {
    log(`[Event] Bid submitted on ${shortAddr(borrower)}'s auction by ${shortAddr(bidder)}`);
  });

  liquidator.on("AuctionSettled", (borrower, winner, winningBid) => {
    log(
      `[Event] Auction settled for ${shortAddr(borrower)}. ` +
      `Winner: ${shortAddr(winner)} | Bid: ${winningBid}`
    );
  });

  log("[Events] Listening for on-chain events...");
}

// ── Main loop ──────────────────────────────────────────────────────────
async function run() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Umbra Protocol — Health Monitor v1.0");
  console.log("═══════════════════════════════════════════════════");
  console.log("  Oracle:     ", ADDRESSES.oracle);
  console.log("  Vault:      ", ADDRESSES.vault);
  console.log("  Liquidator: ", ADDRESSES.liquidator);
  console.log("  Monitor:    ", wallet.address);
  console.log("  Network:     Arbitrum Sepolia");
  console.log(`  Poll every:  ${POLL_MINUTES} minutes`);
  console.log("═══════════════════════════════════════════════════\n");

  // Verify RPC connection
  try {
    const block = await provider.getBlockNumber();
    log(`[Init] Connected to Arbitrum Sepolia. Latest block: ${block}`);
  } catch {
    log("[Init]  Cannot connect to RPC. Check ARBITRUM_SEPOLIA_RPC in .env");
    process.exit(1);
  }

  // Verify wallet has ETH for gas
  const balance = await provider.getBalance(wallet.address);
  log(`[Init] Monitor wallet balance: ${ethers.formatEther(balance)} ETH`);
  if (balance < ethers.parseEther("0.001")) {
    log("[Init]   Low balance. Monitor may fail to send transactions.");
  }

  // Discover existing users then start listening for new ones
  await discoverUsers();
  startEventListeners();

  // First check immediately
  await checkPositions();

  // Then poll on interval
  setInterval(async () => {
    await discoverUsers();
    await checkPositions();
  }, POLL_MS);

  log(`\n[Monitor] Running. Next check in ${POLL_MINUTES} minutes. Press Ctrl+C to stop.\n`);
}

// ── Start ──────────────────────────────────────────────────────────────
run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});