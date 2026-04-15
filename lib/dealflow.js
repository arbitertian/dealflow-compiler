const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { ethers } = require("ethers");

const projectRoot = path.resolve(__dirname, "..");
const artifactPaths = {
  dealVault: path.join(projectRoot, "artifacts", "contracts", "DealVault.sol", "DealVault.json"),
  dealVaultFactory: path.join(projectRoot, "artifacts", "contracts", "DealVaultFactory.sol", "DealVaultFactory.json"),
};
const requiredProjectFiles = [
  "scripts/dealflow.js",
  "lib/dealflow.js",
  "contracts/DealVault.sol",
  "contracts/DealVaultFactory.sol",
  "package.json",
];
const repoSkillFiles = [
  "SKILL.md",
  "scripts/run-dealflow.js",
  "references/architecture.md",
  "references/deal-spec.md",
];
const canonicalEnvKeys = [
  "XLAYER_RPC_URL",
  "SETTLEMENT_TOKEN_ADDRESS",
  "DEAL_FACTORY_ADDRESS",
];
const recommendedEnvKeys = [
  "XLAYER_CHAIN_ID",
  "SETTLEMENT_TOKEN_SYMBOL",
  "SETTLEMENT_TOKEN_DECIMALS",
  "DEAL_PAYER_ADDRESS",
  "DEAL_ARBITER_ADDRESS",
];
let dealVaultArtifactCache = null;
let dealVaultFactoryArtifactCache = null;
let dealVaultInterfaceCache = null;
let dealVaultFactoryInterfaceCache = null;

const erc20Abi = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];
const swapNativeTokenAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const allowedDueModes = new Set(["immediate", "manual_confirmation", "deadline"]);
const normalizedRoleLabels = {
  creator: "creator",
  "\u521b\u4f5c\u8005": "creator",
  "\u5185\u5bb9\u521b\u4f5c\u8005": "creator",
  agency: "agency",
  "\u4ee3\u7406": "agency",
  ops: "ops",
  operation: "ops",
  operations: "ops",
  "\u8fd0\u8425": "ops",
  "\u8fd0\u8425\u65b9": "ops",
  client: "client",
  customer: "client",
  payer: "payer",
  "\u5ba2\u6237": "client",
};

function loadArtifact(artifactPath, label) {
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`${label} artifact is missing at ${artifactPath}. Run npm run compile first.`);
  }

  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

function getDealVaultArtifact() {
  if (!dealVaultArtifactCache) {
    dealVaultArtifactCache = loadArtifact(artifactPaths.dealVault, "DealVault");
  }

  return dealVaultArtifactCache;
}

function getDealVaultFactoryArtifact() {
  if (!dealVaultFactoryArtifactCache) {
    dealVaultFactoryArtifactCache = loadArtifact(artifactPaths.dealVaultFactory, "DealVaultFactory");
  }

  return dealVaultFactoryArtifactCache;
}

function getDealVaultInterface() {
  if (!dealVaultInterfaceCache) {
    dealVaultInterfaceCache = new ethers.Interface(getDealVaultArtifact().abi);
  }

  return dealVaultInterfaceCache;
}

function getDealVaultFactoryInterface() {
  if (!dealVaultFactoryInterfaceCache) {
    dealVaultFactoryInterfaceCache = new ethers.Interface(getDealVaultFactoryArtifact().abi);
  }

  return dealVaultFactoryInterfaceCache;
}

function onchainosBinary() {
  return process.platform === "win32" ? "onchainos.exe" : "onchainos";
}

function runOnchainos(args) {
  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/c", onchainosBinary(), ...args], {
      encoding: "utf8",
      shell: false,
    });
  }

  return spawnSync(onchainosBinary(), args, {
    encoding: "utf8",
    shell: false,
  });
}

function parseArgv(argv) {
  const parsed = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    const value = next && !next.startsWith("--") ? next : true;
    if (value !== true) {
      index += 1;
    }

    if (parsed[key] === undefined) {
      parsed[key] = value;
    } else if (Array.isArray(parsed[key])) {
      parsed[key].push(value);
    } else {
      parsed[key] = [parsed[key], value];
    }
  }

  return parsed;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(value, null, 2));
}

function projectFile(relativePath) {
  return path.join(projectRoot, relativePath);
}

