# GitHub Release Checklist

Use this one-page checklist before you push `DealFlow Compiler` as a public repo or hackathon submission.

## 1. Repo hygiene

- [ ] Use the contents of `dealflow-compiler/` as the GitHub repo root
- [ ] Commit `SKILL.md`, `README.md`, `README.en.md`, `LICENSE`, and this checklist
- [ ] Keep `artifacts/` in the repo so runtime decoding and reporting work out of the box
- [ ] Do not commit `.env`
- [ ] Do not commit `node_modules/`
- [ ] Do not commit private keys, wallet session files, or personal API credentials

## 2. Install flow

- [ ] `npm install` succeeds in a clean clone
- [ ] `.env.example` still matches the actual runtime requirements
- [ ] `node scripts/run-dealflow.js preflight` runs
- [ ] `node scripts/run-dealflow.js doctor` gives repair guidance when config is missing
- [ ] `node scripts/run-dealflow.js capabilities` prints a natural-language capability menu
- [ ] `npm run skill:install` mirrors the package into `~/.codex/skills/dealflow-compiler`

## 3. Skill usability

- [ ] `SKILL.md` still describes the standalone package correctly
- [ ] `scripts/run-dealflow.js` works without depending on an external workspace root
- [ ] The README shows how to trigger the skill with `[$dealflow-compiler](~/.codex/skills/dealflow-compiler/SKILL.md)`
- [ ] The README shows at least one compile prompt and one deploy/report prompt

## 4. Local quality checks

- [ ] `node scripts/run-hardhat.js test` passes
- [ ] `python C:\Users\<you>\.codex\skills\.system\skill-creator\scripts\quick_validate.py .` passes
- [ ] `node scripts/run-dealflow.js compile --terms "..."` works on a fresh example
- [ ] `node scripts/run-dealflow.js preview --deal ...` renders a clear deal card

## 5. Chain demo readiness

- [ ] `.env` points to the intended X Layer RPC
- [ ] `DEAL_FACTORY_ADDRESS` is correct for the demo environment
- [ ] `Agentic Wallet` is logged in
- [ ] The demo wallet has small X Layer gas funds
- [ ] The demo wallet has small settlement funds, or a clear normalize path is ready
- [ ] You have at least one clean demo script for `compile -> preview -> deploy -> fund -> release -> report`

## 6. Submission assets

- [ ] Chinese README is ready for local users and judges
- [ ] English README is ready for global reviewers
- [ ] Architecture diagram and value proposition are consistent across docs
- [ ] At least one real vault address and tx hash set is prepared for proof
- [ ] The repo description and submission blurb use the same one-line positioning

## 7. Final publish pass

- [ ] Open the repo as if you were a first-time user and follow only the docs
- [ ] Confirm the first screen explains what the skill does in one sentence
- [ ] Confirm installation takes under 5 minutes with no hidden steps
- [ ] Confirm all commands in the README still match `package.json`
- [ ] Tag or snapshot the exact version you plan to submit
