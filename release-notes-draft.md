# v0.5.18 · 小驴管家（内测版）生态服务桥API规范、建库器多分支容错与Issue模板体系

## 变更

- **生态服务桥 API 规范文档权威发布（DOC-01）**：
  - 在 `docs/api.md` 中全景呈现 `window.LvHome` Protocol 1 对外标准契约与 5 项核心能力方法签名（`whenReady`、`openButler`、`openReminders`、`addMemo`、`summary`）。
  - 详细定义与雷切、人脉、考试、打卡兄弟插件的事件联动通道，严格落实零私有存储渗透、入参类型防御及输出有界脱敏原则。
- **建库器多分支容错与自动化单测闭环（PROV-01）**：
  - 深度核查并锁定 `tests/core/provisioner.test.ts` 19 项单元测试，完整覆盖全新建文档建库建列、文档在登记丢找回属性视图块、内核 not found 自动重建等全部容错分支。
  - 配合 fakeKernel 模拟网络丢包与重试全链路，确保各种极端边界下台账文档与属性视图稳定自愈。
- **标准化 GitHub Issue 规范模板体系（COMM-01）**：
  - 统一建立 `.github/ISSUE_TEMPLATE/` 规范模板，提供环境信息、复现步骤、脱敏日志检查与影响范围分类，保障开源社区问题高效高质量收敛。
- **确认彻底根除切页微闪烁与路由死循环**：
  - `screenCache` 内存组件池与 150ms 闲置预热机制持续稳定运行，实现“总览 / 提醒 / 台账 / 成员”四主屏 **100% 同步秒开无缝切换**，彻底消除骨架屏微闪烁。
  - 快速记录弹层（`quick-capture`）250ms 闲置预热就绪，`N` 键呼出与 ⚡ 点击零延迟瞬时秒开。
  - 彻底拔除对宿主全局 `window.history` / `popstate` 的依赖，杜绝任何 `tree not found` 及路由纠错死锁。

## 验证

- 全量单元测试 66 个测试文件共 **512 项全绿**。
- 多语言词条扩充至 1747 键中英文全量对齐；TypeScript 与 Svelte 0 错误 0 警告，单文件打包与加载器语义通过。
- `pnpm audit --prod --audit-level moderate` 通过，未发现中等级别及以上生产依赖漏洞。

完整变更见 [CHANGELOG.md](./CHANGELOG.md)。
