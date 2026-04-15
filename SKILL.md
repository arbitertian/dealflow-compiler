---
name: dealflow-compiler
description: Compile collaboration terms into X Layer settlement flows for the OKX Build X Skill Arena. Use when Codex needs to work on DealFlow Compiler, DealSpec, DealVault, creator revenue splits, milestone payouts, escrow rules, refund penalties, treasury settlement flows, or natural-language-to-onchain settlement on X Layer with Agentic Wallet and OnchainOS.
---

# Dealflow Compiler

## Overview

Build this project as a reusable Skill, not a generic dApp. The product promise is:

`natural language terms -> DealSpec JSON -> previewable execution plan -> X Layer DealVault transactions`

Assume the repo is the source of truth and the current workspace contains:

- `scripts/dealflow.js`
- `lib/dealflow.js`
- `contracts/DealVault.sol`
- `contracts/DealVaultFactory.sol`
- `.env` with X Layer configuration

If those files are missing, stop and explain that the current workspace is not the DealFlow Compiler project.

Before first use in a fresh clone, run `npm install` in the package root so the local CLI can load `dotenv`, `ethers`, and Hardhat.

## Chat-First Orchestration

When this skill is triggered inside Codex chat, treat it as a staged natural-language workflow, not as a raw CLI wrapper.

### Initial Response Contract

If the user has not explicitly chosen a step yet, always start by showing the full flow in natural language:

1. `环境检查 / Preflight`
   Explain whether the environment is ready, what is missing, and which abilities are currently unlocked.
2. `编译条款 / Compile`
   Explain that natural-language business terms will be converted into a structured `DealSpec`.
3. `预览方案 / Preview`
   Explain the deal card, milestone releases, reserve handling, and late-penalty behavior in plain language.
4. `部署金库 / Deploy`
   Explain that this creates a new `DealVault` on X Layer and returns the vault address plus deploy tx.
5. `入金 / Fund`
   Explain that the payer approves the settlement token and funds the vault.
6. `释放里程碑 1 / Release Milestone 1`
   Explain the first payout release and how the split is applied.
7. `释放里程碑 2 / Penalty / Refund`
   Explain the second release, and whether penalty or refund logic will trigger.
8. `结案 / Close`
   Explain that the vault is closed and any remaining reserve is released.
9. `审计报告 / Report`
   Explain that the skill summarizes the vault address, tx hashes, events, balances, and final state.

For each stage, state:

- what it does
- whether it is read-only or writes on-chain
- what output the user should expect next

End the initial response by asking the user which stage to run first.

### Confirmation Rule

- Never auto-advance from one on-chain stage to the next without explicit user confirmation.
- After each completed stage, summarize the result in natural language, list the remaining stages, and wait for the user to say `继续`, `下一步`, or name the next stage.
- If the user asks for a specific stage directly, do that stage and then return to the staged flow.
- It is acceptable to bundle adjacent read-only steps when the user asks for them together, such as `compile + preview`.
- Do not bundle state-changing stages (`normalize`, `deploy`, `fund`, `release`, `close`) unless the user explicitly asks to execute that exact stage now.

### Natural-Language Mapping

Map common user requests like this:

- `先检查环境` -> `preflight`, then `doctor` and `capabilities` if needed
- `把条款编译成 deal` -> `compile`
- `给我看 deal card` / `预览一下` -> `preview`
- `部署到 X Layer` -> `deploy`
- `给 vault 入金` -> `fund`
- `释放第一阶段` -> `release --milestone 0`
- `释放第二阶段` / `触发罚则` -> `release --milestone 1`
- `结案` / `释放储备金` -> `close --success`
- `生成审计报告` -> `report`

## Workflow

1. Lock the MVP boundary before coding. Keep v1 to one settlement token, one payer, up to three payees, two or three milestones, manual milestone confirmation, and one late-penalty rule.
2. Keep official integrations on the critical path. Every transaction must be sent through Agentic Wallet. Use OnchainOS Wallet plus DEX or Payment when normalizing assets or funding the deal.
3. Separate responsibilities. Parse and validate terms off-chain; escrow and distribute funds on-chain through a DealVault contract deployed on X Layer.
4. Optimize for proof. The canonical demo should show normalize if needed, deploy, fund, release milestone 1, release milestone 2 with penalty or refund, and close.
5. Return audit artifacts every time. Surface the DealSpec, human-readable preview, vault address, tx hashes, emitted events, and final balances.

## Implementation Rules

- Keep the AI layer narrow. Use it to extract structure, explain tradeoffs, and generate execution plans; do not use it to arbitrate off-chain disputes.
- Treat `DealSpec` as the interface contract between natural language and execution. Validate it before any wallet action.
- Prefer one `DealVault` contract for v1. Add a factory only if repeated deployment becomes a real bottleneck.
- Default demos to small real funds such as `5-10 USDC` plus gas so the flow is safe and still produces real on-chain evidence.
- If the payer holds a non-settlement asset, swap into the settlement token through OnchainOS DEX before funding the vault.
- Keep milestone completion human-triggered in v1. Avoid oracles, auto-dispute logic, and generalized contract-law features.

