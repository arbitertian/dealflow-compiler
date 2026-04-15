#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const skillName = "dealflow-compiler";

function parseTarget(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--target") {
      return argv[index + 1];
    }
  }

  return null;
}

function copyRecursive(sourcePath, destinationPath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.mkdirSync(destinationPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath)) {
      copyRecursive(path.join(sourcePath, entry), path.join(destinationPath, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function main() {
  const targetOverride = parseTarget(process.argv.slice(2));
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const targetDir = targetOverride
    ? path.resolve(targetOverride)
    : path.join(codexHome, "skills", skillName);

  copyRecursive(projectRoot, targetDir);

  console.log(
    JSON.stringify(
      {
        ok: true,
        skill: skillName,
        sourceDir: projectRoot,
        targetDir,
      },
      null,
      2
    )
  );
}

main();
