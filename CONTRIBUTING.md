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

## 开发约定

1. **Conventional Commits**：`feat/fix/docs/refactor/test/chore:` 前缀，一个逻辑变更一个提交
2. **事实源**：`TODO.md`（35 组待办）——完成任务必须勾选并在 34 组"循环执行记录"表加行
3. **设计遵循**：UI 见 `docs/design/07`（token 禁硬编码色值）与 `08`（组件契约/类名）；架构变更先改对应 ADR
4. **i18n**：所有用户可见文案进 `public/i18n/zh-CN.json` 与 `en.json` 两份（`check:i18n` 会拦不一致）
5. **内核 API**：一切 `/api` 调用收口在 `src/core/siyuan.ts`（transport 可注入，测试用 mock）
6. **数据边界**：业务数据只进思源侧（数据库/文档）；插件存储只放设置与运行态（ADR-7）
7. **隐私红线**：console 不输出用户数据；证件号等字段脱敏；不引入网络依赖
8. **测试**：新逻辑带单测（`tests/`，vitest）；内核 API 改动同步更新 mock

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
