# v0.5.45 · 小驴管家（内测版）全方位代码防抖与安全健壮性审查：全仓SQL防注入转义加固、状态栏/移动端顶栏启动前清零与深度自愈

## 变更

- **全仓 SQL 查询转义防注入加固**：
  - 对 `health.ts`、`provisioner.ts`、`ledger.svelte` 中的全部 `sql<T>` 块查询参数（`docId`、`existing.docId`、`root_id`）统一实施严格的单引号转义过滤（`.replace(/'/g, "''")`），杜绝任何潜在的 SQL 语法截断或注入异常；
- **全生命周期幽灵节点彻底根绝**：
  - 启动阶段不仅清理桌面顶栏，同时对 `#status .lv-statusbar` 状态栏及 `#mobileTopBar #lvHomeMobileTopBarButton` 移动端顶栏实施启动前清零扫描；
  - 完善移动端与状态栏在 `onunload` 卸载时的全量节点 `remove()` 闭环，确保多次重载或多窗口切换时零残留、零叠影、零抖动。

## 验证

- 90 个测试文件，**791 项单测全部通过**（0 失败）。
- `tsc` 类型检查、Svelte 5 诊断（0 错误 0 警告）、i18n 1948 键严格对齐。
- 元数据校验与 `pnpm audit` 全部通过。
- 生产构建与 `smoke-test`、思源加载器语义测试（`verify-loader-semantics`）全部绿灯。

完整变更细节见 [CHANGELOG.md](./CHANGELOG.md)。
