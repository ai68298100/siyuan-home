# v0.5.0 · 小驴管家（内测版）车辆管理与体验优化

## 变更

- 新增车辆加油、充电、保养/维修流水，以及油耗、电耗、费用、趋势和日期/里程提醒。
- 优化首次安装建库、成员/证件/附件/提醒/设置操作的反馈和失败恢复。
- 修复思源 3.8.x 成员卡菜单、select 持久化、存储错误信封和移动端顶栏问题。
- 完整身份证号码校验、脱敏与按需 OCR 入口继续可用，并提供必要的配置和隐私引导。

## 验证

- 350 项单测通过；Svelte、TypeScript、i18n、meta、loader、生产构建和发布包 smoke 通过。
- `pnpm audit --prod --audit-level moderate` 本机通过，未发现已知漏洞。
- 真实思源 UI 六阶段走查（含 Android WebView 和无障碍检查）仍需人工宿主验收；本版继续保留 `disabledInPublish: true`。

完整变更见 [CHANGELOG.md](./CHANGELOG.md)。
