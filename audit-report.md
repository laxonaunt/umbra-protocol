# Umbra Protocol — Smart Contract Audit Report

**Auditor:** ChainGPT Smart Contract Auditor  
**Date:** April 2026  
**Contracts Audited:** UmbraOracle.sol, UmbraVault.sol, UmbraLiquidator.sol  
**Network:** Arbitrum Sepolia  
**Solidity Version:** 0.8.28  

---

## Overall Assessment

No critical vulnerabilities were identified across any of the three contracts.
No findings that would allow fund drainage, unauthorized access, or contract takeover.
All contracts are considered safe for testnet deployment.

---

## UmbraOracle.sol

### Findings

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | Low | Stale price reverts with no fallback notification | Accepted — revert is intentional design |
| 2 | Info | Health factor uses integer division, minor precision loss | Accepted — scale of 100 is intentional |
| 3 | Info | Redundancy between `_getPriceView` and `_getPrice` | Accepted — split is required by Solidity view rules |
| 4 | Info | Access control on price fetch functions | Rejected — oracle functions are intentionally public |
| 5 | Info | Emit events in view functions | Rejected — Solidity does not allow events in view functions |

### Actions Taken
- No changes required. All findings are informational or accepted by design.

---

## UmbraVault.sol

### Findings

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | Low | `accrueInterest` is public, callable by anyone | Accepted — required for backend monitor to call |
| 2 | Low | `fallback` accepts unsolicited ETH silently | Fixed — fallback now reverts with message |
| 3 | Info | `block.timestamp` used for interest accrual | Accepted — standard practice on Arbitrum |
| 4 | Info | External oracle dependency | Accepted — oracle is our own audited contract |
| 5 | Info | Gas optimization with `unchecked` blocks | Deferred — not critical for hackathon scope |

### Actions Taken
- **Fixed:** `fallback()` now reverts with `"Use depositCollateral()"` to prevent silent ETH acceptance.
- All other findings accepted or deferred.

---

## UmbraLiquidator.sol

### Findings

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | Medium | `settleAuction` iterates all bids — potential gas limit issue at scale | Noted — acceptable for hackathon scale |
| 2 | Low | No minimum bid enforcement — spam bids possible | Noted — acceptable for testnet |
| 3 | Low | Bidders can see each other's bids on-chain | Accepted — TEE layer handles privacy in production |
| 4 | Info | Fixed 1-hour auction duration | Accepted — intentional for demo simplicity |
| 5 | Info | `vaultAddress` is immutable — cannot be changed | Accepted — this is a security feature, not a bug |

### Actions Taken
- No changes required. Medium finding is a known scalability tradeoff acceptable at hackathon scope.
- Full TEE-based bid encryption is the production solution for finding #3.

---

## Summary

| Contract | Critical | High | Medium | Low | Info |
|----------|----------|------|--------|-----|------|
| UmbraOracle | 0 | 0 | 0 | 1 | 4 |
| UmbraVault | 0 | 0 | 0 | 2 | 3 |
| UmbraLiquidator | 0 | 0 | 1 | 2 | 2 |

**All contracts are cleared for deployment on Arbitrum Sepolia testnet.**