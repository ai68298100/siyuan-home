# 迁移指南（从其他应用迁入小驴管家）

> 设计三原则（源自 Wunderlist 停服教训，见 MODULES.md 附录）：
> ① 数据本地思源侧，服务消亡不丢数据；② 标准格式（CSV/JSON）导出一等公民；③ 迁移逐字段核对，绝不静默丢弃。
> 本指南持续补充；映射表为起点，实际迁移后请**抽查核对**（尤其备注/附件类字段）。

## 通用流程

1. 在原应用导出 CSV（多数支持：设置/导出/备份）
2. 对照下方字段映射整理列名（可先只迁移核心列：名称/日期/金额）
3. 思源中启用对应模块 → 台账页"新建"逐行录入，或用思源数据库原生导入（CSV 粘贴）
4. **核对**：行数、日期格式（YYYY-MM-DD）、金额、备注是否完整
5. 原应用保留只读存档至少一个月再删除

## Sortly → 实物资产（assets-real）

| Sortly 字段 | 本插件字段 |
|---|---|
| Item Name | name |
| Category/Folder | category |
| Location | location |
| Purchase Price | amount |
| Purchase Date | date |
| Warranty Expiry | warranty_expiry |
| Custom Fields | tags / note |
| Photos | attachments（手动重挂） |

## 钱迹 → 购物记录/会员与订阅

| 钱迹概念 | 本插件字段 |
|---|---|
| 周期账（房租/订阅） | memberships.next_pay + cycle |
| 账户资产 | assets-virtual（余额快照手动） |
| 分类 | category |
| 金额/日期 | amount / date |
| 备注 | note |

**不迁移**：交易流水明细（本插件不做记账，只留台账级金额）。

## 注意事项

- 证件号等敏感字段：原应用若存全号，迁入时**只填后四位**（脱敏原则）
- 附件（图片/PDF）：CSV 不含文件，需在原应用逐个下载后手动挂到台账行
- 农历生日：原应用多为公历，勾选"农历"前请核对
- **同名行**：快速录入遇到同名会提示确认（防手滑重复；同名不同规格属合法可继续）
- **迁移后核对**：设置 → 关于 → 深度健康检查，逐模块核对行数、读取完整性与 schema 缺列