## Canonical Command Surface

Prefer the skill-local wrapper so the command surface stays stable even after the skill is installed into `~/.codex/skills`:

- `node scripts/run-dealflow.js preflight`
- `node scripts/run-dealflow.js doctor`
- `node scripts/run-dealflow.js capabilities`
- `node scripts/run-dealflow.js compile --terms "<terms>"`
- `node scripts/run-dealflow.js validate --deal deals/demo-deal.json`
- `node scripts/run-dealflow.js preview --deal deals/demo-deal.json`
- `node scripts/run-dealflow.js normalize --from-token okb --amount 1 --wallet <payer> --executor plan`
- `npm run deploy:factory:xlayer`
- `node scripts/run-dealflow.js deploy --deal deals/demo-deal.json --executor wallet`
- `node scripts/run-dealflow.js fund --deal deals/demo-deal.json --vault <vault> --executor wallet`
- `node scripts/run-dealflow.js fund --deal deals/demo-deal.json --vault <vault> --normalize-from okb --normalize-amount 1 --executor plan`
- `node scripts/run-dealflow.js release --deal deals/demo-deal.json --vault <vault> --milestone 0 --executor wallet`
- `node scripts/run-dealflow.js close --deal deals/demo-deal.json --vault <vault> --executor wallet --success`
- `node scripts/run-dealflow.js report --vault <vault> --tx <hash> --tx <hash>`

To make the skill directly callable by Codex, sync this folder into the auto-discovered skill directory:

- `node scripts/install-skill.js`

That command mirrors the repo skill folder into `~/.codex/skills/dealflow-compiler` without changing the repo copy.

## Default Conversation Pattern

Use this pattern unless the user clearly asks for a single specific action:

1. Run `preflight` or explain the last known environment status.
2. Present the full staged flow in natural language.
3. Explain the meaning of the current recommended next step.
4. Ask the user whether to proceed.
5. Execute only that step.
6. Return a short result summary plus the next available stages.

For example, after `compile + preview`, do not jump into `deploy`. Instead, explain:

- what `deploy` will do
- that it writes on-chain
- what address / tx outputs the user will receive
- that the user can choose to continue now or stop here

## Build Priorities

### 1. Compile Terms

Extract only the fields needed for execution:

- settlement token
- budget
- payer
- arbiter
- payees and split ratios
- milestones and amounts
- reserve amount
- late penalty

### 2. Preview Clearly

Translate the parsed deal into a compact deal card before execution. The preview should let a human confirm:

- who pays
- who gets paid
- how much is released at each milestone
- how reserve and penalty logic work

### 3. Execute on X Layer

Send all state-changing actions through Agentic Wallet. If the payer starts with a non-settlement asset, normalize through OnchainOS DEX before funding. Keep the canonical chain evidence easy to show in a demo:

- funding normalization quote or swap tx
- factory-backed deploy tx
- vault deployment tx
- funding tx
- release tx
- penalty or refund tx
- close tx

## Resources

- Read [references/architecture.md](references/architecture.md) when you need the final hackathon architecture, module boundaries, or judging alignment.
- Read [references/deal-spec.md](references/deal-spec.md) when you need the `DealSpec` shape, MVP constraints, or the canonical demo values.
- Use [scripts/run-dealflow.js](scripts/run-dealflow.js) when you want a stable wrapper that validates local runtime dependencies and forwards commands to the real CLI.
- Use `preflight` first when another agent or teammate is opening the skill for the first time. It checks workspace files, compiled artifacts, `.env`, OnchainOS CLI, Agentic Wallet, X Layer RPC, and whether the skill has been mirrored into `~/.codex/skills`.
- Use `doctor` when `preflight` reports failures. It turns each missing piece into concrete next steps and prints a safe `.env` template without echoing private keys.
- Use `capabilities` after setup is green. It prints the natural-language prompt menu for the abilities that are currently unlocked in the environment.
- In chat, always prefer natural-language stage guidance over dumping raw command output. Translate every step into user-facing flow language first, then execute the command behind the scenes.
- Use `validate` before executing external or hand-edited deal files.
- Use `normalize` when the payer holds `OKB`, a native gas token, or any non-`USDC` asset that should be swapped into the settlement token through OnchainOS DEX.
- Use `report` after deploy/fund/release/close to turn tx hashes and vault state into audit artifacts for judges or downstream agents.
- Run `python scripts/validate_deal_spec.py path/to/deal.json` before wiring a new deal flow into wallet execution.
- Use `node scripts/install-skill.js` from the project root when the standalone package needs to be mirrored into `~/.codex/skills`.
- Use `node scripts/run-dealflow.js --help` in the project root for the end-to-end wrapper entrypoint.
