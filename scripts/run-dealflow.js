#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function isStandaloneSkillRoot(candidate) {
  return [
    path.join(candidate, "package.json"),
    path.join(candidate, "scripts", "dealflow.js"),
    path.join(candidate, "lib", "dealflow.js"),
    path.join(candidate, "contracts", "DealVault.sol"),
    path.join(candidate, "contracts", "DealVaultFactory.sol"),
  ].every((filePath) => fs.existsSync(filePath));
}

function ensureRuntimeDependencies(skillRoot) {
  const requiredPackages = ["dotenv", "ethers"];
  for (const packageName of requiredPackages) {
    try {
      require.resolve(packageName, { paths: [skillRoot] });
    } catch {
      console.error(
        `Missing runtime dependency '${packageName}'. Run 'npm install' in ${skillRoot} before using this skill package.`
      );
      process.exit(1);
    }
  }
}

function main() {
  const skillRoot = path.resolve(__dirname, "..");
  if (!isStandaloneSkillRoot(skillRoot)) {
    console.error("Could not locate the standalone DealFlow skill root next to run-dealflow.js.");
    process.exit(1);
  }

  ensureRuntimeDependencies(skillRoot);

  const cliPath = path.join(skillRoot, "scripts", "dealflow.js");
  const result = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
    cwd: skillRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      DEALFLOW_SKILL_ROOT: skillRoot,
    },
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status === null ? 1 : result.status);
}

main();
