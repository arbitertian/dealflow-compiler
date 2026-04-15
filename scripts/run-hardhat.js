const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(projectRoot, "..");
const fallbackAppDataDir = path.join(workspaceRoot, ".appdata");
const fallbackLocalAppDataDir = path.join(workspaceRoot, ".localappdata");
const fallbackHardhatCacheDir = path.join(fallbackLocalAppDataDir, "hardhat-nodejs", "Cache", "compilers-v2");
const appDataDir = fs.existsSync(fallbackAppDataDir) ? fallbackAppDataDir : path.join(projectRoot, ".appdata");
const localAppDataDir = fs.existsSync(fallbackHardhatCacheDir)
  ? fallbackLocalAppDataDir
  : path.join(projectRoot, ".localappdata");
const hardhatCacheDir = path.join(localAppDataDir, "hardhat-nodejs", "Cache", "compilers-v2");

fs.mkdirSync(appDataDir, { recursive: true });
fs.mkdirSync(localAppDataDir, { recursive: true });

if (process.platform === "win32") {
  const nativeCompilerDir = path.join(hardhatCacheDir, "windows-amd64");
  if (fs.existsSync(nativeCompilerDir)) {
    for (const entry of fs.readdirSync(nativeCompilerDir)) {
      if (entry.endsWith(".exe")) {
        const markerPath = path.join(nativeCompilerDir, `${entry}.does.not.work`);
        if (!fs.existsSync(markerPath)) {
          fs.writeFileSync(markerPath, "");
        }
      }
    }
  }
}

const env = {
  ...process.env,
  APPDATA: appDataDir,
  HARDHAT_USE_SOLCJS: "true",
  LOCALAPPDATA: localAppDataDir,
};

const hardhatBin = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "hardhat.cmd" : "hardhat"
);

if (!fs.existsSync(hardhatBin)) {
  console.error(`Missing Hardhat runtime at ${hardhatBin}. Run 'npm install' in ${projectRoot} first.`);
  process.exit(1);
}

const result = spawnSync(hardhatBin, process.argv.slice(2), {
  cwd: projectRoot,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
