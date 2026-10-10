# v0.4.2 · 小驴管家（内测版）首次安装建库兼容修复

## 变更

- 修复思源 3.8.6+ `createNotebook` 返回对象格式导致首次安装建库时报 `Field [notebook] has an invalid type` 的问题。
- 兼容裸字符串、`{ notebook: id }`、`{ notebook: { id } }` 和 `{ id }` 四种响应格式；无效响应会立即显示明确错误。

## 验证

- 329 项单测通过；Svelte、TypeScript、i18n、meta、loader、生产构建和发布包 smoke 通过。
- `pnpm audit --prod --audit-level moderate` 本机通过，未发现已知漏洞。
- 真实思源 UI 六阶段走查（含 Android WebView 和无障碍检查）仍需人工宿主验收；本版继续保留 `disabledInPublish: true`。

完整变更见 [CHANGELOG.md](./CHANGELOG.md)。
