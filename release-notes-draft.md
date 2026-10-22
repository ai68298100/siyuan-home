# v0.5.44 · 小驴管家（内测版）全仓系统性排查多端顶栏、状态栏与浮层生命周期，建立全局唯一性闭环与幽灵节点主动收敛机制

## 变更

- **全仓系统性排查多端顶栏与状态栏生命周期**：
  - **启动注册前主动清幽灵**：在 `registerEntrypoints()` 中，启动注册前不仅对 `#toolbar` 桌面顶栏，同时对 `#status .lv-statusbar` 状态栏及 `#mobileTopBar #lvHomeMobileTopBarButton` 移动端顶栏实施全局历史残留扫描与清空，确保初始化环境处于纯净状态；
  - **移动端顶栏主动排重守护**：`ensureMobileTopBarButton` 增加对 `#mobileTopBar` 中同名按钮的实时数量检测，一旦发现数量 > 1 立即自愈清除多余节点，严格维持有且仅有 1 个按钮；
  - **onunload 卸载彻底清理闭环**：卸载与重载时对桌面顶栏、移动端顶栏与状态栏节点实施彻底的 DOM `remove()`，从机制层面彻底根除重载后任何 UI 元素的叠加与重影风险。

## 验证

- 90 个测试文件，**791 项单测全部通过**（0 失败）。
- `tsc` 类型检查、Svelte 5 诊断（0 错误 0 警告）、i18n 1948 键严格对齐。
- 元数据校验与 `pnpm audit` 全部通过。
- 生产构建与 `smoke-test`、思源加载器语义测试（`verify-loader-semantics`）全部绿灯。

完整变更细节见 [CHANGELOG.md](./CHANGELOG.md)。
