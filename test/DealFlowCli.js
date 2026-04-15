const assert = require("node:assert/strict");
const { describe, it } = require("mocha");

const {
  buildCapabilitiesCatalog,
  buildClosePlan,
  buildDealSpec,
  buildDeployPlan,
  buildFundPlan,
  buildNormalizePlan,
  buildPreflightReport,
  buildReleasePlan,
  previewDealSpec,
  renderCapabilitiesMenu,
  renderDoctorGuide,
  renderPreflightReport,
  renderValidationSummary,
  validateDealSpec,
} = require("../lib/dealflow");

describe("DealFlow CLI helpers", function () {
  const addresses = {
    payer: "0x1111111111111111111111111111111111111111",
    arbiter: "0x2222222222222222222222222222222222222222",
    creator: "0x3333333333333333333333333333333333333333",
    agency: "0x4444444444444444444444444444444444444444",
    ops: "0x5555555555555555555555555555555555555555",
    vault: "0x6666666666666666666666666666666666666666",
    token: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
    factory: "0x7777777777777777777777777777777777777777",
  };

  const spec = buildDealSpec({
    terms: "\u5ba2\u6237\u9884\u7b97 10 USDC\uff0c\u521b\u4f5c\u8005/\u4ee3\u7406/\u8fd0\u8425\u6309 70/20/10 \u5206\u8d26\uff0c\u5148\u4ed8 4\uff0c\u4ea4\u4ed8\u540e\u4ed8 5\uff0c\u4fdd\u7559 1 \u505a\u50a8\u5907\u91d1\uff0c\u903e\u671f\u7f5a 20%\u3002",
    payerAddress: addresses.payer,
    arbiterAddress: addresses.arbiter,
    payeeOverrides: {
      creator: addresses.creator,
      agency: addresses.agency,
      ops: addresses.ops,
    },
  });

  it("compiles natural-language terms into the canonical DealSpec", function () {
    assert.equal(spec.settlementToken, "USDC");
    assert.equal(spec.budget, "10");
    assert.equal(spec.reserveAmount, "1");
    assert.equal(spec.latePenaltyBps, 2000);
    assert.equal(spec.payees.length, 3);
    assert.equal(spec.milestones.length, 2);
    assert.equal(spec.milestones[0].name, "advance");
    assert.equal(spec.milestones[1].name, "final_delivery");
    assert.ok(spec.milestones[1].dueAt < Math.floor(Date.now() / 1000));
  });

  it("renders a preview with milestone distributions and the command flow", function () {
    const preview = previewDealSpec(spec);

    assert.match(preview, /Budget: 10 USDC/);
    assert.match(preview, /Optional: node scripts\/run-dealflow\.js normalize/);
    assert.match(preview, /Milestone 1: advance/);
    assert.match(preview, /Milestone 2: final_delivery/);
    assert.match(preview, /late penalty: 1 USDC/);
    assert.match(preview, /node scripts\/run-dealflow\.js fund/);
  });

  it("builds deploy, fund, release, and close plans", async function () {
    const overrides = {
      tokenAddress: addresses.token,
      tokenDecimals: 6,
      chainId: 196,
    };

    const deployPlan = await buildDeployPlan(spec, {
      ...overrides,
      executor: "wallet",
      factoryAddress: addresses.factory,
    });
    assert.equal(deployPlan.kind, "deploy");
    assert.equal(deployPlan.chainId, 196);
    assert.equal(deployPlan.factoryAddress, addresses.factory);
    assert.match(deployPlan.call.command, /contract-call/);

    const fundPlan = buildFundPlan(spec, addresses.vault, overrides);
    assert.equal(fundPlan.kind, "fund");
    assert.equal(fundPlan.calls.length, 2);
    assert.equal(fundPlan.calls[0].label, "Approve settlement token spending");
    assert.match(fundPlan.calls[1].command, /contract-call/);

    const normalizedFundPlan = buildFundPlan(spec, addresses.vault, {
      ...overrides,
      normalizeFromToken: "okb",
      normalizeAmount: "1",
    });
    assert.equal(normalizedFundPlan.calls[0].label, "Quote funding normalization swap");
    assert.equal(normalizedFundPlan.calls[1].label, "Swap into settlement token via OnchainOS DEX");
    assert.equal(normalizedFundPlan.calls[2].label, "Approve settlement token spending");

    const releasePlan = buildReleasePlan(spec, addresses.vault, 1, overrides);
    assert.equal(releasePlan.kind, "release");
    assert.match(releasePlan.call.command, /contract-call/);

    const closePlan = buildClosePlan(spec, addresses.vault, {
      ...overrides,
      success: true,
    });
    assert.equal(closePlan.kind, "close");
    assert.match(closePlan.call.command, /contract-call/);
  });

  it("validates external DealSpecs and builds a normalization plan", function () {
    const errors = validateDealSpec(spec);
    assert.deepEqual(errors, []);

    const invalid = {
      ...spec,
      budget: "2",
    };
    assert.match(validateDealSpec(invalid)[0], /budget must equal/);
    assert.match(renderValidationSummary(spec), /DealSpec OK/);

    const normalizePlan = buildNormalizePlan(spec, {
      sourceToken: "okb",
      amount: "1",
      wallet: addresses.payer,
      chainId: 196,
      tokenAddress: addresses.token,
      tokenDecimals: 6,
    });

    assert.equal(normalizePlan.kind, "normalize");
    assert.match(normalizePlan.calls[0].command, /swap quote/);
    assert.match(normalizePlan.calls[1].command, /swap execute/);
    assert.match(normalizePlan.calls[1].command, /--wallet/);
  });

  it("builds a reusable-skill preflight report and unlocks natural-language capabilities", async function () {
    const env = {
      XLAYER_RPC_URL: "https://rpc.example",
      XLAYER_CHAIN_ID: "196",
      SETTLEMENT_TOKEN_ADDRESS: addresses.token,
      SETTLEMENT_TOKEN_SYMBOL: "USDC",
      SETTLEMENT_TOKEN_DECIMALS: "6",
      DEAL_FACTORY_ADDRESS: addresses.factory,
      DEAL_PAYER_ADDRESS: addresses.payer,
      DEAL_ARBITER_ADDRESS: addresses.arbiter,
    };

    const report = await buildPreflightReport({
      env,
      envFilePath: __filename,
      skillInstallPath: require("node:path").resolve(__dirname, "..", "dealflow-compiler", "SKILL.md"),
      commandRunner(args) {
        if (args[0] === "wallet" && args[1] === "--help") {
          return { status: 0, stdout: "ok", stderr: "" };
        }
        if (args[0] === "wallet" && args[1] === "addresses") {
          return {
            status: 0,
            stdout: JSON.stringify({
              data: {
                xlayer: [{ address: addresses.payer }],
              },
            }),
            stderr: "",
          };
        }
        return { status: 1, stdout: "", stderr: "unexpected command" };
      },
      providerFactory() {
        return {
          async getNetwork() {
            return { chainId: 196n };
          },
        };
      },
    });

    assert.equal(report.summary.readyForReusableSkill, true);
    assert.equal(report.summary.readyForWalletDemo, true);
    assert.match(renderPreflightReport(report), /Reusable agent skill: ready/);
    assert.match(renderCapabilitiesMenu(report, { enabledOnly: true }), /把聊天条款编译成 Deal Card 并预览执行流/);
    assert.equal(buildCapabilitiesCatalog({
      workspaceReady: true,
      artifactsReady: true,
      roleSourceReady: true,
      settlementReady: true,
      factoryReady: true,
      onchainosReady: true,
      walletReady: true,
      rpcReady: true,
    }).every((capability) => capability.enabled), true);
  });

  it("renders doctor guidance when setup is incomplete", async function () {
    const report = await buildPreflightReport({
      env: {},
      envFilePath: "C:\\missing\\.env",
      skillInstallPath: "C:\\missing\\skill\\SKILL.md",
      commandRunner() {
        return { status: 1, stdout: "", stderr: "onchainos not found" };
      },
      providerFactory() {
        throw new Error("should not be called without rpc");
      },
    });

    assert.equal(report.summary.readyForReusableSkill, false);
    const doctor = renderDoctorGuide(report);
    assert.match(doctor, /优先修这些阻塞项/);
    assert.match(doctor, /XLAYER_RPC_URL=https:\/\/rpc\.xlayer\.tech/);
    assert.match(doctor, /onchainos wallet login/);
    assert.match(renderCapabilitiesMenu(report), /待解锁能力/);
  });
});