function envValue(env, key) {
  const value = env[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function formatCheckStatus(status) {
  return status.toUpperCase().padEnd(4, " ");
}

function buildCheck(id, label, status, summary, options = {}) {
  return {
    id,
    label,
    status,
    summary,
    details: options.details || [],
    nextSteps: options.nextSteps || [],
    meta: options.meta || {},
  };
}

function findMissingFiles(relativePaths) {
  return relativePaths.filter((relativePath) => !fs.existsSync(projectFile(relativePath)));
}

function parseWalletAddressesPayload(stdout) {
  try {
    const payload = JSON.parse(stdout);
    const xlayerAddress = payload?.data?.xlayer?.[0]?.address;
    return xlayerAddress ? ethers.getAddress(xlayerAddress) : null;
  } catch {
    return null;
  }
}

function captureCommandFailure(result) {
  if (!result) {
    return "No command result was returned.";
  }

  if (result.error?.message) {
    return result.error.message;
  }

  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  return stderr || stdout || "Command exited unsuccessfully.";
}

function isPermissionRestrictedMessage(message) {
  return /EPERM|EACCES|permission|sandbox/i.test(String(message));
}

function renderCapabilityPrompt(capability, index) {
  return [
    `${index}. ${capability.title}`,
    `   你可以直接说：${capability.prompt}`,
  ].join("\n");
}

function buildEnvTemplate(env = process.env) {
  return [
    `XLAYER_RPC_URL=${envValue(env, "XLAYER_RPC_URL") || "https://rpc.xlayer.tech"}`,
    `XLAYER_CHAIN_ID=${envValue(env, "XLAYER_CHAIN_ID") || "196"}`,
    `SETTLEMENT_TOKEN_ADDRESS=${envValue(env, "SETTLEMENT_TOKEN_ADDRESS") || "<xlayer-usdc-address>"}`,
    `SETTLEMENT_TOKEN_SYMBOL=${envValue(env, "SETTLEMENT_TOKEN_SYMBOL") || "USDC"}`,
    `SETTLEMENT_TOKEN_DECIMALS=${envValue(env, "SETTLEMENT_TOKEN_DECIMALS") || "6"}`,
    `DEAL_FACTORY_ADDRESS=${envValue(env, "DEAL_FACTORY_ADDRESS") || "<deal-vault-factory-address>"}`,
    `DEAL_PAYER_ADDRESS=${envValue(env, "DEAL_PAYER_ADDRESS") || "<payer-address-or-leave-empty-if-wallet-default>"}`,
    `DEAL_ARBITER_ADDRESS=${envValue(env, "DEAL_ARBITER_ADDRESS") || "<arbiter-address-or-leave-empty-if-wallet-default>"}`,
    "DEPLOYER_PRIVATE_KEY=<optional-local-executor-only>",
  ];
}

function buildCapabilitiesCatalog(context = {}) {
  const compilePreviewEnabled = Boolean(context.workspaceReady && context.roleSourceReady);
  const normalizeEnabled = Boolean(
    context.workspaceReady &&
    context.settlementReady &&
    context.onchainosReady &&
    context.walletReady
  );
  const walletFlowEnabled = Boolean(
    context.workspaceReady &&
    context.artifactsReady &&
    context.settlementReady &&
    context.factoryReady &&
    context.onchainosReady &&
    context.walletReady &&
    context.roleSourceReady
  );
  const reportEnabled = Boolean(context.workspaceReady && context.artifactsReady && context.rpcReady);

  return [
    {
      id: "compile_preview",
      title: "把聊天条款编译成 Deal Card 并预览执行流",
      enabled: compilePreviewEnabled,
      prompt:
        "把这段合作条款 compile 成 deal 并 preview：客户预算 100 USDC，创作者/代理/运营按 70/20/10 分账，先付 40，交付后付 50，保留 10 做储备金，最终交付逾期罚 20%。",
      blockedBy: compilePreviewEnabled ? [] : ["需要先配置 payer/arbiter 地址来源，或登录 Agentic Wallet。"],
    },
    {
      id: "normalize",
      title: "把非 USDC 资产先换成结算币再入金",
      enabled: normalizeEnabled,
      prompt:
        "先把 payer 的 OKB 通过 OnchainOS DEX 换成 USDC，再给这个 deal 做入金计划。",
      blockedBy: normalizeEnabled ? [] : ["需要 OnchainOS CLI、Agentic Wallet 会话和 settlement token 配置。"],
    },
    {
      id: "deploy",
      title: "把 DealVault 部署到 X Layer 并返回 vault 地址与 tx",
      enabled: walletFlowEnabled,
      prompt:
        "把这份 deal 部署到 X Layer，走 Agentic Wallet，并把 vault 地址和交易哈希返回给我。",
      blockedBy: walletFlowEnabled ? [] : ["需要工厂地址、编译 artifacts、钱包登录和链上配置都准备好。"],
    },
    {
      id: "fund",
      title: "给 vault 入金并展示真实 tx",
      enabled: walletFlowEnabled,
      prompt:
        "用 Agentic Wallet 给这个 vault 入金 100 USDC，并把 approve 和 fund 的 tx 都展示出来。",
      blockedBy: walletFlowEnabled ? [] : ["需要完整的钱包执行环境和 settlement token 配置。"],
    },
    {
      id: "release_penalty",
      title: "释放里程碑并自动触发分账 / 逾期罚则",
      enabled: walletFlowEnabled,
      prompt:
        "释放第一个里程碑；然后释放最终里程碑，如果逾期就按 20% 罚则执行退款和分账。",
      blockedBy: walletFlowEnabled ? [] : ["需要 vault 已部署且钱包执行链路可用。"],
    },
    {
      id: "close",
      title: "结案并释放储备金",
      enabled: walletFlowEnabled,
      prompt:
        "把这个 deal close 掉，释放储备金，并告诉我最终余额是否归零。",
      blockedBy: walletFlowEnabled ? [] : ["需要 vault 已部署且钱包执行链路可用。"],
    },
    {
      id: "report",
      title: "读取 vault 审计报告，汇总地址、tx、事件和余额",
      enabled: reportEnabled,
      prompt:
        "读取这个 vault 的审计报告，把地址、交易哈希、事件、当前余额和分账结果整理出来。",
      blockedBy: reportEnabled ? [] : ["需要 XLAYER_RPC_URL 和已编译 artifacts 才能解码链上报告。"],
    },
  ];
}

function renderCapabilitiesMenu(report, options = {}) {
  const catalog = report.capabilities || buildCapabilitiesCatalog();
  const enabledOnly = Boolean(options.enabledOnly);
  const enabledItems = catalog.filter((capability) => capability.enabled);
  const blockedItems = catalog.filter((capability) => !capability.enabled);
  const lines = [];

  if (enabledItems.length !== 0) {
    lines.push("可直接调用的自然语言能力：");
    enabledItems.forEach((capability, index) => {
      lines.push(renderCapabilityPrompt(capability, index + 1));
    });
  }

  if (!enabledOnly && blockedItems.length !== 0) {
    lines.push("待解锁能力：");
    blockedItems.forEach((capability) => {
      lines.push(`- ${capability.title}: ${capability.blockedBy.join(" ")}`);
    });
  }

  return lines.join("\n");
}

async function buildPreflightReport(options = {}) {
  const env = options.env || process.env;
  const commandRunner = options.commandRunner || runOnchainos;
  const providerFactory = options.providerFactory || ((rpcUrl) => new ethers.JsonRpcProvider(rpcUrl));
  const expectedChainId = Number(options.chainId || envValue(env, "XLAYER_CHAIN_ID") || 196);
  const envFilePath = options.envFilePath || projectFile(".env");
  const skillInstallPath = options.skillInstallPath || path.join(os.homedir(), ".codex", "skills", "dealflow-compiler", "SKILL.md");
  const checks = [];

  const missingWorkspaceFiles = findMissingFiles(requiredProjectFiles);
  checks.push(
    missingWorkspaceFiles.length === 0
      ? buildCheck("workspace", "Project workspace", "pass", "DealFlow 核心项目文件齐全。")
      : buildCheck("workspace", "Project workspace", "fail", "当前工作区缺少 DealFlow 核心文件。", {
          details: missingWorkspaceFiles.map((filePath) => `缺少 ${filePath}`),
          nextSteps: ["切到 DealFlow Compiler 项目根目录后再运行。"],
        })
  );

  const missingRepoSkillFiles = findMissingFiles(repoSkillFiles);
  checks.push(
    missingRepoSkillFiles.length === 0
      ? buildCheck("repo_skill", "Repo skill package", "pass", "Repo 内 skill 包完整。")
      : buildCheck("repo_skill", "Repo skill package", "fail", "Repo 内 skill 定义不完整。", {
          details: missingRepoSkillFiles.map((filePath) => `缺少 ${filePath}`),
          nextSteps: ["恢复当前 skill 包目录中的核心文件后再安装。"],
        })
  );

  const missingArtifacts = Object.values(artifactPaths).filter((artifactPath) => !fs.existsSync(artifactPath));
  checks.push(
    missingArtifacts.length === 0
      ? buildCheck("artifacts", "Compiled artifacts", "pass", "合约 artifacts 已就绪。")
      : buildCheck("artifacts", "Compiled artifacts", "fail", "缺少编译产物，链上执行与报告无法解码。", {
          details: missingArtifacts.map((artifactPath) => `缺少 ${path.relative(projectRoot, artifactPath)}`),
          nextSteps: ["运行 npm run compile 生成最新 artifacts。"],
        })
  );

  const envFileExists = fs.existsSync(envFilePath);
  const envSourceSummary = envFileExists
    ? "已找到项目 .env 文件。"
    : "未找到项目 .env 文件，当前将依赖 shell 环境变量。";
  checks.push(
    buildCheck("env_file", "Environment file", envFileExists ? "pass" : "warn", envSourceSummary, {
      nextSteps: envFileExists ? [] : ["在项目根目录创建 .env，或先把所需变量注入当前 shell。"],
    })
  );

  const missingCanonicalEnvKeys = canonicalEnvKeys.filter((key) => !envValue(env, key));
  const missingRecommendedEnvKeys = recommendedEnvKeys.filter((key) => !envValue(env, key));
  checks.push(
    missingCanonicalEnvKeys.length === 0
      ? buildCheck("env_required", "Canonical .env config", missingRecommendedEnvKeys.length === 0 ? "pass" : "warn", "关键链上配置已准备好。", {
          details: missingRecommendedEnvKeys.map((key) => `推荐补充 ${key}`),
          nextSteps: missingRecommendedEnvKeys.length === 0 ? [] : ["补齐推荐变量可减少命令参数输入。"],
          meta: {
            missingCanonicalEnvKeys,
            missingRecommendedEnvKeys,
          },
        })
      : buildCheck("env_required", "Canonical .env config", "fail", "缺少关键 .env 变量，无法跑完整链上演示。", {
          details: missingCanonicalEnvKeys.map((key) => `缺少 ${key}`),
          nextSteps: ["把缺失变量补进 .env，然后重新运行 preflight。"],
          meta: {
            missingCanonicalEnvKeys,
            missingRecommendedEnvKeys,
          },
        })
  );

  const onchainosHelp = commandRunner(["wallet", "--help"]);
  const onchainosHelpMessage = captureCommandFailure(onchainosHelp);
  const onchainosBlockedByRuntime = isPermissionRestrictedMessage(onchainosHelpMessage);
  const onchainosCliReady = onchainosHelp && onchainosHelp.status === 0;
  checks.push(
    onchainosCliReady
      ? buildCheck("onchainos_cli", "OnchainOS CLI", "pass", "OnchainOS CLI 可调用。")
      : buildCheck(
          "onchainos_cli",
          "OnchainOS CLI",
          onchainosBlockedByRuntime ? "warn" : "fail",
          onchainosBlockedByRuntime ? "当前运行环境限制了 OnchainOS CLI 自检。" : "未检测到可用的 OnchainOS CLI。",
          {
            details: [onchainosHelpMessage],
            nextSteps: onchainosBlockedByRuntime
              ? ["请在本机终端直接运行 node scripts/run-dealflow.js preflight 复查真实状态。"]
              : ["安装并确保 onchainos 在 PATH 中可执行，再运行 onchainos wallet --help 验证。"],
          }
        )
  );

  let walletAddress = null;
  let walletStatus = onchainosBlockedByRuntime ? "warn" : "fail";
  let walletSummary = "未检测到 Agentic Wallet 的 X Layer 地址。";
  let walletDetails = [];
  if (onchainosCliReady) {
    const walletAddresses = commandRunner(["wallet", "addresses"]);
    walletAddress = walletAddresses && walletAddresses.status === 0
      ? parseWalletAddressesPayload(walletAddresses.stdout || "")
      : null;
    if (walletAddress) {
      walletStatus = "pass";
      walletSummary = `Agentic Wallet 已登录，默认 X Layer 地址为 ${walletAddress}。`;
    } else {
      walletDetails = [captureCommandFailure(walletAddresses)];
      walletSummary = "OnchainOS CLI 已安装，但 Agentic Wallet 尚未登录或没有 X Layer 地址。";
    }
  } else if (onchainosBlockedByRuntime) {
    walletSummary = "当前运行环境限制了 Agentic Wallet 会话探测。";
    walletDetails = [onchainosHelpMessage];
  }
  checks.push(
    buildCheck("wallet_session", "Agentic Wallet session", walletStatus, walletSummary, {
      details: walletDetails,
      nextSteps: walletStatus === "pass" ? [] : ["运行 onchainos wallet login 并完成邮箱验证码登录。"],
      meta: {
        walletAddress,
      },
    })
  );

  const roleSourceReady = Boolean(
    walletAddress ||
    (envValue(env, "DEAL_PAYER_ADDRESS") && envValue(env, "DEAL_ARBITER_ADDRESS"))
  );
  checks.push(
    roleSourceReady
      ? buildCheck("role_config", "Payer / arbiter source", "pass", "payer / arbiter 地址来源可用。", {
          details: walletAddress
            ? [`将默认使用 Agentic Wallet 地址 ${walletAddress}，也可以通过 .env 覆盖。`]
            : ["当前会优先使用 .env 中的 DEAL_PAYER_ADDRESS / DEAL_ARBITER_ADDRESS。"],
        })
      : buildCheck("role_config", "Payer / arbiter source", "fail", "缺少 payer / arbiter 地址来源。", {
          nextSteps: [
            "登录 Agentic Wallet，或在 .env 中补上 DEAL_PAYER_ADDRESS 和 DEAL_ARBITER_ADDRESS。",
          ],
        })
  );

  const settlementAddress = envValue(env, "SETTLEMENT_TOKEN_ADDRESS");
  const settlementReady = Boolean(settlementAddress);
  checks.push(
    settlementReady
      ? buildCheck("settlement", "Settlement token", "pass", `结算币已配置为 ${settlementAddress}。`, {
          details: [
            `symbol=${envValue(env, "SETTLEMENT_TOKEN_SYMBOL") || "USDC (default)"}`,
            `decimals=${envValue(env, "SETTLEMENT_TOKEN_DECIMALS") || "6 (default)"}`,
          ],
        })
      : buildCheck("settlement", "Settlement token", "fail", "缺少 SETTLEMENT_TOKEN_ADDRESS。", {
          nextSteps: ["在 .env 中设置 X Layer 上的结算币地址，例如 USDC。"],
        })
  );

  const factoryAddress = envValue(env, "DEAL_FACTORY_ADDRESS");
  checks.push(
    factoryAddress
      ? buildCheck("factory", "DealVaultFactory", "pass", `已配置 DealVaultFactory: ${factoryAddress}`)
      : buildCheck("factory", "DealVaultFactory", "fail", "缺少 DEAL_FACTORY_ADDRESS，无法走官方钱包 deploy 主路径。", {
          nextSteps: ["先部署工厂，然后把地址写入 .env 中的 DEAL_FACTORY_ADDRESS。"],
        })
  );

  const rpcUrl = envValue(env, "XLAYER_RPC_URL");
  let rpcCheck = buildCheck("rpc", "X Layer RPC", "fail", "缺少 XLAYER_RPC_URL，无法读取链上报告。", {
    nextSteps: ["在 .env 中设置 XLAYER_RPC_URL。"],
  });
  if (rpcUrl) {
    try {
      const provider = await providerFactory(rpcUrl);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      rpcCheck = chainId === expectedChainId
        ? buildCheck("rpc", "X Layer RPC", "pass", `RPC 已连通，chainId=${chainId}。`)
        : buildCheck("rpc", "X Layer RPC", "fail", `RPC chainId=${chainId}，期望 ${expectedChainId}。`, {
            nextSteps: ["检查 XLAYER_RPC_URL 是否指向 X Layer 主网。"],
          });
    } catch (error) {
      const restricted = isPermissionRestrictedMessage(error.message);
      rpcCheck = buildCheck(
        "rpc",
        "X Layer RPC",
        restricted ? "warn" : "fail",
        restricted ? "当前运行环境限制了 RPC 连通性探测。" : "RPC 可读性检查失败。",
        {
          details: [error.message],
          nextSteps: restricted
            ? ["请在本机终端直接运行 node scripts/run-dealflow.js preflight 或 report 复查。"]
            : ["确认 RPC 地址可访问，或稍后重试。"],
        }
      );
    }
  }
  checks.push(rpcCheck);

  const installedSkillReady = fs.existsSync(skillInstallPath);
  checks.push(
    installedSkillReady
      ? buildCheck("skill_install", "Installed skill mirror", "pass", `已安装到 ${skillInstallPath}`)
      : buildCheck("skill_install", "Installed skill mirror", "warn", "尚未安装到 ~/.codex/skills，Codex 自动发现可能不可用。", {
          nextSteps: ["运行 node scripts/install-skill.js 把当前 skill 包镜像到 ~/.codex/skills。"],
        })
  );

  const context = {
    workspaceReady: missingWorkspaceFiles.length === 0,
    repoSkillReady: missingRepoSkillFiles.length === 0,
    artifactsReady: missingArtifacts.length === 0,
    roleSourceReady,
    settlementReady,
    factoryReady: Boolean(factoryAddress),
    onchainosReady: onchainosCliReady,
    walletReady: Boolean(walletAddress),
    rpcReady: rpcCheck.status === "pass",
  };
  const capabilities = buildCapabilitiesCatalog(context);

  return {
    projectRoot,
    envFilePath,
    skillInstallPath,
    checks,
    summary: {
      readyForCompilePreview: capabilities.some((capability) => capability.id === "compile_preview" && capability.enabled),
      readyForWalletDemo: capabilities
        .filter((capability) => ["deploy", "fund", "release_penalty", "close"].includes(capability.id))
        .every((capability) => capability.enabled),
      readyForAudit: capabilities.some((capability) => capability.id === "report" && capability.enabled),
      readyForReusableSkill: context.workspaceReady && context.repoSkillReady && context.artifactsReady && context.onchainosReady && context.walletReady && context.roleSourceReady && context.settlementReady && context.factoryReady && context.rpcReady,
      walletAddress,
      missingCanonicalEnvKeys,
      missingRecommendedEnvKeys,
    },
    capabilities,
    envTemplate: buildEnvTemplate(env),
  };
}

function renderPreflightReport(report) {
  const lines = [
    "DealFlow Preflight",
    `Project root: ${report.projectRoot}`,
    `Compile / Preview: ${report.summary.readyForCompilePreview ? "ready" : "not ready"}`,
    `Wallet demo: ${report.summary.readyForWalletDemo ? "ready" : "not ready"}`,
    `Audit report: ${report.summary.readyForAudit ? "ready" : "not ready"}`,
    `Reusable agent skill: ${report.summary.readyForReusableSkill ? "ready" : "not ready"}`,
    "Checks:",
  ];

  for (const check of report.checks) {
    lines.push(`- [${formatCheckStatus(check.status)}] ${check.label}: ${check.summary}`);
    for (const detail of check.details) {
      lines.push(`  * ${detail}`);
    }
  }

  if (report.summary.readyForReusableSkill) {
    lines.push(renderCapabilitiesMenu(report, { enabledOnly: true }));
  } else {
    lines.push("运行 node scripts/run-dealflow.js doctor 获取修复引导。");
  }

  return lines.join("\n");
}

function renderDoctorGuide(report) {
  const blockingChecks = report.checks.filter((check) => check.status === "fail");
  const warningChecks = report.checks.filter((check) => check.status === "warn");
  const lines = [
    "DealFlow Doctor",
    report.summary.readyForReusableSkill
      ? "环境已经达到可复用 agent skill 标准。"
      : "还有配置缺口，下面按优先级给你修复路径。",
  ];

  if (blockingChecks.length !== 0) {
    lines.push("优先修这些阻塞项：");
    for (const check of blockingChecks) {
      lines.push(`- ${check.label}: ${check.summary}`);
      for (const step of check.nextSteps) {
        lines.push(`  下一步：${step}`);
      }
    }
  }

  if (warningChecks.length !== 0) {
    lines.push("建议顺手补齐的项：");
    for (const check of warningChecks) {
      lines.push(`- ${check.label}: ${check.summary}`);
      for (const step of check.nextSteps) {
        lines.push(`  建议：${step}`);
      }
    }
  }

  lines.push("推荐 .env 模板：");
  for (const line of report.envTemplate) {
    lines.push(line);
  }

  lines.push("检查完成后，重新运行：");
  lines.push("node scripts/run-dealflow.js preflight");

  if (report.summary.readyForReusableSkill) {
    lines.push(renderCapabilitiesMenu(report, { enabledOnly: true }));
  } else {
    lines.push(renderCapabilitiesMenu(report));
  }

  return lines.join("\n");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNormalizedSpecNumber(value, label) {
  try {
    return normalizeNumberString(value);
  } catch (error) {
    throw new Error(`${label} must be numeric.`);
  }
}

function validateDealSpec(spec) {
  const errors = [];

  if (!isPlainObject(spec)) {
    return ["DealSpec must be a JSON object."];
  }

  const requiredFields = [
    "settlementToken",
    "budget",
    "payer",
    "arbiter",
    "payees",
    "milestones",
    "reserveAmount",
    "latePenaltyBps",
  ];

  for (const field of requiredFields) {
    if (spec[field] === undefined) {
      errors.push(`DealSpec is missing required field '${field}'.`);
    }
  }

  if (errors.length !== 0) {
    return errors;
  }

  if (typeof spec.settlementToken !== "string" || spec.settlementToken.trim() === "") {
    errors.push("settlementToken must be a non-empty string.");
  }

  if (!isPlainObject(spec.payer)) {
    errors.push("payer must be an object.");
  } else if (!spec.payer.address || !ethers.isAddress(spec.payer.address)) {
    errors.push("payer.address must be a valid EVM address.");
  }

  if (!isPlainObject(spec.arbiter)) {
    errors.push("arbiter must be an object.");
  } else if (!spec.arbiter.address || !ethers.isAddress(spec.arbiter.address)) {
    errors.push("arbiter.address must be a valid EVM address.");
  }

  let budgetUnits = null;
  let reserveUnits = null;
  try {
    budgetUnits = decimal(asNormalizedSpecNumber(spec.budget, "budget"));
  } catch (error) {
    errors.push(error.message);
  }
  try {
    reserveUnits = decimal(asNormalizedSpecNumber(spec.reserveAmount, "reserveAmount"));
  } catch (error) {
    errors.push(error.message);
  }

  if (budgetUnits !== null && budgetUnits <= 0n) {
    errors.push("budget must be greater than zero.");
  }
  if (reserveUnits !== null && reserveUnits < 0n) {
    errors.push("reserveAmount cannot be negative.");
  }

  if (!Array.isArray(spec.payees) || spec.payees.length === 0) {
    errors.push("payees must be a non-empty array.");
  } else if (spec.payees.length > 3) {
    errors.push("payees cannot contain more than 3 entries in the MVP.");
  } else {
    let bpsTotal = 0;
    for (const [index, payee] of spec.payees.entries()) {
      const label = `payees[${index}]`;
      if (!isPlainObject(payee)) {
        errors.push(`${label} must be an object.`);
        continue;
      }
      if (typeof payee.role !== "string" || payee.role.trim() === "") {
        errors.push(`${label}.role must be a non-empty string.`);
      }
      if (!payee.address || !ethers.isAddress(payee.address)) {
        errors.push(`${label}.address must be a valid EVM address.`);
      }
      if (!Number.isInteger(payee.bps)) {
        errors.push(`${label}.bps must be an integer.`);
      } else {
        bpsTotal += payee.bps;
      }
    }
    if (bpsTotal !== 10_000) {
      errors.push("payees bps must sum to 10000.");
    }
  }

  let milestoneTotal = 0n;
  if (!Array.isArray(spec.milestones) || spec.milestones.length === 0) {
    errors.push("milestones must be a non-empty array.");
  } else if (spec.milestones.length > 3) {
    errors.push("milestones cannot contain more than 3 entries in the MVP.");
  } else {
    for (const [index, milestone] of spec.milestones.entries()) {
      const label = `milestones[${index}]`;
      if (!isPlainObject(milestone)) {
        errors.push(`${label} must be an object.`);
        continue;
      }
      if (typeof milestone.name !== "string" || milestone.name.trim() === "") {
        errors.push(`${label}.name must be a non-empty string.`);
      }
      try {
        const amountUnits = decimal(asNormalizedSpecNumber(milestone.amount, `${label}.amount`));
        if (amountUnits <= 0n) {
          errors.push(`${label}.amount must be greater than zero.`);
        }
        milestoneTotal += amountUnits;
      } catch (error) {
        errors.push(error.message);
      }
      if (!allowedDueModes.has(milestone.dueMode)) {
        errors.push(`${label}.dueMode must be one of: ${Array.from(allowedDueModes).join(", ")}.`);
      }
      if (milestone.dueAt !== undefined) {
        const dueAt = Number(milestone.dueAt);
        if (!Number.isInteger(dueAt) || dueAt < 0) {
          errors.push(`${label}.dueAt must be a non-negative integer timestamp.`);
        }
      }
    }
  }

  if (!Number.isInteger(spec.latePenaltyBps)) {
    errors.push("latePenaltyBps must be an integer.");
  } else if (spec.latePenaltyBps < 0 || spec.latePenaltyBps > 10_000) {
    errors.push("latePenaltyBps must be between 0 and 10000.");
  }

  if (budgetUnits !== null && reserveUnits !== null && milestoneTotal + reserveUnits !== budgetUnits) {
    errors.push("budget must equal total milestone amounts plus reserveAmount.");
  }

  return errors;
}

function renderValidationSummary(spec) {
  const milestoneTotal = spec.milestones.reduce((sum, milestone) => {
    return sum + decimal(milestone.amount);
  }, 0n);

  return [
    "DealSpec OK",
    `  token: ${spec.settlementToken}`,
    `  budget: ${spec.budget}`,
    `  milestones total: ${decimalToString(milestoneTotal)}`,
    `  reserve: ${spec.reserveAmount}`,
    `  payees: ${spec.payees.map((payee) => `${payee.role}=${payee.bps}`).join(", ")}`,
    `  late penalty bps: ${spec.latePenaltyBps}`,
  ].join("\n");
}

function assertValidDealSpec(spec) {
  const errors = validateDealSpec(spec);
  if (errors.length !== 0) {
    throw new Error(errors.join("\n"));
  }

  return spec;
}

function normalizeNumberString(value) {
  const normalized = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }

  if (!normalized.includes(".")) {
    return normalized;
  }

  return normalized.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

function decimal(value) {
  return ethers.parseUnits(normalizeNumberString(value), 18);
}

function decimalToString(value) {
  return normalizeNumberString(ethers.formatUnits(value, 18));
}

function bpsToPercentString(bps) {
  return decimalToString((BigInt(bps) * 10n ** 18n) / 100n);
}

function normalizeRole(label) {
  const normalized = String(label).trim().toLowerCase();
  return normalizedRoleLabels[normalized] || normalized.replace(/\s+/g, "_");
}

function readTerms(args) {
  if (args.terms && args.terms !== true) {
    return String(args.terms);
  }

  if (args.in && args.in !== true) {
    return fs.readFileSync(path.resolve(String(args.in)), "utf8");
  }

  if (args._.length !== 0) {
    return args._.join(" ");
  }

  throw new Error("Compile requires --terms, --in, or trailing free-form deal text.");
}

function extractMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match;
    }
  }

  return null;
}

