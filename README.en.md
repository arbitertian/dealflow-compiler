# DealFlow Compiler

`DealFlow Compiler` is a reusable agent skill that turns natural-language collaboration terms into executable, auditable settlement flows on X Layer.

Core path:

`natural language terms -> DealSpec -> preview -> Agentic Wallet / OnchainOS -> X Layer DealVault -> audit report`

- Chinese README: [README.md](README.md)
- License: [LICENSE](LICENSE)
- Release checklist: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)

This package is already structured as a standalone open-source repo.  
Anyone who clones it does not need your original workspace root anymore. After `npm install`, `.env` setup, and `Agentic Wallet` login, they can install it into their own Codex skills directory and invoke it with natural-language prompts.

## Best-fit use cases

- creator revenue splits
- agency settlements
- milestone payouts
- reserve escrow
- late penalties and refunds
- AI-to-AI commercial agreements

## Current capabilities

This package ships with a standalone command surface:

- `preflight`: check workspace files, artifacts, `.env`, OnchainOS CLI, Agentic Wallet, RPC, and skill install status
- `doctor`: turn missing prerequisites into concrete repair steps and print a safe `.env` template
- `capabilities`: print the natural-language capability menu unlocked by the current environment
- `compile`: natural language terms -> `DealSpec`
- `validate`: validate `DealSpec`
- `preview`: render a deal card and recommended execution flow
- `normalize`: swap a non-settlement asset into the settlement token
- `deploy`: create a vault on X Layer through `DealVaultFactory`
- `fund`: fund a vault
- `release`: release a milestone
- `close`: close the deal and unlock reserves
- `report`: pull on-chain events, receipts, balances, and produce an audit report

## Project overview

`DealFlow Compiler` is not trying to be another generic dApp. Its goal is to turn messy collaboration terms from chat into deterministic settlement flows on X Layer.

It solves a practical gap:

- commercial terms usually live in chat and are not structured
- splits, milestones, reserves, and late penalties are often executed manually
- creators, agencies, and AI-to-AI service workflows need a reusable, auditable, on-chain settlement skill

That gets compressed into one path:

`natural language terms -> DealSpec -> preview -> Agentic Wallet / OnchainOS -> X Layer DealVault -> audit report`

## Architecture overview

The system has two layers:

- `Off-chain Skill Layer`
  Handles `preflight / doctor / capabilities`, natural-language parsing, `DealSpec` compilation, risk checks, execution planning, and staged natural-language guidance.
- `On-chain Settlement Layer`
  Handles escrow, milestone release, penalty logic, reserve release, and close logic on X Layer.

Core modules:

- `DealFlow Skill`
  A chat-first interface that explains the full flow, then advances one user-confirmed stage at a time.
- `DealSpec Compiler`
  Turns budget, splits, milestones, reserve, and penalty rules into structured JSON.
- `Agentic Wallet + OnchainOS`
  Provides the real wallet execution path and optional asset normalization path.
- `DealVaultFactory`
  Creates new `DealVault` instances on X Layer.
- `DealVault`
  Holds funds and executes milestone, split, penalty, and close logic.
- `Audit Reporter`
  Summarizes vault address, tx hashes, events, balances, and final status.

For a deeper system split, see [references/architecture.md](references/architecture.md).

## Live deployment

Current live configuration and verified deployment:

- `X Layer Chain ID`: `196`
- `Settlement Token`: `USDC` = `0x74b7F16337b8972027F6196A17a631aC6dE26d22`
- `DealVaultFactory`: `0x1fb1E995314449F7F23C4a4A40870D4Fa8010840`

Most recent full live demo:

- `Vault`: `0x6548a7e9C5B0cba25aCEdEF0CC024b56702354C4`
- `Deploy`: `0xff083b742d041b3eea527e8964577bfce2ec752183c8b54854308452b485d61a`
- `Approve`: `0x07c123f283b93d5a5140c003307b8670c5b8e84eb694ebba61430735459e2990`
- `Fund`: `0x307ed47a66e8e55c7a4145db758ae03c0c2c4e91b3e06dced24f7209d1b99957`
- `Release Milestone 0`: `0xf923af774a9e2adfcc612f13527a198ffd390a0ec43518558ae22b50815fd039`
- `Release Milestone 1`: `0x534775c33c347b3f77d94f2e97aff006bb61165504083d65eda48585ae040ee4`
- `Close`: `0x1d8e2085025aabd7b50d44fec5b7798472e438a210dbfd94c33b576f18e7ffee`

This live demo proves:

