# iExec Developer Experience — Feedback

**Project:** Umbra Protocol
**Builder:** Lax Lab
**Challenge:** iExec Vibe Coding Challenge 2026
**Date:** April 2026

---

We want to write this feedback honestly, because we think that is more useful to the iExec team than a polished PR piece.

We built Umbra Protocol — a confidential DeFi lending protocol — over two weeks using iExec Nox as the core privacy layer. What we experienced with Nox was genuinely interesting, but also one of the more technically challenging integrations we have worked with. Here is what actually happened.

---

## What Worked

**The Nox JS SDK decrypt flow is exceptional.**

The standout moment in this entire project was when we clicked "Decrypt My Balance" and the debt amount appeared after a gasless EIP-712 signature. Plaintext never leaves the browser. No server sees the data. The cryptographic proof is verified on-chain. This interaction is genuinely new in DeFi — and when it works, it makes everything feel real.

**The npm packages installed cleanly.**

`@iexec-nox/nox-protocol-contracts`, `@iexec-nox/nox-confidential-contracts`, and `@iexec-nox/handle` installed without dependency conflicts on Node.js v24 with Hardhat v3. The packaging is solid.

**The NoxCompute contract is live on Arbitrum Sepolia.**

The `noxComputeContract()` function returns `0xd464B198f06756a1d00be223634b85E0a731c229` for chainId 421614. The TEE validation happens on real on-chain calls, not mocks. That gives us confidence that what we built is real infrastructure.

**The faucet at cdefi.iex.ec.**

No mainnet ETH requirement. No friction. Tokens immediately. Every hackathon should have this.

---

## What Was Hard

**The Hardhat integration guide says "Coming Soon."**

When we set up Hardhat v3 with the Nox contracts, the documentation page for Hardhat integration was a placeholder. We reverse-engineered the import paths from the npm package structure directly. The contracts compile and work perfectly with Hardhat v3 — but nobody would know that from the docs. This cost us significant time.

**`Nox.fromExternal()` with cross-contract proof forwarding does not work the way the spec implies.**

This was the hardest technical problem we faced. The `encryptInput()` function creates a proof tied to a specific `msg.sender` context. When you forward that proof through multiple contracts — in our case, Vault calls DebtToken which calls `Nox.fromExternal()` — the validation fails because `msg.sender` changes at each hop.

We tried every variation: passing the vault address as the authorized contract, passing the debtToken address, casting between `bytes32` and `externalEuint256`. Every attempt reverted on-chain with no useful error message.

We ended up using `Nox.toEuint256()` instead. The encrypted storage and decrypt flow both work correctly — debt is genuinely encrypted as a `euint256` and only decryptable by the holder. But the borrow amount is not validated by the Handle Gateway proof before entering the TEE, which is a meaningful architectural difference from the full vision.

If there is a correct pattern for cross-contract proof forwarding in Nox, we could not find it in the documentation. This would be the single most valuable thing iExec could document for DeFi builders.

**The Chainlink USDC/USD feed on Arbitrum Sepolia goes 21 hours stale.**

USDC rarely moves, so Chainlink barely updates the testnet feed. Our 1-hour staleness check caused every borrow to revert. The fix was extending the window to 48 hours — trivial once we knew the cause. But the error message was generic and it cost days of debugging.

A single line in the Nox getting-started guide — "Chainlink testnet feeds may be stale, use a longer window in development" — would have saved significant time.

**ChainGPT does not know iExec Nox.**

Expected, since Nox v0.1.0 launched during the hackathon. We used ChainGPT for the base DeFi contract patterns and wrote the Nox integration layer ourselves. ChainGPT's auditor was independently useful. But the generator cannot help with Nox-specific patterns yet — a prompt template from iExec would change that.

---

## What We Would Do With More Time

Getting `encryptInput()` working through the contract call chain is the primary unfinished piece. The architecture is correct — the single-contract approach where vault extends ERC7984 directly would solve the msg.sender forwarding problem. We identified this solution too late to redeploy safely before submission.

Encrypting collateral amounts requires encrypted division for health factor computation, which is not in Nox v0.1.0. When that primitive lands, confidential lending becomes fully private end to end.

---

## Overall

We would build on iExec Nox again. The on-chain encrypted storage with wallet-authorized decryption is not available anywhere else in a composable form. The ERC7984 base contract is well-designed. The JS SDK decrypt flow is genuinely impressive UX that users will understand immediately.

What the ecosystem needs most is worked examples for real DeFi patterns — not hello world, but confidential lending, confidential governance, cross-contract proof forwarding. The primitives are there. Builders need to see them assembled correctly once.

Thank you to the iExec team for the faucet, the packages, and the TEE infrastructure. This was a challenging build and we are proud of what came out of it.