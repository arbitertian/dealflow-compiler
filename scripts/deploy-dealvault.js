const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");

function loadDealSpec(specPath) {
  const resolvedPath = path.resolve(specPath);
  const raw = fs.readFileSync(resolvedPath, "utf8");
  return JSON.parse(raw);
}

function parseAmount(value, decimals) {
  return hre.ethers.parseUnits(String(value), decimals);
}

async function main() {
  const specPath = process.argv[2];
  if (!specPath) {
    throw new Error("Usage: npx hardhat run scripts/deploy-dealvault.js --network xlayer <path-to-deal-spec>");
  }

  const settlementTokenAddress = process.env.SETTLEMENT_TOKEN_ADDRESS;
  if (!settlementTokenAddress) {
    throw new Error("SETTLEMENT_TOKEN_ADDRESS is required.");
  }

  const settlementTokenDecimals = Number(process.env.SETTLEMENT_TOKEN_DECIMALS || 6);
  const spec = loadDealSpec(specPath);

  const payees = spec.payees.map((payee) => payee.address);
  const payeeBps = spec.payees.map((payee) => payee.bps);
  const milestoneNames = spec.milestones.map((milestone) => milestone.name);
  const milestoneAmounts = spec.milestones.map((milestone) =>
    parseAmount(milestone.amount, settlementTokenDecimals)
  );
  const milestoneDueAts = spec.milestones.map((milestone) => {
    if (typeof milestone.dueAt === "number") {
      return milestone.dueAt;
    }

    return 0;
  });
  const reserveAmount = parseAmount(spec.reserveAmount, settlementTokenDecimals);

  const factory = await hre.ethers.getContractFactory("DealVault");
  const vault = await factory.deploy(
    settlementTokenAddress,
    spec.payer.address,
    spec.arbiter.address,
    payees,
    payeeBps,
    milestoneNames,
    milestoneAmounts,
    milestoneDueAts,
    reserveAmount,
    spec.latePenaltyBps
  );

  await vault.waitForDeployment();

  console.log(JSON.stringify({
    contract: "DealVault",
    address: await vault.getAddress(),
    settlementToken: settlementTokenAddress,
    payer: spec.payer.address,
    arbiter: spec.arbiter.address,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
