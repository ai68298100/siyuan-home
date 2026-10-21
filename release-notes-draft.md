# v0.5.31 · 小驴管家（内测版）紧急修复浏览器底层 Headers 构造异常（彻底根治建库崩溃）

## 变更

- **修复核心通信崩溃（根治 `Failed to construct 'Headers': String contains non ISO-8859-1 code point`）**：
  - **根因锁定**：在 `siyuan.ts` 的底层 `fetchSyncPost` 和资源上传中，原本尝试向内核传递 `X-Idempotency-Key` 自定义标头；当该 Key 中包含中文台账路径（如 `/台账 · 家庭成员`）或 Emoji 笔记本名（如 `🏠 小驴管家`）时，**浏览器原生 `new Headers()` 在发出网络请求前直接抛出 `TypeError: Failed to construct 'Headers': String contains non ISO-8859-1 code point`**！导致建笔记本和建文档请求根本无法发出，在浏览器前端当场暴毙，内核日志完全收不到请求；
  - **彻底拔除**：思源内核为同源本地 HTTP 接口，本身无需也并不识别 `X-Idempotency-Key` 标头（幂等防重放完全由插件内部的内存队列可靠保证）；已彻底移除向 `fetchSyncPost` 和 `fetch` 注入非标准自定义 Header 的逻辑，从物理层杜绝任何非 ISO-8859-1 字符触碰浏览器 Headers 限制；
  - **验证保障**：新增单元测试验证带有中文与 Emoji 字符的请求在任何情况下都不会触发 Headers 构造异常。

## 验证

- 89 个测试文件，**788 项单测全部通过**（0 失败）。
- `tsc` 类型检查、Svelte 5 诊断（0 错误 0 警告）、i18n 1946 键严格对齐。
- 元数据校验与 `pnpm audit` 全部通过。
- 生产构建与 `smoke-test`、思源加载器语义测试（`verify-loader-semantics`）全部绿灯。

完整变更细节见 [CHANGELOG.md](./CHANGELOG.md)。