function parseBudget(text) {
  const match = extractMatch(text, [
    /\u9884\u7b97\s*(\d+(?:\.\d+)?)\s*([A-Za-z]+)/u,
    /budget\s*(\d+(?:\.\d+)?)\s*([A-Za-z]+)/iu,
  ]);

  if (!match) {
    return null;
  }

  return {
    amount: normalizeNumberString(match[1]),
    token: match[2].toUpperCase(),
  };
}

function parseReserve(text) {
  const match = extractMatch(text, [
    /\u4fdd\u7559\s*(\d+(?:\.\d+)?)\s*(?:\u505a)?\s*(?:\u50a8\u5907\u91d1|\u98ce\u9669\u50a8\u5907)?/u,
    /reserve\s*(\d+(?:\.\d+)?)/iu,
  ]);

  return match ? normalizeNumberString(match[1]) : null;
}

function parseLatePenaltyBps(text) {
  const match = extractMatch(text, [
    /\u903e\u671f\u7f5a\s*(\d+(?:\.\d+)?)%/u,
    /late\s+penalty\s*(\d+(?:\.\d+)?)%/iu,
    /penalty\s*(\d+(?:\.\d+)?)%/iu,
  ]);

  if (!match) {
    return 0;
  }

  return Number.parseInt(match[1], 10) * 100;
}

