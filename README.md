# DealFlow Compiler

`DealFlow Compiler` 是一个可复用的 Agent Skill：  
把自然语言里的合作条款，编译成 X Layer 上可执行、可审计、可复用的资金流。

`DealFlow Compiler` is a reusable agent skill that turns natural-language collaboration terms into executable, auditable settlement flows on X Layer.

它的核心路径是：

`natural language terms -> DealSpec -> preview -> Agentic Wallet / OnchainOS -> X Layer DealVault -> audit report`

- English README: [README.en.md](README.en.md)
- License: [LICENSE](LICENSE)
- Release checklist: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)

这个仓库已经整理成一个独立完整包，可以直接作为 GitHub 开源仓库发布。  
别人拿到这个仓库后，不需要依赖你当前的外部项目根目录；只要安装依赖、配置 `.env`、登录 `Agentic Wallet`，就可以把它安装成自己的 skill 并调用。

## 适合什么场景

- 创作者合作分账
- 代理结算
- 里程碑付款
- 储备金托管
- 逾期罚则 / 退款
- AI-to-AI 商业协议执行

## 当前能力

本包已经内置完整的独立命令面：

- `preflight`: 检查工作区、编译产物、`.env`、OnchainOS CLI、Agentic Wallet、RPC、skill 安装状态
- `doctor`: 把缺失配置转成可执行修复步骤，并给出 `.env` 模板
- `capabilities`: 输出当前环境已解锁的自然语言能力清单
- `compile`: 自然语言条款 -> `DealSpec`
- `validate`: 校验 `DealSpec`
- `preview`: 输出 Deal Card 和推荐执行流
- `normalize`: 先把非结算币换成结算币
- `deploy`: 通过 `DealVaultFactory` 在 X Layer 创建 vault
- `fund`: 入金到 vault
- `release`: 释放里程碑
- `close`: 结案并释放储备金
- `report`: 拉取链上事件、回执、余额并输出审计报告

## 项目简介

`DealFlow Compiler` 的目标不是再做一个通用 dApp，而是把“聊天里模糊的合作条款”编译成“X Layer 上确定可执行的资金流”。

它解决的问题是：

- 商务合作条款通常散落在聊天里，不结构化
- 分账、里程碑、储备金、逾期罚则往往靠人工执行
- 对创作者、代理、AI-to-AI 服务协作来说，缺少一个可复用、可审计、可上链的结算 skill

这个项目把上面这几件事收成一条链：

`自然语言条款 -> DealSpec -> 预览 -> Agentic Wallet / OnchainOS -> X Layer DealVault -> Audit Report`

## 架构概述

系统分成两层：

- `Off-chain Skill Layer`
  负责 `preflight / doctor / capabilities`、自然语言解析、`DealSpec` 编译、风险校验、执行计划生成，以及分阶段自然语言引导。
- `On-chain Settlement Layer`
  负责在 X Layer 上托管结算资产、释放里程碑、应用罚则、释放储备金和结案。

核心模块：

- `DealFlow Skill`
  对话式入口，先解释完整流程，再按用户确认逐步推进。
- `DealSpec Compiler`
  把预算、分账、里程碑、储备金、罚则编译成结构化 JSON。
- `Agentic Wallet + OnchainOS`
  负责真实钱包执行与可选的资产标准化路径。
- `DealVaultFactory`
  在 X Layer 上创建新的 `DealVault`。
- `DealVault`
  托管资金并执行分账、里程碑、罚则和结案逻辑。
- `Audit Reporter`
  汇总 vault 地址、tx hash、事件、余额和最终状态。

如果你要看更完整的系统划分，可以继续读 [references/architecture.md](references/architecture.md)。

## Live Deployment

当前 live 配置和已验证部署如下：

- `X Layer Chain ID`: `196`
- `Settlement Token`: `USDC` = `0x74b7F16337b8972027F6196A17a631aC6dE26d22`
- `DealVaultFactory`: `0x1fb1E995314449F7F23C4a4A40870D4Fa8010840`

最近一次完整 live demo：

