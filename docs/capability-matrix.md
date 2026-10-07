# 能力证据矩阵（TRUST-01）

> 生成：scripts/trust-matrix.mjs @ v0.3.9（靶场 http://127.0.0.1:14680 内核实读 + 源码契约解析）。
> 证据等级：L1=代码存在 · L2=自动化断言（单测/e2e）· L3=真机（残余见 §缺口）。对外文案只引用 L2 及以上。

## 全局契约事实（L1/L2）

- SCHEMA_CATALOG 覆盖模块：**31/31**（契约自检 validateSchema 启动期执行，违规即 console.error）
- 提醒规则块：22 处；providerCoverage 契约自检缺失=**0**（hub.test.ts 断言）
- 字段字典 labelKey：103 个，i18n 对齐缺失=**0**（274 波 A1b 收口）
- 快速录入（capture）定义：31 处

## 已启用模块（靶场内核实读）

| 模块 | 建库 | 读写（实读） |
|---|---|---|
| members | ✅ | ✅ 27 行 / 218 列 |
| certs | ✅ | ✅ 0 行 / 359 列 |
| health | ✅ | ✅ 0 行 / 211 列 |
| assets-real | ✅ | ✅ 0 行 / 254 列 |
| medicine | ✅ | ✅ 7 行 / 192 列 |
| parenting | ✅ | ✅ 0 行 / 184 列 |
| schooling | ✅ | ✅ 0 行 / 171 列 |
| allowance | ✅ | ✅ 0 行 / 106 列 |

> 实读通过 8/8。

## 未启用模块（契约就绪，启用即建库）

| 模块 | 建库 | 读写 |
|---|---|---|
| social | ·未启用 | — |
| insurance | ·未启用 | — |
| exams | ·未启用 | — |
| pets | ·未启用 | — |
| assets-virtual | ·未启用 | — |
| shopping | ·未启用 | — |
| memberships | ·未启用 | — |
| contracts | ·未启用 | — |
| stock | ·未启用 | — |
| favors | ·未启用 | — |
| chores | ·未启用 | — |
| food | ·未启用 | — |
| address | ·未启用 | — |
| bookmarks | ·未启用 | — |
| snippets | ·未启用 | — |
| house | ·未启用 | — |
| vehicles | ·未启用 | — |
| transit | ·未启用 | — |
| travel-plan | ·未启用 | — |
| travel-booking | ·未启用 | — |
| travel-packing | ·未启用 | — |
| travel-log | ·未启用 | — |
| media | ·未启用 | — |

## 横切能力（全模块共用，L2 自动化断言）

| 能力 | 证据 |
|---|---|
| 首录路径 | VALUE-01 6/6（引导→建库→成员→录证件→提醒→定位） |
| 恢复路径 | VALUE-02 4/4（设置损坏回退/缺库自愈） |
| 导入 | IMPORT-RECOVERY 5/5（非法 JSON 拒绝/敌意归一化） |
| 真机批 | device-batch 40/40（首启/四页/弹层/移动三档/无障碍/性能基线） |
| 成员 DAL | addMember/updateMember/removeMember/syncMembersToAv（VALUE-01 成员建立） |
| 提醒派生 | runScan/deriveVisible + providerCoverage 契约自检（hub.test.ts） |
| 导出 | .ics（提醒）/ .csv（台账）/ .vcf（成员）/ QR 标签 |
| 移动端 | DEVICE-07 顶栏注入 + 全屏面板（S4 移动三档） |
| 无障碍 | S5：可访问名称/aria-current/命中区/键盘切换 |

## 缺口（L3 残余，不对外声明）

- 真机批残余：Android WebView 软键盘/返回/旋转/安全区、独立窗口、兄弟插件并发、双端冲突（DEVICE-01~06 ◐）
- 帧率/内存/能耗基线需低端真机（DEVICE-05 ◐）
- 用户试用完成率证据（VALUE-04，待 3–5 位目标用户）
