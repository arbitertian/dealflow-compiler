const assert = require("node:assert/strict");
const { describe, it } = require("mocha");
const { ethers } = require("hardhat");

const { buildDealAuditReport, renderDealAuditReport } = require("../lib/dealflow");

describe("DealFlow audit report", function () {
  it("builds an auditable report from a local DealVault lifecycle", async function () {
    const [payer, arbiter, creator, agency, ops] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Mock USDC", "mUSDC", 6);
    await token.waitForDeployment();

    const tokenUnit = 10n ** 6n;
    const budget = 10n * tokenUnit;
    await (await token.mint(payer.address, budget)).wait();

    const Factory = await ethers.getContractFactory("DealVaultFactory");
    const dealFactory = await Factory.deploy();
    await dealFactory.waitForDeployment();

    const latestBlock = await ethers.provider.getBlock("latest");
    const createTx = await dealFactory.createDeal(
      await token.getAddress(),
      payer.address,
      arbiter.address,
      [creator.address, agency.address, ops.address],
      [7000, 2000, 1000],
      ["advance", "final_delivery"],
      [4n * tokenUnit, 5n * tokenUnit],
      [0, BigInt(latestBlock.timestamp - 10)],
      1n * tokenUnit,
      2000
    );
    const createReceipt = await createTx.wait();
    const createEvent = createReceipt.logs
      .map((log) => {
        try {
          return dealFactory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "DealCreated");

    const vaultAddress = createEvent.args.vault;
    const vault = await ethers.getContractAt("DealVault", vaultAddress);

    const approveTx = await token.connect(payer).approve(vaultAddress, budget);
    await approveTx.wait();
    const fundTx = await vault.connect(payer).fund(budget);
    await fundTx.wait();
    const releaseOneTx = await vault.connect(arbiter).releaseMilestone(0);
    await releaseOneTx.wait();
    const releaseTwoTx = await vault.connect(arbiter).releaseMilestone(1);
    await releaseTwoTx.wait();
    const closeTx = await vault.connect(arbiter).closeDeal(true);
    await closeTx.wait();

    const report = await buildDealAuditReport(vaultAddress, {
      provider: ethers.provider,
      factoryAddress: await dealFactory.getAddress(),
      txHashes: [
        createTx.hash,
        fundTx.hash,
        releaseOneTx.hash,
        releaseTwoTx.hash,
        closeTx.hash,
      ],
      spec: {
        payees: [
          { role: "creator" },
          { role: "agency" },
          { role: "ops" },
        ],
        meta: {
          warnings: [],
        },
      },
    });

    assert.equal(report.kind, "report");
    assert.equal(report.summary.closed, true);
    assert.equal(report.summary.balance, "0");
    assert.equal(report.settlementToken.symbol, "mUSDC");
    assert.equal(report.milestones.length, 2);
    assert.equal(report.payees[0].role, "creator");
    assert.ok(report.discoveredEvents.some((item) => item.event.name === "DealCreated"));
    assert.ok(report.discoveredEvents.some((item) => item.event.name === "PenaltyApplied"));
    assert.ok(report.discoveredEvents.some((item) => item.event.name === "DealClosed"));
    assert.equal(report.transactions.length, 5);

    const rendered = renderDealAuditReport(report);
    assert.match(rendered, /DealFlow Audit Report/);
    assert.match(rendered, /Discovered events:/);
    assert.match(rendered, /Balances:/);
  });
});