- `Vault`: `0x6548a7e9C5B0cba25aCEdEF0CC024b56702354C4`
- `Deploy`: `0xff083b742d041b3eea527e8964577bfce2ec752183c8b54854308452b485d61a`
- `Approve`: `0x07c123f283b93d5a5140c003307b8670c5b8e84eb694ebba61430735459e2990`
- `Fund`: `0x307ed47a66e8e55c7a4145db758ae03c0c2c4e91b3e06dced24f7209d1b99957`
- `Release Milestone 0`: `0xf923af774a9e2adfcc612f13527a198ffd390a0ec43518558ae22b50815fd039`
- `Release Milestone 1`: `0x534775c33c347b3f77d94f2e97aff006bb61165504083d65eda48585ae040ee4`
- `Close`: `0x1d8e2085025aabd7b50d44fec5b7798472e438a210dbfd94c33b576f18e7ffee`

这条 live demo 已经验证：

- `deploy -> fund -> release -> penalty -> close`
- vault 最终余额归零
- `DealCreated / DealFunded / MilestoneReleased / PenaltyApplied / DealClosed` 事件完整出现

## 官方 Skill / OnchainOS 使用情况

当前 MVP 采用 `OnchainOS-first` 路线，官方集成在主路径上，不是装饰性接入。

本项目实际使用了：

- `Agentic Wallet`
  所有状态变化交易都由 Agentic Wallet 发起
- `OnchainOS Wallet`
  用于合约调用和真实链上执行
- `OnchainOS DEX / normalize path`
  作为可选标准化路径，为“先把非结算资产换成 USDC 再入金”预留主流程能力

当前版本没有把 `Uniswap AI Skills` 放进 live demo 主路径。  
原因不是不能接，而是这个 MVP 当前强调的是：

- 自然语言条款编译
- 通过 Agentic Wallet 完成真实结算执行
- 在 X Layer 上留下完整结算证据链

换句话说，这版提交主打的是 `OnchainOS + Agentic Wallet + X Layer DealVault`。

## 运作机制

完整运作机制是：

1. 用户用自然语言描述合作条款
2. skill 先做环境检查，确认可用能力
3. skill 把条款编译成 `DealSpec`
4. skill 输出 Deal Card，让用户先确认结构和金额
5. 用户逐步确认进入 `deploy / fund / release / close`
6. 每一个链上阶段都通过 Agentic Wallet 执行
7. 最后通过 `report` 输出完整审计结果

这意味着它既是：

- `对外`: 一个自然语言 agent skill
- `对内`: 一个 CLI / 合约 / 审计模块组成的执行引擎

## X Layer 生态定位

`DealFlow Compiler` 在 X Layer 生态里的定位，不是通用支付工具，而是：

`面向创作者合作、代理结算、服务分期交付、AI-to-AI 商业协议的链上结算编译器`

它和 X Layer 的契合点在于：

- 所有核心状态都留在 X Layer，形成真实可审计活动
- Agentic Wallet 直接驱动交易，符合 Skill Arena 的官方要求
- 适合低金额、多阶段、强结算逻辑的真实业务场景
- 能把“自然语言交互”和“链上执行证据”连成一个统一产品体验

从生态角度看，它补的是：

- 不是“再做一个钱包入口”
- 不是“再做一个 swap 入口”
- 而是“把链上商业协作结算变成 agent 可以复用的能力模块”

## Team

- `Fate` — CEO — `arbitertian@gmail.com`

## 运行前提

本地需要准备：

- Node.js 和 npm
- `Agentic Wallet`
- `OnchainOS CLI`
- 可访问的 X Layer RPC
- 少量 X Layer gas 和演示资金

如果只想先试本地能力，最小前提是：

- `npm install`
- 配好 `.env`

如果要真正走链上闭环，还需要：

- `onchainos` 可执行
- `Agentic Wallet` 已登录
- `.env` 里有结算币、工厂地址、RPC 等配置

## 5 分钟安装

1. 安装依赖

```bash
npm install
```

2. 复制环境变量模板并填写

把 `.env.example` 复制成 `.env`，然后补上真实值。

3. 先做环境检查

