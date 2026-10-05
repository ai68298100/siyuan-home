# 贡献指南（Contributing）

感谢关注小驴管家（Lv Home）！本指南覆盖环境搭建与开发约定。

## 环境搭建

- Node ≥ 24、pnpm ≥ 11
- 思源笔记 3.8.x（本机运行中，内核默认 `http://127.0.0.1:6806`）

```bash
pnpm install
pnpm run make-link   # 软链到思源工作空间 data/plugins/
# 重启思源 → 集市"下载"页启用小驴管家
```

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm run dev` | 开发（app + kernel 双目标 watch + livereload） |
| `pnpm run check` | TypeScript + Svelte + **i18n 键位对齐**（三合一，必须零错零警） |
| `pnpm test` | 单元测试（规则引擎/提醒中枢，30 个） |
| `pnpm run build` | 生产构建 + package.zip |
| `pnpm run check:meta` | 元数据交叉校验 + zip 体积门禁 |

### 后台部署到运行中的思源实例（免可见浏览器、免 make-install 认证）

多插件并行开发时优先后台操作（API/磁盘），不开可见浏览器面板：

1. `pnpm run build` 后，用 `curl -F` 逐文件调 `/api/file/putFile`（token 在 `%APPDATA%/siyuan/env`；Git Bash 必须 `MSYS2_ARG_CONV_EXCL="*"` 防 `/data/...` 被改写成 Git 安装路径）；
2. **注意 chunk 哈希**：代码一变 `chunks/*.js` 文件名就变，先 `grep -o 'require("./chunks/[^"]*")' dist/index.js` 列出全部依赖，逐个上传，缺一个插件就白屏；
   **陈旧 chunk 积累**：putFile 管线只增不删，多次部署后远端会堆积旧哈希 chunk（不影响运行）。清理法：readDir 列远端 chunks ∖ 本地 dist/chunks 的差集，逐个 `/api/file/removeFile`（125 波实测清了 26 个）；预检脚本会报告堆积数量。
3. 热重载：`/api/petal/setPetalEnabled` off→on（桌面端前端随即重载新代码）；
4. 凭据：工作区 `conf/conf.json` 的 `api.token`；锁屏授权码在 `accessAuthCode`（仅 web 端登录用）。

已验证（2026-10-03，真机 3.8.6）：cp 直拷会被安全 hook 拦截；`make-install` 走的 getWorkspaces 在开锁屏的实例上 401；符号链接需 Developer Mode（本机无）——putFile 是当前唯一后台通路。

### 脚本/端点实战教训（2026-10-04，79–82 波真机实测）

写运维/测试脚本前先读 `scripts/e2e-endpoints.sh` 头注与 [docs/testing/v0.2.md §8](docs/testing/v0.2.md)，要点：

1. **sy 包装器对大响应（>~64KB）静默截断**——render/PK 等大响应用原始 curl 落盘再解析；MSYS 禁转换下 curl 的 `-o`/`-F` 文件参数要 `cygpath` 转 Windows 路径，且环境变量需显式 `source %APPDATA%/siyuan/env`（包装器配置不会导出到你的 shell）；
2. **端点实名易踩坑**：加列是 `addAttributeViewKey`（keyID 必须自造，留空建出空 id 列）；`removeDoc(path)` 恒报 block not found → 用 `removeDocByID`；`/api/query/sql` **不暴露 notebooks 表**（笔记本 id 走 lsNotebooks）；
3. **多实例工作区鉴权门**：token 只对本工作区有效——脚本稳定判定用带鉴权探测（lsNotebooks 连续通过），`version` 免鉴权不可作判据；
4. 完整端点结论（render 默认分页、PK 封顶语义、写路径回读等 10 条）见 testing 文档 §8。

## 开发约定

1. **Conventional Commits**：`feat/fix/docs/refactor/test/chore:` 前缀，一个逻辑变更一个提交
2. **事实源**：`TODO.md`（35 组待办）——完成任务必须勾选并在 34 组"循环执行记录"表加行
3. **设计遵循**：UI 见 `docs/design/07`（token 禁硬编码色值）与 `08`（组件契约/类名）；架构变更先改对应 ADR
4. **i18n**：所有用户可见文案进 `public/i18n/zh-CN.json` 与 `en.json` 两份（`check:i18n` 会拦不一致）
5. **内核 API**：一切 `/api` 调用收口在 `src/core/siyuan.ts`（transport 可注入，测试用 mock）
6. **数据边界**：业务数据只进思源侧（数据库/文档）；插件存储只放设置与运行态（ADR-7）
7. **隐私红线**：console 不输出用户数据；证件号等字段脱敏；不引入网络依赖
8. **测试**：新逻辑带单测（`tests/`，vitest）；内核 API 改动同步更新 mock

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm run dev` | 开发（app + kernel 双目标 watch + livereload） |
| `pnpm run check` | TypeScript + Svelte + i18n 键位对齐 + 元数据校验 + **pnpm audit**（五合一，必须零错） |
| `pnpm test` | 单元测试（**138 个**：规则引擎/读写层/成员 DAL/建库器/注册表/schema 快照/迁移/容错/EC 契约形状/桥/月历） |
| `pnpm run build` | 生产构建 + package.zip |
| `pnpm run check:meta` | 元数据交叉校验 + zip 体积门禁 |
| `pnpm run check:audit` | pnpm audit（prod 依赖，moderate+ 级别拦截） |

## 开发约定

1. **Conventional Commits**：`feat/fix/docs/refactor/test/chore:` 前缀，一个逻辑变更一个提交
2. **事实源**：`TODO.md`（35 组待办）——完成任务必须勾选并在 34 组"循环执行记录"表加行
3. **设计遵循**：UI 见 `docs/design/07`（token 禁硬编码色值）与 `08`（组件契约/类名）；架构变更先改对应 ADR
4. **i18n**：所有用户可见文案进 `public/i18n/zh-CN.json` 与 `en.json` 两份（`check:i18n` 会拦不一致）
5. **内核 API**：一切 `/api` 调用收口在 `src/core/siyuan.ts`（transport 可注入，测试用 mock）
6. **数据边界**：业务数据只进思源侧（数据库/文档）；插件存储只放设置与运行态（ADR-7）
7. **隐私红线**：console 不输出用户数据；证件号等字段脱敏；不引入网络依赖
8. **测试**：新逻辑带单测（`tests/`，vitest）；内核 API 改动同步更新 mock
9. **EC 集成契约测试**：跨插件数据交换形状必须有测试锁定（`tests/core/ec-contracts.test.ts`）——提供方改字段时 CI 立即暴露
10. **schema 变更**：`pnpm test -- -u` 更新黄金快照 + CHANGELOG 记录原因；契约门禁（`validateSchema`）自动校验
11. **面板类型**：面板组件使用 `HomePluginLike`（`src/types/plugin.ts`）——插件类结构性满足，禁 `plugin: any`
12. **错误处理**：所有 async 路径（`await plugin.xxx` / `await setCell` / `await saveRuntime`）必须有 try/catch + 用户可见反馈

## EC 生态集成模式

管家与其他小驴系列插件（人脉/打卡/考试/闪卡/拾遗/雷切）通过以下方式集成：

| 模式 | 说明 | 已落地 |
|---|---|---|
| **window 全局桥** | 提供方挂 `window.<PluginName>`，消费方探测存在性后调用 | 人脉 `window.LvContacts`、管家 `window.LvHome`、打卡 `window.siyuanCheckin` |
| **app.plugins 探测** | 通过思源 `app.plugins` 查找插件实例，调用其公开方法 | 雷切 `registerQuickAction/registerHomeModule`（EC16/17） |
| **window CustomEvent** | 提供方 `dispatchEvent`，消费方 `addEventListener` | 考试 `lv-exam:stats`（EC21）、打卡 `checkin:*`（EC10） |

新增集成前先读提供方源码确认签名（参考 `docs/research/2026-10-03-EC-源码契约摘录.md`），实现后写契约形状测试锁定。

## 内核靶场约定（冒烟/e2e）

本机内核常被多个插件项目和真实数据共用，针对内核的自动化分两类：

| 类型 | 例子 | 约束 |
|---|---|---|
| **只读走查** | `device-batch-preflight.sh`、`smoke-test.mjs`（离线） | 不调写 API、不改 petal 存储；可在在用工作区随时跑、可并发 |
| **写型冒烟/基准** | `e2e-core.sh`、`e2e-endpoints.sh` | **禁直打在用工作区**：其他插件的事件监听会把测试写入当真实事件反应；并发索引放大 flakiness；同步工作区会被临时库建删搅动 |

写型脚本统一经 `scripts/lib/smoke-kernel.mjs` 三层防护（改自小驴考试 @fa57d6a）：

1. **目标参数化**：`SIYUAN_BASE_URL` / `SIYUAN_TOKEN` 环境变量（argv 优先）；缺 token 明确退出或 SKIP，绝不内置默认凭据；
2. **靶场防呆**：启动 `lsNotebooks`，存在任何非 `siyuan-home-smoke-*` 前缀的笔记本 → 判定非隔离靶场并拒跑（附处理指引）；确需豁免 `SIYUAN_E2E_ALLOW_SHARED=1`；
3. **残留清扫**：启动按前缀注册表（含旧名 `LVH-真机批`/`LVH-端点实测`）清扫上次崩溃残留，只删自己前缀内的库；临时库统一 `siyuan-home-smoke-*`，脚本结束时移除测试笔记本。

外发默认关：会向已配置 AI 模型真实发请求的检查步默认跳过，`SIYUAN_E2E_AI=1` 显式启用。退出码语义不变：可选脚本离线/缺凭据 → SKIP 退出 0；守卫拒绝或断言失败 → 退出 1。

**靶场做法**：用独立 workspace 目录起第二个思源实例（端口自动顺延为 6807），实例内只装被测插件；每个插件项目用自己的靶场 workspace，不跨项目共用；同一实例上的写型冒烟串行执行、不并发（只读走查可随时并发）。靶场实例 token 与主工作区不同，跑之前从该实例 设置→关于 获取。**靶场 workspace 放在仓库目录之外**（如 `D:\AI\思源笔记插件开发\靶场\<插件名>-ws`）——仓库内放置会让部署产物（dist 拷贝）落在源码树里，被安全扫描器反复误报，且构建产物本就不该入源码树。运维坑：**先启动内核后部署**会让内核把 `petals.json` 重写为空（启动时插件目录为空）——部署脚本需每次 upsert 注册表，部署后重启内核生效。

## 发布

- **版本策略（semver）**：
  - **Major**（1.0→2.0）：破坏性变更（数据结构不兼容、模块移除、最低思源版本抬升）
  - **Minor**（0.2→0.3）：新模块上线、显著新功能（用户可感知）
  - **Patch**（0.2.1）：修复、文案、性能优化（用户无新能力）
  - 0.x 阶段：Minor 即可能含结构调整，升级前看 CHANGELOG 的 migration notes
- `minAppVersion` 抬升策略：仅当依赖新内核能力时才升（否则保持最大兼容面）
- 版本号：`pnpm run update-version`（同步 package.json/plugin.json）
- Release：打 tag → GitHub Release 附 package.zip（**集市上架暂缓**，由维护者决定时机）
- **Beta 通道**：内测版本打 `vX.Y.Z-beta.N` 标签发 **GitHub prerelease**（勾选 "Set as a pre-release"）——内测用户手动下载安装；beta 不进 CHANGELOG 正式段，只在 prerelease notes 说明改动
- 发布前：`docs/testing/v0.2.md` 回归脚本走查 + `check:meta` + smoke test（33.5）

## 问题反馈

GitHub Issues（bug 请附环境信息与复现步骤；feature 请描述场景）。
