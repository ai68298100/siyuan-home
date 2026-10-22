# v0.5.40 · 小驴管家（内测版）深度对齐思源官方最新插件生命周期契约，接入原生右键菜单、自定义URL路由与AttributeView数据库深度联动

## 变更

- **对齐思源官方最新生命周期契约（Petal Lifecycle 与防抖）**：
  - **严格串行与 5 秒预算契约**：严格遵循思源官方《前端插件生命周期契约》（Issue #18979），`onload` -> `onLayoutReady` -> `onDataChanged` -> `onunload` 严格串行且遵守 5 秒超时约束，卸载期间严禁开启新任务；
  - **跨设备同步 (sync) 即时感知**：`onDataChanged(reason)` 识别 `reason === "sync"` 来源，当云端同步拉取新数据时自动静默刷新 `runtime` 与只读扫描到期提醒，无需用户手动重启插件；
  - **顶栏入口原生稳定 ID 幂等注册**：`addTopBar` 显式声明官方稳定标识 `id: "siyuan-home-topbar"`，与宿主管理系统深度绑定，彻底杜绝多窗口与 DOM 刷新时的顶栏排布抖动；
- **思源官方功能深度融合与交互创新**：
  - **顶栏图标原生右键菜单（contextMenu）**：右键点击顶栏管家图标，即可呼出原生快捷菜单：⚡ 快速记录 (Alt+N)、⏰ 到期提醒、🗂️ 家庭台账、👥 家庭成员与 ⚙️ 管家设置；
  - **思源协议自定义 URL Scheme 路由（siyuan://plugins/siyuan-home/...）**：正式支持在思源文档超链接、看板或外部浏览器中通过协议直达管家任意页面或唤起快速记录（例如 `?screen=reminders`、`?action=capture`）；
  - **思源原生属性视图（AttributeView 数据库）右键联动**：在思源笔记中右键任意属性视图数据库行，即可一键呼出小驴管家管理面板或展开快速记录；
  - **思源文档块级打开高亮聚焦（cb-get-hl / cb-get-focus）**：`showTabDocs` 原生传递 `["cb-get-focus", "cb-get-hl"]` 与 `keepCursor: false`，跳转思源文档时自动高亮聚焦该条目块。

## 验证

- 90 个测试文件，**791 项单测全部通过**（0 失败）。
- `tsc` 类型检查、Svelte 5 诊断（0 错误 0 警告）、i18n 1946 键严格对齐。
- 元数据校验与 `pnpm audit` 全部通过。
- 生产构建与 `smoke-test`、思源加载器语义测试（`verify-loader-semantics`）全部绿灯。

完整变更细节见 [CHANGELOG.md](./CHANGELOG.md)。