```bash
node scripts/run-dealflow.js preflight
node scripts/run-dealflow.js doctor
node scripts/run-dealflow.js capabilities
```

4. 安装成 Codex skill

```bash
npm run skill:install
```

安装后会复制到：

```text
~/.codex/skills/dealflow-compiler
```

也可以直接执行：

```bash
node scripts/install-skill.js
```

## 最短上手示例

### 1. 直接试自然语言编译

```bash
node scripts/run-dealflow.js compile --terms "客户预算 10 USDC，创作者/代理/运营按 70/20/10 分账，先付 4，交付后付 5，保留 1 做储备金，逾期罚 20%。"
```

### 2. 预览 Deal Card

```bash
node scripts/run-dealflow.js preview --deal deals/demo-deal.json
```

### 3. 查看当前环境已解锁的自然语言能力

```bash
node scripts/run-dealflow.js capabilities
```

如果环境已就绪，你可以直接对 agent 说：

```text
把这段合作条款 compile 成 deal 并 preview：客户预算 100 USDC，创作者/代理/运营按 70/20/10 分账，先付 40，交付后付 50，保留 10 做储备金，最终交付逾期罚 20%。
```

或者：

```text
把这份 deal 部署到 X Layer，走 Agentic Wallet，并把 vault 地址和交易哈希返回给我。
```

## 给 Agent 的调用方式

安装完成后，最稳的方式是先让 Codex 发现这个 skill：

```md
[$dealflow-compiler](~/.codex/skills/dealflow-compiler/SKILL.md)
```

然后直接给自然语言任务，例如：

```text
把这段合作条款 compile 成 deal 并 preview：客户预算 100 USDC，创作者/代理/运营按 70/20/10 分账，先付 40，交付后付 50，保留 10 做储备金，最终交付逾期罚 20%。
```

或者：

```text
先检查当前环境是否能运行 DealFlow Compiler；如果缺配置就告诉我怎么修，再列出当前可用能力。
```

## 分阶段自然语言使用示例

这版 skill 默认按“先解释完整流程，再逐步确认”的方式工作。一个典型对话可以像这样：

```text
用户：我想从头走一遍 DealFlow Compiler，请先告诉我完整流程，每一步分别是什么意思、是否会上链、会产出什么，然后等我决定是否进入下一步。

Agent：会先列出 9 个阶段：
1. 环境检查 / Preflight（只读）
2. 编译条款 / Compile（只读）
3. 预览方案 / Preview（只读）
4. 部署金库 / Deploy（上链）
5. 入金 / Fund（上链）
6. 释放第一阶段 / Release Milestone 0（上链）
7. 释放第二阶段 / Release Milestone 1（上链）
8. 结案 / Close（上链）
9. 审计报告 / Report（只读）

用户：编译条款 / Compile：把这段合作条款 compile 成 deal 并 preview：客户预算 1 USDC，创作者/代理/运营按 70/20/10 分账，先付 0.4，交付后付 0.5，保留 0.1 做储备金，最终交付逾期罚 20%。

Agent：会返回 deal JSON 路径、Deal Card、每个里程碑的分账结果，并停下来等待下一步确认。

用户：部署金库 / Deploy

Agent：会解释这一步会在 X Layer 创建新的 DealVault，上链成功后只返回 vault 地址和 deploy tx hash，然后等待你决定是否继续。

用户：入金 / Fund

Agent：会解释这一步会先 approve 再 fund，返回 approve tx 和 fund tx，然后等待你决定是否继续。
```

推荐话术：

- `先检查当前环境是否能运行 DealFlow Compiler；如果缺配置就告诉我怎么修，再列出当前可用能力。`
- `把这段合作条款 compile 成 deal 并 preview：...`
- `部署金库 / Deploy`
- `入金 / Fund`
- `释放第一阶段 / Release Milestone 0`
- `释放第二阶段 / Release Milestone 1`
- `结案 / Close`
- `审计报告 / Report`

## 环境变量

参考 `.env.example`：

