# Spike：R1 / R2 / R5 实验结论（✅ 2026-10-01 已完成回填）

> 执行环境：思源 3.8.x 实例（内核 `127.0.0.1:6806`，注意 sy env 里的 1568 已过期）。
> 实验笔记本 `siyuan-home-spike`（2 文档/8 块，全部为实验创建数据）已删除。
> **结论已实现进 `src/core/siyuan.ts`**（transport 可注入，av 全路径真实实现）。

---

## 实验一 · R-av-create：✅ 定案（方式 b+c 组合）

**建库路径**（三步，全部验证通过）：

1. `createDocWithMd` 写入 av 容器（**自造 av-id 可被接受**）：
   `<div data-type="NodeAttributeView" data-av-id="<seed>" data-av-type="table"></div>`
2. SQL 定位 av 块：`SELECT id FROM blocks WHERE type='av' AND markdown LIKE '%<seed>%'`
3. `POST /api/av/renderAttributeView {id: <块ID>, createIfNotExist: true}` → 内核创建 av 实体（自动带"主键"block 列、"单选"select 列、表格视图）

**关键事实**：**avID = av 块 ID**（非自造 seed）；`getAttributeView {id}` 用块 ID 查询。
**加列**：`POST /api/av/addAttributeViewKey {avID, keyID(自造), keyIcon:"", keyName, keyType, previousKeyID:""}` —— text/date/select/number/relation 全部验证通过（keyIcon 与 previousKeyID 必填，空串即可）。
**加行**：`POST /api/av/addAttributeViewBlocks {avID, srcs:[{content, isDetached:true}]}`（detached 行）✅；**`isDetached:false` 绑定真实块静默失败**（code 0 但行不出现）→ 非绑定行路径需另探索（`/api/transactions` 或 UI 组合调用），已记 TODO（A2b 附注）。
**写值**：`POST /api/av/batchSetAttributeViewBlockAttrs {avID, values:[{keyID, itemID, value}]}` ✅ text/date 验证。**rowID 参数已废弃改 itemID**（issue #15727）。
**读**：`renderAttributeView → data.view.{columns, rows, rowCount}`（rows[].id=行 itemID；cells[].value 按类型）；行主键列表 `getAttributeViewPrimaryKeyValues {id: avID, page, pageSize}`。

## 实验二 · R2 关系列：✅ 可行（优于降级方案）

- relation 列可编程创建：`keyType:"relation"` + `relation:{avID:<目标av>, isTwoWay:false, backKeyID:""}` ✅
- relation 值写入：`value:{type:"relation", relation:{blockIDs:[<目标行 itemID>]}}` ✅（目标= members av 的行 itemID）
- **限制**：读取 API 不回显 relation 目标 avID（key 仅 7 个基础字段）——无碍：列的目标由插件 schema 声明（`member` → members 库），不需要读回。
- **ADR-4/02 §2 定案**：字典列 `member` = relation 列 → members 库；跨模块成员聚合走 members 库反向查询或按 itemID join。

## 实验三 · R5 行定位：⚠️ 降级定案

- detached 行有 itemID（=行内块 ID）但**不在 blocks 表**：SQL 不可查、`openTab` 无法块定位。
- 绑定真实块的行暂不可编程创建（见实验一）。
- **B4e 定案**：「定位」动作降级为 `openTab({doc:{id:<台账文档ID>}})` 打开台账文档；行内高亮待非绑定行路径解锁后复核。
- 附注：行数据若需要 SQL 全局检索，需依赖绑定真实块的行（解锁后行块可入 blocks 表）；当前 detached 模式下提醒中枢扫描走 av 读取 API（renderLedger / getAttributeViewPrimaryKeyValues），不依赖 SQL。

## 对架构的影响（已落实）

| 项 | 结论 |
|---|---|
| 01 ADR-4 | 台账嵌入方式仍有三个候选未定（前端行为），但**数据层建库/读写路径已定案并实现**；C4 台账页外壳可先走"在文档中打开" |
| 01 ADR-1 | 行=块 修订：detached 行不产生可双链的块；"行即块可双链"作为 v0.2+ 待解锁能力（依赖非绑定行路径），文档与 UI 文案相应调整 |
| 02 §2 | `member` 列 relation 可用；`relationTargetAvID` 由 provisioner 从 dbRefs.members 注入 |
| 03 §5 | B4e 定位降级 |
| 05 §6 | R1 部分（数据层）✅ / R2 ✅ / R5 ⚠️ 降级 / R-av-create ✅ |
| siyuan.ts | 真实实现：createAttributeView / addAttributeViewColumn / addDetachedRow / setCell / renderLedger / primaryRowItemIDs（transport 可注入可测） |
