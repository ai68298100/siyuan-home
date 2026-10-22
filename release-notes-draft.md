# v0.5.43 · 小驴管家（内测版）紧急修复重载思源后顶栏出现两个图标问题，强化 DOM 排重守护与 onunload 清理闭环

## 变更

- **紧急修复重载后顶栏出现两个图标问题**：
  - **根因锁定**：在思源重载插件时，旧插件实例卸载时未显式调用 `removeTopBar` 且未将 DOM 节点清除；同时 `ensureTopBarIconAlive` 中的查询选择器与思源官方真实生成的 `[data-id="siyuan-home-topbar"]` 属性不匹配，导致误判“图标丢失”后再次执行 `addTopBar`，在顶栏累加了第二颗重复图标；
  - **根本解决**：
    1. 启动注册前自动排查并彻底清除任何残留的历史顶栏节点（`querySelectorAll('#toolbar ...').forEach(el => el.remove())`）；
    2. 存活守护引入**自动排重收敛逻辑**：一旦发现 toolbar 中管家图标数量 > 1，立即自动清除多余节点严格仅留 1 个；数量 == 1 时坚决不重复调用 `addTopBar`；
    3. `onunload` 卸载时严格执行 `removeTopBar("siyuan-home-topbar")` 并清理 DOM 引用，彻底闭合生命周期，保证视觉上永远只有唯一 1 个顶栏图标。

## 验证

- 90 个测试文件，**791 项单测全部通过**（0 失败）。
- `tsc` 类型检查、Svelte 5 诊断（0 错误 0 警告）、i18n 1948 键严格对齐。
- 元数据校验与 `pnpm audit` 全部通过。
- 生产构建与 `smoke-test`、思源加载器语义测试（`verify-loader-semantics`）全部绿灯。

完整变更细节见 [CHANGELOG.md](./CHANGELOG.md)。
