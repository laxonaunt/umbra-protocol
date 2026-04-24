# Umbra Protocol

**Confidential DeFi lending with sealed-bid liquidations**  
Built for the [iExec Vibe Coding Challenge 2026](https://discord.gg/RXYHBJceMe)

[![Network](https://img.shields.io/badge/Network-Arbitrum%20Sepolia-blue)](https://sepolia.arbiscan.io)
[![Frontend](https://img.shields.io/badge/Live%20App-Netlify-brightgreen)](https://umbra-protocol.netlify.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## The Problem

Every lending position on Aave, Compound, and Spark is completely public. Your collateral amount, your debt, your health factor — all readable by anyone on-chain. MEV bots monitor these positions and race to liquidate you the moment your health drops, extracting value through gas wars and front-running.

## The Solution

Umbra Protocol encrypts every position using **iExec Nox ERC-7984 confidential tokens**. Only the position holder can read their own balance. When a position becomes undercollateralized, instead of a public gas war, liquidators submit **sealed bids inside a Trusted Execution Environment**. The highest bid wins. No bots. Fair price for the borrower.

---

## Architecture
┌──────────────────────────────────────────────────────────────┐
│                        USER BROWSER                           │
│         React + ethers.js v6 + Tailwind CSS                  │
│    Landing / Dashboard / Markets / Liquidation Board         │
└─────────────────────┬────────────────────────────────────────┘
│ wallet connection / contract calls
▼
┌──────────────────────────────────────────────────────────────┐
│                  ARBITRUM SEPOLIA TESTNET                     │
│                                                               │
│   UmbraOracle          UmbraVault          UmbraLiquidator   │
│   ─────────────        ──────────────      ───────────────   │
│   Chainlink feeds      deposit ETH         startAuction()    │
│   ETH/USD              borrow USDC         submitBid()       │
│   USDC/USD             repay               settleAuction()   │
│   getHealthFactor()    withdraw            sealed bids       │
│                        flagForLiquidation()                  │
│                                                               │
│         All balances encrypted via ERC-7984 (iExec Nox)     │
└─────────────────────▲────────────────────────────────────────┘
│ polls every 2 min + event listeners
┌──────────────────────────────────────────────────────────────┐
│              BACKEND HEALTH MONITOR (Railway)                 │
│                      Node.js service                          │
│  • Scans CollateralDeposited events to find active users     │
│  • Calls oracle.getHealthFactor() per position               │
│  • Calls vault.flagForLiquidation() when HF drops below 100  │
│  • Triggers sealed-bid auction automatically                  │
└──────────────────────────────────────────────────────────────┘

---

## Confidentiality Model
Standard DeFi Protocol        Umbra Protocol
──────────────────────         ──────────────────────────────────
Collateral:  PUBLIC     →      Encrypted (ERC-7984 Nox token)
Debt:        PUBLIC     →      Encrypted (ERC-7984 Nox token)
Health:      PUBLIC     →      Private — TEE monitor only
Liquidation: MEV race   →      Sealed-bid TEE auction

---

## Deployed Contracts — Arbitrum Sepolia

| Contract | Address |
|---|---|
| UmbraOracle | [`0xF78DcADf3dA21A290d2488e72bce033aFEE48765`](https://sepolia.arbiscan.io/address/0xF78DcADf3dA21A290d2488e72bce033aFEE48765) |
| UmbraVault | [`0xC135Ce19dB893A4a156Cdd31b62F78036b9c9F52`](https://sepolia.arbiscan.io/address/0xC135Ce19dB893A4a156Cdd31b62F78036b9c9F52) |
| UmbraLiquidator | [`0x49E418477fb26Ee1bbE6708948e23339759EF7bd`](https://sepolia.arbiscan.io/address/0x49E418477fb26Ee1bbE6708948e23339759EF7bd) |

---

## How Liquidations Work
Position health factor drops below 100
│
▼
Backend monitor detects it via Chainlink oracle
│
▼
vault.flagForLiquidation(user) called on-chain
vault marks position + calls liquidator.startAuction()
│
▼
1-hour sealed-bid auction opens
Liquidators submit encrypted bids — nobody sees others' bids
│
▼
Anyone calls settleAuction() after 1 hour
Contract finds highest bid, emits AuctionSettled
│
▼
Frontend Liquidation Board updates in real time

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Arbitrum Sepolia (chainId 421614) |
| Confidentiality | iExec Nox — ERC-7984 Confidential Tokens |
| Smart Contracts | Solidity 0.8.28 + OpenZeppelin v5 |
| Contract Tooling | Hardhat v3 |
| Contract Generation | ChainGPT Smart Contract Generator |
| Contract Audit | ChainGPT Smart Contract Auditor |
| Price Oracle | Chainlink (ETH/USD + USDC/USD) |
| Frontend | React + Vite + Tailwind CSS v3 |
| Wallet Integration | ethers.js v6 + MetaMask |
| Backend Monitor | Node.js — deployed on Railway |
| Frontend Hosting | Netlify |

---

## Project Structure
umbra-protocol/
├── contracts/
│   ├── UmbraOracle.sol        Chainlink price feed wrapper
│   ├── UmbraVault.sol         Core lending vault
│   └── UmbraLiquidator.sol    Sealed-bid auction contract
├── frontend/
│   ├── src/
│   │   ├── pages/             Landing, Dashboard, Markets, Liquidations
│   │   ├── components/        Navbar, Footer
│   │   ├── context/           WalletContext (MetaMask + Arbitrum Sepolia)
│   │   └── lib/               contracts.js (ABIs), txHelpers.js (gas + errors)
│   └── public/favicon.svg
├── backend/
│   └── src/monitor.js         TEE health monitor service
├── scripts/
│   ├── deploy.js              Deploys all 3 contracts
│   └── fundReserve.js         Seeds the USDC lending reserve
├── audit-report.md            ChainGPT security audit results
└── feedback.md                iExec developer experience notes

---

## Running Locally

### Requirements
- Node.js v20+
- MetaMask with Arbitrum Sepolia network added
- Testnet ETH (free from [cdefi.iex.ec](https://cdefi.iex.ec))

### Setup

```bash
git clone https://github.com/laxonaunt/umbra-protocol.git
cd umbra-protocol
npm install
cp .env.example .env
# Fill in your PRIVATE_KEY and contract addresses in .env
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

### Backend Monitor

```bash
node backend/src/monitor.js
```

---

## Security

- OpenZeppelin `ReentrancyGuard` on all state-changing functions
- Chainlink staleness check — reverts if price older than 1 hour
- `setVault()` one-time initialization — permanently locked after deployment
- `fallback()` reverts to prevent accidental ETH acceptance
- Full audit by ChainGPT — see [audit-report.md](./audit-report.md)
- Zero critical vulnerabilities found

---

## Links

- **Live App:** https://umbra-protocol.netlify.app
- **Audit Report:** [audit-report.md](./audit-report.md)
- **iExec Nox Docs:** https://docs.iex.ec/nox-protocol/getting-started/welcome
- **ChainGPT:** https://app.chaingpt.org
- **iExec Vibe Coding Challenge:** https://discord.gg/RXYHBJceMe

---

*A Lax Lab product — iExec Vibe Coding Challenge 2026*
