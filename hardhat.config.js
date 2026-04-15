require("@nomicfoundation/hardhat-ethers");
require("dotenv").config();

const networks = {
  hardhat: {},
};

if (process.env.XLAYER_RPC_URL) {
  networks.xlayer = {
    url: process.env.XLAYER_RPC_URL,
    chainId: Number(process.env.XLAYER_CHAIN_ID || 196),
    accounts: process.env.DEPLOYER_PRIVATE_KEY
      ? [process.env.DEPLOYER_PRIVATE_KEY]
      : [],
  };
}

/** @type {import("hardhat/config").HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks,
};