function parseSplit(text) {
  const match = extractMatch(text, [
    /([\p{L}\s/,\u3001\uff0c]+?)\s*\u6309\s*(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)+)\s*\u5206\u8d26/iu,
    /([\p{L}\s/,\u3001\uff0c]+?)\s*split\s*(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)+)/iu,
  ]);

  if (!match) {
    return null;
  }

  const roleSource = match[1]
    .split(/[\u3002\uff0c,\uff1b;:\uff1a]/u)
    .pop()
    .replace(/\d.*$/u, "")
    .trim();
  const roles = roleSource
    .split(/[\/,\u3001\uff0c]/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeRole);
  const ratios = match[2]
    .split("/")
    .map((item) => normalizeNumberString(item.trim()));

  if (roles.length !== ratios.length) {
    throw new Error("Split roles and ratio count do not match.");
  }

  const total = ratios.reduce((sum, item) => sum + Number.parseFloat(item), 0);
  if (Math.abs(total - 100) > 0.0001) {
    throw new Error("Split ratios must sum to 100.");
  }

  return {
    roles,
    bps: ratios.map((item) => Math.round(Number.parseFloat(item) * 100)),
  };
}

function parseMilestones(text) {
  const patterns = [
    {
      name: "advance",
      dueMode: "immediate",
      regexes: [
        /\u5148\u4ed8\s*(\d+(?:\.\d+)?)/u,
        /\u9884\u4ed8\u6b3e?\s*(\d+(?:\.\d+)?)/u,
        /advance(?:\s+payment)?\s*(\d+(?:\.\d+)?)/iu,
        /pay\s*(\d+(?:\.\d+)?)\s*upfront/iu,
      ],
    },
    {
      name: "final_delivery",
      dueMode: "manual_confirmation",
      regexes: [
        /\u6700\u7ec8\u4ea4\u4ed8\u540e(?:\u518d)?\u4ed8\s*(\d+(?:\.\d+)?)/u,
        /\u4ea4\u4ed8\u540e(?:\u518d)?\u4ed8\s*(\d+(?:\.\d+)?)/u,
        /final(?:\s+delivery)?(?:.*?)(\d+(?:\.\d+)?)/iu,
        /after\s+delivery(?:.*?)(\d+(?:\.\d+)?)/iu,
      ],
    },
  ];

  const milestones = [];
  for (const pattern of patterns) {
    const match = extractMatch(text, pattern.regexes);
    if (match) {
      milestones.push({
        name: pattern.name,
        amount: normalizeNumberString(match[1]),
        dueMode: pattern.dueMode,
      });
    }
  }

  return milestones;
}

