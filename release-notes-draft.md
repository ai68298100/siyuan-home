# v0.4.1 · 小驴管家（内测版）按钮可用性与失败恢复

## 变更

- 新增建库结果报告、身份待确认恢复入口，以及重建/导入/恢复后的明确失败回执。
- 优化建库单飞与状态变更复查，避免并发重复建库并补建过程中启用的新模块。
- 修复 CSV 导出不沿用当前排序、快速录入身份待确认重开后目标台账丢失等问题。
- 收口提醒、成员、台账、总览、设置和引导中的保存中、失败、重试、空态与导出反馈。

## 验证

- 324 项单测通过；Svelte、TypeScript、i18n、meta、loader、生产构建和发布包 smoke 通过。
- `pnpm audit` 因当前环境访问 npm registry 时的 `UnknownIssuer` 证书错误未能完成，待 CI 网络环境复核。
- 真实思源 UI 六阶段走查（含 Android WebView 和无障碍检查）仍需人工宿主验收；本版继续保留 `disabledInPublish: true`。

完整变更见 [CHANGELOG.md](./CHANGELOG.md)。
