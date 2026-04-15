const hre = require("hardhat");

async function main() {
  const factory = await hre.ethers.getContractFactory("DealVaultFactory");
  const contract = await factory.deploy();
  const deploymentTx = contract.deploymentTransaction();

  await contract.waitForDeployment();

  console.log(
    JSON.stringify(
      {
        contract: "DealVaultFactory",
        address: await contract.getAddress(),
        transactionHash: deploymentTx ? deploymentTx.hash : null,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
