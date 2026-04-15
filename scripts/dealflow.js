#!/usr/bin/env node

const path = require("node:path");
require("dotenv").config();
const {
  assertValidDealSpec,
  buildCapabilitiesCatalog,
  buildDealAuditReport,
  buildClosePlan,
  buildDealSpec,
  buildDeployPlan,
  buildFundPlan,
  buildNormalizePlan,
  buildPreflightReport,
  buildReleasePlan,
  executeLocalCall,
  executeLocalDeploy,
  executeLocalFund,
  executeWalletPlan,
  getWalletDefaultAddress,
  parseArgv,
  parsePayeeOverrides,
  previewDealSpec,
  readJson,
  readTerms,
  renderCapabilitiesMenu,
  renderDoctorGuide,
  renderDealAuditReport,
  renderPreflightReport,
  renderValidationSummary,
  validateDealSpec,
  writeJson,
} = require("../lib/dealflow");

function printHelp() {
  console.log(`DealFlow CLI

Usage:
  node scripts/dealflow.js compile [--terms "..."] [--out deals/my-deal.json]
  node scripts/dealflow.js preflight
  node scripts/dealflow.js doctor
  node scripts/dealflow.js capabilities
  node scripts/dealflow.js validate --deal deals/my-deal.json
  node scripts/dealflow.js preview --deal deals/my-deal.json
  node scripts/dealflow.js normalize --from-token okb --amount 1 --wallet 0x... [--executor wallet|plan]
  node scripts/dealflow.js deploy --deal deals/my-deal.json [--executor wallet|plan|local]
  node scripts/dealflow.js fund --deal deals/my-deal.json --vault 0x... [--executor wallet|local|plan] [--normalize-from okb --normalize-amount 1]
  node scripts/dealflow.js release --deal deals/my-deal.json --vault 0x... --milestone 0 [--executor wallet|local|plan]
  node scripts/dealflow.js close --deal deals/my-deal.json --vault 0x... [--executor wallet|local|plan] [--success]
  node scripts/dealflow.js report --vault 0x... [--deal deals/my-deal.json] [--tx 0x... --tx 0x...]

Notes:
  - preflight checks workspace files, .env, Agentic Wallet, OnchainOS CLI, factory config, RPC, and skill install status.
  - doctor turns failed checks into step-by-step setup guidance plus a ready-to-copy .env template.
  - capabilities prints natural-language prompts for the abilities that are unlocked in the current environment.
  - compile/validate/preview/report are local or read-only.
  - normalize uses OnchainOS DEX + Agentic Wallet to swap into the settlement token before funding.
  - deploy uses DealVaultFactory + Agentic Wallet when DEAL_FACTORY_ADDRESS or --factory-address is available.
  - fund/release/close can execute through Agentic Wallet via onchainos wallet contract-call.
  - report decodes DealVault / DealVaultFactory events and prints vault state, tx receipts, and balances.
  - deploy also supports local RPC deployment today; plan mode emits either the wallet factory call or raw deployment calldata for inspection.`);
  console.log("  - If automatic wallet detection is unavailable, pass --payer/--arbiter or set DEAL_PAYER_ADDRESS / DEAL_ARBITER_ADDRESS.");
}

function loadDeal(args) {
  const dealPath = args.deal || args.in;
  if (!dealPath || dealPath === true) {
    throw new Error("A deal file is required. Pass --deal path/to/deal.json.");
  }

  return assertValidDealSpec(readJson(String(dealPath)));
}

function safeJson(value) {
  return JSON.stringify(
    value,
    (_, current) => (typeof current === "bigint" ? current.toString() : current),
    2
  );
}

function emit(result, args) {
  if (args.out && args.out !== true) {
    writeJson(String(args.out), JSON.parse(safeJson(result)));
  }

  if (args.json || (args.out && args.out !== true)) {
    console.log(safeJson(result));
  } else if (typeof result === "string") {
    console.log(result);
  } else {
    console.log(safeJson(result));
  }
}

