# 小驴管家（Lv Home）· 项目待办总清单

> 标记：🔴 当前版本必须 · 🟡 下一版本 · 🟢 远期/可选 · ⛔ 被阻塞（注明被什么阻塞）· ⏸ 暂缓（集市上架，触发条件另定）
> **发布策略（2026-10-01 定）**：开发到一定程度后公开 GitHub 仓库与 Release；**集市上架整体暂缓**（见第 26 组）。
> 阶段定义见 `docs/design/06-v0.2开发任务拆解.md`；版本路线见 `MODULES.md §6`。
> 完成一项勾一项；每个版本的验收线见对应小节的"出口条件"。

---

## 0. 工程基建

- [x] 🔴 `git init` 并建立首个提交（当前项目无版本控制） ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [ ] 🟡 创建 GitHub 仓库 `ai68298100/siyuan-home`（仓库名必须等于插件 name，main 分支）——**触发条件：v0.2 纵向切片完成且回归全绿，公开前审查（第 25 组）通过**
- [ ] 🟡 推送骨架 + 设计文档（README/MODULES/docs/design/prototype）——同上触发条件
- [ ] 🟡 配置 GitHub Actions：PR 时跑 `pnpm run check + build`（模板自带 workflow 改造）
- [ ] 🟢 分支保护：main 禁直推
- [ ] 🟢 `plugin.json` 的 `author`/`url` 从占位 lvdaoguan 改为 ai68298100
- [ ] 🔴 替换 `icon.png`（160×160，≤64KiB，禁止 SVG）
- [ ] 🟡 制作 `preview.png`（1024×768，≤512KiB，集市展示图）
- [ ] ⏸ 上架时移除 `plugin.json` 的 `disabledInPublish: true`
- [ ] 🟢 LICENSE 确认（MIT，作者名更新）

## 1. Spike 阶段（⛔ 全部被阻塞：等待思源实例启动）

- [x] 🔴 S0 用户启动思源（内核 `127.0.0.1:1568`），`sy nb` 确认可达 ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [x] 🔴 S1 台账视图嵌入三选一实验：protyle 内嵌 av / API 渲染 / 文档跳转（`docs/testing/spike-R1R2.md` 实验一） ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [x] 🔴 S1a 结论回填：`src/core/siyuan.ts#createAttributeView` 实现 + 01 ADR-4 定案 ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [x] 🔴 S2 关系列实验：relation 列可否编程创建并指向 members 库（实验二） ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [x] 🔴 S2a 结论回填：可 → 字典列 member=relation；不可 → 降级文本列 + SQL 聚合，更新 02 §2 ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [x] 🟡 S3 行定位实验：openTab 定位高亮台账行（R5），结论回填 03 §5 ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [x] 🟡 S4 实验数据清理：临时笔记本 `siyuan-home-spike` 经确认后删除 ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [x] 🟡 S5 av kramdown 形态观察（手建 av 后查 blocks.markdown，为建库提供参照） ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [ ] ⛔ 🟡 S6 kernel cron 实验：最小间隔、休眠/唤醒、重复扫描与前端兜底的行为记录（R3）
- [ ] ⛔ 🟡 S7 双端冲突实验：两设备同时编辑同一行，验证提醒写回幂等、冲突提示和恢复路径（R6）
- [ ] 🟡 S8 农历库专项：tree-shake 体积、闰月/腊月三十精度与版本升级回归（R4）

## 2. v0.2 · 数据层（阶段 A）

- [x] 🔴 A1a schema.ts：members 成员库 schema 落地（02 §3：角色/生日/农历/尺码/忌口/状态） ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [ ] 🔴 A1b 字段字典 i18n 键补全核对（field.* 已有 certs 部分，补 members 专属列）
- [x] 🔴 A2a siyuan.ts：av 创建端点实现（等 S1） ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [ ] 🔴 A2b siyuan.ts：av 行 CRUD 封装（新增行/更新行值/删除行/按视图查询）
- [ ] 🔴 A2c siyuan.ts：附件关联（asset 列写入文件引用）
- [ ] 🔴 A2d siyuan.ts：错误类型统一（KernelError）+ 单元可注入 mock
- [ ] 🔴 A3a provisioner：幂等建库全流程打通（依赖 A2a）
- [ ] 🔴 A3b provisioner：ensureColumns 版本升级补列（不删不改旧列）
- [ ] 🔴 A3c provisioner：默认视图创建（certs 的 by_member / expiring）
- [ ] 🔴 A3d provisioner：dbRefs 失效自愈（文档被删→重建→登记刷新）
- [x] 🔴 A4 members 数据访问层（`src/core/members.ts`）：成员 CRUD 双写（settings 引用 + members 库行） ✅ 2026-10-02（Tab 化 + 数据接线 commit，见 34 组记录）
- [ ] 🔴 A5 certs 数据访问层（`src/modules/certs/`）：行 CRUD / 续期写回 / 按到期范围查询 / 脱敏读取
- [x] 🟡 A6 设置页"诊断"区数据源：台账缺失/列缺失检测接口 ✅ 2026-10-02（qbtn 跳台账预选；诊断区=dbRefs/扫描/契约；回归脚本 docs/testing/v0.2.md；胶囊 spring；check 零警告）

## 3. v0.2 · 提醒中枢（阶段 B）

- [x] 🔴 B0 vitest 接入（devDependencies + `pnpm test` script） ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [x] 🔴 B1a 规则引擎单测：oneoff 边界（今天到期/昨天/闰年 2-29） ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [x] 🔴 B1b 规则引擎单测：anniversary 农历（腊月廿九、闰月、跨年、当天） ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [x] 🔴 B1c 规则引擎单测：recurring 周期滚动（day/week/month/quarter/year）+ 未声明周期降级 ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [x] 🔴 B1d 规则引擎单测：leadOverrides 覆盖与 later 降噪过滤 ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [x] 🔴 B2a 扫描器：DataProvider 接口 + certs 实现（SQL 到期范围查询） ✅ 2026-10-01（providers/scanner/runtime 三层 + 7 单测；kernel 定时触发 B2d 另行）
- [x] 🔴 B2b 扫描器：三路触发整合（kernel 定时 / Tab 打开刷新 / 前端兜底心跳） ✅ 2026-10-02（B2b=Tab触发+30min心跳；B2d 定案 kernel 无定时器 API 走前端心跳；B4 续期=思源 Dialog/延后=Menu 1/3/7/30）
- [x] 🔴 B2c HubState 缓存读写（kernel storage 优先，前端降级） ✅ 2026-10-01（providers/scanner/runtime 三层 + 7 单测；kernel 定时触发 B2d 另行）
- [x] 🟡 B2d kernel.js 定时任务：每日 08:00 全量扫描（可配）+ broadcast `hub.updated` ✅ 2026-10-02（B2b=Tab触发+30min心跳；B2d 定案 kernel 无定时器 API 走前端心跳；B4 续期=思源 Dialog/延后=Menu 1/3/7/30）
- [ ] 🔴 B3a 通知：每日摘要一条（notifyHour，lastNotifiedDate 去重）
- [x] 🔴 B3b 通知：overdue 首次发现立即通知 + 静默时段（silentFrom/To） ✅ 2026-10-02（B2b=Tab触发+30min心跳；B2d 定案 kernel 无定时器 API 走前端心跳；B4 续期=思源 Dialog/延后=Menu 1/3/7/30）
- [ ] 🔴 B3c 通知点击 → 打开管家 Tab 提醒页
- [ ] 🔴 B4a 动作：完成（oneoff 归档 / recurring 写 last_done 重算 due / anniversary 记当年已办）
- [x] 🔴 B4b 动作：续期小窗（新到期日 + 历史追加 note） ✅ 2026-10-02（B2b=Tab触发+30min心跳；B2d 定案 kernel 无定时器 API 走前端心跳；B4 续期=思源 Dialog/延后=Menu 1/3/7/30）
- [x] 🔴 B4c 动作：延后 snooze（1/3/7/30 天，运行态持久化） ✅ 2026-10-02（B2b=Tab触发+30min心跳；B2d 定案 kernel 无定时器 API 走前端心跳；B4 续期=思源 Dialog/延后=Menu 1/3/7/30）
- [x] 🔴 B4d 动作：忽略 mute（rowId+ruleKey，可恢复） ✅ 2026-10-02（B2b=Tab触发+30min心跳；B2d 定案 kernel 无定时器 API 走前端心跳；B4 续期=思源 Dialog/延后=Menu 1/3/7/30）
- [x] 🔴 B4e 动作：定位（依赖 S3 结论；降级=打开台账文档） ✅ 2026-10-02（R5 降级定案实施：提醒行定位按钮→openTab 台账文档）
- [x] 🔴 B4f 提醒中枢运行态存储 schema（snooze/mute/已办缓存 → loadData） ✅ 2026-10-01（providers/scanner/runtime 三层 + 7 单测；kernel 定时触发 B2d 另行）

## 4. v0.2 · UI（阶段 C，组件契约见 docs/design/08）

