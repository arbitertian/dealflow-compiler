# DealSpec Reference

## Purpose

`DealSpec` is the structured boundary between natural language and execution. Parse human terms into this shape before any wallet action.

## MVP Constraints

- one settlement token, preferably `USDC`
- one payer
- one arbiter
- one to three payees
- one to three milestones
- reserve amount required
- one late penalty rule in basis points

## Suggested Shape

```json
{
  "settlementToken": "USDC",
  "budget": "10",
  "payer": {
    "address": "0x1111111111111111111111111111111111111111"
  },
  "arbiter": {
    "address": "0x2222222222222222222222222222222222222222"
  },
  "payees": [
    {
      "role": "creator",
      "address": "0x3333333333333333333333333333333333333333",
      "bps": 7000
    },
    {
      "role": "agency",
      "address": "0x4444444444444444444444444444444444444444",
      "bps": 2000
    },
    {
      "role": "ops",
      "address": "0x5555555555555555555555555555555555555555",
      "bps": 1000
    }
  ],
  "milestones": [
    {
      "name": "advance",
      "amount": "4",
      "dueMode": "immediate"
    },
    {
      "name": "final_delivery",
      "amount": "5",
      "dueMode": "manual_confirmation"
    }
  ],
  "reserveAmount": "1",
  "latePenaltyBps": 2000
}
```

## Validation Rules

- `budget` must equal the sum of milestone amounts plus `reserveAmount`
- `payees[].bps` must sum to `10000`
- `latePenaltyBps` must be between `0` and `10000`
- addresses should be real EVM addresses before live execution
- milestone names should be stable identifiers that can be mapped to release actions

## Canonical Demo Deal

Use this as the shortest convincing demo:

- total budget: `10 USDC`
- milestone 1: `4 USDC`
- milestone 2: `5 USDC`
- reserve: `1 USDC`
- split: `70 / 20 / 10`
- late penalty on milestone 2: `20%`

Expected story:

1. The payer funds `10 USDC`.
2. Milestone 1 releases `4 USDC` and auto-splits into `2.8 / 0.8 / 0.4`.
3. Milestone 2 is released late. `1 USDC` is refunded as the penalty, and the remaining `4 USDC` is split into `2.8 / 0.8 / 0.4`.
4. Closing the deal releases the `1 USDC` reserve as `0.7 / 0.2 / 0.1` or returns it to the payer if the deal is unsuccessful.

## CLI Mapping

The recommended command mapping is:

- `node scripts/run-dealflow.js preflight` -> detect whether the workspace, `.env`, OnchainOS CLI, Agentic Wallet, RPC, and installed skill mirror are ready
- `node scripts/run-dealflow.js doctor` -> turn failed checks into setup guidance and a safe `.env` template
- `node scripts/run-dealflow.js capabilities` -> print the unlocked natural-language prompt menu for this environment
- `node scripts/run-dealflow.js compile "<terms>"` -> produce `DealSpec`
- `node scripts/run-dealflow.js validate --deal path/to/deal.json` -> fail early on invalid ratios, amounts, or addresses
- `node scripts/run-dealflow.js preview --deal path/to/deal.json` -> show a human-readable card
- `node scripts/run-dealflow.js normalize --from-token okb --amount 1 --wallet 0x... --executor wallet|plan` -> swap into the settlement token via OnchainOS DEX when funding starts from another asset
- `npm run deploy:factory:xlayer` -> deploy `DealVaultFactory` once and export `DEAL_FACTORY_ADDRESS`
- `node scripts/run-dealflow.js deploy --deal path/to/deal.json --executor wallet|plan|local` -> create the vault via factory, or emit a deploy plan
- `node scripts/run-dealflow.js fund --deal path/to/deal.json --vault 0x... --executor wallet|local|plan` -> approve and fund the deal
- `node scripts/run-dealflow.js fund --deal path/to/deal.json --vault 0x... --normalize-from okb --normalize-amount 1 --executor wallet|plan` -> normalize then fund as one planned flow
- `node scripts/run-dealflow.js release --deal path/to/deal.json --vault 0x... --milestone 0 --executor wallet|local|plan` -> release advance
- `node scripts/run-dealflow.js release --deal path/to/deal.json --vault 0x... --milestone 1 --executor wallet|local|plan` -> release final milestone
- `node scripts/run-dealflow.js close --deal path/to/deal.json --vault 0x... --executor wallet|local|plan --success` -> release reserve and close
- `node scripts/run-dealflow.js report --vault 0x... --tx 0x... --tx 0x...` -> decode events, balances, and audit evidence into a reusable report
