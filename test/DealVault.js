const assert = require("node:assert/strict");
const { describe, it } = require("mocha");
const { ethers } = require("hardhat");

describe("DealVault", function () {
  async function deployFixture() {
    const [payer, arbiter, creator, agency, ops] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("MockERC20");
    const token = await tokenFactory.deploy("Mock USDC", "mUSDC", 6);
    await token.waitForDeployment();

    const tokenUnit = 10n ** 6n;
    const budget = 10n * tokenUnit;
    await (await token.mint(payer.address, budget)).wait();

    const latestBlock = await ethers.provider.getBlock("latest");
    const dealFactory = await ethers.getContractFactory("DealVault");
    const dealVault = await dealFactory.deploy(
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
    await dealVault.waitForDeployment();

    return { token, dealVault, payer, arbiter, creator, agency, ops, tokenUnit, budget };
  }

  it("funds the vault and releases the first milestone with the expected split", async function () {
    const { token, dealVault, payer, arbiter, creator, agency, ops, budget, tokenUnit } =
      await deployFixture();

    await (await token.connect(payer).approve(await dealVault.getAddress(), budget)).wait();
    await (await dealVault.connect(payer).fund(budget)).wait();
    await (await dealVault.connect(arbiter).releaseMilestone(0)).wait();

    assert.equal(await token.balanceOf(await dealVault.getAddress()), 6n * tokenUnit);
    assert.equal(await token.balanceOf(creator.address), 28n * 10n ** 5n);
    assert.equal(await token.balanceOf(agency.address), 8n * 10n ** 5n);
    assert.equal(await token.balanceOf(ops.address), 4n * 10n ** 5n);
  });

  it("applies a late penalty on the second milestone and distributes the reserve on close", async function () {
    const { token, dealVault, payer, arbiter, creator, agency, ops, budget, tokenUnit } =
      await deployFixture();

    await (await token.connect(payer).approve(await dealVault.getAddress(), budget)).wait();
    await (await dealVault.connect(payer).fund(budget)).wait();

    await (await dealVault.connect(arbiter).releaseMilestone(0)).wait();
    await (await dealVault.connect(arbiter).releaseMilestone(1)).wait();
    await (await dealVault.connect(arbiter).closeDeal(true)).wait();

    assert.equal(await token.balanceOf(await dealVault.getAddress()), 0n);

    // 4 USDC split + 4 USDC split + 1 USDC reserve split
    assert.equal(await token.balanceOf(creator.address), 63n * 10n ** 5n);
    assert.equal(await token.balanceOf(agency.address), 18n * 10n ** 5n);
    assert.equal(await token.balanceOf(ops.address), 9n * 10n ** 5n);

    // 1 USDC late penalty refunded to payer
    assert.equal(await token.balanceOf(payer.address), 1n * tokenUnit);
  });

  it("does not allow a successful close when the reserve was never funded", async function () {
    const { token, dealVault, payer, arbiter, tokenUnit } = await deployFixture();

    const underfundedAmount = 9n * tokenUnit;
    await (await token.connect(payer).approve(await dealVault.getAddress(), underfundedAmount)).wait();
    await (await dealVault.connect(payer).fund(underfundedAmount)).wait();

    await (await dealVault.connect(arbiter).releaseMilestone(0)).wait();
    await (await dealVault.connect(arbiter).releaseMilestone(1)).wait();

    await assert.rejects(
      dealVault.connect(arbiter).closeDeal(true),
      /Deal must be fully funded/
    );
  });
});