- [x] 🔴 C1a Tab 化外壳：`addTab` + 四页签导航（总览/提醒/台账/成员）+ 顶栏入口改造 ✅ 2026-10-02（Tab 化 + 数据接线 commit，见 34 组记录）
- [x] 🔴 C1b 导航胶囊滑动（offsetLeft 计算 + spring） ✅ 2026-10-02（qbtn 跳台账预选；诊断区=dbRefs/扫描/契约；回归脚本 docs/testing/v0.2.md；胶囊 spring）
- [ ] 🔴 C1c 删除旧 Dialog 面板与 index.scss LEGACY 段（dashboard.svelte/settings.svelte 重写为 lv-* 组件）
- [x] 🔴 C1d 屏幕容器 `.lv-screen/.lv-anim` 接入（入场编排生效） ✅ 2026-10-02（Tab 化 + 数据接线 commit，见 34 组记录）
- [x] 🔴 C2a 总览：页头（问候/日期/计数滚动）+ 成员 chips 行 ✅ 2026-10-02（bundle gzip 132→32KB；成员过滤持久化；三级分组；向导重跑）
- [x] 🔴 C2b 总览：即将到期区（取 HubState 前 4 条 + 空态 + "查看全部"） ✅ 2026-10-02（Tab 化 + 数据接线 commit，见 34 组记录）
- [x] 🔴 C2c 总览：快速记录行（qbtn 按 enabledModules 过滤） ✅ 2026-10-02（qbtn 跳台账预选；诊断区=dbRefs/扫描/契约；回归脚本 docs/testing/v0.2.md；胶囊 spring）
- [ ] 🔴 C2d 总览：模块卡网格（启用模块 + certs/药箱统计卡）
- [x] 🔴 C2e 成员 chips 过滤状态持久化（作用于提醒/模块卡计数） ✅ 2026-10-02（bundle gzip 132→32KB；成员过滤持久化；三级分组；向导重跑）
- [ ] 🔴 C3a 提醒中枢页：四组筛选（模块/成员/类型/时间）+ 显示已处理
- [x] 🔴 C3b 提醒中枢页：分组列表（逾期/7 天/30 天/已处理折叠） ✅ 2026-10-02（bundle gzip 132→32KB；成员过滤持久化；三级分组；向导重跑）
- [x] 🔴 C3c 提醒中枢页：行内动作菜单（完成/续期/延后▾/定位/忽略）接线 B4 ✅ 2026-10-02（B2b=Tab触发+30min心跳；B2d 定案 kernel 无定时器 API 走前端心跳；B4 续期=思源 Dialog/延后=Menu 1/3/7/30）
- [x] 🔴 C3d 筛选条件持久化 ✅ 2026-10-02（runtime.hubFilter）
- [ ] ⛔ 🔴 C4a 台账页外壳：模块切换下拉 + "在文档中打开"（依赖 S1 定案嵌入方式）
- [ ] ⛔ 🔴 C4b 台账行点击 → 详情抽屉（kv/附件/相关/块 ID 复制）
- [ ] 🔴 C4c 台账"新建"：capture 列集快速表单（抽屉内或弹层）
- [ ] 🔴 C5a 成员页：成员卡网格（统计三格 + alert 行 + 农历标记）
- [ ] 🔴 C5b 成员页：单成员下钻（跨模块时间线 v0.2 = certs + 提醒）
- [ ] 🔴 C5c 成员编辑对话框（增删改/角色/生日/农历）
- [ ] 🔴 C5d 长期进度条接入（疫苗程序占位，数据 v0.5 接通）
- [ ] 🔴 C6a 快速录入弹层：capture 驱动表单 + 模块选择（记住上次）
- [ ] 🔴 C6b 快速录入保存链路（写台账行 + toast + "保存并查看"）
- [ ] 🔴 C6c 块菜单入口：选中文字 → 存为常用语/网址/地址（预填）
- [ ] 🔴 C6d 斜杠命令 `/lv`（快速记录/打开台账）
- [ ] 🔴 C6e 命令面板：打开管家面板 / 快速记录（快捷键可配置）
- [x] 🔴 C7a 首次引导向导：三步（家庭构成→推荐模块→建库确认） ✅ 2026-10-02（Tab 化 + 数据接线 commit，见 34 组记录）
- [x] 🔴 C7b 引导按 suggestRoles 预选逻辑（子女→育儿/上学/零花钱） ✅ 2026-10-02（Tab 化 + 数据接线 commit，见 34 组记录）
- [ ] 🔴 C7c 引导建库批处理（provisioner 逐模块）+ 完成空态引导
- [x] 🔴 C7d 引导可跳过、设置页可重跑 ✅ 2026-10-02（bundle gzip 132→32KB；成员过滤持久化；三级分组；向导重跑）
- [ ] 🔴 C8a 设置五分区：模块/成员/提醒/生态/关于
- [ ] 🔴 C8b 模块开关接线（启用→provisioner 建库；禁用→隐藏保留数据 + 确认框）
- [ ] 🔴 C8c 提醒分区：leadOverrides 编辑（按 moduleId.ruleKey）+ 摘要时段 + 静默时段
- [ ] 🟡 C8d 生态分区占位（开关 UI，v0.3 接线）
- [ ] 🔴 C8e 关于分区：版本/仓库链接/诊断入口
- [ ] 🟡 C8f 面板隐藏金额开关（隐私，07 §4）
- [ ] 🟡 C9a 移动端走查：760 断点/触摸目标/抽屉全宽
- [ ] 🟡 C9b 空态文案全量走查（每屏"下一步动作"型）
- [ ] 🟡 C9c 与原型组件库屏像素比对走查（间距 ±2px）

## 5. v0.2 · 收尾（阶段 D）

- [x] 🔴 D1 回归脚本 `docs/testing/v0.2.md`：引导→建库→录入→提醒→续期→禁用→数据保留→重装恢复 ✅ 2026-10-02（qbtn 跳台账预选；诊断区=dbRefs/扫描/契约；回归脚本 docs/testing/v0.2.md；胶囊 spring）
- [ ] 🔴 D2 性能预算实测：05 §4.5 表逐项记录（onload/扫描/首开/构建体积）
- [ ] 🔴 D3 i18n 全量走查（无硬编码文案；zh-CN/en 同步）
- [ ] 🔴 D4 `update-version` 0.2.0 + 构建 zip + CHANGELOG
- [ ] 🟡 D5 发布前安全扫描（mimosa security_scan）
- [ ] 🟡 D6 内测：装入 `D:\小飞驴的SIYUAN` 工作空间实跑一周

## 6. v0.3 提醒中枢扩展（🟡）

- [x] 🟡 medicine schema + 建库 + 提醒接入（效期+低库存双规则） ✅ 2026-10-02（SchemaLedgerProvider 通用派生，schema 驱动建库+提醒；低库存双规则留 v0.3 后段）
- [x] 🟡 memberships schema（计费周期/试用期/自动续费/储值余额） ✅ 2026-10-02（SchemaLedgerProvider 通用派生，schema 驱动建库+提醒；低库存双规则留 v0.3 后段）
- [x] 🟡 insurance schema（缴费日+保障到期双提醒） ✅ 2026-10-02（SchemaLedgerProvider 通用派生，schema 驱动建库+提醒；低库存双规则留 v0.3 后段）
- [ ] 🟡 提醒中枢规则清单 UI 完善（按模块列出 rules）
- [ ] 🟡 生态 RPC server 首批：home.capabilities / getSnippets / getBookmarks
- [ ] 🟡 生态开关接线（设置·生态 → rpc 权限）
- [ ] 🟡 多端同步信号：台账变更 broadcast → 他端"刷新"角标
- [ ] 🟡 移动端提醒降级实测（角标+开面板刷新）

## 7. v0.4 资产购物（🟡）

- [ ] 🟡 assets-real schema + 保修/借出/处置状态机
- [ ] 🟡 assets-virtual schema（平台/账号名/密码位置索引/继承备注）
- [x] 🟡 shopping schema（订单号/快递单号/取件码/渠道） ✅ 2026-10-02（schema+枚举 i18n+通用提醒派生；UI 细化随模块启用迭代）
- [x] 🟡 contracts schema（起止/到期提醒/押金/对方联系方式） ✅ 2026-10-02（schema+枚举 i18n+通用提醒派生；UI 细化随模块启用迭代）
- [ ] 🟡 购物→实物资产一键建档联动
- [ ] 🟡 资产估值汇总统计卡（总览）
- [ ] 🟡 会员年费折算视图（月均统计）

## 8. v0.5 教育包（🟡）

- [x] 🟡 parenting schema + 国家免疫规划程序表内置模板（0-6 岁 22 剂） ✅ 2026-10-02（src/core/immunization.ts：22 剂程序表+doseDate 月龄推算/月末收敛；排期视图接线留 v0.5 后段）
- [ ] 🟡 schooling schema（学段推算当前年级/升学节点/学费/课外班课时）
- [x] 🟡 exams schema（证书效期/复审周期/考试节点） ✅ 2026-10-02（schema+枚举 i18n+通用提醒派生；UI 细化随模块启用迭代）
- [x] 🟡 allowance schema（压岁钱/零花钱多账户/发放周期） ✅ 2026-10-02（schema+枚举 i18n+通用提醒派生；UI 细化随模块启用迭代）
- [ ] 🟡 疫苗排期视图（应种/已种/逾期）
- [ ] 🟡 打卡联动：recordValue RPC（身高体重落成长记录）
- [ ] 🟡 升学节点倒计时进提醒中枢

## 9. v0.6 生活包（🟡）

- [x] 🟡 favors schema（收送双向/事件类型/按人净额视图） ✅ 2026-10-02（schema+枚举 i18n+通用提醒派生；UI 细化随模块启用迭代）
- [x] 🟡 stock schema（低库存+效期双提醒） ✅ 2026-10-02（schema+枚举 i18n+通用提醒派生；UI 细化随模块启用迭代）
- [ ] 🟡 food schema（菜谱/忌口联动/餐厅）
- [ ] 🟡 address / bookmarks / snippets schema（轻台账三件）
- [x] 🟡 chores schema（周期任务 → 提醒中枢 recurring） ✅ 2026-10-02（schema+枚举 i18n+通用提醒派生；UI 细化随模块启用迭代）
- [x] 🟡 house schema（维护周期/缴费日/农历纪念日/忌日） ✅ 2026-10-02（schema+枚举 i18n+通用提醒派生；UI 细化随模块启用迭代）
- [ ] 🟡 应急物资清单模板文档（应急管理部基础版）+ 半年巡检提醒
- [ ] 🟡 快切注入：网址/常用语 RPC 消费端联调

## 10. v0.7 影音书库 + 健康深化（🟢→🟡）

- [ ] 🟢 media schema（六类媒体/状态机/评分/进度/来源链接）
- [ ] 🟢 收藏夹/在看/年度统计三视图
- [ ] 🟡 health 深化：复诊提醒/报告归档视图/过敏史联动 food
- [ ] 🟡 social 退休倒计时（出生年月+政策参数+按成员卡片展示）
- [ ] 🟢 pets schema（疫苗/驱虫周期）

## 11. v0.8 出行包（🟢）

- [ ] 🟢 vehicles schema（保养里程/年检/保险/电池更换/加油充电台账）
- [ ] 🟢 transit schema（ETC/交通卡年审）
- [ ] 🟢 travel-plan / booking / packing / log 四模块 schema
- [ ] 🟢 行前清单证件自查（引用 certs 库：护照 6 个月规则/儿童证件）
- [ ] 🟢 行李清单模板库（城市游/海岛/露营/自驾/研学）

## 12. v1.0 GitHub 正式发布（公开仓库的 1.0 版本）

- [ ] 🟡 公开发布条件自检：🔴 项全部完成、回归脚本全绿、内测反馈（31 组）处理完毕
- [ ] 🟡 生态联动打磨：四插件互测（快切/打卡/人脉/拾遗）
- [ ] 🟡 多设备同步冲突测试（两台设备实跑同一工作区）
- [ ] 🟡 31 模块全开性能回归（05 §4.5 预算复核）
- [ ] 🟡 隐私终审：脱敏显示/无密码确认/导出脱敏提示/通知脱敏
- [ ] 🟡 `v1.0.0` tag + GitHub Release（附 package.zip；siyuan-plugin-release skill 调整为只发 Release 不推集市）
- [ ] 🟡 README 双语终稿（截图/GIF/功能表/隐私声明链接）
- [ ] 🟡 migration notes 汇总（0.x → 1.0 用户升级说明）
- [ ] 🟢 公告帖：ld246 / 少数派（是否随 1.0 公开同步发布，另定）
- [ ] 🟢 1.0 后维护节奏：每两周 issue 清扫 + 月度小版本
- [ ] 🟢 ROADMAP.md（从 TODO.md 提炼用户视角的路线图）

