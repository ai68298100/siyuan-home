# v0.5.46 · 小驴管家（内测版）全面落地《小驴生态中枢统领指令》：四别名联邦挂载、弃用笑脸换装暖木金火种标、移动端键盘避让与雷切组件注册

## 变更

- **跨插件联邦联动（Epoch 6 标准）**：
  - **四别名挂载与安全注销**：同步挂载 `window.LvHome`、`window.lvHome`、`window.xiaolvHome`、`window.siyuanHome`，严格实行 First-Instance-Wins，实现 `hasCapability()` 能力协商与 `whenReady()` 握手；`summary()` 严格只返回数字计数，绝不泄漏敏感信息；
  - **人脉选人双轨智能回退**：`contact-picker.ts` 接入生态 SDK，未安装人脉插件时平滑回退，保障单插件 100% 独立可用；
  - **事务完成打卡联动与雷切小组件**：事项办结时调用 `logCheckinEventSafely`（`home:<module>:<rowId>:<today>`）；向雷切注册 `home-expiry-reminders` 家庭提醒看板组件；
- **顶栏图标重大升级（彻底弃用 iconEmoji 笑脸）**：
  - 桌面与移动全端注册官方统一山墙小屋+壁炉火种矢量图标（`iconLvHome`），将顶栏写死的 `iconEmoji` 彻底替换为 `iconLvHome`；
- **UI 样式轻量统一与 Bento 软性美学**：
  - 注入专属品牌变量 `--lv-brand: #D97706`（暖木金）、`--lv-brand-soft` 与 `--lv-accent-ruby: #E11D48`（鸽血红火种）；
  - 清理顶层裸写 `.b3-dialog` 样式污染，全部限制在 `:has([id^="lv-"])` 专属命名空间；统一徽章为 `9999px` 胶囊药丸；
- **深层工程规范与历史排雷加固**：
  - `plugin.json` 补充 `"keywords": ["小驴", "小驴管家", ...]`，新增 `"settingsWindow": true`，`minAppVersion` 升至 `"3.8.4"`；保持最新殿堂级金底红宝石头像 `icon.png` 不变；
  - 精简默认快捷键占用（仅保留主入口 `Ctrl+Alt+H`），其余设为空字符串防冲突；
  - 移动端快速录入挂载 `window.visualViewport` 动态抬升底边距避让软键盘；全仓控制台日志规范统一为 `[LvHome]`；产出包含 `dist/i18n/zh_CN.json`。

## 验证

- 90 个测试文件，**791 项单测全部通过**（0 失败）。
- `tsc` 类型检查、Svelte 5 诊断（0 错误 0 警告）、i18n 1948 键严格对齐。
- 元数据校验与 `pnpm audit` 全部通过。
- 生产构建与 `smoke-test`、思源加载器语义测试（`verify-loader-semantics`）全部绿灯。

完整变更细节见 [CHANGELOG.md](./CHANGELOG.md)。