```env
XLAYER_RPC_URL=https://rpc.xlayer.tech
XLAYER_CHAIN_ID=196
SETTLEMENT_TOKEN_ADDRESS=<xlayer-usdc-address>
SETTLEMENT_TOKEN_SYMBOL=USDC
SETTLEMENT_TOKEN_DECIMALS=6
DEAL_FACTORY_ADDRESS=<deal-vault-factory-address>
DEAL_PAYER_ADDRESS=<payer-address-or-leave-empty-if-wallet-default>
DEAL_ARBITER_ADDRESS=<arbiter-address-or-leave-empty-if-wallet-default>
DEPLOYER_PRIVATE_KEY=<optional-local-executor-only>
```

说明：

- `XLAYER_RPC_URL`: X Layer RPC
- `SETTLEMENT_TOKEN_*`: 结算币配置，推荐 `USDC`
- `DEAL_FACTORY_ADDRESS`: 已部署的 `DealVaultFactory`
- `DEAL_PAYER_ADDRESS` / `DEAL_ARBITER_ADDRESS`: 可选；如果不填，会优先尝试使用 Agentic Wallet 默认地址
- `DEPLOYER_PRIVATE_KEY`: 仅本地执行模式需要，钱包模式不必依赖它

## 推荐调用路径

对第一次接入的用户，最稳的顺序是：

1. `node scripts/run-dealflow.js preflight`
2. `node scripts/run-dealflow.js doctor`
3. `node scripts/run-dealflow.js capabilities`
4. `node scripts/run-dealflow.js compile --terms "..."`
5. `node scripts/run-dealflow.js preview --deal ...`
6. `node scripts/run-dealflow.js deploy --deal ... --executor wallet`
7. `node scripts/run-dealflow.js fund --deal ... --vault ... --executor wallet`
8. `node scripts/run-dealflow.js release --deal ... --vault ... --milestone 0 --executor wallet`
9. `node scripts/run-dealflow.js report --vault ... --tx ...`

## 目录结构

如果你准备单独上传到 GitHub，建议把 `dealflow-compiler/` 目录里的内容直接作为新仓库根目录。  
也就是说，最终开源仓库的目录建议长这样：

```text
SKILL.md                     # skill 入口定义
README.md                    # GitHub 首页说明
.env.example                 # 环境变量模板
.gitignore                   # 开源发布时应忽略的本地文件
package.json                 # 独立依赖与命令面
package-lock.json
hardhat.config.js            # 独立 Hardhat 配置
agents/
  openai.yaml                # agent 展示信息
contracts/
  DealVault.sol              # 托管、分账、罚则、结案
  DealVaultFactory.sol       # 工厂部署入口
  test/MockERC20.sol         # 本地测试 token
artifacts/                   # 预编译产物，供运行时解码和执行
lib/
  dealflow.js                # 核心执行库
scripts/
  run-dealflow.js            # 稳定 wrapper 入口
  dealflow.js                # CLI 主入口
  run-hardhat.js             # 独立 Hardhat runner
  deploy-dealvault-factory.js
  deploy-dealvault.js
  install-skill.js           # 安装到 ~/.codex/skills
  validate_deal_spec.py
references/
  architecture.md            # 架构说明
  deal-spec.md               # DealSpec 规范
test/
  DealFlowCli.js
  DealFlowReport.js
  DealVault.js
  DealVaultFactory.js
```

## 开源发布建议

上传 GitHub 时建议：

- 把这个包本身作为 repo 根目录
- 保留 `artifacts/`，这样别人拿到仓库就能直接跑 runtime 和 report
- 不要提交 `.env`
- 不要提交 `node_modules/`

如果你想让别人 clone 后最少步骤就能跑，当前这个结构已经是比较稳的形态。

## 验证命令

本仓库建议至少验证这几条：

```bash
node scripts/run-dealflow.js preflight
node scripts/run-dealflow.js capabilities
node scripts/run-hardhat.js test
python C:\Users\<you>\.codex\skills\.system\skill-creator\scripts\quick_validate.py .
```

## 一句话定位

`DealFlow Compiler = 自然语言合作条款 -> DealSpec -> Agentic Wallet + OnchainOS -> X Layer DealVault -> 可审计 tx 证据`