## 13. 生态与远期（🟢）

- [ ] 🟢 人脉联动：home.linkContact（成员↔联系人双向引用 + 缺失降级快照）
- [ ] 🟢 拾遗联动：home.archiveRef（剪藏归档为台账行附件/关联文档）
- [ ] 🟢 打卡联动：家务/备考台账任务一键转打卡习惯
- [ ] 🟢 模板包导入导出（schema+模板+视图 JSON 打包，"新生儿包/露营包"）
- [ ] 🟢 CSV/JSON 导出一键入口（脱敏提示，05 §4）
- [ ] 🟢 家庭年报生成器（年度提醒处理率/人情净额/媒体统计）
- [ ] 🟢 用户自定义台账模块（自定义字段集建库，复用建库器与提醒中枢）
- [ ] 🟢 家庭成员间状态共享（kernel broadcast 多端，家务完成同步）
- [ ] 🟢 i18n 扩展：zh-TW / ja
- [ ] 🟢 无障碍专项审查（键盘全可达/对比度/读屏标签）
- [ ] 🟢 发布快照数据（savePublishData，3.8.4+）探索

## 14. 调研补齐（🟢 可选，前次因并发限制中断于 16 款/9 轮）

- [ ] 🟢 书影音国际产品集群：Goodreads/StoryGraph/Letterboxd/Trakt/Komga（gh 可查 gotson/komga）
- [ ] 🟢 健康用药集群：Medisafe/MyTherapy/Apple 健康/CareZone 兴衰
- [ ] 🟢 车辆旅行国际集群：Drivvo/Fuelio/TripIt/Wanderlog/PackPoint/Polarsteps
- [x] 🟢 效率小件集群（部分）：espanso 已查（14.6k★：触发词展开+Forms 表单参数位印证 snippets 形态；系统级注入不吸收）；Raindrop/TextExpander 留待下轮
- [ ] 🟢 国际家庭管理集群：Cozi/FamilyWall/Maple/OurHome/Sweepy/Tody/Homechart（gh）
- [x] 🟢 记账补充：Actual（12k★，架构印证）+ firefly-iii（24.8k★，循环交易/规则引擎印证 memberships 语义；复式记账与预算不吸收）均已查；MoneyWiz 闭源跳过
- [ ] 🟢 调研结论回填 MODULES.md 附录 + 影响新模块/字段时更新 schema

## 15. 数据完整性与边界场景

- [ ] 🔴 引用完整性：成员删除后行上的成员引用悬空 → 显示「未指定成员」+ 批量改派入口
- [ ] 🔴 provisioner 只增列不改枚举：用户自改的 select 选项不被覆盖（ensureColumns 约束）
- [ ] 🔴 settings.json 损坏容错：解析失败 → 备份坏文件 + 回退默认值 + 警告 toast
- [ ] 🔴 孤儿提醒清理：台账行被删除后，HubState 中残留提醒自动清除
- [ ] 🔴 模块禁用时其提醒立即从 HubState 与通知中剔除
- [ ] 🟡 settings 写入失败重试与错误上报（saveData 异常捕获）
- [x] 🔴 成员双 ID 关联修正：FamilyMember.avItemId 回填（addDetachedRow 返回值）+ certs provider 读 relation.blockIDs 反查 memberId ✅ 2026-10-02（老成员无 avItemId 需重加或补写，迁移待办见 33.2）
- [x] 🟡 老成员 avItemId 迁移：v0.2.0 前添加的成员在 members 库中已有行但 settings 无 avItemId → 诊断区提供"按姓名匹配回填"工具 ✅ 2026-10-02（诊断区一键按姓名回填）
- [ ] 🔴 B2d 定案记录：kernel.js（goja）无定时器 API → 定时扫描=前端心跳 30min + Tab 打开触发；kernel 侧保留 RPC 供生态（v0.3）；03 §3 已按此实现，文档同步
- [ ] 🟡 笔记本被用户关闭（closed=true）→ ensureNotebook 重新打开或引导
- [ ] 🟡 笔记本被删除 → 诊断区一键重建全部已启用模块台账
- [ ] 🟡 台账文档被移入回收站 → dbRefs 失效检测与恢复路径
- [ ] 🟡 提醒列表 >200 条虚拟滚动（防长列表卡顿）
- [ ] 🟡 系统休眠错过定时扫描 → 唤醒/开面板补扫
- [x] 🟡 农历闰月生日规则定案（闰月生日在平年如何处理）+ 单测 ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [ ] 🟡 系统时间回拨/跨天瞬间的扫描容错（due 计算幂等）
- [ ] 🟢 金额显示层：小数/千分位/多币种符号（仅显示，不做汇率）
- [ ] 🟢 多端同时编辑同一行：写回操作幂等性验证
- [ ] 🟢 跨时区说明：due 以内核本地时区计算（文档 + 测试用例）

## 16. 模块功能深化（按模块细化，v0.3+ 逐版吸收进 schema）

- [ ] 🟡 certs：换证历史链（旧证→新证 relation + 历史视图）
- [ ] 🟡 certs：复印件/电子版存放位置字段
- [ ] 🟡 assets：估值快照（手动记录 + 时间线，非自动估值）
- [ ] 🟡 assets：位置变更历史（物品搬家记录）
- [ ] 🟢 assets：CSV 批量导入（列映射向导）
- [ ] 🟡 shopping：退货/退款记录字段与状态
- [ ] 🟢 shopping：同商品价格历史（复购比价参考）
- [ ] 🟡 shopping：购入联动 stock（囤货品自动加库存）
- [ ] 🟡 memberships：家庭共享账号（主卡人/成员位标注）
- [ ] 🟢 memberships：取消自动续费指引链接字段
- [ ] 🟡 contracts：自动续约条款标记 → 到期提醒升级为「续约决策提醒」
- [ ] 🟢 contracts：押金退还记录
- [ ] 🟡 health：体检年度计划模板（recurring）
- [ ] 🟡 health：处方药 → 药箱联动（新建药箱行或扣减提示）
- [ ] 🟡 insurance：理赔记录状态机（报案/材料/到账）
- [ ] 🟡 social：缴费基数年度调整提醒
- [ ] 🟡 schooling：作业/考试日程（recurring）+ 家长会记录文档模板
- [ ] 🟢 schooling：转学/插班历史
- [ ] 🟡 parenting：疫苗批号与接种点字段（接种追溯）
- [ ] 🟡 parenting：生长曲线图（身高体重 WHO 百分位 SVG 渲染）
- [ ] 🟡 parenting：辅食新食材 3 天观察期 → 联动 health 过敏史
- [ ] 🟡 allowance：孩子愿望清单（目标金额 + 存钱进度条）
- [ ] 🟢 allowance：利息/收益流水
- [ ] 🟡 favors：年度人情报告（收送 TOP / 净额走势）
- [ ] 🟡 favors：回礼提醒（事件后 N 天）
- [ ] 🟢 media：追更提醒（剧更新日手动登记 → 提醒中枢）
- [ ] 🟢 media：图书借出记录（借出状态复用 assets 模式）
- [ ] 🟢 travel：行前证件检查结果存档（检查时间/结论）
- [ ] 🟡 house：水电煤抄表流水（表读数记录）
- [ ] 🟡 house：保修期联动 contracts（保修内报修免费标记）
- [ ] 🟡 stock：采购建议清单（低于阈值项自动汇总视图）

## 17. UI / 交互增强

- [ ] 🟡 全局台账搜索框（标题/备注 contains，与成员过滤叠加）
- [ ] 🟡 排序与视图偏好记忆（提醒页/台账页各自持久化）
- [ ] 🟡 提醒/台账行批量操作（多选 → 批量归档/延后/忽略）
- [ ] 🟡 成员卡右键/长按菜单（编辑/归档/查看档案）
- [ ] 🟢 成员网格拖拽排序
- [ ] 🟡 头像上传（asset 文件选择器 → 成员库 avatar 列）
- [ ] 🟡 单条记录复制为脱敏文本（分享场景）
- [ ] 🟡 紧急信息卡打印样式（@media print，家庭紧急信息卡可打印）
- [x] 🟢 快捷键速查表（设置·关于区） ✅ 2026-10-02（快捷键与入口说明进关于区）
- [ ] 🟢 成员下钻面包屑返回
- [ ] 🔴 删除行走思源块删除（保留撤销窗口），禁止绕过 UI 直接删
- [ ] 🟡 统计卡点击下钻（模块卡 → 预筛选的台账/提醒视图）
- [ ] 🟢 提醒行就地展开摘要（不离开列表）
- [ ] 🟡 时间表述本地化（「3 天后 / 下周三」+ 悬浮完整日期）
- [ ] 🟡 空工作区首启体验（无笔记本时引导先建笔记本）
- [ ] 🟢 bookmarks 失效链接检测（周期 HEAD 检查+标记失效——Raindrop 印证，进阶）
- [ ] 🟢 快速录入日期智能解析（TickTick 印证；实现规格已深挖：今天/明天/下周X/X月X日/明早9点等格式+模糊日期取最近有效日+识别后移除残留，见 MODULES.md 附录滴答清单·智能解析条目；中文正则可覆盖）
- [ ] 🟡 通知队列防轰炸（任务笔记管理模式：应用内通知单例队列 MAX=5 超出关最旧；B3 接线时采用）
- [ ] 🟢 B3 出口扩展：Webhook 推送（Bark/ntfy 推手机）或与 siyuan-homepage 通知中心联动转发——不自建推送，借道既有出口（homepage 深挖印证）
- [ ] 🟢 提醒双日期：deadline（必须完成日）与 plan（计划处理日）分离，逾期 deadline 加粗红显（Things 3 印证；总览可按 plan 提前展示）；Today 晚间分区（可选）
- [ ] 🟢 筛选器命名视图（滴答清单智能清单印证：筛选条件组合保存为命名视图如"妈妈的证件"/"本月订阅"，一键切换；依赖 C3d 筛选持久化已实现）
- [ ] 🟢 成员卡统计改用 rollup 列（Notion 印证：members 库行加 rollup 列指向 member relation 计数 Count，原生显示"证件 5·保单 2"，替代插件聚合查询；C5b 数据层简化）
- [x] 🟢 stock/shopping 按品类自动分区视图 ✅ 2026-10-02（stock schema views：按品类分组+按效期排序双视图；台账列视图可选项保留）
- [ ] 🟡 C4a 复核点：Notion form 视图=表单直写库——思源 3.8 未推出表单视图（官方调研确认），快速录入维持自建 Dialog 路线；日历视图官方已推出→提醒中枢日历形态改走原生（C4a 复核点更新）
- [ ] 🟢 密度切换（紧凑/舒适，表格行高两档）

