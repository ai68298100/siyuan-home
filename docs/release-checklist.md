# 发版清单（v0.3.0 起适用；版本号和 tag 必须参数化核对）

> 前置门禁（D18）：真机批全绿（docs/testing/device-batch-runbook.md 六阶段）+ PR/Issues 清零 + `pnpm audit --prod` 干净。自动 Release 还必须通过 test、smoke、包内容和体积检查；自动门禁不能替代真机 UI 证据。
> 全部命令在仓库根执行；发版是一次性动作，本清单按顺序走完即可。

## 1. 版本号

```
node scripts/update_version.js        # 交互式：输入 0.3.0（写 plugin.json/package.json）
```

- 同步核对：`src/plugin.json` 与根 `plugin.json` version 一致（check-meta 会拦不一致）。

## 2. CHANGELOG 定稿

- `CHANGELOG.md` 的 `## Unreleased` 两块（65–86 / 87–112+）合并且补齐尾波（当前最后记录到 112 波，发版前把后续轮次行折入）；
- 标题改为 `## v<version> <日期>`，保留此前已发布版本段落；
- 用户可感知口径核对：声明与实现一致（参照 87/108/110 波的同步方法）。

## 3. Release Notes

```
PREVIOUS_VERSION="v<previous-version>"
node scripts/release-notes.mjs "$PREVIOUS_VERSION" > release-notes-draft.md
```

- 人工润色后：GitHub Release 正文（tag 创建后），CHANGELOG 放精简版。

## 4. 构建与验证（缺一不可）

```
pnpm run build          # app + kernel 双目标（勿用单目标 npx vite build）
pnpm run check          # tsc×2 + svelte + i18n(含使用面) + meta + audit
pnpm test               # 全量测试
node scripts/smoke-test.mjs
```

- 全绿后 `package.zip` 即集市候选包。

## 5. Tag 与 Release

```
VERSION="<version>"
git add -A && git commit -m "chore(release): v$VERSION"
git tag "v$VERSION" && git push origin main --tags
gh release create "v$VERSION" --title "v$VERSION" --notes-file release-notes-draft.md package.zip
```

## 6. 集市材料

- 截图：真机批 PL24 产出（总览/提醒/台账/成员/设置，标注版本与合成资料状态）；
- 描述双语与 README 对齐；`disabledInPublish` 决策复核（D13：当前 true=不上架自动分发，按需调整）。

## 7. 发版后

- 部署一份到本地实例并跑预检（`scripts/device-batch-preflight.sh`）确认升级路径；
- TODO 循环日志收尾行 + 决策日志 D18 状态更新。
