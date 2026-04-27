# iExec Developer Experience — Feedback

**Project:** Umbra Protocol
**Challenge:** iExec Vibe Coding Challenge 2026
**Builder:** Lax Lab
**Date:** April 2026

---

## What We Built

A confidential DeFi lending protocol where debt positions are encrypted on-chain using iExec Nox ERC-7984. Users borrow USDC and their debt balance is stored as a `euint256` encrypted handle — only decryptable by the position holder via the Nox JS SDK. Liquidations run through sealed-bid auctions.

---

## Tools Used

- `@iexec-nox/nox-protocol-contracts` — Solidity library (`Nox.sol`)
- `@iexec-nox/nox-confidential-contracts` — ERC-7984 base contracts
- `@iexec-nox/handle` — JS SDK for `encryptInput` and `decrypt`
- iExec Nox testnet on Arbitrum Sepolia
- iExec demo faucet at `cdefi.iex.ec`
- ChainGPT Smart Contract Generator and Auditor

---

## What Worked Well

### The Solidity library is clean and learnable

Once we found the Hello World guide, the Nox Solidity primitives were straightforward to use. `Nox.toEuint256()`, `Nox.add()`, `Nox.sub()`, `Nox.allowThis()`, and `Nox.allow()` follow a consistent pattern. The ACL model — where you explicitly grant decrypt permission to specific addresses — is well-designed and maps naturally to DeFi position ownership.

### The JS SDK decrypt flow is genuinely impressive

The gasless EIP-712 decrypt is the standout feature from a UX perspective. Users sign a message in MetaMask, the Nox KMS verifies authorization against the on-chain ACL, and the value is decrypted locally in the browser — the plaintext never travels over the network. This is exactly the kind of privacy primitive DeFi has been missing.

### The npm packages installed cleanly

Both `@iexec-nox/nox-protocol-contracts` and `@iexec-nox/handle` installed without conflicts on Node.js v24 with Hardhat v3. The import paths resolved correctly. This is not always a given for new protocols.

### The iExec faucet (cdefi.iex.ec)

Fast, no mainnet ETH required, gave both testnet ETH and tokens. Removed a major blocker for builders with no mainnet assets. This should be the model for every hackathon faucet.

---

## Challenges Encountered

### The Hardhat integration guide does not exist yet

The documentation page for Hardhat integration says "Coming Soon." For builders using Hardhat — which is the most common Solidity toolchain — this means there is no guided path from install to compile. We had to reverse-engineer the import paths from the npm package structure and the Hello World guide. This cost significant time.

**Suggestion:** Even a minimal `hardhat.config.js` example showing the correct `paths.sources` and remappings would have saved hours.

### No encrypted division means health factors cannot be fully private

The health factor calculation requires dividing collateral value by debt value. Because Nox does not yet support encrypted division, health factors must be computed in plaintext. This means the confidentiality model is partial — debt is private, but the ratio of debt to collateral is still public.

This is a fundamental protocol limitation, not a documentation issue. But builders attempting confidential lending will hit this wall immediately. A clear note in the use cases guide explaining this limitation and the recommended architecture pattern (parallel plaintext for math, encrypted handle for storage) would help.

**Our solution:** Store debt as both a plaintext `uint256` (for health factor math only) and as a `euint256` Nox handle (the confidential source of truth). Document this clearly in the contract code.

### ChainGPT does not know iExec Nox

ChainGPT's Smart Contract Generator was trained before Nox's release. It cannot generate Nox-specific contracts. We used ChainGPT for the base DeFi patterns (vault, oracle, liquidator) and manually integrated the Nox layer on top. ChainGPT's auditor was useful independently.

**Suggestion:** A Nox-specific prompt template or fine-tune in ChainGPT would make the hackathon collaboration between the two sponsors much more powerful.

### Testnet Chainlink feeds go stale

The USDC/USD Chainlink feed on Arbitrum Sepolia was 21 hours stale during development. Our initial 1-hour staleness check caused every borrow to revert. We extended the window to 48 hours for testnet reliability.

This is an infrastructure issue outside iExec's control but worth documenting for future builders.

---

## What We Would Do With More Time

1. Encrypt collateral amounts using Nox once encrypted comparison operators are available — this would make health factor computation fully private
2. Use `encryptInput` from the JS SDK to encrypt borrow amounts before they reach the contract, rather than converting plaintext in `mintDebt`
3. Implement the full TEE health monitor using iExec's offchain compute infrastructure

---

## Overall Assessment

iExec Nox delivers on its core promise — real on-chain encryption with a clean ACL model and a gasless decrypt UX that works. The protocol is genuinely novel and the DeFi use cases are compelling.

The ecosystem needs more worked examples, a Hardhat guide, and documentation of known limitations like the absence of encrypted division. The foundation is strong. The tooling around it needs to grow to match.

**Would we build on iExec Nox again?** Yes. The encrypted handle primitive is not available anywhere else in a form that is this composable with standard DeFi contracts. Once the documentation catches up with the protocol, this will be a serious tool.