- `deploy -> fund -> release -> penalty -> close`
- the vault ends with zero balance
- `DealCreated / DealFunded / MilestoneReleased / PenaltyApplied / DealClosed` all appear on-chain

## Official skill / OnchainOS usage

This MVP is intentionally `OnchainOS-first`. Official integrations are on the critical path, not added as decoration.

This project currently uses:

- `Agentic Wallet`
  Every state-changing transaction is initiated through Agentic Wallet
- `OnchainOS Wallet`
  Used for contract calls and live on-chain execution
- `OnchainOS DEX / normalize path`
  Included as the main optional path for swapping non-settlement assets into USDC before funding

The current live MVP does not put `Uniswap AI Skills` on the main execution path.  
That is a product-scope choice, not a technical limitation. This release focuses on:

- natural-language deal compilation
- real settlement execution through Agentic Wallet
- full settlement proof on X Layer

In short, this submission is centered on `OnchainOS + Agentic Wallet + X Layer DealVault`.

## Operating model

The operating model is:

1. the user describes collaboration terms in natural language
2. the skill checks environment readiness and unlocked capabilities
3. the skill compiles terms into a `DealSpec`
4. the skill renders a deal card so the user can confirm structure and amounts
5. the user explicitly advances through `deploy / fund / release / close`
6. every on-chain step is executed through Agentic Wallet
7. the final `report` step returns a complete audit surface

This means the product is both:

- `externally`: a natural-language agent skill
- `internally`: a CLI / contract / reporting execution engine

## X Layer ecosystem fit

`DealFlow Compiler` is not positioned as a generic payment tool inside X Layer. It is positioned as:

`an on-chain settlement compiler for creator deals, agency settlements, milestone-based services, and AI-to-AI business agreements`

Why it fits X Layer:

- all critical state changes stay on X Layer and become auditable activity
- Agentic Wallet drives execution directly, matching the Skill Arena requirement
- it fits low-ticket, multi-step, logic-heavy real settlement flows
- it connects natural-language interaction to provable on-chain settlement evidence

From an ecosystem perspective, it fills a different gap:

- not another wallet front-end
- not another swap front-end
- but a reusable agent-native module for business settlement execution

## Team

- `Fate` — CEO — `arbitertian@gmail.com`

## Prerequisites

Local requirements:

- Node.js and npm
- `Agentic Wallet`
- `OnchainOS CLI`
- reachable X Layer RPC
- small X Layer gas budget and demo funds

If you only want local features first, the minimum is:

- `npm install`
- a configured `.env`

If you want the full on-chain loop, you also need:

- working `onchainos`
- logged-in `Agentic Wallet`
- settlement token, factory address, and RPC settings in `.env`

## 5-minute setup

1. Install dependencies

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in real values

3. Run environment checks

```bash
node scripts/run-dealflow.js preflight
node scripts/run-dealflow.js doctor
node scripts/run-dealflow.js capabilities
```

4. Install the skill into Codex

```bash
npm run skill:install
```

This mirrors the package into:

```text
~/.codex/skills/dealflow-compiler
```

You can also run:

```bash
node scripts/install-skill.js
```

## Quick start

### Compile terms directly

```bash
node scripts/run-dealflow.js compile --terms "Client budget is 10 USDC, split creator/agency/ops 70/20/10, pay 4 first, 5 on delivery, keep 1 as reserve, and apply a 20% late penalty."
```

### Preview a deal card

```bash
node scripts/run-dealflow.js preview --deal deals/demo-deal.json
```

### Inspect unlocked natural-language capabilities

```bash
node scripts/run-dealflow.js capabilities
```

If the environment is ready, an agent can be prompted like this:

```text
Compile this collaboration clause into a deal and preview it: client budget 100 USDC, split creator/agency/ops 70/20/10, pay 40 upfront, 50 on delivery, keep 10 as reserve, and apply a 20% late penalty on the final delivery.
```

Or:

```text
Deploy this deal to X Layer with Agentic Wallet and return the vault address plus transaction hashes.
```

## How to invoke it as a skill

After installation, the safest way to trigger it in Codex is:

```md
[$dealflow-compiler](~/.codex/skills/dealflow-compiler/SKILL.md)
```

Then follow with a natural-language request such as:

```text
Compile this deal and preview it: client budget 100 USDC, split creator/agency/ops 70/20/10, pay 40 upfront, 50 on delivery, keep 10 as reserve, and apply a 20% late penalty on the final delivery.
```

Or:

```text
Check whether the current environment is ready for DealFlow Compiler. If anything is missing, tell me how to fix it, then list the capabilities currently unlocked.
```

## Staged natural-language example

