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

## 滴答清单 / Things 3 → 提醒中枢 / 快速备忘

| 原应用概念 | 本插件对应功能 |
|---|---|
| 收集箱 / Inbox | 快速备忘（adhoc / ⚡ 快捷记录） |
| 截止日（Deadline） | 硬截止日（dueDate，逾期加粗红显） |
| 计划日（Plan / When Date） | 计划处理日（planDate，智能双日期解耦） |
| 重复任务（Recurring） | 周期性提醒规则（chores / memberships） |
| 标签 / 分组 | 模块分类 / 智能筛选命名视图（UIX-06） |

## Grocy → 家庭药箱 / 囤货清单

| Grocy 字段 | 本插件字段 |
|---|---|
| Product Name | name |
| Location | location |
| Best Before Date | expiry |
| Current Stock Amount | stock_qty |
| Minimum Stock Amount | low_stock_at |
| Price | amount |

## 0.x → 1.0 版本平滑升级说明

- **台账数据零损耗**：台账记录完全作为思源原生数据库文档与块存储在用户工作空间内，插件升级不经过外部数据库迁移，原有用例与数据 100% 保持不动。
- **自动向前兼容**：新版本引入新配置项或新字段时，`settings.ts` 自动补全默认配置，同时严格保留用户原有的偏好设置（如排序规则、命名视图、静默时段与提前量覆写 `leadOverrides`）。
- **属性视图只增列机制**：版本迭代增加新字段时，建库器仅自动补充缺失的 schema 声明列，绝不修改或删除用户自建的自定义属性视图列。
- **自愈与回退备份**：若发生意外断电或坏文件，插件会在 `data/storage/petal/siyuan-home/` 下自动生成 `.corrupted.json` 安全快照并回退到可用配置，保障主程序始终稳定启动。

## 注意事项

- 证件号等敏感字段：按实际管理需要迁入；如录入完整号码，请知悉号码会保存在思源台账中，界面默认掩码不等于加密，导出 CSV 也可能包含原值
- 附件（图片/PDF）：CSV 不含文件，需在原应用逐个下载后手动挂到台账行
- 农历生日：原应用多为公历，勾选"农历"前请核对
- **同名行**：快速录入遇到同名会提示确认（防手滑重复；同名不同规格属合法可继续）
- **迁移后核对**：设置 → 关于 → 深度健康检查，逐模块核对行数、读取完整性与 schema 缺列
