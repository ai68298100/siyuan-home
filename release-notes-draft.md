# v0.5.21 · 小驴管家（内测版）紧急修复思源 3.8.x 顶栏闪烁与页面读取循环

## 变更

- 移除插件页签对宿主 `window.history` / `popstate` 的依赖，避免思源将插件状态误判为文档路由并触发 `tree not found` 纠错循环。
- 使用 `sessionStorage` 保存插件内部页签，刷新后稳定恢复且不污染思源历史栈。
- 将首次扫描安排到挂载后的定时器，并预热 `screenCache`，消除内容与加载态反复闪烁。
- 增加 Chrome 隔离内核页签生命周期回归检查，覆盖连续切页、刷新、历史栈稳定性、页面唯一挂载和错误日志。

## 验证

- `pnpm check`
- `pnpm test`
- `pnpm build`
- `pnpm run verify:loader`
- `pnpm run smoke`
