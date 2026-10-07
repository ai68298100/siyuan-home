## 自查清单

- [ ] PR 标题符合 Conventional Commits，并且说明了用户可感知的结果
- [ ] 改动范围与 PR 目标一致，没有夹带无关格式化或生成文件
- [ ] `pnpm run check` 零错误零警告（types + svelte + i18n + meta + audit）
- [ ] `pnpm test` 全绿
- [ ] `pnpm run build` 成功，并通过 `pnpm run smoke` 与 `pnpm run verify:loader`
- [ ] 若改动依赖或构建配置，已检查 `pnpm-lock.yaml`
- [ ] 涉及 UI 的改动已对照 `prototype/index.html` 或设计文档
- [ ] 涉及移动端或宿主生命周期的改动，已注明真实 SiYuan/Android 验证范围
- [ ] 新增文案已同步 `public/i18n/zh-CN.json` 与 `en.json`
- [ ] 完成的 TODO 项已在 `TODO.md` 勾选，并更新对应循环记录（如适用）
- [ ] 提交信息符合 Conventional Commits
- [ ] 未提交真实用户数据、token、密码、工作区导出或截图隐私

涉及真实实例的验证请在描述中记录版本、平台和结果；不要上传工作区导出、token 或个人资料。

## 改动说明

（做了什么、为什么、影响面）

## 验证

（列出执行的命令、结果，以及尚未执行的真实宿主/设备验证。）

## 截图或录屏（可选）

（仅上传合成数据或脱敏画面；移动端请说明是真实 SiYuan WebView 还是浏览器模拟。）