This skill now defaults to a staged flow: first explain the full process, then wait for user confirmation before each next step. A typical conversation looks like this:

```text
User: I want to go through DealFlow Compiler from start to finish. First show me the full flow, explain what each stage means, whether it writes on-chain, and what output I should expect, then wait for me before moving on.

Agent: It will first list 9 stages:
1. Preflight (read-only)
2. Compile (read-only)
3. Preview (read-only)
4. Deploy (on-chain)
5. Fund (on-chain)
6. Release Milestone 0 (on-chain)
7. Release Milestone 1 (on-chain)
8. Close (on-chain)
9. Report (read-only)

User: Compile this clause into a deal and preview it: client budget 1 USDC, split creator/agency/ops 70/20/10, pay 0.4 upfront, 0.5 on delivery, keep 0.1 as reserve, and apply a 20% late penalty.

Agent: It returns the deal JSON path, the deal card, the milestone payout breakdown, and then waits for the next instruction.

User: Deploy

Agent: It explains that this creates a DealVault on X Layer, then returns the vault address and deploy tx hash, and waits for the next step.

User: Fund

Agent: It explains that the payer will approve and then fund the vault, returns the approve tx and fund tx, and waits again.
```

Recommended prompts:

- `Check whether the current environment is ready for DealFlow Compiler. If anything is missing, tell me how to fix it, then list the capabilities currently unlocked.`
- `Compile this collaboration clause into a deal and preview it: ...`
- `Deploy`
- `Fund`
- `Release Milestone 0`
- `Release Milestone 1`
- `Close`
- `Report`

## Environment variables

See `.env.example`:

```env
XLAYER_RPC_URL=https://rpc.xlayer.tech
XLAYER_CHAIN_ID=196
SETTLEMENT_TOKEN_ADDRESS=<xlayer-usdc-address>
SETTLEMENT_TOKEN_SYMBOL=USDC
SETTLEMENT_TOKEN_DECIMALS=6
DEAL_FACTORY_ADDRESS=<deal-vault-factory-address>
DEAL_PAYER_ADDRESS=<payer-address-or-leave-empty-if-wallet-default>
DEAL_ARBITER_ADDRESS=<arbiter-address-or-leave-empty-if-wallet-default>
DEPLOYER_PRIVATE_KEY=<optional-local-executor-only>
```

Notes:

- `XLAYER_RPC_URL`: X Layer RPC endpoint
- `SETTLEMENT_TOKEN_*`: settlement token config, usually `USDC`
- `DEAL_FACTORY_ADDRESS`: deployed `DealVaultFactory`
- `DEAL_PAYER_ADDRESS` / `DEAL_ARBITER_ADDRESS`: optional; Agentic Wallet defaults can be used when omitted
- `DEPLOYER_PRIVATE_KEY`: only needed for local executor mode, not wallet mode

## Recommended command flow

For a first-time user, the safest sequence is:

1. `node scripts/run-dealflow.js preflight`
2. `node scripts/run-dealflow.js doctor`
3. `node scripts/run-dealflow.js capabilities`
4. `node scripts/run-dealflow.js compile --terms "..."`
5. `node scripts/run-dealflow.js preview --deal ...`
6. `node scripts/run-dealflow.js deploy --deal ... --executor wallet`
7. `node scripts/run-dealflow.js fund --deal ... --vault ... --executor wallet`
8. `node scripts/run-dealflow.js release --deal ... --vault ... --milestone 0 --executor wallet`
9. `node scripts/run-dealflow.js report --vault ... --tx ...`

## Repo layout

If you publish this as a dedicated GitHub repository, use the contents of this package as the repo root.  
The final open-source repo should look like this:

```text
SKILL.md
README.md
README.en.md
RELEASE_CHECKLIST.md
LICENSE
.env.example
.gitignore
package.json
package-lock.json
hardhat.config.js
agents/
contracts/
artifacts/
lib/
scripts/
references/
test/
```

## Open-source release notes

When publishing to GitHub:

- use this package itself as the repo root
- keep `artifacts/` so runtime commands and reporting work immediately
- do not commit `.env`
- do not commit `node_modules/`

## Verification commands

At minimum, validate these before releasing:

```bash
node scripts/run-dealflow.js preflight
node scripts/run-dealflow.js capabilities
node scripts/run-hardhat.js test
python C:\Users\<you>\.codex\skills\.system\skill-creator\scripts\quick_validate.py .
```

## One-line positioning

`DealFlow Compiler = natural language collaboration terms -> DealSpec -> Agentic Wallet + OnchainOS -> X Layer DealVault -> auditable transaction evidence`