async function run() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  const args = parseArgv(rest);

  if (command === "preflight") {
    const report = await buildPreflightReport();
    emit(args.json ? report : renderPreflightReport(report), args);
    return;
  }

  if (command === "doctor") {
    const report = await buildPreflightReport();
    emit(args.json ? report : renderDoctorGuide(report), args);
    return;
  }

  if (command === "capabilities") {
    const report = await buildPreflightReport();
    emit(
      args.json
        ? {
            command: "capabilities",
            summary: report.summary,
            capabilities: report.capabilities || buildCapabilitiesCatalog(),
          }
        : renderCapabilitiesMenu(report),
      args
    );
    return;
  }

  if (command === "compile") {
    const defaultWalletAddress = getWalletDefaultAddress();
    const spec = buildDealSpec({
      terms: readTerms(args),
      payerAddress: args.payer !== true ? args.payer : undefined,
      arbiterAddress: args.arbiter !== true ? args.arbiter : undefined,
      payeeOverrides: parsePayeeOverrides(args.payee),
      defaultWalletAddress,
    });

    const outputPath = args.out && args.out !== true
      ? String(args.out)
      : path.join("deals", `${Date.now()}-deal.json`);
    writeJson(outputPath, spec);

    emit(
      {
        command: "compile",
        outputPath: path.resolve(outputPath),
        walletDefaultAddress: defaultWalletAddress,
        spec,
      },
      { ...args, json: true, out: false }
    );
    return;
  }

  if (command === "validate") {
    const spec = loadDeal(args);
    const errors = validateDealSpec(spec);
    if (errors.length !== 0) {
      throw new Error(errors.join("\n"));
    }
    emit(
      {
        command: "validate",
        ok: true,
        summary: renderValidationSummary(spec),
        spec,
      },
      args
    );
    return;
  }

  if (command === "preview") {
    emit(previewDealSpec(loadDeal(args)), args);
    return;
  }

  if (command === "normalize") {
    const executor = args.executor && args.executor !== true ? String(args.executor) : "wallet";
    const walletAddress = args.wallet !== true ? args.wallet : args.from;
    const plan = buildNormalizePlan(null, {
      executor,
      sourceToken: args["from-token"],
      amount: args.amount,
      wallet: walletAddress,
      chainId: args["chain-id"],
      swapChain: args.chain,
      slippage: args.slippage,
      gasLevel: args["gas-level"],
      mevProtection: Boolean(args["mev-protection"]),
      targetToken: args["to-token"],
    });

    if (executor === "wallet") {
      emit({ plan, results: executeWalletPlan(plan) }, args);
      return;
    }

    emit(plan, args);
    return;
  }

  if (command === "deploy") {
    const spec = loadDeal(args);
    const executor = args.executor && args.executor !== true ? String(args.executor) : "wallet";
    const result = executor === "local"
      ? await executeLocalDeploy(spec, {
          tokenAddress: args["token-address"],
          tokenDecimals: args["token-decimals"],
          rpcUrl: args["rpc-url"],
          privateKey: args["private-key"],
          chainId: args["chain-id"],
        })
      : await buildDeployPlan(spec, {
          executor,
          tokenAddress: args["token-address"],
          tokenDecimals: args["token-decimals"],
          chainId: args["chain-id"],
          factoryAddress: args["factory-address"],
          from: args.from,
        });

    if (executor === "wallet") {
      emit({ plan: result, results: executeWalletPlan(result) }, args);
      return;
    }

    emit(result, args);
    return;
  }

  if (command === "fund") {
    const spec = loadDeal(args);
    const vault = String(args.vault || args.to);
    if (!vault || vault === "true") {
      throw new Error("Fund requires --vault 0x...");
    }

    const executor = args.executor && args.executor !== true ? String(args.executor) : "wallet";
    if (executor === "local") {
      emit(
        await executeLocalFund(spec, vault, {
          amount: args.amount,
          tokenAddress: args["token-address"],
          tokenDecimals: args["token-decimals"],
          rpcUrl: args["rpc-url"],
          privateKey: args["private-key"],
          chainId: args["chain-id"],
        }),
        args
      );
      return;
    }

    const plan = buildFundPlan(spec, vault, {
      amount: args.amount,
      tokenAddress: args["token-address"],
      tokenDecimals: args["token-decimals"],
      chainId: args["chain-id"],
      from: args.from,
      executor,
      normalizeFromToken: args["normalize-from"],
      normalizeAmount: args["normalize-amount"],
      swapChain: args.chain,
      slippage: args.slippage,
      gasLevel: args["gas-level"],
      mevProtection: Boolean(args["mev-protection"]),
    });

    if (executor === "wallet") {
      emit({ plan, results: executeWalletPlan(plan) }, args);
      return;
    }

    emit(plan, args);
    return;
  }

  if (command === "release") {
    const spec = loadDeal(args);
    const vault = String(args.vault || args.to);
    if (!vault || vault === "true") {
      throw new Error("Release requires --vault 0x...");
    }
    if (args.milestone === undefined || args.milestone === true) {
      throw new Error("Release requires --milestone <index>.");
    }

    const milestoneId = Number.parseInt(String(args.milestone), 10);
    const executor = args.executor && args.executor !== true ? String(args.executor) : "wallet";
    if (executor === "local") {
      emit(
        await executeLocalCall(vault, "releaseMilestone", [milestoneId], {
          rpcUrl: args["rpc-url"],
          privateKey: args["private-key"],
        }),
        args
      );
      return;
    }

    const plan = buildReleasePlan(spec, vault, milestoneId, {
      tokenAddress: args["token-address"],
      chainId: args["chain-id"],
      from: args.from,
      executor,
    });

    if (executor === "wallet") {
      emit({ plan, results: executeWalletPlan(plan) }, args);
      return;
    }

    emit(plan, args);
    return;
  }

  if (command === "close") {
    const spec = loadDeal(args);
    const vault = String(args.vault || args.to);
    if (!vault || vault === "true") {
      throw new Error("Close requires --vault 0x...");
    }

    const executor = args.executor && args.executor !== true ? String(args.executor) : "wallet";
    if (executor === "local") {
      emit(
        await executeLocalCall(vault, "closeDeal", [Boolean(args.success)], {
          rpcUrl: args["rpc-url"],
          privateKey: args["private-key"],
        }),
        args
      );
      return;
    }

    const plan = buildClosePlan(spec, vault, {
      tokenAddress: args["token-address"],
      chainId: args["chain-id"],
      from: args.from,
      executor,
      success: Boolean(args.success),
    });

    if (executor === "wallet") {
      emit({ plan, results: executeWalletPlan(plan) }, args);
      return;
    }

    emit(plan, args);
    return;
  }

  if (command === "report") {
    const spec = args.deal && args.deal !== true ? loadDeal(args) : null;
    const vault = String(args.vault || args.to);
    if (!vault || vault === "true") {
      throw new Error("Report requires --vault 0x...");
    }

    const txHashes = args.tx === undefined
      ? []
      : Array.isArray(args.tx)
        ? args.tx
        : [args.tx];

    const report = await buildDealAuditReport(vault, {
      spec,
      txHashes,
      rpcUrl: args["rpc-url"],
      chainId: args["chain-id"],
      factoryAddress: args["factory-address"],
      tokenAddress: args["token-address"],
      tokenDecimals: args["token-decimals"],
      tokenSymbol: args["token-symbol"],
    });

    emit(args.json ? report : renderDealAuditReport(report), args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