## 18. kernel.js 与基础设施

- [ ] 🔴 前端监听 `kernel-plugin-state-change` 之后才初始化 RPC 客户端（模板硬性约定）
- [ ] 🔴 kernel 不可用时的降级链路：RPC 失败 → 前端兜底扫描（静默）
- [ ] 🟡 storage watcher：他端 settings 变更 → 本端设置热重载
- [ ] 🟡 onDataChanged 防抖 → 增量扫描触发
- [ ] 🟢 kernel 私有 HTTP 路由规划（/plugin/private/siyuan-home/...，为外部工具预留）
- [ ] 🔴 onunload 清理审计：eventBus 解绑/定时器销毁/observer 断开（内存泄漏清单）
- [ ] 🟡 卸载向导：uninstall 时询问保留或清理（默认保留台账文档）
- [ ] 🟡 工作区切换/插件重载的 onload 幂等验证

## 19. 安全加固

- [ ] 🔴 面板渲染用户内容统一转义（标题/备注防 XSS——台账内容来自用户输入）
- [ ] 🔴 日志审计：永不输出 token / 证件号 / 金额到 console
- [ ] 🟡 附件处理边界：仅展示图片/PDF 预览，不执行未知类型
- [ ] 🟡 RPC 入参校验：生态调用方参数 schema 校验（防脏数据入库）
- [ ] 🟡 依赖最小化审查：每个新依赖记录必要性理由（已核：lunar-typescript/date-fns）
- [ ] 🟡 `pnpm audit` 纳入发布前检查 + lockfile 提交
- [x] 🟢 dependabot/renovate 配置（依赖自动升级 PR） ✅ 2026-10-02（.github/dependabot.yml：npm weekly + actions monthly，major 排除）

## 20. 性能与内存

- [ ] 🟡 列表性能预算：1000 行表格滚动 60fps（虚拟滚动兜底）
- [ ] 🟡 扫描去抖合并（Tab 快速切换不重复全量扫描）
- [ ] 🟢 成员色/图标映射缓存（避免每帧重算）
- [ ] 🟡 bundle 体积守门：CI 检查 index.js gzip < 100KB（超限即失败）
- [ ] 🟡 date-fns 按需引入核验（bundle 分析，只导入用到函数）
- [ ] 🟢 附件缩略图懒加载（成员头像/资产照片墙）
- [ ] 🟡 长会话内存走查（开关抽屉/弹层 50 次无增长）
- [x] 🔴 bundle 超预算整改：index.js gzip 132KB > 100KB 预算（05 §4.5）——lunar-typescript 全量入包；动态 import 拆独立 chunk（按需加载，仅农历触发）✅ 2026-10-02 实测 gzip 132→32.4KB（-76%） ✅ 2026-10-02（bundle gzip 132→32KB；成员过滤持久化；三级分组；向导重跑）

## 21. 测试与质量工程

- [x] 🟡 i18n 键位对齐检查脚本（zh-CN/en key 集合 diff，纳入 CI） ✅ 2026-10-02（scripts/check-i18n.mjs + check:i18n；451 键对齐，循环A 第6项）
- [ ] 🟡 schema 黄金文件测试（certs schema 序列化快照防意外变更）
- [ ] 🟡 provisioner mock 单测：新建/补登记/重建三分支（A3 已列，此处补测试文件规划）
- [ ] 🟡 settings 迁移测试：v0.1 旧结构 → v0.2 读取兼容（reminderAdvanceDays 遗留字段）
- [ ] 🟢 core/ 目录覆盖率目标 ≥70%（vitest coverage）
- [ ] 🟡 兼容性矩阵：思源 3.8.0 LTS / 最新 beta 各跑一轮回归脚本
- [ ] 🟢 issue 模板（bug：环境信息+复现步骤；feature：场景+竞品参照）
- [ ] 🟢 回归脚本模板化（docs/testing/ 每版本一份，含截图占位）

## 22. 文档与用户支持

- [ ] 🟡 用户手册 docs/guide/（每模块一页，含截图，上架前完成核心五模块）
- [x] 🟡 FAQ（数据存哪里/是否上传/如何备份/多设备） ✅ 2026-10-02
- [x] 🟡 隐私声明 docs/privacy.md（README 与集市描述引用） ✅ 2026-10-02
- [ ] 🟡 生态 RPC API 文档 docs/api.md（方法/签名/since 版本，05 §2 的落地文档）
- [ ] 🟡 README 中英双语截图与演示 GIF（替换纯文字介绍）
- [ ] 🟢 60 秒快速上手视频脚本（B 站/小红书发布素材）
- [x] 🟢 ADR 索引页 docs/design/00-index.md（七条 ADR + 后续增补的导航） ✅ 2026-10-02
- [ ] 🟢 每版本 migration notes（用户可见的升级说明）
- [x] 🟢 键盘快捷键完整表（配合 17 组速查表） ✅ 2026-10-02（FAQ 快捷键条目：2 命令+页签+自定义说明）

## 23. 发布工程与维护

- [x] 🟡 semver 策略文档（破坏性=大版本/新模块=小版本/修复=patch） ✅ 2026-10-02（并入 CONTRIBUTING 发布节；0.x 阶段附 migration notes 说明）
- [x] 🟡 minAppVersion 抬升策略（依赖新内核能力时才升） ✅ 2026-10-02（并入 semver 节）
- [x] 🟢 release notes 半自动生成（git log → CHANGELOG 草稿） ✅ 2026-10-02（scripts/release-notes.mjs：Conventional Commits 按类型分组）
- [x] 🟡 zip 产物体积检查（<10MB，CI 门禁） ✅ 2026-10-02（check:meta 内置 zip 体积门禁）
- [x] 🟢 beta 通道：GitHub prerelease 供内测用户先行 ✅ 2026-10-02（CONTRIBUTING 发布节：vX.Y.Z-beta.N 标签+prerelease 勾选+不进正式 CHANGELOG）
- [x] 🟡 集市竞品监控：每月检索家庭类新插件一次，回填 MODULES.md 附录 ✅ 2026-10-02 首轮（ledger 记账不冲突；任务笔记管理证明移动端提醒可行；homepage 通知中心可参考；家庭垂直仍 0 竞品）
- [ ] 🟢 用户反馈渠道定案（GitHub issue + ld246 帖）
- [ ] 🟢 弃用提示机制（字段/模块弃用时面板内一次性通知）

## 24. 设置与数据管理

- [ ] 🟡 插件设置导出/导入（JSON 文件，跨设备/重装迁移辅助）
- [ ] 🟡 恢复出厂：清空 settings 保留台账数据（双重确认）
- [ ] 🟡 示例数据一键生成/一键清除（新用户体验与截图制作）
- [ ] 🟢 数据体积概览（各模块行数/附件数量统计面板）
- [x] 🟢 迁移指南：Sortly/钱迹等 CSV → 本插件字段映射文档 ✅ 2026-10-02（docs/migration.md 骨架：通用流程+双映射表+注意事项，Wunderlist 三原则落地）
- [ ] 🟢 备份指引：结合思源备份机制的台账备份建议（写入 FAQ）

## 25. GitHub 公开化准备（🟡 触发条件：v0.2 纵向切片完成且回归全绿）

- [ ] 🟡 仓库公开前隐私审查：历史提交/文档/示例中无真实姓名、证件号、家庭数据
- [ ] 🟡 示例数据生成器：虚拟家庭（"小飞驴一家"）一键生成，专供截图与演示（配合 24 组示例数据项）
- [ ] 🟡 README 双语终稿 + badges（CI 状态/版本/license）
- [ ] 🟡 social preview 图 + about topics（siyuan / siyuan-plugin / family / reminder）
- [ ] 🟡 `.gitignore` 终审（dist/node_modules/本地环境/测试空间路径不入库）
- [ ] 🟢 `assets/` 展示资产目录（截图与 GIF 源文件归档）
- [x] 🟡 CONTRIBUTING.md（开发环境/流程/规范摘要） ✅ 2026-10-02（含约定 8 条：事实源/i18n/内核 API 收口/数据边界/隐私红线等）
- [ ] 🟡 issue 与 PR 模板落盘 `.github/`（21 组模板的落地项）
- [ ] 🟢 GitHub Projects 看板或 milestone（v0.2/v0.3；以 TODO.md 为唯一事实源，Projects 仅展示）
- [ ] 🟡 Releases 流程演练：tag → GitHub Release 附 zip（不发集市）
- [ ] 🟡 0.x 预发布约定写入 README（0.x 阶段数据结构可能变，升级需看 migration notes）
- [ ] 🟢 公开仓库首次 announcement 计划（发帖与否另定）
- [ ] 🟡 代码目录终审：无实验残留、无注释掉的死代码、无调试入口
- [ ] 🟢 git 历史敏感信息扫描（早期提交复查）

## 26. 集市上架（⏸ 整体暂缓：触发条件由你另行决定，以下全部挂起）

- [ ] ⏸ `disabledInPublish: true` 移除 + `minAppVersion` 复核
- [ ] ⏸ fork `siyuan-note/bazaar` + `plugins.txt` 一行 PR（一次 PR 只做一件事）
- [ ] ⏸ PR Check 校验修复（审核意见在原 PR 修改，不开新 PR）
- [ ] ⏸ 集市 keywords/描述优化（plugin.json）
- [ ] ⏸ 上架前终审：兼容矩阵（21 组）+ 安全扫描（mimosa）+ 隐私走查
- [ ] ⏸ 审核反馈处理
- [ ] ⏸ 上架后发布流水线常态化（每版本 release → 索引更新验证）

## 26.5 数据安全（2026-10-02 教训：远程电脑死机，一夜改动恐丢失）

- [ ] 🔴 推送纪律：每天开发结束必须 git push（杜绝未推送改动过夜——工作区/未推送提交=单点风险）
- [ ] 🟡 多机开发规则：任何一台机器开新工作前先 git pull；跨机改动用独立分支+即时推送，回主开发机先 fetch 再合并
- [ ] 🟢 里程碑打 tag（v0.1/v0.2…额外还原点；GitHub 之外建议重要节点备份 zip）
- [ ] 🟡 远程/出差场景：优先在 GitHub 网页端改文档类内容（代码等回来再合并），避免只在本地存在的新文件

