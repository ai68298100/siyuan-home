# Spike：R1 / R2 / R5 实验指南（v0.2 阶段 S）

> 目的：在真实思源实例（3.8.x）上定案三个架构开放问题（[05 扩展设计 §6](../design/05-扩展设计.md)）。
> 执行方式：本机内核 `http://127.0.0.1:1568`，用 `sy` 客户端（siyuan-kernel-api skill）。
> 所有实验在临时笔记本 `siyuan-home-spike` 中进行，结论回填本文档与代码，实验笔记本经用户确认后删除。

## 准备

```bash
sy="<siyuan-kernel-api skill>/scripts/sy"
"$sy" nb            # 确认实例可达；记录现有笔记本（避免污染用户数据）
```

## 实验一 · R-av-create：编程创建数据库（av）

三种候选，择一贯穿实现（`src/core/siyuan.ts#createAttributeView`）：

1. **直连端点**（若存在最优先）：
   ```bash
   "$sy" api -g attributeView          # 列出全部 av 端点与参数
   "$sy" api -g "av" | head -40
   ```
   关注：createAttributeView / addAttributeViewColumn(s) / setAttributeViewColumn / addAttributeViewBlocks。
2. **insertBlock kramdown**：`/api/block/insertBlock` 插入 av 块语法（先在思源 UI 手建一个 av，`"$sy" sql "SELECT markdown FROM blocks WHERE type='av'"` 观察其 kramdown 形态）。
3. **createDocWithMd 内联**：同上形态能否在文档创建时内联。

记录：能否设列名/列类型/枚举值？返回什么 ID？视图（table）默认是否自动创建？

## 实验二 · R2 关系列

在实验一产出的 av 上：

```bash
# 尝试创建 relation 列（端点与参数名按实验一发现替换）
"$sy" <av-add-column> -d '{"avID":"...","column":{"type":"relation","name":"成员","relation":{"avID":"<成员库avID>","isTwoWay":false}}}'
```

- [ ] relation 能否编程创建并指向另一 av？
- [ ] 已有行填 relation 值的写法？
- 失败 → 启用降级：字典列 `member` 改 text（存成员名），成员页跨模块聚合改 SQL `LIKE`。回填 [02 §2](../design/02-数据模型与模块规格.md)。

## 实验三 · R5 行定位

```bash
"$sy" sql "SELECT id, f_id? FROM av_blocks WHERE av_id='<avID>'"   # 取行块 ID（表名按实际调整）
```

前端验证（在插件里临时按钮调用）：

- `openTab({doc: {id: rowBlockId}})` 是否定位并高亮该行？
- `openTab` 的 `focusName: "av"`（siyuan.d.ts:426）可否直接聚焦数据库页签？

记录结论到 [03 §5 定位](../design/03-提醒中枢.md)：可用 / 降级"打开台账文档"。

## 收尾

- 结论回填：`siyuan.ts` 端点实现、`provisioner.ts` 若无变化确认、`05 §6` 风险表打勾、`01 ADR-4` 定案。
- 临时笔记本删除需你确认爆炸半径后 `"$sy" removeNotebook -y`（内容全部为实验数据）。
