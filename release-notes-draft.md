# v0.5.9 · 小驴管家（内测版）生态联动增强、安全日志审计、附件危险类型阻断与全量无障碍审查认证

## 变更

- **生态联动全面增强（EC13–EC19）**：
  - 向小驴雷切（`siyuan-speed-switch`）注册全局快捷动作（`lvhome.open-overview` 打开总览、`lvhome.open-reminders` 打开提醒中枢）与实时家庭摘要仪表卡（`lvhome.summary`），契约经单测锁定。
  - 与小驴人脉（`siyuan-contacts`）实现成员联系人检索绑定、解绑与快照展示，在人脉未安装时提供缺失优雅降级。
- **全量无障碍审查认证（A11Y-01）**：
  - 核心操作支持全键盘导航（Tablist 箭头键切换、成员卡键盘排序、Enter/Space 展开与操作）。
  - 全局 5 秒撤销底栏支持全局快捷键（`Ctrl+Z` / `Cmd+Z` 瞬时恢复）。
  - `@media (forced-colors: active)` 激活标准 `CanvasText` 轮廓线；`@media (prefers-reduced-motion: reduce)` 严密禁用所有非必要动效与过渡。
  - 全量补齐 ARIA 属性（`role="tablist"` / `role="tab"` / `role="status"` / `aria-selected` / `aria-live`），触控命中区加权至 ≥32px。
- **安全日志审计与附件安全处理边界（SEC-02）**：
  - 全局代码控制台日志审计：确认仅输出脱敏的错误信息与状态码，绝对不输出 Token、身份证号、明文密码与敏感金额。
  - 附件抽屉引入 `isDangerousAsset` 校验，阻断可执行文件与高危脚本伪装，仅图片与 PDF 开放安全预览。
- **确认彻底根除切页微闪烁与路由死循环**：
  - `screenCache` 内存组件池与 150ms 闲置预热机制持续守护，实现“总览 / 提醒 / 台账 / 成员”四主屏 **100% 同步秒开无缝切换**，彻底消除骨架屏微闪烁。
  - 彻底拔除对宿主全局 `window.history` / `popstate` 的依赖，杜绝任何 `tree not found` 及路由纠错死锁。

## 验证

- 全量单元测试 66 个测试文件共 **512 项全绿**。
- 多语言词条扩充至 1747 键中英文全量对齐；TypeScript 与 Svelte 0 错误 0 警告，单文件打包与加载器语义通过。
- `pnpm audit --prod --audit-level moderate` 通过，未发现中等级别及以上生产依赖漏洞。

完整变更见 [CHANGELOG.md](./CHANGELOG.md)。
