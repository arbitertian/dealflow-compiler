const assert = require("node:assert/strict");
const { describe, it } = require("mocha");
const { ethers } = require("hardhat");

describe("DealVaultFactory", function () {
  it("creates a DealVault and records its address", async function () {
    const [payer, arbiter, creator, agency, ops] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Mock USDC", "USDC", 6);
    await token.waitForDeployment();

    const Factory = await ethers.getContractFactory("DealVaultFactory");
    const dealFactory = await Factory.deploy();
    await dealFactory.waitForDeployment();

    const tx = await dealFactory.createDeal(
      await token.getAddress(),
      payer.address,
      arbiter.address,
      [creator.address, agency.address, ops.address],
      [7000, 2000, 1000],
      ["advance", "final_delivery"],
      [ethers.parseUnits("4", 6), ethers.parseUnits("5", 6)],
      [0, 0],
      ethers.parseUnits("1", 6),
      2000
    );
    const receipt = await tx.wait();
    const event = receipt.logs
      .map((log) => {
        try {
          return dealFactory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "DealCreated");

    assert.ok(event);

    const vaultAddress = event.args.vault;
    assert.match(vaultAddress, /^0x/i);

    const vault = await ethers.getContractAt("DealVault", vaultAddress);
    const summary = await vault.getSummary();

    assert.equal(summary[0], await token.getAddress());
    assert.equal(summary[1], payer.address);
    assert.equal(summary[2], arbiter.address);
    assert.equal(summary[3], ethers.parseUnits("10", 6));
    assert.equal(summary[6], ethers.parseUnits("9", 6));
    assert.equal(summary[7], ethers.parseUnits("1", 6));
  });
});
