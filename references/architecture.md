# DealFlow Compiler Architecture

## Core Claim

`DealFlow Compiler` turns chat-based commercial terms into executable and auditable settlement flows on X Layer.

The MVP is intentionally narrow:

- natural language goes in
- a structured `DealSpec` comes out
- a DealVault contract holds and releases funds
- every transaction is sent through Agentic Wallet
- OnchainOS is used on the main execution path

## Required Integrations

### Agentic Wallet

Use Agentic Wallet for every state-changing transaction:

- deploy the DealVault
- fund the vault
- release milestones
- apply penalty or refund logic
- close the deal

### OnchainOS

Keep OnchainOS in the primary money path instead of as a side demo:

- use Wallet capabilities to sign and send transactions through the configured agent wallet flow
- use DEX or Payment when the payer needs to normalize into the settlement token before funding

### X Layer

Deploy the contract on X Layer and keep the deal lifecycle there. The proof surface for judges is:

- contract address
- explorer-visible transactions
- emitted events
- end balances

## Recommended System Split

### Off-chain

- `preflight` environment and dependency checks
- `doctor` setup guidance and `.env` remediation
- `capabilities` natural-language prompt menu
- natural-language parser
- `DealSpec` compiler
- risk and constraint checker
- execution planner
- CLI or skill wrapper

### On-chain

- `DealVault` contract on X Layer
- escrowed settlement token balance
- milestone release logic
- penalty or refund logic
- close logic

## Canonical Demo Lifecycle

Use a small real-money flow:

1. If needed, normalize the payer's asset into the settlement token through OnchainOS DEX.
2. Deploy the vault on X Layer.
3. Fund the vault with the settlement token.
4. Release milestone 1 and auto-split the payout.
5. Release milestone 2 with a late penalty or refund.
6. Close the deal and distribute or return the reserve.

## Scoring Alignment

### OnchainOS / Uniswap Integration & Innovation

Score this by making official integrations essential, not decorative. The cleanest MVP is OnchainOS-first:

- natural language compilation is custom
- settlement logic is custom
- funding normalization goes through OnchainOS
- wallet execution goes through Agentic Wallet
- audit evidence is emitted from the contract and rendered by the skill

### X Layer Ecosystem Fit & On-Chain Activity

Strength comes from real X Layer contract deployment and a full deal lifecycle with live transactions.

### AI Interaction & Novelty

The novelty is not "AI chat for crypto." The novelty is turning messy business terms into deterministic, executable money flows.

### Product Completeness & Commercial Potential

Stay focused on creator deals, agency settlements, milestone-based services, and AI-to-AI service agreements. Those are realistic enough to feel commercial and narrow enough to ship.

## Non-Goals for MVP

Do not expand v1 into these areas:

- generalized legal contracts
- autonomous dispute resolution
- oracle-driven milestone verification
- multi-chain settlement
- complex factory systems unless repeated deployment is already working