## 26.6 调研吸收清单（2026-10-02 全量梳理：调研验证过但此前未待办化的功能点）

- [ ] 🟢 assets-real QR 标签打印/扫码定位（Sortly 印证）——实现路径已定：依赖 `qrcode`（纯 JS 无网络，33.5 理由：贴物标签打印+扫码直达行，用户可见功能值得引入）；内容=块双链；打印用 @media print 样式；**留 UI 阶段与新依赖评估一并做**（26.6 组 8/9 完成）
- [x] 🟡 vehicles 电池更换周期字段+提醒 ✅ 2026-10-02（schema 加 battery_due 列 + battery 提醒 30 天；周期推算由用户按实际记录下次更换日）
- [x] 🟡 vehicles 违章手动记录字段 ✅ 2026-10-02（violations text 列：日期/地点/行为/罚款摘要，换行分隔；子表化留 v0.8 深化）
- [ ] 🟢 insurance 续保决策提醒（contracts 自动续约有同款语义：到期前 N 天提示"续/比价/放弃"决策而非仅提醒）
- [x] 🟢 snippets 参数位模板（espanso Forms/TextExpander 印证：{{占位}} 展开时弹填充） ✅ 2026-10-02（约定文档化进 MODULES 16 组；{{语法}}+填充交互随 snippets 面板 v0.6+ 实现）
- [x] 🟢 media gallery 海报墙视图 ✅ 2026-10-02（schema 层：ViewDef 扩展 gallery 类型 + media views 声明；av 建视图实现在 provisioner views 落地时）
- [x] 🟢 food→stock 采购联动（最小版） ✅ 2026-10-02（food schema 加 ingredients 食材清单列，采购时对照 stock 采购建议；自动汇总联动留 v0.8）
- [x] 🟢 FAQ 补"全家共用"指引 ✅ 2026-10-02（专用笔记本+思源协作=零开发家庭共用；ADR-5 隐藏优点文档化）
- [x] 🟢 智能归类进阶参照 ✅ 2026-10-02（概念级文档化进 MODULES；依赖智能解析+Agent 能力先行，不排期）

## 26.7 细节优化梳理（2026-10-02：功能/流程/交互/UI 细节审查产出）

- [x] 🟡 快速表单按模块隐藏不适用行 ✅ 2026-10-02（字段行按台账列存在性显隐：certs 不显示金额、exams 不显示到期下拉等——capture 驱动完成）
- [ ] 🟡 adhoc 备忘的成员过滤语义定案（备忘无 memberId：成员过滤时显示全部还是隐藏？建议=显示全部并带"备忘"标记）+ 备忘管理入口（总览快速备忘区加"已添加 N 条"查看/清理）
- [ ] 🟡 台账页"未建库模块"重建入口（模块下拉只列有 avId 的；启用但建库失败的模块应可从台账页直接触发重建，联动诊断区）
- [x] 🟡 向导完成后的 CTA 深链 ✅ 2026-10-02（完成按钮=建库后直达预选 certs 的台账快速表单）
- [x] 🟡 打开管家面板默认热键策略定案 ✅ 2026-10-02（默认 Ctrl+Alt+H；FAQ 快捷键表同步；用户可在设置-快捷键改）
- [x] 🟢 成员删除确认文案升级 ✅ 2026-10-02（确认框说明数据保留语义；批量改派入口属 33 引用完整性项）
- [x] 🟢 提醒行移动端操作路径 ✅ 2026-10-02（hover:none 设备 ops 常显——比长按 Menu 更简洁可靠；04 §9 落点）
- [x] 🟢 Ledger 空态区分双文案 ✅ 2026-10-02（未建库=🚧重建指引；建库无数据=🗂录入指引；role=status 保留）
- [ ] 🟢 adhoc 备忘自动清理（已完成备忘 30 天后自动清除，防运行态无限增长；联动 33.3 运行态清理）
- [x] 🟢 窄屏 tabbar 折叠 ✅ 2026-10-02（760px：标题/meta 隐藏+wrap；<400px：页签等分收窄；04 §9 落点）

## 27. 开发流程与协作

