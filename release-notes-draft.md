# v0.5.4 · 小驴管家（内测版）紧急修复

## 变更

- **彻底根治 `tree not found` 报错与路由死锁**：
  - 彻底拔除 `TabPanel` 中对宿主全局 `window.history`（`history.pushState`、`history.replaceState`、`window.addEventListener("popstate")`）的侵入性调用。
  - 根因定位：思源笔记作为单窗口桌面应用，全局路由器会捕获插件在自定义 Tab 中写入的非文档 ID 路由状态并尝试加载文档树，导致思源内核抛出 `tree not found` 弹窗；随后思源试图纠正路由触发 `popstate`，与插件形成相互触发的死循环，造成页面在能渲染与骨架屏之间快速来回闪烁。
  - 插件内部页签状态切换完全改由安全的 `sessionStorage` 与组件局部状态接管，彻底隔离宿主全局历史。
- **解耦首屏扫描与刷新事件监听**：
  - `refreshInitialScan` 从频繁受依赖重触发的 `$effect` 移至 `onMount` 启动，切断 `hubListeners`（`version++`）引发的递归自激更新。

## 验证

- 409 项单测全部通过；TypeScript、Svelte（0 错误 0 警告）、i18n（1522 键全量对齐）、元数据、loader 语义、生产构建和发布包 smoke 检查全部通过。
- `pnpm audit --prod --audit-level moderate` 通过，未发现中等级别及以上生产依赖漏洞。

完整变更见 [CHANGELOG.md](./CHANGELOG.md)。