function parsePayeeOverrides(rawValue) {
  const values = rawValue === undefined ? [] : Array.isArray(rawValue) ? rawValue : [rawValue];
  const parsed = {};

  for (const value of values) {
    const [rawRole, rawAddress] = String(value).split("=");
    if (!rawRole || !rawAddress) {
      throw new Error(`Invalid --payee override: ${value}`);
    }

    parsed[normalizeRole(rawRole)] = ethers.getAddress(rawAddress.trim());
  }

  return parsed;
}

function getWalletDefaultAddress() {
  const result = runOnchainos(["wallet", "addresses"]);

  if (result.status !== 0) {
    return null;
  }

  return parseWalletAddressesPayload(result.stdout || "");
}

function resolveRoleAddress(role, overrides, defaultWalletAddress, warnings) {
  if (overrides[role]) {
    return overrides[role];
  }

  const envKey = `DEAL_${role.toUpperCase()}_ADDRESS`;
  if (process.env[envKey]) {
    return ethers.getAddress(process.env[envKey]);
  }

  if (defaultWalletAddress) {
    warnings.push(`No address configured for role '${role}', defaulted to wallet address ${defaultWalletAddress}.`);
    return defaultWalletAddress;
  }

  throw new Error(`Missing address for role '${role}'. Pass --payee ${role}=0x... or set ${envKey}.`);
}

function buildDealSpec({
  terms,
  payerAddress,
  arbiterAddress,
  payeeOverrides = {},
  defaultWalletAddress = null,
}) {
  const sourceText = String(terms).replace(/\s+/g, " ").trim();
  const warnings = [];
  const budget = parseBudget(sourceText);
  const parsedSplit = parseSplit(sourceText);
  const split = parsedSplit || {
    roles: ["creator"],
    bps: [10_000],
  };
  if (!parsedSplit) {
    warnings.push("No split phrase found. Defaulted to a single 'creator' payee with 100%.");
  }

  const milestones = parseMilestones(sourceText);
  if (milestones.length === 0) {
    throw new Error("Could not parse any milestone payments from the deal terms.");
  }

  const milestoneTotal = milestones
    .reduce((sum, milestone) => sum + decimal(milestone.amount), 0n);

  let reserveAmount = parseReserve(sourceText);
  if (!reserveAmount && budget) {
    const derivedReserve = decimal(budget.amount) - milestoneTotal;
    if (derivedReserve <= 0n) {
      throw new Error("Reserve amount is missing and could not be derived from the budget.");
    }
    reserveAmount = decimalToString(derivedReserve);
    warnings.push(`Reserve amount was not explicit. Derived reserve=${reserveAmount} from budget minus milestones.`);
  }
  if (!reserveAmount) {
    throw new Error("Could not parse a reserve amount from the deal terms.");
  }

  const reserveUnits = decimal(reserveAmount);
  const expectedBudget = decimalToString(milestoneTotal + reserveUnits);
  if (budget && normalizeNumberString(budget.amount) !== expectedBudget) {
    throw new Error(
      `Budget mismatch: milestones + reserve = ${expectedBudget}, but parsed budget = ${budget.amount}.`
    );
  }

  const walletAddress = defaultWalletAddress || getWalletDefaultAddress();
  const payer = payerAddress
    ? ethers.getAddress(payerAddress)
    : process.env.DEAL_PAYER_ADDRESS
      ? ethers.getAddress(process.env.DEAL_PAYER_ADDRESS)
    : walletAddress;
  const arbiter = arbiterAddress
    ? ethers.getAddress(arbiterAddress)
    : process.env.DEAL_ARBITER_ADDRESS
      ? ethers.getAddress(process.env.DEAL_ARBITER_ADDRESS)
    : walletAddress;

  if (!payer || !arbiter) {
    throw new Error("Payer and arbiter addresses are required. Pass --payer/--arbiter or log into Agentic Wallet.");
  }

  const payees = split.roles.map((role, index) => ({
    role,
    address: resolveRoleAddress(role, payeeOverrides, walletAddress, warnings),
    bps: split.bps[index],
  }));

  const latePenaltyBps = parseLatePenaltyBps(sourceText);
  if (latePenaltyBps !== 0 && !milestones.some((milestone) => milestone.dueAt)) {
    milestones.forEach((milestone, index) => {
      if (index === milestones.length - 1 && milestone.dueMode === "manual_confirmation") {
        milestone.dueAt = Math.floor(Date.now() / 1000) - 60;
      }
    });
    warnings.push("No explicit deadline found. Final milestone dueAt was set in the past so the demo can exercise the penalty path.");
  }

  return {
    settlementToken: budget?.token || process.env.SETTLEMENT_TOKEN_SYMBOL || "USDC",
    budget: expectedBudget,
    payer: { address: payer },
    arbiter: { address: arbiter },
    payees,
    milestones,
    reserveAmount,
    latePenaltyBps,
    meta: {
      sourceTerms: sourceText,
      warnings,
    },
  };
}

function formatMilestonePreview(spec, milestone, index) {
  const gross = decimal(milestone.amount);
  const penalty = milestone.name === "advance"
    ? 0n
    : (gross * BigInt(spec.latePenaltyBps || 0)) / 10_000n;
  const distributable = gross - penalty;

  const lines = [
    `Milestone ${index + 1}: ${milestone.name}`,
    `  gross: ${milestone.amount} ${spec.settlementToken}`,
    `  due mode: ${milestone.dueMode}`,
  ];

  if (milestone.dueAt) {
    lines.push(`  due at: ${milestone.dueAt}`);
  }

  if (penalty !== 0n) {
    lines.push(`  late penalty: ${decimalToString(penalty)} ${spec.settlementToken}`);
  }

  lines.push(`  distributable: ${decimalToString(distributable)} ${spec.settlementToken}`);
  for (const payee of spec.payees) {
    const payout = decimalToString((distributable * BigInt(payee.bps)) / 10_000n);
    lines.push(`  - ${payee.role}: ${payout} ${spec.settlementToken} (${bpsToPercentString(payee.bps)}%)`);
  }

  return lines.join("\n");
}