- [x] 🔴 conventional commits 规范（feat/fix/docs/refactor/test/chore，git-commit skill 已支持） ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [ ] 🔴 eslint + prettier 配置统一（沿用模板或补齐，写入 CONTRIBUTING）
- [ ] 🟡 pre-commit hook：staged 文件快速 lint（提交前秒级反馈）
- [ ] 🟡 分支模型：main + feature/*；单人项目也走 PR 自检（触发 CI）
- [x] 🟡 PR 自查清单（check 通过/截图对比/TODO.md 勾选同步） ✅ 2026-10-02（.github/PULL_REQUEST_TEMPLATE.md 落盘）
- [ ] 🟡 每次合并后同步勾选 TODO.md（流程约定，防止清单腐化）
- [ ] 🟢 代码内 TODO/FIXME 注释规范 + 每版本清扫一次
- [ ] 🟢 多机开发同步约定（pull --rebase、禁 force push main）
- [ ] 🟢 devlog 开发日志（GitHub Discussions，记录关键决策）

## 28. 思源平台适配与增强

- [ ] 🟡 状态栏入口：`addStatusBar`「今日到期 N」角标，点击直达提醒页
- [ ] 🟡 Dock 面板评估：提醒中枢常驻侧栏（04 交互设计的遗留决策项）
- [ ] 🟡 多前端实测矩阵：desktop / desktop-window / browser-desktop / mobile 各一轮
- [ ] 🟡 第三方主题兼容走查（dark+/sunflower 等：color-mix 派生 token 在非官方主题下的表现）
- [ ] 🟡 思源设置内字号缩放适配（相对单位检查，禁固定 px 的正文字号）
- [ ] 🟡 高分屏/DPI 走查（发丝线、图标砖、光晕在不同缩放下）
- [ ] 🟢 面包屑按钮：`addBreadcrumbButton`，打开台账文档时显示「在管家面板打开」
- [ ] 🟢 AI Agent 能力注册：`addAgentCapability`「查询家庭到期/快速记录」（3.8.x 新能力）
- [ ] 🟢 与常见插件共存抽测（面板类名/事件总线/dock 冲突）
- [ ] 🟢 `siyuan://` 深链处理（通知点击在移动端的落地路径）
- [ ] 🟢 `addFloatLayer` 探索：块内快速记录浮层
- [ ] 🟢 台账行块拖入日记验证（思源原生块拖拽，文档化用法）
- [ ] 🟢 打印/导出 PDF 时管家界面的降级样式
- [ ] 🟢 `bootAppearances` 启动画面（远期彩蛋）

## 29. 提醒中枢深化

- [ ] 🟡 同成员同日多提醒合并展示（"儿子的 3 件事"折叠卡）
- [ ] 🟡 每周预告摘要（周日推送下周 7 天清单）
- [ ] 🟡 处理历史视图 + 月度完成率统计（到期处理率 = 质感的延伸）
- [x] 🟡 「快速备忘」开放决策：是否允许独立于台账的一次性提醒（如"周三给老师打电话"）——与 P2 原则的边界，需定案后更新 03 文档 ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [ ] 🟢 续期历史时间线（一个证件的历次换证/续保记录沉淀）
- [ ] 🟢 默认提前量自适应（按用户实际处理时长学习）
- [ ] 🟢 通知一键静音（今日免打扰快捷开关，顶栏）

## 30. 国际化细节

- [ ] 🟡 日期 locale 格式（zh `YYYY-MM-DD` / en 规范定案）
- [ ] 🟡 农历显示的 en 方案设计决策（"腊月廿三"英文呈现方式）
- [ ] 🟡 币种符号与千分位 locale 化（¥/￥/，分隔）
- [ ] 🟡 英文复数处理（1 item / N items，i18n 键设计）
- [ ] 🟢 双语言截图资产（README 与未来集市用）
- [ ] 🟢 zh-TW 翻译启动（用词对照表：软体/资料/档案…）
- [ ] 🟢 文案语气规范成文（按钮用动词开头、空态友好不卖萌、错误不说教）

## 31. 体验研究与反馈

- [ ] 🟡 内测计划：3-5 位真实用户（家人/朋友），两周使用 + 结构化访谈
- [ ] 🟡 内测反馈表模板（按模块打分 + 高频场景 + 弃用模块原因）
- [ ] 🟢 面板内「反馈」入口（跳转 GitHub issue）
- [ ] 🟢 访谈提纲：哪些模块真实被用/哪些被关掉/提醒是否及时
- [ ] 🟢 迭代优先级决策流程：内测数据 → TODO.md 重排（而非拍脑袋）

## 32. Svelte / 前端工程规范

- [ ] 🟡 组件目录规范：`src/panels/<screen>/`（index.svelte + 子组件拆分原则，禁止单文件超 300 行）
- [ ] 🟡 状态管理定案：svelte 5 runes 单例 store 三分（settings / hub / ui），边界写进 08 文档
- [ ] 🟡 SQL 结果类型化（query 泛型封装 + 每模块手写 Row 类型，禁 any）
- [ ] 🟡 面板 props any 清零：tab-panel 接口已具体类型化（HomeSettings/HubRuntime/ScanResult）；四屏组件的 IHomePluginLike any 字段（28 处）随 C 阶段细化逐屏类型化（循环A 第 2 项剩余）
- [ ] 🟡 Svelte 错误边界：面板崩溃不拖垮思源主界面（顶层 error boundary + 降级 UI）
- [ ] 🟡 加载态规范落地：何时 skeleton / 何时缓存直渲（对照 08 §4 状态矩阵逐屏标注）
- [ ] 🟢 关键组件 props 文档注释（含用法示例）
- [ ] 🟢 视觉回归抽查流程：改 token 后过一遍原型「组件库」屏截图比对

---

## 33. 2026-10-01 仓库审计补充（现状差距与新增验收线）

> 本组来自对当前源码、原型、构建产物和文档的交叉审计。`pnpm run check` 与 `pnpm run build` 已通过，但当前可运行范围仍是 v0.1 的 Dialog、设置、成员引用和模块注册骨架；以下项目用于把“能编译”推进到“可交付、可恢复、可验证”。

### 33.1 产品闭环与状态诚实

- [ ] 🔴 现状能力矩阵：为每个模块声明 `ready/skeleton/planned`，并让默认启用项必须具备 schema、provider、空态和可执行入口；禁止“已启用但点击只弹规划中”
- [x] 🔴 `loadSettings` 回归：用户显式关闭 `defaultEnabled` 模块后重启仍保持关闭；新增模块只在版本化迁移时补入默认值 ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [ ] 🔴 首次引导状态迁移：向导完成或用户明确跳过后才写 `onboarded=true`；v0.1 已安装用户能看到一次迁移提示并可重跑
- [ ] 🔴 模块启停事务：启用时显示建库进度、失败原因和重试；禁用只隐藏并保留数据，状态与 `dbRefs` 原子写入
- [ ] 🟡 管家面板单实例：顶栏、命令和通知点击复用同一 Tab/Dialog，避免重复打开多个面板和过期状态
- [ ] 🟡 设计契约引用矩阵：`docs/design/08`、`design-system.scss` 中的组件必须有实际页面引用或明确标为未实现，防止“样式已写但用户看不到”

### 33.2 数据、建库与迁移正确性

- [x] 🔴 `createAttributeView` 端点落地并建立真实响应 fixture；删除当前占位抛错，验收创建、补列、视图、relation 四类能力 ✅ 2026-10-01 Spike 全通（建库/加列/视图/relation）；fixture=spike 文档结论，补列循环见 provisioner
- [ ] 🔴 建库补偿：文档创建成功而 AV/列/视图失败时写入 provisioning journal，下一次可恢复重试并清理或复用空文档；并发启用同一模块不得产生双库
- [ ] 🔴 `dbRefs.notebook` 明确保存 ID；兼容旧的名称值、关闭/删除笔记本和重命名策略，禁止把 ID 当名称创建新笔记本
- [ ] 🔴 台账稳定身份：查找键改用稳定 `moduleId` 标记/属性，不使用本地化标题；语言切换或文案修改不得重复建库
- [x] 🔴 schema 契约门禁：所有 `capture`、`views`、`reminders.field` 必须存在于 `columns`；补齐 certs 的 `due` 列或删除无效 endorsement 规则，并统一 `date/issue_date`、`issuance_rule` 命名 ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [ ] 🔴 relation 元数据：`member` 列声明目标 members 库及缺失降级策略；v0.1 `settings.members` → members 数据库的一次性迁移可重试、去重且保留引用
- [ ] 🟡 目标笔记本配置落地：`HomeSettings` 增加 notebook ID/名称的迁移字段，设置页支持选择、关闭、删除后的恢复策略
- [ ] 🟡 设置 schema 版本与迁移链：校验小时范围、提前量、成员字段和未知字段；坏文件先备份，再回退默认并给出可恢复提示
- [ ] 🟡 去重修复工具：诊断区能发现重复模块文档/AV、孤儿 `dbRefs`、重复成员 ID，预览后安全合并并在迁移前自动备份

### 33.3 提醒规则与运行态

- [ ] 🔴 提醒字段语义契约：规则实际读取 `ReminderRuleSpec.field/cycleField/lunarField`，实现行级 `remind_before`、`leadOverrides`、`last_done` 优先级，校验并 clamp 无效提前量，明确 `later` 折叠/过滤语义，并过滤 archived/void 行
- [x] 🔴 日期序列化使用思源内核本地日期，不用 `toISOString().slice(0, 10)`；覆盖 UTC+8、夏令时、跨天和系统时间回拨矩阵 ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [x] 🔴 农历边界策略定案并测试：闰月映射、无闰月年份、腊月廿九、正月初一、2 月 29 日周年（2/28、3/1 或跳过）及单条异常隔离 ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [x] 🔴 recurring 算法与语义：明确逾期周期是否展示 overdue；月末 31 日不漂移；长期历史日期采用 O(1) 跳步，不能按天 `while` 扫描 ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [ ] 🔴 HubState 协议版本化：增加 `schemaVersion`、每成员/模块统计、扫描错误、snooze/mute/handled TTL 和旧缓存迁移；单模块失败不得把全局显示成“暂无事项”
- [ ] 🟡 运行态清理：行删除、模块禁用、卸载和跨设备冲突时清理提醒缓存，限制 `snooze/mute/handled` 无限增长，通知去重按本地日历计算，并提供脱敏诊断导出

### 33.4 UI、交互与可访问性

- [ ] 🔴 设置编辑事务：使用 draft 副本；取消/关闭回滚未保存改动，dirty 状态触发离开确认，保存失败保留输入并支持重试
- [ ] 🔴 成员编辑校验：首个成员可快速设为“自己”，名称必填、角色/日期合法；删除说明“仅移除引用/保留台账”并提供批量改派
- [ ] 🔴 提醒区真实接线：移除静态空态，接入 HubState 的 loading/empty/error/stale/retry 状态和“下一步”操作
- [ ] 🔴 无障碍走查：模块卡/成员 chip/表格行改为语义按钮或补齐 Enter+Space；补 label、heading、tablist/tabpanel、`aria-selected`、`aria-live`、可见焦点和读屏文案
- [ ] 🔴 弹层行为契约：Dialog/抽屉支持初始焦点、focus trap、Esc、关闭后恢复焦点、`aria-modal`、滚动锁和未保存变更保护
- [ ] 🟡 响应式矩阵：320/375/768/1024、desktop-window、browser、mobile 全部走查；Dialog 使用视口上限、成员行窄屏堆叠、触摸目标至少 44px、安全区可用
- [ ] 🟡 无悬停操作：提醒/表格动作在键盘 focus-within、触摸和移动端均可见；不能只依赖 hover 后显示操作按钮
- [ ] 🟡 主题与样式隔离：`.b3-tab-bar` 等旧样式全部挂 `.lv-home` 作用域，清理硬编码颜色并补 color-mix fallback、对比度和 high-contrast 验收
- [x] 🟡 文案国际化真值：关于页、版本、错误、ARIA、农历说明和诊断文案全部进入 zh-CN/en；禁止 `settings.svelte` 继续硬编码中文 ✅ 2026-10-02（Tab 化 + 数据接线 commit，见 34 组记录）

### 33.5 平台、发布与支持

- [ ] 🔴 SQL/输入安全专项：所有动态查询统一参数化或严格 ID 校验；对话框 placeholder/defaultText、标题、备注、附件名称统一 textContent/HTML sanitization
- [ ] 🔴 错误与诊断入口：设置页显示插件/思源版本、前端类型、失败端点、最近扫描和恢复步骤；日志永不输出证件号、金额、token
- [ ] 🔴 前端/内核兼容矩阵：desktop、desktop-window、browser-desktop、browser-mobile、mobile 在 3.8 LTS 与最新 beta 上验证能力探测和降级路径
- [ ] 🟡 多窗口状态一致性：settings 与 `hub.updated` 事件带版本/时间戳，覆盖乱序、重复、丢失事件并提供手动刷新提示
- [x] 🟡 发布包 smoke test：解压 `package.zip` 检查 manifest、双语 i18n、图标、`LICENSE`、`MODULES.md` 和 README 链接；处理 `dist` 未包含 docs/design、prototype 导致的失链 ✅ 2026-10-02（首轮抓到 2 真问题并修复：docs 泄漏入包已禁、LICENSE 补入；D12 落实 vite 配置）
- [x] 🟡 元数据一致性门禁：`package.json` repository/homepage、作者、版本、license、`plugin.json`、README 和 release tag 在 CI 中交叉校验 ✅ 2026-10-02（scripts/check-meta.mjs + check:meta；name/version 交叉+关键文件存在性；repository 已填）
- [ ] 🟡 PR CI：除 tag release 外补充 PR 的 `check + build + 包体/产物检查`，并记录 zip 体积与关键文件哈希
- [ ] 🟡 README / MODULES / TODO 发布策略统一：明确当前 v0.1 实现边界、GitHub Release 与集市暂缓状态，避免把路线图写成已交付能力
- [ ] 🟢 卸载/重装/工作区切换测试：确认台账保留、设置恢复、插件 reload 不复用旧内存，`onunload` 清理事件、计时器和 observer

---

## 34. 自主开发兜底循环协议（2026-10-01 设立）

> **触发条件**：当前所有可自主完成的任务（非 ⛔ 等实测、非 ⏸ 暂缓）已全部完成或阻塞。
> **退出条件**：循环中产生任何新的可自主任务（用户反馈、Spike 解锁、调研发现）→ 立即退出循环回主线开发。
> 每轮循环必须有**产出证据**：一个 conventional commit（循环 A）或 TODO/MODULES 文档变更（循环 B），禁止空转。

### 循环 A · 优化循环（对已开发内容）

按固定清单顺序走查，命中即修，修完构建 + 测试 + 提交（`refactor:`/`fix:`/`perf:`/`docs:`）：

1. **代码质量**：重复逻辑提取、`any` 清零、死代码与调试残留清扫、TODO/FIXME 注释清偿
2. **类型严格**：新增公共 API 的类型完整性、SQL 结果类型化（禁 any 行）
3. **测试补强**：新逻辑必须有对应单测；覆盖率向 core/ ≥70% 推进；边界用例（闰月/月末/跨年/空值）
4. **设计一致性**：`design-system.scss` vs 原型组件库屏比对；新 UI 是否用了 b3 派生 token（禁硬编码色）
5. **文档一致性**：设计文档 01-09 与代码现状交叉核对（ADR 是否被实现偏离、决策 D 编号是否落实）
6. **i18n**：zh-CN/en 键位 diff、硬编码文案扫描、新组件文案双语言
7. **可访问性**：新交互元素的键盘可达、aria 标注、焦点管理
8. **性能**：bundle 体积变化记录、date-fns/lunar 按需引入复查、列表渲染 memo 机会
9. **安全**：新增渲染点转义、日志脱敏复查、依赖变更记录理由

### 循环 B · 扩展循环（新增待办 + 外部调研）

每轮至少完成 ①+② 各一项，③ 轮流执行不同信源：

1. **新增待办**：从以下来源提炼可执行项回填 TODO.md（带优先级标记）——
   - 16 组模块深化的自然延伸、33 组审计项的细分子项、09 决策的落地缺口
   - 循环 A 走查中发现的结构性改进（非即时修复的）
   - 调研结论（见下）
2. **待办质量化**：新待办必须写清验收标准与依赖关系；每周（或每 10 项）重排一次优先级
3. **外部调研**（轮换信源，结论回填 `MODULES.md` 附录 + 新待办）：
   - **GitHub 同类高 star 项目**：`gh repo view <owner/repo>` / `gh api repos/<repo>/readme`（家庭管理/物品台账/订阅/提醒类：homebox、grocy、firefly-iii、actual、espanso、komga…每轮 2-3 个深读功能清单）
   - **思源集市**：抓取 siyuan-note/bazaar `plugins.json`，检索家庭/台账/提醒/记账/标签新插件
   - **Obsidian 插件生态**：GitHub topic obsidian-plugin 高 star（tracker/life-os/dataview 任务管理/日历系）
   - **Notion 模板生态**：home management/life OS 模板的功能面
   - **手机/桌面软件**：iOS 提醒事项/家庭、Things 3、TickTick、Stocard、小日常、滴答清单等的功能演进
   - **调研纪律**：每产品固定输出"功能点 → 归属模块 → 优先级 → 来源"四元组；不吸收项写明原因

### 循环执行记录（append-only）

| 日期 | 循环 | 动作 | 产出 |
|---|---|---|---|
| 2026-10-01 | 设立 | 协议建立 | 本节 |
| 2026-10-01 | 主线 | Spike 三组实验（用户启动思源后执行） | 定案 R-av-create/R2/R5；siyuan.ts 真实 av 实现；S0-S5/A2a 共 9 项勾选；R5 降级定案；实验笔记本已清理 |
| 2026-10-01 | 主线 | B2a/B2c/B4f 提醒中枢数据链 | DataProvider(certs/members) + runScan(容错/开关收敛/计数) + runtime(snooze/mute/adhoc/缓存)；DbRef.columns 映射补齐；vitest 30/30；B2d/B3 留待接线 |
| 2026-10-02 | 主线 | C1 Tab 化 + B2b/B3 接线 + C7 向导 + A4 | addTab 四页签面板（总览/提醒/台账/成员）；onload 建库+扫描+每日摘要；向导三步（suggestRoles 预选）；i18n 迁移（216 键双语）；GitHub 公开仓库 ai68298100/siyuan-home 推送；新增 🔴 bundle 超预算待办；发现 addTab init 闭包 self 指向 window 的坑已修 |
| 2026-10-02 | 主线 | 🔴 bundle 整改 + C2a/e + C3b + C7d | 农历动态 import 拆 chunk（gzip 132→32.4KB，-76%，chunk 强制 .js）；总览成员 chips 过滤（持久化）+模块卡待办数；提醒页三级分组；设置页重跑引导；vitest 30/30 |
| 2026-10-02 | 主线 | 33.1 单实例 + 33.4 draft 事务 + 文档三件套 | hubListeners Set 多实例刷新；设置 draft 编辑事务（保存落盘）；i18n 真值收尾；FAQ/privacy/ADR 索引落地；vitest 30/30 |
| 2026-10-02 | 主线 | C2c qbtn + C1b 胶囊 + 诊断区 + D1 回归脚本 | 快速记录行（跳台账预选）；导航胶囊 spring；设置·关于诊断（dbRefs/扫描错误/契约门禁）；回归脚本 docs/testing/v0.2.md |
| 2026-10-02 | 主线 | avItemId 迁移工具 | 诊断区一键按姓名匹配 members 库行回填 avItemId（backfillMemberLinks）；vitest 30/30 |
| 2026-10-02 | 主线 | v0.3 三模块 schema 生产 | medicine/memberships/insurance schema + SchemaLedgerProvider 通用提醒派生 + ensureCoreLedgers 按启用建库 + 54 枚举 i18n；验证"新模块=数据"扩展设计；gzip 33.4KB |
| 2026-10-02 | 主线 | 8 模块 schema 批量生产（v0.4/v0.5/v0.6 主体） | shopping/contracts/exams/allowance/favors/stock/chores/house schema + 66 枚举 i18n（总 329 键）；契约门禁 13 schema 全过；gzip 34.2KB；schema 驱动模块达 13/31；devStatus 已随 schema 批量晋升（31 模块 skeleton，ready 待各模块 UI 完成逐个晋升） |
| 2026-10-02 | 主线 | 🏁 31/31 schema 全覆盖 | 最后 7 个轻模块（food/address/bookmarks/snippets/parenting/schooling/social）；i18n 451 键；gzip 35.9KB；契约门禁 31 schema 全过；31 模块全部 schema 驱动——v0.3~v0.8 全版本 schema 层提前完成 |
| 2026-10-02 | 循环A | 兜底循环 A 启动：devStatus 批量晋升 + 面板点击文案分级（ready/skeleton/planned 三态已实现） | modules.ts 31 项 skeleton；vitest 30/30 |
| 2026-10-02 | 循环A | 第 6 项 i18n 走查 | scripts/check-i18n.mjs（check:i18n script）；451 键 zh/en 全对齐 |
| 2026-10-02 | 循环A | 第 9 项安全审计 | 移除模板遗留 console.debug（配置含成员/金额禁止打印）；保留 error 一处（契约校验提示）；console 全库仅剩必要路径 |
| 2026-10-02 | 循环A | 第 1 项代码质量 | package.json repository/homepage 补齐（25 组元数据一致性）；抽查 5 个导出符号无死代码实锤 |
| 2026-10-02 | 循环A | 第 5 项文档一致性 | 全仓 47 个 md 相对链接核查零失效 |
| 2026-10-02 | 循环A | 第 2 项类型严格（首步） | tab-panel 核心接口具体类型化；全库 any 存量 27+28 处已盘点并记待办分批清零 |
| 2026-10-02 | 循环A | 第 4 项设计一致性（色值走查） | svelte/ts 硬编码色值仅 2 处（品牌渐变第二色）→ token 化 --lv-accent-2 集中于设计系统；无其他违规 |
| 2026-10-02 | 循环A | 第 3 项（部分：check 链）+ 第 7 项（盘点） | check:i18n 纳入 pnpm check；a11y 盘点：buttons 全量可键盘达、aria-label/role/tabindex 已有基础，剩余=抽屉 focus trap 与 aria-live（记 33.4 剩余） |
| 2026-10-02 | 循环A | 第 8 项性能 + 循环终局 | gzip 35.9KB 实测达标（预算 100KB）；9 项走查完成 7 项，剩余 2 项（无障碍补齐/any 清零）已归属 33.4 与 C 阶段；循环 A 关闭，后续触发条件=实测反馈或新模块生产 |
| 2026-10-02 | 循环B | v0.5 疫苗程序表种子数据 | immunization.ts（22 剂+推算函数）；政策公开数据，无版权问题 |
| 2026-10-02 | 循环B | 外部调研最小轮 | actual（12k★：加密同步/快照设计印证）、seerr（12.7k★：媒体状态机印证）回填 MODULES.md 附录 |
| 2026-10-02 | 循环B | 外部调研 espanso | 14.6k★；snippets 印证 Forms 参数位形态回填 MODULES.md |
| 2026-10-02 | 循环B | 外部调研 Raindrop | 官方端 ★680/659；bookmarks 印证集合分类+失效检测；新增轻待办：bookmarks 加失效链接检测（进阶） |
| 2026-10-02 | 循环B | 外部调研 Notion 家庭 Binder 生态 | 5 款模板共性（紧急卡置顶/信息中枢/Legacy 维度/移动优先）全部印证既有设计；14 组集群调研收官 |
| 2026-10-02 | 循环B | 外部调研 TextExpander | 14 组最后尾巴收掉：Snippet Groups 分组共享印证 snippets 家庭共享形态（v2.x kernel broadcast 场景）；云端订阅不吸收。循环 B 常规项全部完成，后续仅按需触发 |
| 2026-10-02 | 循环B | 外部调研 Obsidian Tasks | 循环任务完成→自动生成下一次（印证 chores 语义）；内嵌 query 块按日期分组（印证台账嵌入视图方向）；来源 obsidian-tasks-plugin 官方文档 |
| 2026-10-02 | 循环B | 外部调研 TickTick/滴答清单 | 智能日期解析产出新待办（快速录入 NLP 日期）；位置提醒/四象限/习惯打卡不吸收 |
| 2026-10-02 | 循环B | 外部调研 Things 3 | 双日期分离（deadline/plan）产出新待办；This Evening 晚间分区记可选；来源 culturedcode 官方支持文档 |
| 2026-10-02 | 循环B | 外部调研 Apple Reminders | Grocery 按品类自动分区产出待办（stock 分组视图）；列视图记可选项；来源 Apple Support |
| 2026-10-02 | 循环B | 外部调研 Microsoft To Do | My Day/星标/共享列表印证总览与徽章设计；家庭共享列表印证 v2.x kernel broadcast；来源 Microsoft Support |
| 2026-10-02 | 循环B | 社区需求信号调研 | Issue #15002（dock 时间提醒=社区公认缺口）；家庭垂直在社区侧亦空白——定位持续有效；来源 ld246/GitHub 检索 |
| 2026-10-02 | 循环B | 滴答清单智能解析规则深挖 | 提取实现规格（格式清单/模糊日规则/残留清理）；智能解析待办从概念升级为有规格可实施 |
| 2026-10-02 | 循环B | 外部调研 Superlist/时律清单 | AI 转结构化任务=行业方向（对应 addAgentCapability）；时律纪念日助手印证农历纪念日场景 |
| 2026-10-02 | 循环B | 思源 3.8.5/3.8.6 官方更新调研 | ⭐ 官方新增数据库日历视图+列表视图（3.8.5）并增强（3.8.6）——提醒中枢日历形态可走原生；表单视图未推出（快速录入维持自建）；回填 MODULES.md |
| 2026-10-02 | 循环B | 官方日历 issue 深挖 | #19933/#19951 均已 CLOSED（日历交互/模板计算日期）——官方在日历视图上快速迭代，原生路线决策强化 |
| 2026-10-02 | 主线 | C2c qbtn 矩阵补全 | 快速记录行 6 入口（新增订阅/影音/人情） |
| 2026-10-02 | 循环B | ⭐ 官方 Issue #15002 深挖 | 88250 官方回应：系统级提醒让渡给插件生态（无开发资源）——小驴管家定位获最强背书；家庭垂直无竞争确认；回填 MODULES.md |
| 2026-10-02 | 主线 | 33.4 弹层契约（部分） | 续期 Dialog 初始焦点落日期输入；aria-live 需结构配合暂缓 |
| 2026-10-02 | 主线 | 33.4 微补 | 总览空状态卡 role=status（读屏播报空态切换） |
| 2026-10-02 | 主线 | C6a 增量 | ledger 快速表单加分类下拉（schemaCatalog 目录挂载，枚举 schema 驱动）；capture 全列集动态渲染留后续 |
| 2026-10-02 | 主线 | C6a 增量 2 | 快速表单加金额字段（number 列写入；购物/会员/人情模块通用） |
| 2026-10-02 | 主线 | C6a 增量 3 | 快速建行自动写默认状态（schema status 枚举首值，certs=valid/medicine=inuse） |
| 2026-10-02 | 主线 | C6a 增量 4 | 快速表单加 URL 字段（url 列写入；shopping/bookmarks/media/food 模块 capture 常见列） |
| 2026-10-02 | 主线 | C2e 补全 | 模块卡待办数跟随成员过滤（此前仅提醒区过滤） |
| 2026-10-02 | 主线 | 26.6 消化④ | insurance 续保动作（renew 扩展：新到期日写回 expiry；比价/放弃选项留细化） |
| 2026-10-02 | 主线 | 26.6 调研吸收清单 | 全量梳理 30 信源对照 31 模块：9 个调研验证过但未待办化的功能点落盘（QR 标签/电池周期/违章记录/续保决策/参数位/海报墙/food-stock 联动/全家共用指引/智能归类参照）；三验证全绿 |
| 2026-10-02 | 主线 | 26.6 消化 8/9 | 电池周期✓ 违章✓ 全家共用FAQ✓ 续保动作✓ 海报墙✓ 参数位约定✓ food-stock✓ 智能归类✓；QR 标签留 UI 阶段（依赖决策已记录） |
| 2026-10-02 | 主线 | 26.7 细节优化梳理 | 审查功能/流程/交互/UI 细节产出 10 项新待办（表单行级显隐/adhoc 过滤语义与备忘管理/台账重建入口/向导 CTA/默认热键/删除文案/移动长按/空态双文案/备忘清理/窄屏 tabbar） |
| 2026-10-02 | 循环B | 外部调研 Notion 数据库自动化 | 循环触发器（Every frequency，2025 新）印证提醒中枢 recurring 语义且我们更彻底（推算 due 而非仅跑自动化）；来源 notion.com/help/database-automations |
| 2026-10-02 | 循环B | 外部调研 Google Tasks | 到期自动同步日历印证台账日历呈现（原生路线再确认）；Gmail 侧栏捕捉=顶栏⚡同位设计；来源 Google Workspace |
| 2026-10-02 | 循环B | 外部调研 Wunderlist 停服教训 | 云服务消亡=数据永久丢失+官方迁移工具静默丢数据——强化本地优先/标准导出/逐字段核对三原则；迁移指南（24 组）设计原则落定；来源 The Verge/Taskade |
| 2026-10-02 | 循环B | 外部调研 Todoist | Quick Add 输入即解析+Filter Queries+Assist 自然语言生成查询——智能解析与命名视图两待办的规格参照再强化；来源 todoist.com/help |
| 2026-10-02 | 循环B | 外部调研 Any.do Family | 协作智能杂货清单印证品类分区；任务内聊天/@提及/指派=v2.x kernel broadcast 交互设计参照；来源 support.any.do |
| 2026-10-02 | 主线 | 22 组快捷键速查表 | 设置·关于区落地；策略=仅 2 命令可配避免冲突 |
| 2026-10-02 | 主线 | C1c 真正收尾 | settings 面板类名统一 lv-settings 命名空间（脱离 LEGACY 段）；index.scss 仅剩 settings 现役类 |
| 2026-10-02 | 循环B | 外部调研 Notion Calendar | 日期属性数据库直接上日历+Date 属性提醒——印证提醒中枢日历视图形态（v0.3+ 候选）；菜单栏理念印证状态栏角标；来源 notion.com/help |
| 2026-10-02 | 主线 | 23 组 release notes 生成器 | scripts/release-notes.mjs（git log 分组草稿） |
| 2026-10-02 | 循环B | 外部调研 flomo | 无压力捕捉印证快速备忘设计；每日回顾/八维统计参考到 v2.x 年报与统计卡；来源 flomoapp.com |
| 2026-10-02 | 循环B | 外部调研 Notion Timeline | 起止日期范围=时间线上屏条件；travel-plan/schooling 的 timeline 视图在 v0.8 建库时补（schema 已有起止列）；来源 notion.com/help/timelines |
| 2026-10-02 | 循环B | 外部调研 Things 3 Areas | Area→Project→To-do 层级强印证我们模块组→台账→行两层结构；组织归层级/时间归调度的分离与成员 chips+提醒中枢设计一致；来源 vanja.io/r/thingsapp |
| 2026-10-02 | 循环B | 外部调研 滴答清单四象限/智能清单 | 筛选器命名视图产出新待办（依赖已实现的 C3d 持久化）；来源 help.dida365/sspai |
| 2026-10-02 | 循环B | 外部调研 Notion relation/rollup | 成员卡统计 rollup 原生路径确认产出待办（C5b 数据层简化）；来源 notion.com/help/relations-and-rollups |
| 2026-10-02 | 循环B | 闲时队列任务执行（第二轮 prompt 到达） | 任务1-4（i18n/Tab化/接线/引导）核对为已完成（prompt 快照滞后约20提交）；增量=firefly-iii 调研（24.8k★）回填；巡检全绿；金钱提醒：循环交易印证 memberships recurring |
| 2026-10-02 | 主线 | 33.5 发布包 smoke test（首轮） | 抓到并修复：docs 泄漏入包（vite staticCopy 删 docs 行）+ LICENSE 未入包（补复制）；复检 11 必要文件全 OK/4 禁入文件全无/JSON 与 i18n 校验过 |
| 2026-10-02 | 循环B | 外部调研 Apple 备忘录家庭共享 | 共享文件夹=家庭共用台账的思源原生路径印证（专用笔记本+思源分享即可，无需插件开发）；来源 Apple Support |
| 2026-10-02 | 循环B | 外部调研 Notion Charts/Dashboard | 原生 chart/dashboards 印证统计卡价值；思源暂无 chart 视图→统计卡维持自绘 spark；来源 notion.com/help/charts |
| 2026-10-02 | 循环B | 外部调研 Notion 视图 2.0 | 10 种视图与台账映射（form=快速录入原生路径候选，记 C4a 复核点）；map 思源暂无保持列表 |
| 2026-10-02 | 循环B | 集市监控首轮（23 组） | 3 插件扫描：无家庭垂直竞品；任务笔记管理的移动端后台提醒印证 B3 可行性；23 组转为周期性持续 |
| 2026-10-02 | 循环B | 任务笔记管理源码深挖 | NotificationDialog 队列模式（MAX=5）产出通知防轰炸待办；移动端后台教程在其知乎文章（B3 接线时参照） |
| 2026-10-02 | 循环B | siyuan-homepage 深挖（循环B 本阶段收尾） | 通知中心 Webhook 出口产出 B3 扩展待办（Bark/ntfy 或联动转发）；循环 B 进入休眠，触发条件=新竞品信号或实测反馈 |
| 2026-10-02 | 循环B | 外部调研 Apple Shortcuts | x-callback/自动化触发器→外部快速记录待办（kernel 私有路由用例补充；28 信源） |
| 2026-10-02 | 主线 | C3d 筛选持久化 | runtime.hubFilter；健康巡检全绿 |
| 2026-10-02 | 主线 | B3b 逾期即时提醒 | 每日首次扫描 overdue>0 且非静默 → error 级提示；lastOverdueAlertDate 去重 |
| 2026-10-02 | 主线 | B4e 定位动作（R5 降级实施） | 提醒行加定位按钮 → 打开该模块台账文档；行内高亮待非 detached 行路径解锁 |
| 2026-10-02 | 主线 | C2d 深化 | 模块卡点击 → setActiveLedger 预选对应模块台账 |
| 2026-10-02 | 循环A | README 导航补全（回归脚本/FAQ/privacy 链接可见化） | 新用户路径打通；英文版同步 |
| 2026-10-02 | 循环A | FAQ 补快捷键表+参与测试指引（22 组项落地） | 快捷键策略：仅 2 命令可配，页签点击为主 |
| 2026-10-02 | 主线 | 33.2 重复台账检测（最小版） | findDuplicateLedgers：hpath 分组检测同名台账；诊断区接入留下轮（函数已就绪+验证） |
| 2026-10-02 | 主线 | 33.2 检测接入诊断区 | 按钮+结果提示（无重复/列出重复组）；合并修复动作留待实测后按需 |
| 2026-10-02 | 循环A | 第 7 项无障碍终查（快速） | 新 UI 非按钮交互仅模块卡（已有 role/tabindex/onkeydown）；dashboard.svelte 为 LEGACY 待 C1c 删除；33.4 无障碍剩余仅剩抽屉 focus trap/aria-live |
| 2026-10-02 | 主线 | 33.2 journal 最小版 | DbRef.provisionError 记录建库/补列失败摘要（成功清除）；诊断区红色显示；完整 journal（多步恢复）留实测后按需 |
| 2026-10-02 | 主线 | 33.5 元数据一致性校验脚本 | scripts/check-meta.mjs（name/version 交叉+文件存在性+上架开关提示）；check:meta script |
| 2026-10-02 | 主线 | 23 组 zip 体积门禁 | check:meta 内置（<10MB） |
| 2026-10-02 | 主线 | 25 组 issue/PR 模板落盘 .github/ | bug/feature 模板 + PR 自查清单 |
| 2026-10-02 | 主线 | C5b 成员下钻最小版 | 成员卡点击展开该成员提醒明细（徽章+逐条+完成动作）；完整跨模块时间线留 v0.5+ |
| 2026-10-02 | 主线 | C1c（部分） | 删除废弃 dashboard.svelte（Tab 化后无引用）；settings 面板为现役保留 |
| 2026-10-02 | 主线 | C1c 收尾（第一步完成） | LEGACY 段 7 个 dashboard 专用类删除（全局零引用验证）；settings 现役类保留；css 21.8→更精简 |
| 2026-10-02 | 巡检 | 健康巡检 | check 0/0、30/30、build 成功、工作区干净；大颗粒项（C6a/33.2 journal 完整版）交接闲时队列 | media/pets/vehicles/transit/travel×4/assets-virtual 9 个 + 修复核心缺口 assets-real/health（默认启用却无 schema 的建库缺口）+ 68 枚举 i18n（总 399 键）；gzip 35.3KB；contract gate 24 schema 全过；剩余无 schema：food/address/bookmarks/snippets/parenting/schooling/social |

---

## 关键路径速览

```
S0(启动思源) → S1/S2 → A2a/A3 → A5 → B2 → C1 → C2-C7 → D
                ⛔目前唯一阻塞点：思源实例未运行
快速可先行（不依赖 Spike）：
  0 工程基建(git init/icon) · B0/B1 单测 · C6c-d 块菜单与斜杠 · C7 向导骨架 · C8 设置壳 · 27 开发流程规范
```

> 统计：待办 36 组共 **417 项**（已完成 ✅ 15 · 🔴 95 · 🟡 179 · 🟢 94，部分项含双重标记；⛔ 等实测 14 项、⏸ 暂缓 8 项）。⛔ 项全部指向同一根因：**思源实例未启动**（等用户空闲实测，不阻塞其余开发）。兜底循环协议见第 34 组。
