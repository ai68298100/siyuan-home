# v0.5.53 · 小驴管家（内测版）虚拟滚动视口防抖防跳动与全场景空值引用加固

## 变更

- **表格虚拟滚动视口防抖防跳动（Virtual Scrolling Bounds）**：
  - 重构 `virtualRange` 边界约束公式（`start = Math.max(0, Math.min(first, Math.max(0, total - count)))`, `end = Math.min(total, start + count)`），确保视口高度与上下占位垫片总和严格守恒，彻底消除在快速滚动至台账底部时滚动条跳动与视觉频闪；
- **全场景单元格空值防御强化**：
  - 对行记录属性视图单元格访问全面增加安全可选链保护（`r.cells?.[ref?.columns?.[k]]`），杜绝极端残缺行或列配置加载未就绪时的潜在空指针报错。

## 验证

- 90 个测试文件，**791 项单测全部通过**（0 失败）。
- `tsc` 类型检查、Svelte 5 诊断（0 错误 0 警告）、i18n 1950 键严格对齐。
- 元数据校验与 `pnpm audit` 全部通过。
- 生产构建与 `smoke-test`、思源加载器语义测试（`verify-loader-semantics`）全部绿灯。

完整变更细节见 [CHANGELOG.md](./CHANGELOG.md)。