function previewDealSpec(spec) {
  const hasFactoryAddress = Boolean(process.env.DEAL_FACTORY_ADDRESS);
  const lines = [
    "DealFlow Preview",
    `Token: ${spec.settlementToken}`,
    `Budget: ${spec.budget} ${spec.settlementToken}`,
    `Payer: ${spec.payer.address}`,
    `Arbiter: ${spec.arbiter.address}`,
    `Reserve: ${spec.reserveAmount} ${spec.settlementToken}`,
    `Late penalty: ${bpsToPercentString(spec.latePenaltyBps || 0)}%`,
    "Payees:",
  ];

  for (const payee of spec.payees) {
    lines.push(`- ${payee.role}: ${payee.address} (${bpsToPercentString(payee.bps)}%)`);
  }

  lines.push("Milestones:");
  spec.milestones.forEach((milestone, index) => {
    lines.push(formatMilestonePreview(spec, milestone, index));
  });

  lines.push("Recommended CLI flow:");
  lines.push("0. Optional: node scripts/run-dealflow.js normalize --from-token <asset> --amount <readable> --wallet <payer>");
  if (!hasFactoryAddress) {
    lines.push("0b. Deploy DealVaultFactory once and export DEAL_FACTORY_ADDRESS before wallet-based deploys.");
  }
  lines.push("1. node scripts/run-dealflow.js deploy --deal <deal.json> --executor wallet");
  lines.push("2. node scripts/run-dealflow.js fund --deal <deal.json> --vault <vault> --executor wallet");
  lines.push("3. node scripts/run-dealflow.js release --deal <deal.json> --vault <vault> --milestone 0 --executor wallet");
  lines.push("4. node scripts/run-dealflow.js release --deal <deal.json> --vault <vault> --milestone 1 --executor wallet");
  lines.push("5. node scripts/run-dealflow.js close --deal <deal.json> --vault <vault> --executor wallet --success");

  if (spec.meta?.warnings?.length) {
    lines.push("Warnings:");
    for (const warning of spec.meta.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

function settlementConfig(overrides = {}) {
  const tokenAddress = overrides.tokenAddress || process.env.SETTLEMENT_TOKEN_ADDRESS;
  const tokenDecimals = Number(overrides.tokenDecimals || process.env.SETTLEMENT_TOKEN_DECIMALS || 6);
  const chainId = Number(overrides.chainId || process.env.XLAYER_CHAIN_ID || 196);
  const factoryAddress = overrides.factoryAddress || process.env.DEAL_FACTORY_ADDRESS;

  if (!tokenAddress) {
    throw new Error("SETTLEMENT_TOKEN_ADDRESS is required for deploy/fund/release flows.");
  }

  return {
    tokenAddress: ethers.getAddress(tokenAddress),
    tokenDecimals,
    chainId,
    factoryAddress: factoryAddress ? ethers.getAddress(factoryAddress) : null,
  };
}

function swapChainName(overrides = {}) {
  if (overrides.swapChain) {
    return String(overrides.swapChain);
  }

  const chainId = Number(overrides.chainId || process.env.XLAYER_CHAIN_ID || 196);
  if (chainId === 196) {
    return "xlayer";
  }

  return String(chainId);
}

function normalizeSwapTokenRef(value) {
  const normalized = String(value).trim();
  if (normalized === "") {
    throw new Error("Swap token reference cannot be empty.");
  }

  if (ethers.isAddress(normalized)) {
    return normalized.toLowerCase();
  }

  if (normalized.toLowerCase() === "native") {
    return swapNativeTokenAddress;
  }

  return normalized.toLowerCase();
}

function resolveRpcUrl(overrides = {}) {
  return overrides.rpcUrl || process.env.XLAYER_RPC_URL || "https://rpc.xlayer.tech";
}

function resolveProvider(overrides = {}) {
  if (overrides.provider) {
    return overrides.provider;
  }

  return new ethers.JsonRpcProvider(resolveRpcUrl(overrides));
}

function formatTokenAmount(rawAmount, decimals) {
  return normalizeNumberString(ethers.formatUnits(rawAmount, decimals));
}

async function readTokenMetadata(tokenAddress, overrides = {}) {
  const provider = resolveProvider(overrides);
  const token = new ethers.Contract(tokenAddress, erc20Abi, provider);

  let decimals = Number(overrides.tokenDecimals || process.env.SETTLEMENT_TOKEN_DECIMALS || 6);
  let symbol = overrides.tokenSymbol || process.env.SETTLEMENT_TOKEN_SYMBOL || "TOKEN";

  try {
    decimals = Number(await token.decimals());
  } catch {
    // Keep configured fallback.
  }

  try {
    symbol = await token.symbol();
  } catch {
    // Keep configured fallback.
  }

  return {
    address: ethers.getAddress(tokenAddress),
    decimals,
    symbol,
  };
}

function buildNormalizePlan(spec, overrides = {}) {
  const { tokenAddress } = settlementConfig(overrides);
  const sourceToken = overrides.sourceToken || overrides["source-token"] || overrides["from-token"];
  const readableAmount = overrides.readableAmount || overrides["readable-amount"] || overrides.amount;
  const walletAddress = overrides.wallet || overrides.from || spec?.payer?.address;

  if (!sourceToken) {
    throw new Error("Normalization requires --from-token <symbol|address>.");
  }
  if (!readableAmount) {
    throw new Error("Normalization requires --amount <readable amount>.");
  }
  if (!walletAddress || !ethers.isAddress(walletAddress)) {
    throw new Error("Normalization requires a valid wallet address.");
  }

  const fromTokenRef = normalizeSwapTokenRef(sourceToken);
  const toTokenRef = normalizeSwapTokenRef(overrides.targetToken || tokenAddress);
  if (fromTokenRef === toTokenRef) {
    throw new Error("Normalization is not needed when the source token is already the settlement token.");
  }

  const chain = swapChainName(overrides);
  const executeArgs = [
    "swap",
    "execute",
    "--from",
    fromTokenRef,
    "--to",
    toTokenRef,
    "--readable-amount",
    normalizeNumberString(readableAmount),
    "--chain",
    chain,
    "--wallet",
    ethers.getAddress(walletAddress),
  ];

  if (overrides.slippage !== undefined && overrides.slippage !== true) {
    executeArgs.push("--slippage", String(overrides.slippage));
  }
  if (overrides.gasLevel) {
    executeArgs.push("--gas-level", String(overrides.gasLevel));
  }
  if (overrides.mevProtection) {
    executeArgs.push("--mev-protection");
  }

  return {
    kind: "normalize",
    executor: overrides.executor || "wallet",
    chain,
    from: ethers.getAddress(walletAddress),
    settlementTokenAddress: ethers.getAddress(tokenAddress),
    sourceToken: fromTokenRef,
    targetToken: toTokenRef,
    readableAmount: normalizeNumberString(readableAmount),
    calls: [
      buildWalletCall(
        [
          "swap",
          "quote",
          "--from",
          fromTokenRef,
          "--to",
          toTokenRef,
          "--readable-amount",
          normalizeNumberString(readableAmount),
          "--chain",
          chain,
        ],
        [],
        "Quote funding normalization swap"
      ),
      buildWalletCall([], executeArgs, "Swap into settlement token via OnchainOS DEX"),
    ],
    notes: [
      "Use this path when the payer does not already hold the settlement token.",
      "The swap executes through OnchainOS DEX with the Agentic Wallet session.",
      "Run funding immediately after normalization so the quote stays fresh.",
    ],
  };
}

function dealSpecToConstructorArgs(spec, overrides = {}) {
  const { tokenAddress, tokenDecimals } = settlementConfig(overrides);

  return [
    tokenAddress,
    spec.payer.address,
    spec.arbiter.address,
    spec.payees.map((payee) => payee.address),
    spec.payees.map((payee) => payee.bps),
    spec.milestones.map((milestone) => milestone.name),
    spec.milestones.map((milestone) => ethers.parseUnits(String(milestone.amount), tokenDecimals)),
    spec.milestones.map((milestone) => milestone.dueAt || 0),
    ethers.parseUnits(String(spec.reserveAmount), tokenDecimals),
    spec.latePenaltyBps,
  ];
}

async function buildDeployPlan(spec, overrides = {}) {
  const args = dealSpecToConstructorArgs(spec, overrides);
  const executor = overrides.executor || "wallet";
  const { tokenAddress, chainId, factoryAddress } = settlementConfig(overrides);
  const constructorArgs = args.map((value) => (typeof value === "bigint" ? value.toString() : value));

  if (factoryAddress) {
    const deployerAddress = ethers.getAddress(overrides.from || spec.payer.address);
    const factoryInterface = getDealVaultFactoryInterface();
    const call = buildWalletCall(
      ["wallet", "contract-call"],
      [
        "--chain",
        String(chainId),
        "--from",
        deployerAddress,
        "--to",
        factoryAddress,
        "--input-data",
        factoryInterface.encodeFunctionData("createDeal", args),
      ],
      "Create DealVault via DealVaultFactory"
    );

    return {
      kind: "deploy",
      executor,
      chainId,
      from: deployerAddress,
      settlementTokenAddress: tokenAddress,
      factoryAddress,
      constructorArgs,
      call,
      notes: [
        "This path is wallet-compatible: Agentic Wallet calls DealVaultFactory.createDeal on X Layer.",
        "Read the DealCreated event from the returned transaction receipt to recover the new vault address.",
      ],
    };
  }

  const dealVaultArtifact = getDealVaultArtifact();
  const factory = new ethers.ContractFactory(dealVaultArtifact.abi, dealVaultArtifact.bytecode);
  const transaction = await factory.getDeployTransaction(...args);

  return {
    kind: "deploy",
    executor,
    chainId,
    settlementTokenAddress: tokenAddress,
    constructorArgs,
    data: transaction.data,
    notes: [
      "DEAL_FACTORY_ADDRESS is not configured, so this is a raw create transaction payload only.",
      "Deploy DealVaultFactory once, then rerun deploy with --executor wallet to create deals through Agentic Wallet.",
    ],
  };
}

async function executeLocalDeploy(spec, overrides = {}) {
  const rpcUrl = overrides.rpcUrl || process.env.XLAYER_RPC_URL;
  const privateKey = overrides.privateKey || process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpcUrl || !privateKey) {
    throw new Error("Local deployment requires XLAYER_RPC_URL and DEPLOYER_PRIVATE_KEY.");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const dealVaultArtifact = getDealVaultArtifact();
  const factory = new ethers.ContractFactory(dealVaultArtifact.abi, dealVaultArtifact.bytecode, wallet);
  const contract = await factory.deploy(...dealSpecToConstructorArgs(spec, overrides));
  const receipt = await contract.deploymentTransaction().wait();

  return {
    kind: "deploy",
    executor: "local",
    address: await contract.getAddress(),
    chainId: (await provider.getNetwork()).chainId.toString(),
    deployer: wallet.address,
    transactionHash: receipt.hash,
  };
}

function stringifyCommand(parts) {
  return parts.map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(" ");
}

function buildWalletCall(command, args, label) {
  return {
    label,
    command: stringifyCommand([onchainosBinary(), ...command, ...args]),
    argv: [onchainosBinary(), ...command, ...args],
  };
}

function buildFundPlan(spec, vaultAddress, overrides = {}) {
  const { tokenAddress, tokenDecimals, chainId } = settlementConfig(overrides);
  const amount = normalizeNumberString(overrides.amount || spec.budget);
  const amountUnits = ethers.parseUnits(amount, tokenDecimals);
  const payerAddress = ethers.getAddress(overrides.from || spec.payer.address);
  const tokenInterface = new ethers.Interface(erc20Abi);
  const normalizeCalls = overrides.normalizeFromToken
    ? buildNormalizePlan(spec, {
        executor: overrides.executor,
        sourceToken: overrides.normalizeFromToken,
        amount: overrides.normalizeAmount,
        wallet: payerAddress,
        tokenAddress,
        tokenDecimals,
        chainId,
        swapChain: overrides.swapChain,
        slippage: overrides.slippage,
        gasLevel: overrides.gasLevel,
        mevProtection: overrides.mevProtection,
      }).calls
    : [];

  return {
    kind: "fund",
    executor: overrides.executor || "wallet",
    amount,
    rawAmount: amountUnits.toString(),
    chainId,
    from: payerAddress,
    calls: [
      ...normalizeCalls,
      buildWalletCall(
        ["wallet", "contract-call"],
        [
          "--chain",
          String(chainId),
          "--from",
          payerAddress,
          "--to",
          tokenAddress,
          "--input-data",
          tokenInterface.encodeFunctionData("approve", [vaultAddress, amountUnits]),
        ],
        "Approve settlement token spending"
      ),
      buildWalletCall(
        ["wallet", "contract-call"],
        [
          "--chain",
          String(chainId),
          "--from",
          payerAddress,
          "--to",
          ethers.getAddress(vaultAddress),
          "--input-data",
          getDealVaultInterface().encodeFunctionData("fund", [amountUnits]),
        ],
        "Fund the DealVault"
      ),
    ],
    notes: overrides.normalizeFromToken
      ? [
          "The funding flow includes an OnchainOS DEX normalization step before approval and funding.",
          "Provide --normalize-amount as the source-token amount to swap into the settlement token.",
        ]
      : [
          "If the payer does not already hold the settlement token, run normalize first or pass --normalize-from/--normalize-amount.",
        ],
  };
}

function buildReleasePlan(spec, vaultAddress, milestoneId, overrides = {}) {
  const { chainId } = settlementConfig(overrides);
  const arbiterAddress = ethers.getAddress(overrides.from || spec.arbiter.address);

  return {
    kind: "release",
    executor: overrides.executor || "wallet",
    chainId,
    from: arbiterAddress,
    milestoneId,
    call: buildWalletCall(
      ["wallet", "contract-call"],
      [
        "--chain",
        String(chainId),
        "--from",
        arbiterAddress,
        "--to",
        ethers.getAddress(vaultAddress),
        "--input-data",
        getDealVaultInterface().encodeFunctionData("releaseMilestone", [milestoneId]),
      ],
      `Release milestone ${milestoneId}`
    ),
  };
}

function buildClosePlan(spec, vaultAddress, overrides = {}) {
  const { chainId } = settlementConfig(overrides);
  const from = ethers.getAddress(overrides.from || spec.arbiter.address);
  const success = Boolean(overrides.success);

  return {
    kind: "close",
    executor: overrides.executor || "wallet",
    chainId,
    from,
    success,
    call: buildWalletCall(
      ["wallet", "contract-call"],
      [
        "--chain",
        String(chainId),
        "--from",
        from,
        "--to",
        ethers.getAddress(vaultAddress),
        "--input-data",
        getDealVaultInterface().encodeFunctionData("closeDeal", [success]),
      ],
      `Close DealVault (${success ? "success" : "failure"})`
    ),
  };
}

function executeWalletPlan(plan) {
  const commands = plan.calls || (plan.call ? [plan.call] : []);
  if (commands.length === 0) {
    throw new Error("No wallet calls to execute.");
  }

  const outputs = [];
  for (const command of commands) {
    const walletResult = command.argv[0] === onchainosBinary()
      ? runOnchainos(command.argv.slice(1))
      : spawnSync(command.argv[0], command.argv.slice(1), {
          encoding: "utf8",
          shell: false,
        });

    if (walletResult.status !== 0) {
      throw new Error(`Wallet execution failed for '${command.label}': ${walletResult.stderr || walletResult.stdout}`);
    }

    let parsed = walletResult.stdout.trim();
    try {
      parsed = JSON.parse(parsed);
    } catch {
      // Keep raw output if it isn't JSON.
    }

    outputs.push({
      label: command.label,
      result: parsed,
    });
  }

  return outputs;
}

async function executeLocalCall(vaultAddress, functionName, args, overrides = {}) {
  const rpcUrl = overrides.rpcUrl || process.env.XLAYER_RPC_URL;
  const privateKey = overrides.privateKey || process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpcUrl || !privateKey) {
    throw new Error("Local execution requires XLAYER_RPC_URL and DEPLOYER_PRIVATE_KEY.");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(vaultAddress, getDealVaultArtifact().abi, wallet);
  const transaction = await contract[functionName](...args);
  const receipt = await transaction.wait();

  return {
    executor: "local",
    from: wallet.address,
    transactionHash: receipt.hash,
  };
}

async function executeLocalFund(spec, vaultAddress, overrides = {}) {
  const { tokenAddress, tokenDecimals } = settlementConfig(overrides);
  const rpcUrl = overrides.rpcUrl || process.env.XLAYER_RPC_URL;
  const privateKey = overrides.privateKey || process.env.DEPLOYER_PRIVATE_KEY;
  if (!rpcUrl || !privateKey) {
    throw new Error("Local fund requires XLAYER_RPC_URL and DEPLOYER_PRIVATE_KEY.");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const token = new ethers.Contract(tokenAddress, erc20Abi, wallet);
  const vault = new ethers.Contract(vaultAddress, getDealVaultArtifact().abi, wallet);
  const amountUnits = ethers.parseUnits(String(overrides.amount || spec.budget), tokenDecimals);

  const approveTx = await token.approve(vaultAddress, amountUnits);
  const approveReceipt = await approveTx.wait();
  const fundTx = await vault.fund(amountUnits);
  const fundReceipt = await fundTx.wait();

  return {
    executor: "local",
    from: wallet.address,
    approveTxHash: approveReceipt.hash,
    fundTxHash: fundReceipt.hash,
  };
}

function toAuditTimestamp(value) {
  return value ? new Date(Number(value) * 1000).toISOString() : null;
}

function decodeAuditLog(log, tokenMetadata, interfaces) {
  for (const [source, iface] of interfaces) {
    try {
      const parsed = iface.parseLog(log);
      if (!parsed) {
        continue;
      }

      const args = parsed.args;
      switch (parsed.name) {
        case "DealCreated":
          return {
            source,
            name: parsed.name,
            details: {
              vault: args.vault,
              payer: args.payer,
              arbiter: args.arbiter,
              settlementToken: args.settlementToken,
            },
          };
        case "DealFunded":
          return {
            source,
            name: parsed.name,
            details: {
              funder: args.funder,
              amount: formatTokenAmount(args.amount, tokenMetadata.decimals),
              amountRaw: args.amount.toString(),
              totalFunded: formatTokenAmount(args.totalFunded, tokenMetadata.decimals),
              totalFundedRaw: args.totalFunded.toString(),
            },
          };
        case "PenaltyApplied":
          return {
            source,
            name: parsed.name,
            details: {
              milestoneId: Number(args.milestoneId),
              penaltyAmount: formatTokenAmount(args.penaltyAmount, tokenMetadata.decimals),
              penaltyAmountRaw: args.penaltyAmount.toString(),
              refundedTo: args.refundedTo,
            },
          };
        case "MilestoneReleased":
          return {
            source,
            name: parsed.name,
            details: {
              milestoneId: Number(args.milestoneId),
              grossAmount: formatTokenAmount(args.grossAmount, tokenMetadata.decimals),
              grossAmountRaw: args.grossAmount.toString(),
              penaltyAmount: formatTokenAmount(args.penaltyAmount, tokenMetadata.decimals),
              penaltyAmountRaw: args.penaltyAmount.toString(),
              distributedAmount: formatTokenAmount(args.distributedAmount, tokenMetadata.decimals),
              distributedAmountRaw: args.distributedAmount.toString(),
            },
          };
        case "DealClosed":
          return {
            source,
            name: parsed.name,
            details: {
              success: args.success,
              payerRefund: formatTokenAmount(args.payerRefund, tokenMetadata.decimals),
              payerRefundRaw: args.payerRefund.toString(),
              payeeDistribution: formatTokenAmount(args.payeeDistribution, tokenMetadata.decimals),
              payeeDistributionRaw: args.payeeDistribution.toString(),
            },
          };
        default:
          return {
            source,
            name: parsed.name,
            details: JSON.parse(
              JSON.stringify(parsed.args, (_, current) =>
                typeof current === "bigint" ? current.toString() : current
              )
            ),
          };
      }
    } catch {
      // Ignore logs that are not emitted by known interfaces.
    }
  }

  return null;
}

async function buildReceiptAuditEntries(provider, txHashes, tokenMetadata, overrides = {}) {
  const entries = [];
  const interfaces = [
    ["vault", getDealVaultInterface()],
    ["factory", getDealVaultFactoryInterface()],
  ];

  for (const txHash of [...new Set(txHashes.filter(Boolean).map((item) => String(item).trim()))]) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      entries.push({
        txHash,
        status: "pending",
        events: [],
      });
      continue;
    }

    const block = await provider.getBlock(receipt.blockNumber);
    const events = receipt.logs
      .map((log) => decodeAuditLog(log, tokenMetadata, interfaces))
      .filter(Boolean);

    entries.push({
      txHash,
      status: receipt.status === 1 ? "success" : "failed",
      blockNumber: receipt.blockNumber,
      timestamp: block ? Number(block.timestamp) : null,
      timestampIso: block ? toAuditTimestamp(block.timestamp) : null,
      events,
    });
  }

  return entries;
}

async function getLogsPaged(provider, filter, step = 100) {
  const latestBlock = await provider.getBlockNumber();
  const startBlock = Number(filter.fromBlock || 0);
  const endBlock = filter.toBlock === "latest" || filter.toBlock === undefined
    ? latestBlock
    : Number(filter.toBlock);

  const logs = [];
  for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += step) {
    const toBlock = Math.min(endBlock, fromBlock + step - 1);
    const batch = await provider.getLogs({
      ...filter,
      fromBlock,
      toBlock,
    });
    logs.push(...batch);
  }

  return logs;
}

async function discoverFactoryEvents(provider, vaultAddress, overrides = {}, tokenMetadata, fromBlock = 0) {
  const factoryAddress = overrides.factoryAddress || process.env.DEAL_FACTORY_ADDRESS;
  if (!factoryAddress) {
    return [];
  }

  const logs = await getLogsPaged(provider, {
    address: ethers.getAddress(factoryAddress),
    fromBlock,
    toBlock: "latest",
    topics: [
      getDealVaultFactoryInterface().getEvent("DealCreated").topicHash,
      ethers.zeroPadValue(ethers.getAddress(vaultAddress), 32),
    ],
  });

  return logs.map((log) => {
    const parsed = decodeAuditLog(log, tokenMetadata, [["factory", getDealVaultFactoryInterface()]]);
    return {
      txHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      logIndex: Number(log.index ?? log.logIndex ?? 0),
      event: parsed,
    };
  });
}

async function discoverVaultEvents(provider, vaultAddress, fromBlock, tokenMetadata) {
  const logs = await getLogsPaged(provider, {
    address: ethers.getAddress(vaultAddress),
    fromBlock,
    toBlock: "latest",
  });

  return logs
    .map((log) => {
      const parsed = decodeAuditLog(log, tokenMetadata, [["vault", getDealVaultInterface()]]);
      if (!parsed) {
        return null;
      }

      return {
        txHash: log.transactionHash,
        blockNumber: Number(log.blockNumber),
        logIndex: Number(log.index ?? log.logIndex ?? 0),
        event: parsed,
      };
    })
    .filter(Boolean);
}

async function buildDealAuditReport(vaultAddress, overrides = {}) {
  const provider = resolveProvider(overrides);
  const network = await provider.getNetwork();
  const vault = new ethers.Contract(ethers.getAddress(vaultAddress), getDealVaultArtifact().abi, provider);
  const summary = await vault.getSummary();
  const payeeCount = Number(await vault.payeeCount());
  const milestoneCount = Number(await vault.milestoneCount());
  const tokenMetadata = await readTokenMetadata(summary[0], {
    ...overrides,
    provider,
  });
  const token = new ethers.Contract(summary[0], erc20Abi, provider);

  const payees = [];
  for (let index = 0; index < payeeCount; index += 1) {
    const [address, bps] = await vault.getPayee(index);
    payees.push({
      role: overrides.spec?.payees?.[index]?.role || `payee_${index}`,
      address,
      bps: Number(bps),
    });
  }

  const milestones = [];
  for (let index = 0; index < milestoneCount; index += 1) {
    const [name, amount, dueAt, released] = await vault.getMilestone(index);
    milestones.push({
      id: index,
      name,
      amount: formatTokenAmount(amount, tokenMetadata.decimals),
      amountRaw: amount.toString(),
      dueAt: Number(dueAt),
      dueAtIso: Number(dueAt) === 0 ? null : toAuditTimestamp(dueAt),
      released,
    });
  }

  const txHashes = Array.isArray(overrides.txHashes)
    ? overrides.txHashes
    : overrides.txHashes
      ? [overrides.txHashes]
      : [];
  const transactions = await buildReceiptAuditEntries(provider, txHashes, tokenMetadata, overrides);
  const knownStartBlock = transactions
    .filter((item) => item.blockNumber !== undefined)
    .reduce((min, item) => Math.min(min, item.blockNumber), Number.MAX_SAFE_INTEGER);
  const queryStartBlock = knownStartBlock === Number.MAX_SAFE_INTEGER ? 0 : knownStartBlock;
  const factoryEvents = await discoverFactoryEvents(
    provider,
    vaultAddress,
    overrides,
    tokenMetadata,
    queryStartBlock
  );
  const fromBlock = factoryEvents.length !== 0 ? factoryEvents[0].blockNumber : queryStartBlock;
  const vaultEvents = await discoverVaultEvents(provider, vaultAddress, fromBlock, tokenMetadata);

  const balanceAddresses = [
    { label: "payer", address: summary[1] },
    { label: "arbiter", address: summary[2] },
    { label: "vault", address: ethers.getAddress(vaultAddress) },
    ...payees.map((payee) => ({
      label: payee.role,
      address: payee.address,
    })),
  ];

  const balances = [];
  for (const item of balanceAddresses) {
    const raw = await token.balanceOf(item.address);
    balances.push({
      label: item.label,
      address: item.address,
      amount: formatTokenAmount(raw, tokenMetadata.decimals),
      amountRaw: raw.toString(),
    });
  }

  return {
    kind: "report",
    chainId: Number(network.chainId),
    rpcUrl: overrides.rpcUrl || resolveRpcUrl(overrides),
    vaultAddress: ethers.getAddress(vaultAddress),
    settlementToken: tokenMetadata,
    summary: {
      payer: summary[1],
      arbiter: summary[2],
      budget: formatTokenAmount(summary[3], tokenMetadata.decimals),
      budgetRaw: summary[3].toString(),
      funded: formatTokenAmount(summary[4], tokenMetadata.decimals),
      fundedRaw: summary[4].toString(),
      balance: formatTokenAmount(summary[5], tokenMetadata.decimals),
      balanceRaw: summary[5].toString(),
      milestoneTotal: formatTokenAmount(summary[6], tokenMetadata.decimals),
      milestoneTotalRaw: summary[6].toString(),
      reserve: formatTokenAmount(summary[7], tokenMetadata.decimals),
      reserveRaw: summary[7].toString(),
      closed: summary[8],
    },
    payees,
    milestones,
    transactions,
    discoveredEvents: [...factoryEvents, ...vaultEvents].sort((left, right) => {
      return left.blockNumber - right.blockNumber || left.logIndex - right.logIndex;
    }),
    balances,
    specWarnings: overrides.spec?.meta?.warnings || [],
  };
}

function renderDealAuditReport(report) {
  const lines = [
    "DealFlow Audit Report",
    `Chain ID: ${report.chainId}`,
    `Vault: ${report.vaultAddress}`,
    `Settlement token: ${report.settlementToken.symbol} (${report.settlementToken.address})`,
    `Budget: ${report.summary.budget} ${report.settlementToken.symbol}`,
    `Funded: ${report.summary.funded} ${report.settlementToken.symbol}`,
    `Current balance: ${report.summary.balance} ${report.settlementToken.symbol}`,
    `Closed: ${report.summary.closed ? "yes" : "no"}`,
    `Payer: ${report.summary.payer}`,
    `Arbiter: ${report.summary.arbiter}`,
    "Payees:",
  ];

  for (const payee of report.payees) {
    lines.push(`- ${payee.role}: ${payee.address} (${bpsToPercentString(payee.bps)}%)`);
  }

  lines.push("Milestones:");
  for (const milestone of report.milestones) {
    lines.push(
      `- #${milestone.id} ${milestone.name}: ${milestone.amount} ${report.settlementToken.symbol}, released=${milestone.released}, dueAt=${milestone.dueAtIso || milestone.dueAt}`
    );
  }

  if (report.discoveredEvents.length !== 0) {
    lines.push("Discovered events:");
    for (const item of report.discoveredEvents) {
      lines.push(
        `- ${item.event.name} @ block ${item.blockNumber} tx ${item.txHash}`
      );
    }
  }

  if (report.transactions.length !== 0) {
    lines.push("Transaction receipts:");
    for (const tx of report.transactions) {
      lines.push(`- ${tx.txHash}: ${tx.status} @ block ${tx.blockNumber || "pending"}`);
      for (const event of tx.events) {
        lines.push(`  * ${event.name}`);
      }
    }
  }

  lines.push("Balances:");
  for (const balance of report.balances) {
    lines.push(`- ${balance.label}: ${balance.amount} ${report.settlementToken.symbol} (${balance.address})`);
  }

  if (report.specWarnings.length !== 0) {
    lines.push("Spec warnings:");
    for (const warning of report.specWarnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

module.exports = {
  assertValidDealSpec,
  buildCapabilitiesCatalog,
  buildDealAuditReport,
  buildClosePlan,
  buildDealSpec,
  buildDeployPlan,
  buildFundPlan,
  buildNormalizePlan,
  buildPreflightReport,
  buildReleasePlan,
  executeWalletPlan,
  dealSpecToConstructorArgs,
  executeLocalCall,
  executeLocalDeploy,
  executeLocalFund,
  formatTokenAmount,
  getWalletDefaultAddress,
  parseArgv,
  parsePayeeOverrides,
  previewDealSpec,
  readJson,
  readTerms,
  renderCapabilitiesMenu,
  renderDoctorGuide,
  renderDealAuditReport,
  renderPreflightReport,
  renderValidationSummary,
  resolveProvider,
  settlementConfig,
  validateDealSpec,
  writeJson,
};
