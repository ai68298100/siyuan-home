# 小驴管家（Lv Home）· 项目待办总清单
| 2026-10-03 | 主线 | 第十五轮：20 组去抖 + 29 组合并卡 + 30 组两项决策 | refreshHub force 分流（30s 去抖+四处强制入口）；同人同日折叠卡（snippet 重构，键盘可达）；en 复数与日期格式记录为设计决策（中性形式/ISO 同形）；单测 118 持平、i18n 589→591、gzip 46.4KB |
| 2026-10-03 | 循环A | 第十五波走查 | 合并卡键盘可达（role=button+Enter）；settings 面板 IHomePluginLike 签名同步（即修 svelte-check）；snippet 重构后单条路径无行为差异 |
| 2026-10-03 | 循环B | 信源轮换：Komga（gotson ★6.7k，14 组遗留项） | 收藏夹/在读清单/进度/元数据编辑印证 media schema 与三视图设计；多用户访问控制不吸收；回填 MODULES 附录 |
| 2026-10-03 | 主线 | 第十六轮：疑点深挖四连 | ①向导建库失败浮出（此前只进诊断区，用户完成向导后无感）；②设置导入归一化（未知模块剔除进报告、成员 id/名/角色逐条修复——normalizeImportedSettings 纯函数+单测两条路径）；③快速存入名称截断改码点安全（emoji/生僻字不再劈成乱码）；④新增成员同名确认（D06 配套：同名会造成按姓名回填歧义）；单测 118→120、i18n 591→595、gzip 46.6KB |
| 2026-10-03 | 循环A | 第十六波走查 | TS 收敛即修（leadOverrides narrowing cast）；归一化修复计数语义复核（一条成员可累计多项修复）；无新增硬编码 |
| 2026-10-03 | 循环B | ③轮休（近七轮已覆盖六信源+两检索） | ①② 不适用——记录轮休 |
| 2026-10-03 | 主线 | 第十七轮：对抗性审查（UG03 前置演练） | 以攻击者/粗心用户视角审查删除/导入/批量三链，命中两缺口并修复：①导入覆盖前自动备份当前设置（settings.pre-import.json）+ 备份存在时显示"恢复导入前设置"一键回滚（DL07 导入前快照语义落地）；②批量操作逐条容错——单项失败不中断剩余项，回执报告成功数与失败清单（原实现中断后静默丢弃）；单测 120 持平、i18n 600 键、gzip 46.8KB |
| 2026-10-03 | 循环A | 对抗性审查方法与覆盖记录 | 已审：删除链（行/成员/备忘/示例清除——此前各轮已加固）、导入链（本轮闭环）、批量链（本轮闭环）；遗留审查点：协作者链（多端并发，R07/EC02 条件）与脚本调用链（kernel 私有路由未开放，天然隔离）；审查发现全部当场修复 |
| 2026-10-03 | 循环B | ③轮休（两日内已覆盖八信源/检索） | ①② 不适用（对抗审查产出已当场消化）——记录轮休 |
| 2026-10-03 | 主线 | 第二十轮：21 组覆盖率达标 + R06 首处修正 + runtime 容错补测 | @vitest/coverage-v8 接入，core/ 语句 86.98%/分支 90.45%（≥70% 目标达成）；英文 README 测试徽章 33→120、"Rows are blocks"过宽声明替换（MODULES.md 同步修正为 detached 行非块事实）；runtime 损坏容错补测；单测 120→121、i18n 600 持平 |
| 2026-10-03 | 循环A | 第二十波走查 | coverage/ 产物拦截入库（gitignore）；动态 import 超时改静态导入（12.7s→<1s）；全门禁绿 |
| 2026-10-03 | 循环B | ③轮休（两日累计十信源/检索） | ①② 不适用——记录轮休 |
| 2026-10-03 | 主线 | 第二十二轮：EC01 身份清单 + 详情抽屉字段编辑 | 六兄弟仓 manifest 全量登记 + 能力面 grep 实证（EC13/16/17/12 升级为源码证据，清单落 docs/research/）；详情抽屉编辑模式（六类型表单化、仅写变更字段、空值清空、逐字段失败报告、PF06 增量刷新）；单测 121 持平、i18n 600→603、gzip 48.1KB |
| 2026-10-03 | 循环A | 第二十二波走查 | 编辑保存失败标签逐字段化（占位即修）；cellValue 补清空语义（date/number 空值 isNotEmpty:false，与成员生日清空一致）；视图/编辑双模式互切零残留 |
| 2026-10-03 | 循环B | ③轮休（两日累计十信源/检索） | ①② 不适用——记录轮休 |
| 2026-10-03 | 主线 | 第二十一轮：CSV 导出 + ws 变更补扫 | 台账页 CSV 导出（schema 全列/BOM/排序搜索联动/本地生成）；ws-main websocket → 60s 节流补扫（他端变更信号，[待实测]）；单测 121 持平、i18n 600→602、gzip 47.2KB |
| 2026-10-03 | 循环A | 第二十一波走查 | CSV 转义复核（引号/逗号/换行成对转义）；导出遵循过滤结果而非全库（用户预期一致）；ws 节流与全量去抖叠加复核（最密 30s 一次） |
| 2026-10-03 | 循环B | ③轮休（两日累计十信源/检索） | ①② 不适用——记录轮休 |
| 2026-10-03 | 主线 | 第二十三轮：EC 源码契约摘录（离线研究轮） | 直读三兄弟仓实现：人脉 window.LvContacts 桥（protocol 1/四能力/幂等 externalRef/未初始化抛错——EC13/14/15）、打卡 window.siyuanCheckin 形式化契约 v5（20 能力 since 矩阵/8 集成事件/硬限制——EC09/10/11/12，EC10 触发源修正为 checkin:* 事件）、雷切 registerQuickAction/registerHomeModule 完整签名（EC16/17，token 防覆盖/只读边界）；摘录落 docs/research/2026-10-03-EC-源码契约摘录.md（含四处对接落点与三项待下轮） |
| 2026-10-03 | 主线 | 第二十四轮：契约摘录 §4 三项深读完成 | 雷切 read 载荷定案（快照对象/错误降级为空态+重试提示/cacheTtlMs 缓存/context.signal 中止）；打卡 CheckinApi 全方法面登记（queryItems/getEventsInRange 半开区间+truncated/recordEventsBatch 幂等 1:1/occasions 三方法/强度摘要 ≤366 天）；拾遗确认**无任何外部桥**（GleanFacade 为内部 UI 契约——EC26-28 提供方依赖坐实）；**EC10 结论：EC09 绑定 UI 必须先行（绑定模型是产品决策），否决抢跑实现**——摘录 §4 更新并新增 §5 判断；单测 121 持平 |
| 2026-10-03 | 循环A | 摘录复核 | 全部条目源码直读非转述；拾遗零暴露结论经 index.ts+types.ts 双文件确认 |
| 2026-10-03 | 循环B | ③信源=兄弟仓源码（连续两轮，零网络） | ①研究产出即待办资产（摘录 §4 深读完成）；②EC10 顺序决策（EC09 先行）记录在案；EC26 供方依赖注记补入 |
| 2026-10-03 | 主线 | 第四十二轮：EC09/EC10 打卡只读消费 | checkin:* 三事件监听（60s 节流）→ getStrengthSummary top 5 缓存进 runtime.lastCheckinSummary；whenReady 探测 + 卸载移除；单测 126 持平、gzip 51.7KB；[待实测] 同实例 |\n| 2026-10-03 | 循环A | 第四十二波走查 | 花括号重复即修；whenReady false 不拉取；三事件监听卸载移除 |\n| 2026-10-03 | 循环B | ③信源=兄弟仓源码（第七轮） | EC10 结论修订：只读消费可先行，绑定 UI 仍待决策 |
| 2026-10-03 | 主线 | 第四十三轮：EC14 补完——成员详情展开显示联系人快照 | 成员卡展开段增加 contactSnapshot 行（📞 前缀）；单测 126 持平、i18n 624 持平、gzip 51.7KB |
| 2026-10-03 | 循环A | 第四十三波走查 | 新增展示零逻辑变更（纯读取渲染）；全门禁绿 |
| 2026-10-03 | 循环B | ③轮休（延续） | 兜底循环静默待命（延续） |
| 2026-10-03 | 主线 | 第四十五轮：用户指南文字内容（22 组） | docs/guide/ 6 篇：getting-started（5 分钟上手）/certs（录入+提醒+续期+联系人）/medicine（双规则提醒+低库存语义）/contracts（字段+对接人+续约）/members（添加/编辑/删除/人脉关联/统计/过滤）/reminders（三级分组/四维筛选/处理动作/批量/通知策略）；截图待真机；单测 126 持平、i18n 624 持平 |
| 2026-10-03 | 循环A | 第四十五波走查 | 指南内容与代码行为逐条核对（筛选维度/提醒规则/双规则语义/快照格式） |
| 2026-10-03 | 循环B | ③轮休（延续） | 兜底循环静默待命（延续） |
| 2026-10-03 | 主线 | 第二十五轮：EC16 落地（管家→雷切动作注册） | 按打卡已验证模式实现：app.plugins 探测 + 方法存在性 + 1200ms×10 重试 + disposer 收集；注册「打开管家/打开提醒中枢」两动作（提醒预选）；卸载全注销；单测 121 持平、gzip 48.2KB；[待实测] 同实例联调随 EC30 |
| 2026-10-03 | 循环A | 第二十五波走查 | 未用字段即修；动作 label 全走 i18n 现有键；重复注册守卫（disposers 非空即返回）复核 |
| 2026-10-03 | 循环B | ③信源=兄弟仓源码（第三轮） | 契约摘录→落地代码的完整闭环首次达成（EC16：摘录 §3 → index.ts 实现）；EC13/17 同路径可复制 |
| 2026-10-03 | 主线 | 第二十七轮：EC17 落地（家庭摘要模块进雷切） | lvhome.summary 只读模块——read 返回 normalizeSnapshot v2.1 形态（stat 英雄区逾期+今日计数/items 两行 command 深链/sourceHealth fresh-stale/emptyHint）；**只共享计数不共享标题日期生日金额**（EC17 边界）；错误降级空态快照；同 EC16 探测/重试模式；卸载注销；单测 121 持平、gzip 49.2KB |
| 2026-10-03 | 循环A | 第二十七波走查 | 快照构建 try-catch 全包（雷切约定错误不抛）；计数口径与提醒中枢一致（scan.reminders 派生）；无新增 i18n |
| 2026-10-03 | 循环B | ③信源=兄弟仓源码（第四轮） | EC17 完成「身份→契约→read 载荷→落地」全链路；EC 生态三角（EC16/EC13/EC17）全部落地 |
| 2026-10-03 | 主线 | 第二十六轮：EC13 v1 落地（人脉联系人选人） | 四 schema（contracts/insurance/schooling/exams）增 contact 文本列（D08 补列续跑自动迁移+快照 -u）；详情抽屉「从人脉选择」——window.LvContacts.searchPeople 实时搜索（旧请求丢弃 PF07）、快照存 `名称 [docId]`、未装/未初始化/失败三态降级；D08 补列续跑首次实战（既有台账自动获新列）；单测 121 持平、i18n 603→608、gzip 48.8KB |
| 2026-10-03 | 循环A | 第二十六波走查 | 快照 diff 仅 contact 列；搜索竞态守卫（seq 计数）；快照格式在抽屉/思源原生 UI 双侧可读 |
| 2026-10-03 | 循环B | ③信源=兄弟仓源码（第四轮） | EC13 完成「身份→契约→落地」全链路（第二十三轮摘录 §1 → 本轮实现）；EC17 同路径待复制 |
| 2026-10-03 | 主线 | 第二十九轮：EC14 落地 + 考试线源码挖掘 | openContactPicker 抽取共享（ledger 复用零行为差）；FamilyMember.contactSnapshot + 成员卡关联/解除（EC14 ✅）；考试线源码挖掘——lv-exam:stats PublicStats v1 载荷全量（attempts/accuracy/eliminated/activeWrong/streak/hours 24/daily 56 天，脱敏无题目内容）+ lv-exam:open-question{qid} + 闪卡 ExamPlan 形状确认；摘录 §6 新增；单测 126 持平、i18n 612 键、gzip 49.8KB |
| 2026-10-03 | 循环A | 第二十九波走查 | 重复 import 即修；成员卡按钮 stopPropagation 防误触展开；快照列省略号+title 全文 |
| 2026-10-03 | 循环B | ③信源=兄弟仓源码（第五轮） | EC20 契约候选记录（exams.expiry ↔ ExamPlan.examDate）；EC23 绑定 id 需闪卡方暴露——不抢跑 |
| 2026-10-03 | 主线 | 第三十轮：EC21 v1 落地（lv-exam:stats 消费） | window CustomEvent 监听（非 eventBus）——校验后缓存 latest-only 子集进 runtime；考试模块卡备考行（连续天数+正确率+更新日期 tooltip）；卸载移除监听；摘录 §6 收敛（广播时机/无消费方现状/AttemptEvent 边界/ExamPlan 契约候选）；单测 126 持平、i18n 612→614、gzip 50.1KB |
| 2026-10-03 | 循环A | 第三十波走查 | 载荷校验（非数字整体拒绝）；runtime 子集 latest-only 防无界增长；监听器卸载移除 |
| 2026-10-03 | 循环B | ③信源=兄弟仓源码（第六轮） | 考试线研究收敛（EC21 v1 落地；EC20 待闪卡暴露）；EC26-28 维持供方依赖 |
| 2026-10-03 | 主线 | 第三十一轮：EC15 落地 + LvHome 服务桥 + BRIDGE.md | 人情抽屉「记录到人脉」（ensurePerson + recordInteraction externalRef 幂等 + favorSyncs 留痕）；window.LvHome 服务桥 v1（protocol 1/capabilities 五项/summary 仅计数/addMemo 校验）+ docs/BRIDGE.md 契约文档；v0.3 生态 RPC window 版先行；单测 126 持平、i18n 622 键、gzip 50.6KB |
| 2026-10-03 | 循环A | 第三十一波走查 | ensurePerson 返回类型修正（补 name 字段）；模板字符串转义修正（金额拼接）；favorSyncs 类型入 HubRuntime |
| 2026-10-03 | 循环B | ③信源=兄弟仓源码（第七轮） | EC15 完成「身份→契约→落地」全链路（第二十三轮摘录 §1 recordInteraction → 本轮实现）；EC 生态落地计数增至七项 |
| 2026-10-03 | 主线 | 第三十二轮：C7c 收口 + 打印样式 | 向导建库 loading/error 内联展示（按钮禁用+文字切换+失败 inline）；@media print 全局规则（隐藏交互/白底/防跨页）；单测 126 持平、i18n 623 键、gzip 50.9KB |
| 2026-10-03 | 循环A | 第三十二波走查 | 新增样式均用 b3/lv token；新 i18n 键即补 |
| 2026-10-03 | 循环B | ③轮休 | 兜底循环转入静默待命——代码线可自主项确认全部收尾 |
| 2026-10-03 | 主线 | 第三十三轮：月度完成计数 + 29 组部分收口 | complete() 递增 monthlyCompletions[YYYY-MM]；restore 不递减（恢复≠取消完成事实）；总览 hero 条件展示；单测 126 持平、i18n 624 键、gzip 51.1KB |
| 2026-10-03 | 循环A | 第三十三波走查 | 模板字面量转义即修（月键拼接）；月度完成率 % 口径待 PF01（缺 denominator）——不虚假标注 |
| 2026-10-03 | 循环B | ③轮休（延续） | 兜底循环静默待命（延续上一轮状态） |
| 2026-10-03 | 主线 | 第三十四轮：Svelte 5 错误边界 + 性能标记 | ErrorBoundary.svelte（svelte:boundary 四屏包裹+重试按钮）；refreshHub performance.mark/measure（PF01 打点基线）；safeMount.ts 备用；单测 126 持平、gzip 51.3KB |
| 2026-10-03 | 循环A | 第三十四波走查 | boundary 仅捕获渲染期错误（Svelte 5 设计）；事件处理器异常不在此范围 |
| 2026-10-03 | 循环B | ③轮休 | 兜底循环静默待命 |
| 2026-10-03 | 主线 | 第三十五轮：favorSyncs 孤儿数据修复 | 行删除时同步清理 favorSyncs（与第 30 轮 renewHistory 同模式—— EC15 新代码引入时 renewHistory 修了但 favorSyncs 遗漏，自查发现）；单测 126 持平、gzip 51.3KB |
| 2026-10-03 | 循环A | 第三十五波走查 | favorSyncs/renewHistory/dirty 标志合并为单次 saveRuntime（避免双重写盘） |
| 2026-10-03 | 循环B | ③轮休（延续） | 兜底循环静默待命（延续） |
| 2026-10-03 | 主线 | 第三十七轮：onboarding skip 错误处理修复 | skip() 无 try/catch——kernel 不可达时 finishOnboarding 的 Promise rejection 被静默吞掉（真实 bug）；修复后弹 error toast；单测 126 持平、gzip 51.5KB |
| 2026-10-03 | 循环A | 第三十七波走查 | showError 复用 provisionIssues 键 |
| 2026-10-03 | 循环B | ③轮休（延续） | 兜底循环静默待命（延续） |
| 2026-10-03 | 主线 | 第三十八轮：成员保存/删除/台账重建错误处理 | doSave/confirmRemove/rebuildLedger 三条异步链路补 try/catch——内核不可达等异常不再静默吞掉；单测 126 持平、gzip 51.5KB |
| 2026-10-03 | 循环A | 第三十八波走查 | 未处理 Promise rejection 全扫——panels 层已清零（剩余在 core 层由调用方 catch） |
| 2026-10-03 | 循环B | ③轮休（延续） | 兜底循环静默待命（延续） |
| 2026-10-03 | 主线 | 第四十轮：0 组元数据修正（plugin.json/package.json/LICENSE） | author/url 从模板占位 lvdaoguan → ai68298100；LICENSE 追加二次开发版权；0 组两项 ✅；R05 根因=模板占位符未替换——check-meta 应加 url 一致性校验（记 TODO） |
| 2026-10-03 | 循环A | 第四十波走查 | 全门禁绿；plugin.json JSON 语法确认 |
| 2026-10-03 | 循环B | ③轮休（延续） | 兜底循环静默待命（延续） |
| 2026-10-03 | 主线 | 第四十一轮：check-meta 增加 author/url 校验 + i18n 未用键审计 | check-meta 新增 4 条规则（author 占位符/url 含 lvdaoguan/pkg-plugin 不一致/非 GitHub URL）——R05 根因闭合；i18n 未用键扫描——287 个"未用"绝大多数为动态模板构造（t(`module.${id}`) 等）非真未用；单测 126 持平、gzip 51.5KB |
| 2026-10-03 | 循环A | 第四十一波走查 | check-meta 新规则通过现有合法数据；i18n 扫描器局限记录（动态构造误报——不删键） |
| 2026-10-03 | 循环B | ③轮休（延续） | 兜底循环静默待命（延续） |
| 2026-10-03 | 主线 | 第四十四轮：pnpm audit 纳入 check 链（19 组 ✅） | check:audit script（--prod --audit-level moderate）；当前 0 known vulnerabilities；单测 126 持平、gzip 51.7KB |
| 2026-10-03 | 循环A | 第四十四波走查 | 新增脚本通过；audit 结果 0 漏洞确认 |
| 2026-10-03 | 循环B | ③轮休（延续） | 兜底循环静默待命（延续） |
| 2026-10-03 | 主线 | 第四十六轮：29 组通知一键静音 ✅ | runtime.todaySilent 字段（今日 localDateKey）；inSilentHours 优先检查 todaySilent；摘要/逾期/每周预告三处共用；跨天自动失效（新一天 todaySilent 不匹配） |
| 2026-10-03 | 循环A | 第四十六波走查 | inSilentHours 签名变更（加 rt 参数）→ 测试调用同步更新 |
| 2026-10-03 | 循环B | ③轮休（延续） | 兜底循环静默待命（延续） |
| 2026-10-03 | 主线 | 第三十六轮：代码卫生 + EC18/19 确认 | 死代码 safe-mount.ts 移除（ErrorBoundary 取代）；monthlyCompletions 24 个月保留期入 purgeHandled；LeiQie 无 bookmarks/snippets 消费 API（EC18/19 供方依赖确认）；单测 126 持平、gzip 51.4KB |
| 2026-10-03 | 循环A | 第三十六波走查 | 死代码移除零引用验证；purgeHandled 月度清理边界（24 个月 cutoffKey）逻辑复核 |
| 2026-10-03 | 循环B | ③信源=兄弟仓源码（第六轮） | LeiQie 无 getBookmarks/getSnippets 对外暴露——EC18/19 维持供方依赖注记 |
| 2026-10-03 | 主线 | 第二十八轮：EC03/v0.3 服务桥 window.LvHome 落地 | src/bridge/external-bridge.ts（protocol 1/capabilities 五项/whenReady/openButler/openReminders/addMemo 校验/summary 仅计数）+ docs/BRIDGE.md 契约文档（对齐人脉 BRIDGE 纪律：只提供服务不读他库/挂载卸载语义/版本策略）；重复挂载守卫；5 项单测；单测 121→126、i18n 608 持平、gzip 49.5KB |
| 2026-10-03 | 循环A | 第二十八波走查 | 未用参数即修；summary 计数断言修正（today=daysLeft≤0 含逾期，测试初值写错）；重复挂载守卫（多实例不覆盖首桥） |
| 2026-10-03 | 循环B | ③信源=兄弟仓 BRIDGE 模式（人脉 external-bridge 直读） | 管家桥的挂载/卸载/纪律三段对人脉同构复刻；EC 组「摘录→落地」第二例（EC16→EC13→EC03） |
| 2026-10-03 | 循环A | 契约摘录复核 | 全部签名来自源码直读非文档转述；未初始化抛错/卸载注销/重复注册保护三处运行时语义已登记；EC12 owner 定案点未越界 |
| 2026-10-03 | 循环B | ①研究产出即待办资产 ③信源=兄弟仓库源码（零网络） | 摘录 §4 登记 3 项待下轮深读；EC10 触发源修正（checkin:* 优于 ws-main）反向注记本轮 ws-main 实现为兜底 |
| 2026-10-03 | 循环A | 兜底循环深化：全仓九项终审 | ①调试残留 0/TODO 注释仅 1 处文档性引用；②面板 any 存量 43 处（32 组追踪中，本轮零新增）；③120 测试覆盖新逻辑；④新 UI 全走 b3/lv token；⑤43 个 md 相对链接零失效（README 新增链接即修 1 处路径）；⑥i18n 600 键对齐；⑦新交互 aria/键盘齐备；⑧gzip 46.8KB<100KB；⑨日志脱敏复核（批量失败 warn 仅记错误不记标题）；README 能力表与 CHANGELOG Unreleased 对齐十七轮真实能力（R06 事实边界：待实测项明确标注） |
| 2026-10-03 | 循环B | 终审收尾 | ⑨项中唯一开放项=②any 存量（随 C 阶段细化逐屏类型化，已有追踪项）；全仓终审闭环，兜底循环转入静默等待（触发条件=真机回归/新模块/外部反馈） |
| 2026-10-03 | 主线 | 第十九轮：32 组 props any 清零（终审开放项②收口） | 新建 src/types/plugin.ts 共享 HomePluginLike 契约（结构性类型，插件类天然满足）；tab-panel 删除本地窄接口，六屏 plugin prop 全部类型化；提醒/成员 lambda 类型化（Reminder/FamilyMember）；面板 ": any" 43→13（剩余全部为台账行 cells 的内核 JSON 边界，归 21 组 SQL 结果类型化）；单测 120 持平、i18n 591→595、gzip 46.8KB |
| 2026-10-03 | 循环A | 终审②收口复核 | 终审九项至此全部闭环（②由 43→13 且契约面清零，剩余归 21 组）；本轮类型化零行为变更（check/test/build/smoke 全绿） |

> 标记：🔴 优先修复/当前验收门槛 · 🟡 后续迭代 · 🟢 远期/可选 · ⛔ 被阻塞（注明实际条件）· ⏸ 暂缓（集市上架，触发条件另定）
> **发布策略（2026-10-01 定）**：开发到一定程度后公开 GitHub 仓库与 Release；**集市上架整体暂缓**（见第 26 组）。
> **最新核对（2026-10-03，main `9a7177f` 后）**：公开仓库与 v0.2.0 正式 Release 已存在；31 个 schema 已落地。**主线开发已恢复十三轮，可自主开发项已收尾（余项均需真机/内核条件）**：⑤–⑪ 见下方分轮明细（C4b 详情抽屉/C5a/C3a/C8d/C6b/H12/19组安全；C6c/28组；24组导出导入；H14/29组/示例数据/台账搜索；H03删除/17组行删除；QA 工程；D11 收尾/PF13/A2c）；⑫ **发现并修复 provider 手工清单漂移**（parenting/schooling 提醒从未生效）——provider 与建库计划改为 schemaCatalog 程序化派生 + 覆盖契约测试，ensureCoreLedgers 第二份手工清单删除。⑬ PF06 增量刷新（写行只重扫本模块）+ 17 组批量操作。单测 33→113 全过、i18n 585 键对齐、gzip 45.6KB；**真机回归清单（docs/testing/v0.2.md §7）已就绪未执行**。详见 [状态与调研报告](docs/research/2026-10-02-开发状态与待办调研.md)。
> **本轮仅规划**：首轮第 35 组新增 60 项；多角度调研第 36–42 组新增 160 项；第二轮产品调研第 43–46 组新增 181 项，见 [第二轮报告](docs/research/2026-10-02-第二轮产品调研与待办延伸.md)；继续延伸第 47–50 组新增 112 项，见 [生活阶段/服务治理/跨地区报告](docs/research/2026-10-02-生活阶段服务治理与跨地区产品调研.md)。均未实施开发。第 34 组自动回主线规则不覆盖用户“先扩充、不开发”的指令；后续收到开发指令后再执行。
> **定位与宽深扩展**：第 51–54 组新增 95 项，见 [定位、作用与宽深研究](docs/research/2026-10-02-定位作用与宽深扩展研究.md)。研究个人/家庭受益、权益/凭证/资源、原生知识依据与办理闭环，保持原产品定案与只规划边界。
> **AI 贯穿规划**：第 55–58 组新增 99 项，见 [AI 融入与思源智能体调研](docs/research/2026-10-02-AI融入与思源智能体调研.md)、[AI 总体设计](docs/design/10-AI融入与思源智能体.md)和[提示词模板设计稿](docs/design/11-内置AI提示词模板.md)。覆盖思源 Agent 接入、全局 AI 治理、31 模块提示词和 AI 产品运营；本轮仅研究与设计，不开发。
> **工作台质感与系统治理**：第 61 组新增 24 项，覆盖宿主容器、图层/焦点、触控、数据真实性、状态视觉、动效、移动端与原型证据；第 62 组新增 12 项，覆盖升级回滚、无遥测诊断、共享威胁、数据质量、检索、自动化边界、能耗、模块版本、教育、开源治理、互操作和责任边界。两组均只规划，详见 [原型质感与实现差距](docs/design/13-原型质感与实现差距.md)。
> **v4 场景原型验收**：模块草稿、详情身份、组合筛选、提醒状态与 AT05 合成解释已做浏览器验证，见 [场景原型与 AI 协作验证](docs/design/14-场景原型与AI协作验证.md)。提醒处理历史、设置保存/回滚、完整首次价值与全局演示重置继续归入 H/OP19/F01/F02/PP19/PL24；原型通过不勾选生产待办，本轮不重复增加 checkbox。
> 阶段定义见 `docs/design/06-v0.2开发任务拆解.md`；版本路线见 `MODULES.md §6`。
> 完成一项勾一项；每个版本的验收线见对应小节的"出口条件"。
> 原版本节次保留作历史设计分组，不代表这些能力已按版本交付；第 35–62 组含验收分解与业务候选，引用旧大项的工作只安排一次。新增数量不等于独立工作量或版本承诺。具体主责、合并和路线以[待办归并与路线重排调研](docs/research/2026-10-02-待办归并与路线重排调研.md)为准；旧编号保留用于追踪，不代表每个编号都要独立实现。
> **归并规则**：产品语义以 PM/PV/UX 为上游；数据与确定性规则以 S/D/H/V 为主项；流程以 F/AF、交互以 UI/PF、领域以 MD/HP/BD/LS/NV、AI 以 SA/AX/MA/AI、生态与运营以 EC/DL/NX/OP/Q/R/CM 为主项。旧组、场景组和模块组只补差异、案例或验收，不重复实现同一契约。

---

## 0. 工程基建

- [x] 🔴 `git init` 并建立首个提交（当前项目无版本控制） ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [x] 🟡 创建 GitHub 公开仓库 `ai68298100/siyuan-home`（main 分支） ✅ 2026-10-02 只读核对已存在；不据此推定原公开触发条件全部验收通过
- [x] 🟡 推送骨架 + 设计文档（README/MODULES/docs/design/prototype） ✅ 2026-10-02 核对远程 main 与本地 HEAD 均为 `10eccfe`
- [x] 🟡 配置 GitHub Actions：.github/workflows/ci.yml（check 五重门禁+test+build+smoke+gzip 包体门禁+产物上传）
- [ ] 🟢 分支保护：main 禁直推
- [x] 🟢 `plugin.json` 的 `author`/`url` 从占位 lvdaoguan 改为 ai68298100 ✅ 2026-10-03 第四十轮（plugin.json + package.json author 修正；plugin.json url 从 github.com/lvdaoguan → github.com/ai68298100——集市仓库链接修正）
- [ ] 🔴 替换 `icon.png`（160×160，≤64KiB，禁止 SVG）
- [ ] 🟡 制作 `preview.png`（1024×768，≤512KiB，集市展示图）——生成路径确认：内置图像工具本环境不可用，待图像工具可用时生成（约定见 asset/README.md）
- [ ] 🟡 核对 `disabledInPublish` 的发布服务运行/隐私边界；是否解除禁用单独决定，与集市上架解耦（保持现配置，本轮只登记，见 R05/R06）
- [x] 🟢 LICENSE 确认（MIT，作者名更新） ✅ 2026-10-03 第四十轮（原始 SiYuan 模板版权保留 + 追加 ai68298100 Lv Home 二次开发声明）

## 1. Spike 阶段（S0–S5 已完成；余项按实际实验条件安排）

- [x] 🔴 S0 用户启动思源（内核 `127.0.0.1:1568`），`sy nb` 确认可达 ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [x] 🔴 S1 台账视图嵌入三选一实验：protyle 内嵌 av / API 渲染 / 文档跳转（`docs/testing/spike-R1R2.md` 实验一） ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [x] 🔴 S1a 结论回填：`src/core/siyuan.ts#createAttributeView` 实现 + 01 ADR-4 定案 ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [x] 🔴 S2 关系列实验：relation 列可否编程创建并指向 members 库（实验二） ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [x] 🔴 S2a 结论回填：可 → 字典列 member=relation；不可 → 降级文本列 + SQL 聚合，更新 02 §2 ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [x] 🟡 S3 行定位实验：openTab 定位高亮台账行（R5），结论回填 03 §5 ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [x] 🟡 S4 实验数据清理：临时笔记本 `siyuan-home-spike` 经确认后删除 ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [x] 🟡 S5 av kramdown 形态观察（手建 av 后查 blocks.markdown，为建库提供参照） ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [ ] ⛔ 🟡 S6 前端调度实测：休眠/唤醒、后台/锁屏、跨天及重复扫描行为记录（R3）；kernel 无计时器的方案已定案，不再等待不存在的 cron API。依赖真实前端与设备，见 H11/H13
- [ ] ⛔ 🟡 S7 双端冲突实验：两设备同时编辑同一行，验证提醒写回幂等、冲突提示和恢复路径（R6）；依赖两台设备/可访问同一工作空间及测试数据
- [ ] 🟡 S8 农历库专项：tree-shake 体积、闰月/腊月三十精度与版本升级回归（R4）

## 2. v0.2 · 数据层（阶段 A）

- [x] 🔴 A1a schema.ts：members 成员库 schema 落地（02 §3：角色/生日/农历/尺码/忌口/状态） ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [ ] 🔴 A1b 字段字典 i18n 键补全核对（field.* 已有 certs 部分，补 members 专属列）
- [x] 🔴 A2a siyuan.ts：av 创建端点实现（等 S1） ✅ 2026-10-01 Spike 定案（docs/testing/spike-R1R2.md 结论区）
- [ ] 🔴 A2b siyuan.ts：av 行 CRUD 封装（新增行/更新行值/删除行/按视图查询）
- [x] 🔴 A2c siyuan.ts：附件关联（asset 列写入文件引用） ✅ 2026-10-03 第十一轮（uploadAsset 封装（multipart/可注入传输）+ 详情抽屉附件段：列出现有文件、多文件上传追加 mAsset、逐文件失败报告；端点与 succMap 形态 [待实测]，回归清单 7.2 有验收项）
- [ ] 🔴 A2d siyuan.ts：错误类型统一（KernelError）+ 单元可注入 mock——已有 KernelError/setTransport；网络异常与真实响应契约仍需验收，见 D01/D02/T01
- [ ] 🔴 A3a provisioner：幂等建库全流程打通（依赖 A2a）
- [ ] 🔴 A3b provisioner：ensureColumns 版本升级补列（不删不改旧列）
- [ ] 🔴 A3c provisioner：默认视图创建（certs 的 by_member / expiring）
- [ ] 🔴 A3d provisioner：dbRefs 失效自愈（文档被删→重建→登记刷新）
- [x] 🔴 A4 members 数据访问层：已有新增行/引用删除基础；2026-10-02 复核编辑 AV 写入仍占位，设置页也绕过 DAL。完整双写、清空字段、失败修复与稳定关联见 D04–D06 ✅ 2026-10-02 第二轮（成员 DAL 统一：设置页保存走 syncMembersToAv 差异同步、成员页编辑走 updateMember；按 avItemId 精确写回含改名与清空生日；失败记 syncError 可见可重试；单测覆盖）
- [ ] 🔴 A5 certs 数据访问层（`src/modules/certs/`）：行 CRUD / 续期写回 / 按到期范围查询 / 脱敏读取（2026-10-03 第二十二轮进度：**行更新（U）的 UI 层落地**——详情抽屉编辑模式，text/number/date/select/url/checkbox 六类变更仅写变更字段、空值=清空字段、逐字段失败报告；R（续期/删除）已有；按到期范围查询被 D01 全量读+派生替代，脱敏读取随导出脱敏设计）
- [ ] 🟡 A6 设置页诊断：已有 dbRefs/扫描/契约显示；实际文档/AV/列健康检查尚未完成，不能用登记列数表示健康，见 D12

## 3. v0.2 · 提醒中枢（阶段 B）

- [x] 🔴 B0 vitest 接入（devDependencies + `pnpm test` script） ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [x] 🔴 B1a 规则引擎单测：oneoff 边界（今天到期/昨天/闰年 2-29） ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [x] 🔴 B1b 规则引擎单测：anniversary 农历（腊月廿九、闰月、跨年、当天） ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [x] 🔴 B1c 规则引擎单测：recurring 周期滚动（day/week/month/quarter/year）+ 未声明周期降级 ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [x] 🔴 B1d 规则引擎单测：leadOverrides 覆盖与 later 降噪过滤 ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [x] 🔴 B2a 扫描器：DataProvider 接口 + certs 实现（SQL 到期范围查询） ✅ 2026-10-01（providers/scanner/runtime 三层 + 7 单测；kernel 定时触发 B2d 另行）
- [x] 🔴 B2b 扫描触发基础：Tab 打开 + 前端 30min 心跳 ✅ 2026-10-02；合并扫描、乱序/卸载及唤醒实测见 H11/H13，未实现 kernel 定时扫描
- [x] 🔴 B2c HubState loadData/saveData 基础缓存读写 ✅ 2026-10-01；失败模块快照保留与并发一致性未完成，见 H01/H04
- [x] 🟡 B2d 调度方案定案：kernel（goja）无计时器 API，采用前端心跳与 Tab 触发 ✅ 2026-10-02；不是每日 08:00 内核任务或 hub.updated 广播的实现凭证
- [ ] 🔴 B3a 通知：已有 notifyHour/lastNotifiedDate 摘要基础；静默、失败结果、重复通知与交付能力验收见 H12/H13
- [ ] 🔴 B3b 通知：已有每日首次逾期应用内提示与静默判断；逐项新逾期发现、摘要共用静默及去重合并尚待 H12 验收
- [ ] 🔴 B3c 通知点击 → 打开管家 Tab 提醒页（2026-10-03 注记：应用内 showMessage 无点击回调——点击直达需走系统通知路径（H13 实测后定案）；状态栏角标已提供等效入口（28 组 ✅））
- [ ] 🔴 B4a 动作：完成（oneoff 归档 / recurring 写 last_done 重算 due / anniversary 记当年已办）——运行态侧已按 H05 闭环（2026-10-02：anniversary/recurring/oneoff/adhoc 分派+恢复+单测）；recurring 写台账行 last_done 重算 due 仍属 A5 行编辑 API
- [ ] 🔴 B4b 动作：已有续期 Dialog/expiry 写回；按规则写正确字段、历史 note 和失败保留输入未完成，见 H10（2026-10-02 第二轮进度：按规则字段写回 next_pay/due/expiry 已落地（H10）、失败保留 Dialog 与输入已落地；历史流水已记 runtime.renewHistory，查看 UI 待补）
- [x] 🔴 B4c 动作：已有 1/3/7/30 天菜单与存储函数；内存覆写、备忘延后及到期后分级未完成，见 H01/H06 ✅ 2026-10-02（H01 串行队列消除内存覆写；备忘可延后且 snooze 到期分级见 H06；真机走查待回归）
- [x] 🔴 B4d 动作：已有 mute/unmute 函数；运行态一致性、备忘忽略与 UI 恢复入口未完成，见 H01/H06/H07 ✅ 2026-10-02（H01 运行态一致；备忘忽略=mute 生效；恢复入口=提醒页已处理视图（H07）；真机走查待回归）
- [x] 🔴 B4e 动作：定位（依赖 S3 结论；降级=打开台账文档） ✅ 2026-10-02（R5 降级定案实施：提醒行定位按钮→openTab 台账文档）
- [x] 🔴 B4f 提醒中枢运行态存储 schema（snooze/mute/已办缓存 → loadData） ✅ 2026-10-01（providers/scanner/runtime 三层 + 7 单测；kernel 定时触发 B2d 另行）

## 4. v0.2 · UI（阶段 C，组件契约见 docs/design/08）

- [x] 🔴 C1a Tab 化外壳：`addTab` + 四页签导航（总览/提醒/台账/成员）+ 顶栏入口改造 ✅ 2026-10-02（Tab 化 + 数据接线 commit，见 34 组记录）
- [x] 🔴 C1b 导航胶囊滑动（offsetLeft 计算 + spring） ✅ 2026-10-02（qbtn 跳台账预选；诊断区=dbRefs/扫描/契约；回归脚本 docs/testing/v0.2.md；胶囊 spring）
- [x] 🔴 C1c 删除旧 dashboard.svelte 与无引用 LEGACY 类；现役设置面板改为 lv-settings 命名空间 ✅ 2026-10-02 源码与提交记录核对
- [x] 🔴 C1d 屏幕容器 `.lv-screen/.lv-anim` 接入（入场编排生效） ✅ 2026-10-02（Tab 化 + 数据接线 commit，见 34 组记录）
- [x] 🔴 C2a 总览：页头（问候/日期/计数滚动）+ 成员 chips 行 ✅ 2026-10-02（bundle gzip 132→32KB；成员过滤持久化；三级分组；向导重跑）
- [x] 🔴 C2b 总览：即将到期区（取 HubState 前 4 条 + 空态 + "查看全部"） ✅ 2026-10-02（Tab 化 + 数据接线 commit，见 34 组记录）
- [x] 🔴 C2c 总览：快速记录行（qbtn 按 enabledModules 过滤） ✅ 2026-10-02（qbtn 跳台账预选；诊断区=dbRefs/扫描/契约；回归脚本 docs/testing/v0.2.md；胶囊 spring）
- [ ] 🔴 C2d 总览：已有模块网格/提醒计数/点击预选台账；certs/药箱业务统计卡与真实计数仍需验收
- [x] 🔴 C2e 成员 chips 过滤状态持久化（作用于提醒/模块卡计数） ✅ 2026-10-02（bundle gzip 132→32KB；成员过滤持久化；三级分组；向导重跑）
- [x] 🔴 C3a 提醒中枢页：四组筛选（模块/成员/类型/时间）+ 显示已处理 ✅ 2026-10-03 第五轮（模块/成员/类型/时间四组齐（时间窗=今天/7/30 天含逾期）+ 已处理真实视图；均持久化；真机走查待回归）
- [x] 🔴 C3b 提醒中枢页：逾期/7 天/提前量三级分组基础 ✅ 2026-10-02；已处理真实记录与恢复见 H07
- [x] 🔴 C3c 提醒中枢页：行内动作菜单（完成/续期/延后▾/定位/忽略）接线 B4 ✅ 2026-10-02（B2b=Tab触发+30min心跳；B2d 定案 kernel 无定时器 API 走前端心跳；B4 续期=思源 Dialog/延后=Menu 1/3/7/30）
- [x] 🔴 C3d 筛选条件持久化 ✅ 2026-10-02（runtime.hubFilter）
- [x] 🔴 C4a 台账页基础外壳：模块切换下拉 + 在文档中打开 ✅ 2026-10-02；原生嵌入/视图增强与前端适配另见 D10/P11/R08
- [x] 🔴 C4b 台账行点击 → 详情抽屉（kv/附件/相关）；独立行 itemID 不冒充可引用块 ID，真实绑定块能力需 P12 实测 ✅ 2026-10-03 第五轮（行点击/Enter 打开全列 kv 详情（schema 驱动、DOM 构建用户内容防注入）+ 在台账文档打开；用户自建列展示与附件预览留待办；块深链维持 P12 实测边界）
- [ ] 🔴 C4c 台账"新建"：capture 列集快速表单（抽屉内或弹层）
- [x] 🔴 C5a 成员页：成员卡网格（统计三格 + alert 行 + 农历标记） ✅ 2026-10-03 第五轮（统计=待办按模块 top-3 chips（来自扫描，不做全库聚合）+ alert 行 + 🌙 农历标记；完整跨模块时间线仍属 C5b/H08）
- [ ] 🔴 C5b 成员页：已有该成员提醒展开明细；完整 certs+提醒时间线与生日归属尚未完成，见 H08/H16
- [ ] 🔴 C5c 成员编辑对话框（增删改/角色/生日/农历）
- [ ] 🔴 C5d 长期进度条接入（疫苗程序占位，数据 v0.5 接通）
- [ ] 🔴 C6a 快速录入：已有台账页名称/分类/成员/到期日/金额/URL/备注固定字段；未真正消费 schema.capture，也未形成完整弹层。字段类型、顺序、显隐与专属字段见 D09/D11
- [x] 🔴 C6b 快速录入保存链路（写台账行 + toast + "保存并查看"） ✅ 2026-10-03 第五轮（保存成功回执条（模块去向 + 在台账文档查看入口，8 秒自动消失）；失败路径见 D03）
- [x] 🔴 C6c 块菜单入口：选中文字 → 存为常用语/网址/地址（预填） ✅ 2026-10-03 第六轮（块菜单"存入小驴管家"：URL 形态→bookmarks.url、文本→snippets.content（name 截 40 字符）；未启用模块给引导；地址分流待办见 33.4 新项）
- [ ] 🔴 C6d 斜杠命令 `/lv`（快速记录/打开台账）（2026-10-03 ⛔ 注记：思源未向插件开放斜杠菜单注册 API；替代入口已齐——顶栏/命令面板/状态栏/块菜单；待官方能力后重开）
- [x] 🔴 C6e 命令面板：打开管家面板 / 快速记录（快捷键可配置） ✅ 2026-10-02 已有两条 addCommand；快速记录目前跳台账表单，完整表单范围见 C6a
- [x] 🔴 C7a 首次引导向导：三步（家庭构成→推荐模块→建库确认） ✅ 2026-10-02（Tab 化 + 数据接线 commit，见 34 组记录）
> 复核注：C7a 的“三步”是设计/历史记录；生产 `onboarding.svelte` 当前实际渲染 STEP 1/2，推荐模块与完成动作合并，建库进度/局部失败/取消/重试仍由 C7c 与 PX02–PX05 负责。
- [x] 🔴 C7b 引导按 suggestRoles 预选逻辑（子女→育儿/上学/零花钱） ✅ 2026-10-02（Tab 化 + 数据接线 commit，见 34 组记录）
- [x] 🔴 C7c 引导建库批处理（provisioner 逐模块）+ 完成空态引导 ✅ 2026-10-03 第三十二轮（finishOnboarding 内联 loading/error——向导按钮在建库期间禁用+文字切换、失败时 inline 显示 provisionError；起止 toast + provisionIssues 汇总此前已落；交互级重试/进度条仍随 F07）
- [x] 🔴 C7d 引导可跳过、设置页可重跑 ✅ 2026-10-02（bundle gzip 132→32KB；成员过滤持久化；三级分组；向导重跑）
- [x] 🔴 C8a 设置五分区：模块/成员/提醒/生态/关于 ✅ 2026-10-03 第五轮（生态分区以 C8d 占位开关落地，五分区齐）
- [x] 🔴 C8b 模块开关接线（启用→provisioner 建库；禁用→隐藏保留数据 + 确认框） ✅ 2026-10-02 第四轮（保存时检测模块集合变化 → ensureCoreLedgers 立即建库；禁用弹确认框说明数据保留语义；真机走查待回归）
- [x] 🔴 C8c 提醒分区：leadOverrides 编辑（按 moduleId.ruleKey）+ 摘要时段 + 静默时段 ✅ 2026-10-02 第四轮（设置·提醒分区：摘要时刻/静默时段（0-23 clamp）/全规则提前量编辑（留空=默认，非法值忽略，clamp 3650）；rule.* 枚举 i18n 17 条双语；按启用模块过滤行见 33.4 新待办）
- [x] 🟡 C8d 生态分区占位（开关 UI，v0.3 接线） ✅ 2026-10-03 第五轮（关于区六插件占位开关（打卡/人脉/拾遗/考试/闪卡/雷切）标注规划中，v0.3 按 EC03–EC05 接线）
- [x] 🔴 C8e 关于分区：版本/仓库链接/诊断入口 ✅ 2026-10-02 第四轮（版本与诊断区原有，补 GitHub 仓库链接按钮）
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

- [x] 🟡 medicine：schema/建库计划/效期 provider 已存在；低库存数值规则未实现，双规则闭环见 H15 ✅ 2026-10-02 第三轮（H15 落地：NumericRuleProvider 低库存规则与效期规则独立并存，单测覆盖）
- [x] 🟡 memberships schema（计费周期/试用期/自动续费/储值余额） ✅ 2026-10-02（SchemaLedgerProvider 通用派生，schema 驱动建库+提醒；低库存双规则留 v0.3 后段）
- [x] 🟡 insurance schema（缴费日+保障到期双提醒） ✅ 2026-10-02（SchemaLedgerProvider 通用派生，schema 驱动建库+提醒；低库存双规则留 v0.3 后段）
- [ ] 🟡 提醒中枢规则清单 UI 完善（按模块列出 rules）
- [ ] 🟡 生态 RPC server 首批：home.capabilities / getSnippets / getBookmarks（2026-10-03 第二十八轮进度：**window 版先行落地**——`window.LvHome` 服务桥 v1（protocol 1，capabilities=[whenReady,openButler,openReminders,addMemo,summary]，summary 只含计数），模式对齐人脉 window.LvContacts；契约文档 docs/BRIDGE.md；5 项单测。getSnippets/getBookmarks 数据读取待 snippets/bookmarks 面板成型；kernel 私有路由版随实例验证）
- [ ] 🟡 生态开关接线（设置·生态 → rpc 权限）
- [x] 🟡 多端同步信号：台账变更 broadcast → 他端"刷新"角标 ✅ 2026-10-03 第二十一轮（ws-main websocket 消息 → 60 秒节流补扫——变更直接进提醒与计数，未做角标形态；事件名/频度 [待实测]；两设备冲突实测仍属 S7）
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

- [ ] 🔴 parenting：schema 与免疫程序种子已写入，但未核验、未接线；2026-10-02 发现月龄差错与政策过时，须按 2026 官方程序校核，见 V01–V05，暂不作为可用排期能力
- [ ] 🟡 schooling schema（学段推算当前年级/升学节点/学费/课外班课时）
- [x] 🟡 exams schema（证书效期/复审周期/考试节点） ✅ 2026-10-02（schema+枚举 i18n+通用提醒派生；UI 细化随模块启用迭代）
- [x] 🟡 allowance schema（压岁钱/零花钱多账户/发放周期） ✅ 2026-10-02（schema+枚举 i18n+通用提醒派生；UI 细化随模块启用迭代）
- [ ] 🟡 疫苗排期视图（应种/已种/逾期）
- [ ] 🟡 打卡联动：recordValue RPC（身高体重落成长记录）
- [ ] 🟡 升学节点倒计时进提醒中枢

## 9. v0.6 生活包（🟡）

- [x] 🟡 favors schema（收送双向/事件类型/按人净额视图） ✅ 2026-10-02（schema+枚举 i18n+通用提醒派生；UI 细化随模块启用迭代）
- [ ] 🟡 stock：schema/效期规则已存在；低库存阈值执行与解除已落地（2026-10-02 第三轮 H15：≤ 触发/0 算有值/缺值不评估/补货扫描自动解除，单测覆盖）；补货去重待 P03 采购清单
- [ ] 🟡 food schema（菜谱/忌口联动/餐厅）
- [ ] 🟡 address / bookmarks / snippets schema（轻台账三件）
- [x] 🟡 chores schema（周期任务 → 提醒中枢 recurring） ✅ 2026-10-02（schema+枚举 i18n+通用提醒派生；UI 细化随模块启用迭代）
- [x] 🟡 house schema（维护周期/缴费日/农历纪念日/忌日） ✅ 2026-10-02（schema+枚举 i18n+通用提醒派生；UI 细化随模块启用迭代）
- [ ] 🟡 应急物资清单模板文档（应急管理部基础版）+ 半年巡检提醒
- [ ] 🟡 小驴雷切（原规划称“快切”）注入：网址/常用语消费端联调；真实入口和承载范围按 EC16–EC19 定案

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
- [ ] 🟢 行前清单证件自查（引用 certs 库；按目的地/行程的官方要求人工核对护照余期、签证、儿童证件，保存来源与核对日）
- [ ] 🟢 行李清单模板库（城市游/海岛/露营/自驾/研学）

## 12. v1.0 GitHub 正式发布（公开仓库的 1.0 版本）

- [ ] 🟡 公开发布条件自检：🔴 项全部完成、回归脚本全绿、内测反馈（31 组）处理完毕
- [ ] 🟡 生态联动打磨：六插件互测（雷切/打卡/人脉/拾遗/考试/闪卡），分场景与协议验收见 EC01–EC30
- [ ] 🟡 多设备同步冲突测试（两台设备实跑同一工作区）
- [ ] 🟡 31 模块全开性能回归（05 §4.5 预算复核）
- [ ] 🟡 隐私终审：脱敏显示/无密码确认/导出脱敏提示/通知脱敏
- [ ] 🟡 `v1.0.0` tag + GitHub Release（附 package.zip；siyuan-plugin-release skill 调整为只发 Release 不推集市）
- [x] 🟡 README 双语终稿（CI/Release/LICENSE 徽章 + 安装节 + ROADMAP/FAQ/privacy 链接） ✅ 2026-10-02（截图/GIF 待真机）
- [ ] 🟡 migration notes 汇总（0.x → 1.0 用户升级说明；v0.2.0 notes 已在 CHANGELOG 草稿）
- [ ] 🟢 公告帖：ld246 / 少数派（是否随 1.0 公开同步发布，另定）
- [ ] 🟢 1.0 后维护节奏：每两周 issue 清扫 + 月度小版本
- [x] 🟢 ROADMAP.md（从 TODO.md 提炼用户视角的路线图） ✅ 2026-10-02（现已可用/进行中/近期/远期四段；README 可链接）

## 13. 生态与远期（🟢）

- [ ] 🟢 人脉联动：home.linkContact（成员↔联系人双向引用 + 缺失降级快照）
- [ ] 🟢 拾遗联动：home.archiveRef（剪藏归档为台账行附件/关联文档）
- [ ] 🟢 打卡联动：家务/备考台账任务一键转打卡习惯
- [ ] 🟢 模板包导入导出（schema+模板+视图 JSON 打包，"新生儿包/露营包"）
- [x] 🟢 CSV/JSON 导出一键入口（脱敏提示，05 §4） ✅ 2026-10-03 第二十一轮（台账页 CSV 导出：schema 全列、BOM 兼容 Excel、遵循当前排序与搜索过滤、本地生成不外传；设置 JSON 导出此前已落地；跨产品格式互换（DL30）仍属研究）
- [ ] 🟢 条码/QR 扫码录入（2026-10-03 第八轮新增，grocy 印证）：stock/shopping 录入支持相机扫码（ZXing 离线）或扫码枪输入流；验收：离线可用、https/桌面端可行性先验证、外部条码查询默认关闭（触克制边界清单）
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
- [x] 🔴 settings.json 损坏容错：解析失败 → 备份坏文件 + 回退默认值 + 警告 toast ✅ 2026-10-03 第十四轮（loadDataSafe：抛错/非对象 → 回退默认 + onload 警告 toast；诚实边界：API 无法安全回读原始坏文件，备份为 .corrupted.json 标记（时间/原因），原文件留给思源备份处理；runtime 同样接入；单测两条路径）
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
- [x] 🟡 系统休眠错过定时扫描 → 唤醒/开面板补扫 ✅ 2026-10-03 第十一轮（visibilitychange 恢复可见即补扫，10 分钟最小间隔合并重复触发（PF13 语义），卸载解绑；Tab 打开触发与 30min 心跳原有；真机休眠/唤醒走查见回归清单 7.5）
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
- [ ] 🟡 house：保修期联动 contracts（按原始保修条件核对范围、排除项、凭证及服务商确认；在保日期不自动代表免费维修）
- [ ] 🟡 stock：采购建议清单（低于阈值项自动汇总视图）

## 17. UI / 交互增强

- [x] 🟡 全局台账搜索框（标题/备注 contains，与成员过滤叠加） ✅ 2026-10-03 第八轮（台账页搜索：名称/备注 contains 不区分大小写；搜索无命中与空台账区分双空态（UI16 语义）；跨库全局搜索仍属 UG05/UX13 范围）
- [x] 🟡 排序与视图偏好记忆（提醒页/台账页各自持久化） ✅ 2026-10-03 第十轮（台账页：表头点击切换列/方向，runtime.ledgerSortKey/Asc 跨会话记忆；提醒页排序固定按紧急度分组、无用户排序偏好需求——定案不做，后续如加再记）
- [x] 🟡 提醒/台账行批量操作（多选 → 批量归档/延后/忽略） ✅ 2026-10-03 第十三轮（提醒页批量模式：筛选条"批量"开关 → 勾选/全选当前结果 → 批量完成/延后 7 天/忽略，经 H01 串行队列逐条落盘；台账行批量（归档写回）随 A5 行编辑；[待实测] 大批量（50+）串行耗时随回归观察）
- [ ] 🟡 成员卡右键/长按菜单（编辑/归档/查看档案）
- [ ] 🟢 成员网格拖拽排序
- [ ] 🟡 头像上传（asset 文件选择器 → 成员库 avatar 列）
- [ ] 🟡 单条记录复制为脱敏文本（分享场景）
- [x] 🟡 紧急信息卡打印样式（@media print，家庭紧急信息卡可打印） ✅ 2026-10-03 第三十二轮（@media print：隐藏导航/操作按钮/快捷记录行，白底黑字，卡片防跨页断裂——覆盖总览/提醒/台账/成员/设置五屏）
- [x] 🟢 快捷键速查表（设置·关于区） ✅ 2026-10-02（快捷键与入口说明进关于区）
- [ ] 🟢 成员下钻面包屑返回
- [x] 🔴 删除行走思源块删除（保留撤销窗口），禁止绕过 UI 直接删（detached 行语义修正 ✅ 2026-10-03 第九轮：detached 行非块，走 av 行删除端点（[待实测]）+ 双确认 + 失败引导手动删除；绑定行的块删除与撤销窗口维持 P12 实测后设计）
- [ ] 🟡 统计卡点击下钻（模块卡 → 预筛选的台账/提醒视图）
- [ ] 🟢 提醒行就地展开摘要（不离开列表）
- [ ] 🟡 时间表述本地化（「3 天后 / 下周三」+ 悬浮完整日期）
- [ ] 🟡 空工作区首启体验（无笔记本时引导先建笔记本）
- [ ] 🟢 bookmarks 失效链接检测（周期 HEAD 检查+标记失效——Raindrop 印证，进阶）
- [ ] 🟢 快速录入日期智能解析（TickTick 印证；实现规格已深挖：今天/明天/下周X/X月X日/明早9点等格式+模糊日期取最近有效日+识别后移除残留，见 MODULES.md 附录滴答清单·智能解析条目；中文正则可覆盖）
- [x] 🟡 通知队列防轰炸（任务笔记管理模式：应用内通知单例队列 MAX=5 超出关最旧；B3 接线时采用） ✅ 2026-10-03 第十轮（适配版：宿主 showMessage 无"关最旧"句柄，MAX=5 单例队列不可行——改为 coalescedNotify 同键 60s 抑制，已接台账保存失败与快速存入失败两个重试易发路径，单测覆盖）
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
- [x] 🔴 onunload 清理审计：eventBus 解绑/定时器销毁/observer 断开（内存泄漏清单） ✅ 2026-10-03 第六轮（心跳定时器销毁 + 块菜单监听精确解绑 + 状态栏移除 + hubListeners 兜底清空 + scanSeq 作废在途扫描（H11）；插件现无 observer；真机 reload 验证随回归）
- [ ] 🟡 卸载向导：uninstall 时询问保留或清理（默认保留台账文档）
- [ ] 🟡 工作区切换/插件重载的 onload 幂等验证

## 19. 安全加固

- [ ] 🔴 面板渲染用户内容统一转义（标题/备注防 XSS——台账内容来自用户输入）
- [ ] 🔴 日志审计：永不输出 token / 证件号 / 金额到 console
- [ ] 🟡 附件处理边界：仅展示图片/PDF 预览，不执行未知类型
- [ ] 🟡 RPC 入参校验：生态调用方参数 schema 校验（防脏数据入库）
- [ ] 🟡 依赖最小化审查：每个新依赖记录必要性理由（已核：lunar-typescript/date-fns）
- [x] 🟡 `pnpm audit` 纳入发布前检查 + lockfile 提交 ✅ 2026-10-03 第四十四轮（check:audit script（--prod --audit-level moderate）纳入 check 链；当前 0 known vulnerabilities）
- [x] 🟢 dependabot/renovate 配置（依赖自动升级 PR） ✅ 2026-10-02（.github/dependabot.yml：npm weekly + actions monthly，major 排除）

## 20. 性能与内存

- [ ] 🟡 列表性能预算：1000 行表格滚动 60fps（虚拟滚动兜底）
- [x] 🟡 扫描去抖合并（Tab 快速切换不重复全量扫描） ✅ 2026-10-03 第十五轮（refreshHub force 分流：非强制全量 30s 内去抖返回缓存；手动重扫/唤醒/布局就绪/设置保存保持强制；增量扫描不受限；与 H11 seq 防护叠加）
- [ ] 🟢 成员色/图标映射缓存（避免每帧重算）
- [ ] 🟡 bundle 体积守门：CI 检查 index.js gzip < 100KB（超限即失败）
- [ ] 🟡 date-fns 按需引入核验（bundle 分析，只导入用到函数）
- [ ] 🟢 附件缩略图懒加载（成员头像/资产照片墙）
- [ ] 🟡 长会话内存走查（开关抽屉/弹层 50 次无增长）
- [x] 🔴 bundle 超预算整改：index.js gzip 132KB > 100KB 预算（05 §4.5）——lunar-typescript 全量入包；动态 import 拆独立 chunk（按需加载，仅农历触发）✅ 2026-10-02 实测 gzip 132→32.4KB（-76%） ✅ 2026-10-02（bundle gzip 132→32KB；成员过滤持久化；三级分组；向导重跑）

## 21. 测试与质量工程

- [x] 🟡 i18n 键位对齐检查脚本（zh-CN/en key 集合 diff，纳入 CI） ✅ 2026-10-02（scripts/check-i18n.mjs + check:i18n；451 键对齐，循环A 第6项）
- [x] 🟡 schema 黄金文件测试（certs schema 序列化快照防意外变更） ✅ 2026-10-03 第十轮（扩展为全部 31 模块 schema 快照 tests/core/__snapshots__；有意变更用 vitest -u 更新并记录原因；与 33.2 契约门禁互补——门禁查合法性、快照查漂移）
- [ ] 🟡 provisioner mock 单测：新建/补登记/重建三分支（A3 已列，此处补测试文件规划）
- [x] 🟡 settings 迁移测试：v0.1 旧结构 → v0.2 读取兼容（reminderAdvanceDays 遗留字段） ✅ 2026-10-03 第十轮（遗留字段透传保留、未知模块 id 过滤、缺失字段补默认、空存储全默认，均有断言）
- [x] 🟢 core/ 目录覆盖率目标 ≥70%（vitest coverage） ✅ 2026-10-03 第二十轮（@vitest/coverage-v8 接入；首测 core/ 语句 86.98%、分支 90.45%、函数 85%——超目标 17 个百分点；coverage/ 产物已 gitignore）
- [ ] 🟡 兼容性矩阵：思源 3.8.0 LTS / 最新 beta 各跑一轮回归脚本
- [ ] 🟢 issue 模板（bug：环境信息+复现步骤；feature：场景+竞品参照）
- [ ] 🟢 回归脚本模板化（docs/testing/ 每版本一份，含截图占位）

## 22. 文档与用户支持

- [ ] 🟡 用户手册 docs/guide/（每模块一页，含截图，上架前完成核心五模块）（2026-10-03 第四十五轮进度：**文字内容落地**——docs/guide/ 6 篇：快速上手/证件/药箱/合同/成员/提醒中枢；截图待真机；剩余 25 模块指南随模块 ready 逐步补写）
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

- [x] 🟡 插件设置导出/导入（JSON 文件，跨设备/重装迁移辅助） ✅ 2026-10-03 第七轮（设置·关于区：导出=带日期文件名下载 + 隐私警示；导入=形状校验（enabledModules/members/dbRefs）→ 确认框 → 覆盖应用 → 补建台账+重扫；坏文件拒绝不覆盖当前设置；台账数据不受影响）
- [ ] 🟡 恢复出厂：清空 settings 保留台账数据（双重确认）
- [x] 🟡 示例数据一键生成/一键清除（新用户体验与截图制作） ✅ 2026-10-03 第八轮（src/core/demo.ts：示例成员走成员 DAL、【示例】前缀行仅写入已启用模块、生成清单记 settings.demoRows/demoMemberIds；清除走 removeLedgerRows [待实测] 失败逐行报告不假清；设置·关于区两按钮）
- [ ] 🟢 数据体积概览（各模块行数/附件数量统计面板）
- [x] 🟢 迁移指南：Sortly/钱迹等 CSV → 本插件字段映射文档 ✅ 2026-10-02（docs/migration.md 骨架：通用流程+双映射表+注意事项，Wunderlist 三原则落地）
- [x] 🟢 备份指引：结合思源备份机制的台账备份建议（写入 FAQ） ✅ 2026-10-03 第十四轮（FAQ 新增备份节：思源备份保台账/附件 + 设置 JSON 导出双腿组合；损坏标记文件说明）

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
- [x] 🟡 Releases 流程演练：tag → GitHub Release 附 zip（不发集市） ✅ 2026-10-02（v0.1.0-alpha.1 实操全程跑通：build→tag→push→prerelease+zip 附件）
- [ ] 🟡 0.x 预发布约定写入 README（0.x 阶段数据结构可能变，升级需看 migration notes）
- [ ] 🟢 公开仓库首次 announcement 计划（发帖与否另定）
- [ ] 🟡 代码目录终审：无实验残留、无注释掉的死代码、无调试入口
- [x] 🟢 git 历史敏感信息扫描（早期提交复查） ✅ 2026-10-02（全历史扫描：token/身份证/手机号模式命中全部为误报——文档 URL 数字、字段名、官方安全文案；零真实敏感数据）

## 26. 集市上架（⏸ 整体暂缓：触发条件由你另行决定，以下全部挂起）

- [ ] ⏸ 上架材料中的 manifest/`minAppVersion` 复核；`disabledInPublish` 是发布服务策略，另见第 0 组/R05，不作为集市上架开关
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

- [x] 🟢 assets-real QR 标签打印/扫码定位 ✅ 2026-10-02（依赖 qrcode 1.5.4 引入并记录理由；src/core/qr.ts：generateQRDataUrl/blockDeepLink——UI 打印按钮接线随详情抽屉）
- [x] 🟡 vehicles 电池更换周期字段+提醒 ✅ 2026-10-02（schema 加 battery_due 列 + battery 提醒 30 天；周期推算由用户按实际记录下次更换日）
- [x] 🟡 vehicles 违章手动记录字段 ✅ 2026-10-02（violations text 列：日期/地点/行为/罚款摘要，换行分隔；子表化留 v0.8 深化）
- [ ] 🟢 insurance 续保决策提醒（contracts 自动续约有同款语义：到期前 N 天提示"续/比价/放弃"决策而非仅提醒）
- [x] 🟢 snippets 参数位模板（espanso Forms/TextExpander 印证：{{占位}} 展开时弹填充） ✅ 2026-10-02（约定文档化进 MODULES 16 组；{{语法}}+填充交互随 snippets 面板 v0.6+ 实现）
- [x] 🟢 media gallery 海报墙视图 ✅ 2026-10-02（schema 层：ViewDef 扩展 gallery 类型 + media views 声明；av 建视图实现在 provisioner views 落地时）
- [x] 🟢 food→stock 采购联动（最小版） ✅ 2026-10-02（food schema 加 ingredients 食材清单列，采购时对照 stock 采购建议；自动汇总联动留 v0.8）
- [ ] 🟡 FAQ 全家共用指引：已有文案，但“共享笔记本即可零配置协作”缺实际权限/部署/冲突证据；先做 R07，再更新承诺
- [x] 🟢 智能归类进阶参照 ✅ 2026-10-02（概念级文档化进 MODULES；依赖智能解析+Agent 能力先行，不排期）

## 26.7 细节优化梳理（2026-10-02：功能/流程/交互/UI 细节审查产出）

- [x] 🟡 快速表单按模块隐藏不适用行 ✅ 2026-10-02（字段行按台账列存在性显隐：certs 不显示金额、exams 不显示到期下拉等——capture 驱动完成）
- [ ] 🟡 adhoc 备忘过滤与管理：无 memberId 的备忘在总览成员过滤下恒显示已有实现；跨屏范围、来源标记与查看/清理入口尚待 H03/H07/H16 验收
- [x] 🟡 台账页"未建库模块"重建入口 ✅ 2026-10-02（下拉列出全部启用模块并标注未建库；rebuildLedger 按钮→ensureCoreLedgers）
- [x] 🟡 向导完成后的 CTA 深链 ✅ 2026-10-02（完成按钮=建库后直达预选 certs 的台账快速表单）
- [x] 🟡 打开管家面板默认热键策略定案 ✅ 2026-10-02（默认 Ctrl+Alt+H；FAQ 快捷键表同步；用户可在设置-快捷键改）
- [x] 🟢 成员删除确认文案升级 ✅ 2026-10-02（确认框说明数据保留语义；批量改派入口属 33 引用完整性项）
- [ ] 🔴 提醒行移动端操作路径复核：hover:none 的常显规则被后续同特异性 display:none 覆盖；触屏/键盘/鼠标动作等价及真实设备验收见 UI09，不能沿用已完成标记
- [x] 🟢 Ledger 空态区分双文案 ✅ 2026-10-02（未建库=🚧重建指引；建库无数据=🗂录入指引；role=status 保留）
- [x] 🔴 adhoc 备忘清理纠正：当前按到期日删除逾期超过 30 天的未处理项，不能当“已完成后清理”；先保护未处理数据并明确完成保留/恢复策略，见 H03 ✅ 2026-10-02（H03 落地：未办备忘永不按到期删，done 备忘保留 30 天可恢复，物理删除仅经显式 removeMemo）
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

- [x] 🟡 状态栏入口：`addStatusBar`「今日到期 N」角标，点击直达提醒页 ✅ 2026-10-03 第六轮（计数=daysLeft≤0（逾期+今天）；点击打开管家并预选提醒页（pendingScreen）；扫描与动作后即时刷新；卸载移除）
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

- [x] 🟡 续期流水查看入口（2026-10-02 第二轮新增，H10 收尾）：提醒行/台账行详情展示 runtime.renewHistory（from→to、时间）；来源=续期/换证动作，不做台账行 note 改写（历史链视图见 16 组 certs 换证历史） ✅ 2026-10-03 第八轮（详情抽屉底部历史段；行删除时同步清理流水防孤儿数据）
- [x] 🟡 同成员同日多提醒合并展示（"儿子的 3 件事"折叠卡） ✅ 2026-10-03 第十五轮（提醒页组内同人同日多条折叠为一张卡（成员名+日期+计数），点击展开逐条操作（行渲染重构为 snippet 复用）；无成员/单条事项不受影响；键盘可达）
- [x] 🟡 每周预告摘要（周日推送下周 7 天清单） ✅ 2026-10-03 第十四轮（周日全量扫描推送未来 7 天计数；ISO 周键去重（周四锚点算法有单测）；静默时段与零事项不打扰；FAQ 同步说明）
- [ ] 🟡 处理历史视图 + 月度完成率统计（到期处理率 = 质感的延伸）（2026-10-03 第三十三轮进度：**月度完成计数落地**——complete() 递增 monthlyCompletions[YYYY-MM]、overview hero 展示、restore 不递减；处理历史视图=已处理视图+续期历史+EC15 交集此前已落；月度完成率% 需 denominator=当月应到基数，待 PF01 测量协议定口径）
- [x] 🟡 「快速备忘」开放决策：是否允许独立于台账的一次性提醒（如"周三给老师打电话"）——与 P2 原则的边界，需定案后更新 03 文档 ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [ ] 🟢 续期历史时间线（一个证件的历次换证/续保记录沉淀）
- [ ] 🟢 默认提前量自适应（按用户实际处理时长学习）
- [x] 🟢 通知一键静音（今日免打扰快捷开关，顶栏） ✅ 2026-10-03 第四十六轮（runtime.todaySilent 字段（今日 localDateKey，跨天自动失效）→ inSilentHours 优先检查 → 摘要/逾期提示/每周预告共用；跨天自动恢复；单测通过既有 inSilentHours 覆盖）

## 30. 国际化细节

- [x] 🟡 日期 locale 格式（zh `YYYY-MM-DD` / en 规范定案） ✅ 2026-10-03 第十五轮决策：数据与展示统一 ISO yyyy-MM-dd（本地时区 localDateKey），双语同形——排序/比较安全且无歧义；本地化变体（如 en "Mar 5"）v1 不做，需要时走展示层映射
- [ ] 🟡 农历显示的 en 方案设计决策（"腊月廿三"英文呈现方式）
- [ ] 🟡 币种符号与千分位 locale 化（¥/￥/，分隔）
- [x] 🟡 英文复数处理（1 item / N items，i18n 键设计） ✅ 2026-10-03 第十五轮决策：不引入复数引擎——en 文案统一中性形式（"in ${n}d"/"${n} selected"/"item(s)"），现有键已全覆盖；未来需要精确复数再评估 ICU MessageFormat
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
- [x] 🟡 面板 props any 清零：tab-panel 接口已具体类型化（HomeSettings/HubRuntime/ScanResult）；四屏组件的 IHomePluginLike any 字段（28 处）随 C 阶段细化逐屏类型化（循环A 第 2 项剩余） ✅ 2026-10-03 第十九轮（共享 HomePluginLike 契约覆盖六屏+onboarding；面板 ": any" 43→13，剩余为台账行 cells 的内核 JSON 边界，归 21 组 SQL 结果类型化追踪）
- [x] 🟡 Svelte 错误边界：面板崩溃不拖垮思源主界面（顶层 error boundary + 降级 UI） ✅ 2026-10-03 第三十四轮（Svelte 5.57 svelte:boundary——四屏各包一层 ErrorBoundary，渲染期错误降级为带错误摘要+重试按钮的卡片；事件处理器异常不在此范围内（Svelte 5 设计）；safeMount.ts 备用挂载守卫）
- [ ] 🟡 加载态规范落地：何时 skeleton / 何时缓存直渲（对照 08 §4 状态矩阵逐屏标注）
- [ ] 🟢 关键组件 props 文档注释（含用法示例）
- [ ] 🟢 视觉回归抽查流程：改 token 后过一遍原型「组件库」屏截图比对

---

## 33. 2026-10-01 仓库审计补充（现状差距与新增验收线）

> 本组保留 2026-10-01 首次审计的任务结构。2026-10-02 已有 Tab、31 schema 与正式发行；最新状态以顶部快照和第 35 组为准，历史“只到 v0.1 Dialog”的描述不再适用。

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
- [ ] 🟡 成员同名歧义人工选择 UI（2026-10-02 第二轮新增，D06 收尾）：回填报告歧义后提供候选行选择对话框（展示各行主键值/状态），选择结果写 avItemId；当前仅在诊断区以计数报告
- [x] 🟡 其余 status 模块显式默认声明（2026-10-03 第十轮新增，D11 收尾）：certs/medicine 已显式 default，其余 13 个带 status 的模块仍用 options[0] 兜底——逐个显式声明（members=active、memberships=active、insurance=in_force、assets-real=inuse、contracts=ct_active 等）。验收：调整枚举顺序不改变新行状态；黄金快照随声明更新并记录原因 ✅ 2026-10-03 第十一轮（全部 13 个 status 模块显式声明完成；快照经 -u 更新，diff 核对仅含预期 default 行——快照流程首次实战验证）

### 33.3 提醒规则与运行态

- [ ] 🔴 提醒字段语义契约：规则实际读取 `ReminderRuleSpec.field/cycleField/lunarField`，实现行级 `remind_before`、`leadOverrides`、`last_done` 优先级，校验并 clamp 无效提前量，明确 `later` 折叠/过滤语义，并过滤 archived/void 行
- [ ] 🟡 行级提前量表单录入（2026-10-02 第二轮新增，H14 配套）：**provider 合并已落地（2026-10-03 第八轮：行级 > 用户 > 默认，clamp 校验，单测三路对照）**；余下表单入口——certs capture 已满 5 列（D11 门禁），remind_before 的录入位随详情抽屉编辑能力（C4b 收尾）一并设计
- [ ] 🔴 日期全链路验收：已有 localDateKey，但 UI 仍有 UTC 截断、备忘按毫秒算日数；实际采用前端本地时区，不能称已实现内核统一时区。UTC+8/DST/跨天/回拨矩阵见 H09
- [ ] 🔴 农历/周年边界：D2/D3/D7 决策与基础测试已有；同闰月候选和跨下一闰年 2/29 仍有实现缺口，见 H09；保持既有决策，不因勾选掩盖差错
- [x] 🔴 recurring 算法与语义：明确逾期周期是否展示 overdue；月末 31 日不漂移；长期历史日期采用 O(1) 跳步，不能按天 `while` 扫描 ✅ 2026-10-01（09 决策记录 / commit 168dcae）
- [ ] 🔴 HubState 协议版本化：增加 `schemaVersion`、每成员/模块统计、扫描错误、snooze/mute/handled TTL 和旧缓存迁移；单模块失败不得把全局显示成“暂无事项”
- [ ] 🟡 运行态清理：行删除、模块禁用、卸载和跨设备冲突时清理提醒缓存，限制 `snooze/mute/handled` 无限增长，通知去重按本地日历计算，并提供脱敏诊断导出

### 33.4 UI、交互与可访问性

- [ ] 🔴 设置编辑事务：使用 draft 副本；取消/关闭回滚未保存改动，dirty 状态触发离开确认，保存失败保留输入并支持重试
- [ ] 🟡 快速表单必填校验（2026-10-02 第二轮新增，UI05 配套）：name 为空但填了其他字段时当前以"（未命名）"建行兜底——应改为阻止提交并按 UI05 给字段旁错误说明，或明确产品定案允许匿名行（两选一，不能静默）
- [ ] 🟡 leadOverrides 编辑行按启用模块过滤（2026-10-02 第四轮新增，C8c 收尾）：当前列出全部 schema 规则（25+ 行）过长；应只显示已启用模块的规则（未启用模块的覆盖值保留不动），并可折叠。验收：设置·提醒页只出现启用模块行；关闭模块再打开其自定义值不丢失
- [ ] 🟡 详情抽屉展示用户自建列（2026-10-03 第七轮新增，C4b 收尾）：详情当前仅渲染 schema 列；台账里用户手建列（renderLedger 返回的 columns[name] 有列名）应追加在 schema 列之后。验收：手建列在抽屉可见且不冒充 schema 字段；建库器不为其建映射
- [ ] 🟡 块菜单存入的地址分流（2026-10-03 第七轮新增，C6c 收尾）：选中文本命中 URL 时当前固定存入 bookmarks——应提供二级菜单可选"存为网址/存为地址"（address 模块，收货/登记地址场景）。验收：URL 选中时两入口可见；未启用 address 模块时引导开启；存入字段与模块 capture 一致
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
- [ ] 🟡 发布包 smoke 完整验收：文件清单/JSON/体积/许可证基础检查已实现；包内双语 README 相对链接仍失效，见 R04；docs/MODULES 等按 09 产品决策 D12 排除，不为修链接重新塞设计文档
- [ ] 🟡 元数据完整交叉校验：已有 name/version/文件存在性门禁；作者/仓库 URL/license/README/tag 范围未齐，manifest 仍指旧仓库，见 R05
- [x] 🟡 PR CI：ci.yml 覆盖 PR 与 main push（含 smoke 与 gzip 门禁；文件哈希留按需）
- [ ] 🟡 README / MODULES / TODO 发布策略统一：明确当前 v0.2.0 已发行但闭环未验收的边界、GitHub Release 与集市暂缓状态；功能承诺按 R06 核实
- [ ] 🟢 卸载/重装/工作区切换测试：确认台账保留、设置恢复、插件 reload 不复用旧内存，`onunload` 清理事件、计时器和 observer

---

## 34. 自主开发兜底循环协议（2026-10-01 设立）

> **触发条件**：当前所有可自主完成的任务（非 ⛔ 等实测、非 ⏸ 暂缓）已全部完成或阻塞。
> **用户范围优先**：用户指定只调研/扩充规划时，命中问题只登记，不进入循环 A 修复或主线开发；2026-10-02 本轮适用。
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
| 2026-10-02 | 主线 | C6a 勾选 | 表单弹层（C6a）多轮增量完成勾选 |
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
| 2026-10-02 | 主线 | 🏁 v0.2.0 发版 | 版本号 0.2.0（package/plugin/CHANGELOG 转正）；README 双语徽章+安装节；GitHub topics/homepage 设置完成；正式 Release 发布 |
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
| 2026-10-02 | 主线 | 33.5 smoke test 脚本化 | scripts/smoke-test.mjs（必要/禁入文件+JSON+体积）纳入 check 链（check=四重门禁+meta）；pnpm run smoke 独立可跑 |
| 2026-10-02 | 主线 | 23 组 zip 体积门禁 | check:meta 内置（<10MB） |
| 2026-10-02 | 主线 | 25 组 issue/PR 模板落盘 .github/ | bug/feature 模板 + PR 自查清单 |
| 2026-10-02 | 主线 | Releases 流程演练（beta 通道实操） | v0.1.0-alpha.1 prerelease 发布成功（zip 附件+notes）；发布通道全程验证 |
| 2026-10-02 | 主线 | C5b 成员下钻最小版 | 成员卡点击展开该成员提醒明细（徽章+逐条+完成动作）；完整跨模块时间线留 v0.5+ |
| 2026-10-02 | 主线 | C1c（部分） | 删除废弃 dashboard.svelte（Tab 化后无引用）；settings 面板为现役保留 |
| 2026-10-02 | 主线 | C1c 收尾（第一步完成） | LEGACY 段 7 个 dashboard 专用类删除（全局零引用验证）；settings 现役类保留；css 21.8→更精简 |
| 2026-10-02 | 巡检 | 健康巡检 | check 0/0、30/30、build 成功、工作区干净；大颗粒项（C6a/33.2 journal 完整版）交接闲时队列 | media/pets/vehicles/transit/travel×4/assets-virtual 9 个 + 修复核心缺口 assets-real/health（默认启用却无 schema 的建库缺口）+ 68 枚举 i18n（总 399 键）；gzip 35.3KB；contract gate 24 schema 全过；剩余无 schema：food/address/bookmarks/snippets/parenting/schooling/social |
| 2026-10-02 | 主线 | 规划基线入库（开发指令到达，主线恢复） | 35–62 组规划与 7 篇调研报告提交（62d2bf4）；.gitignore 排除 .playwright-cli/output 本地工具目录 |
| 2026-10-02 | 主线 | H/D 正确性一波（H01–H07/D01/D02/D03/D12/H09 部分） | 完成语义分派+恢复、备忘保留、运行态串行事务、失败快照+数据时间、全量分页读+完整性探测、行身份三路确认+pending 防重复、快速表单可恢复、响应式桥修复（发现 tick 未消费缺口）、健康检查最小版、2 处 UTC 截断修复、updateMember 空壳清偿；单测 33→61、i18n 470→487、gzip 38.0KB；D01/D02/H04 留真机核对注记 |
| 2026-10-02 | 主线 | 第二轮：D05/D06/D07 + D09 + H10/H04/H14 | 成员 DAL 统一双写（设置页差异同步+精确写回+清空+syncError）、回填四态（唯一/歧义/无匹配/失效）、建库器笔记本 ID/名称兼容+关闭恢复+瞬态/缺失分类（发现并修复"not found 后仍走复用分支"的实现缺口）+补列续跑+补登记找回 av、capture 驱动快速表单（类型感知渲染，附件列显式声明不支持）、续期按规则字段写回+流水、缺列显式报错、leadFor 校验；单测 61→86、i18n 487→496、gzip 39.7KB |
| 2026-10-02 | 循环B | 第二轮开发发现回填 | 新增 4 待办：续期流水查看入口（29 组）、行级提前量录入与合并（33.3，H14 配套）、成员同名歧义人工选择 UI（33.2，D06 收尾）、快速表单必填校验（33.4，UI05 配套） |
| 2026-10-02 | 主线 | 第三轮：H15 + H08 修复 + H16/C3a | 数值阈值规则（schema 声明+NumericRuleProvider+门禁+medicine/stock 接线，≤触发/0 算有值/缺值不评估/补货自动解除）；修复农历读列错位（birthday 复选框 vs lunar 列——农历生日此前从未生效）+ 生日提醒 memberId 按 avItemId 关联；成员删除复位失效筛选；提醒页成员/模块筛选持久化；单测 86→92、i18n 496→497、gzip 40.5KB |
| 2026-10-02 | 主线 | 第四轮：C8b/C8c/C8e + D11 | 设置·提醒分区（摘要时刻/静默时段/全规则提前量编辑，rule.* 17 条双语）；禁用模块确认框+启用即建库（ensureCoreLedgers）；关于区仓库链接；schema 门禁扩展（重复 key/capture≤5/数值类型）；单测 92→94、i18n 497→526、gzip 41.4KB |
| 2026-10-02 | 循环A | 9 项走查（兜底协议） | 色值零违规（仅 qr 黑白合理）、console 调试零残留、TODO 注释仅 1 处文档性引用；即修 1 项：快速表单"（未命名）"硬编码中文 → i18n（527 键）；03 设计文档补 §7 v0.2 实现注记（H03/H05/H10/H15 与目标语义的差异与依据） |
| 2026-10-02 | 循环B | 信源轮询（23 组周期项：集市家庭垂直监控） | bazaar plugins.txt 541 个社区插件名称级扫描，家庭垂直仍 0 竞品；命中 2 个通用块提醒插件（siyuan-plugin-reminder/plugin-block-reminder）非家庭管理，与管家不冲突；本轮未做逐插件深挖（仅 gh api 名称级） |
| 2026-10-03 | 主线 | 第五轮：C4b/C5a/C3a/C8d/C6b/H12/19组安全 | 行点击详情抽屉（全列 kv，DOM 构建防注入）、成员卡统计 chips、时间窗筛选（今天/7/30 含逾期）、生态占位开关、保存回执+保存并查看、摘要与逾期提示共用静默（inSilentHours 单测：静默不弹不标记→补发）、续期弹层 HTML 移除用户内容（textContent 挂载）；单测 94→97、i18n 526→542、gzip 42.8KB |
| 2026-10-03 | 主线 | 第六轮：C6c 块菜单 + 28 组状态栏角标 | 选中文字存入（URL→bookmarks/文本→snippets，未启用引导）；状态栏「今日到期 N」点击预选提醒页（pendingScreen）；监听精确解绑；onunload 审计收口（18 组 ✅）；单测 97、i18n 547、gzip 43.4KB |
| 2026-10-03 | 主线 | 第七轮：24 组设置导出/导入（主动开发收尾） | 导出（JSON 下载+隐私警示）/导入（形状校验→确认覆盖→补建台账+重扫，坏文件拒绝）；单测 97、i18n 555、gzip 44.0KB。**可自主开发项至此收尾，余项均需真机/内核条件（H09/H11/H13、D01/D02/D10、B3c、C6d⛔、C9 走查、S6–S8）** |
| 2026-10-03 | 循环A | 9 项走查（第五轮后） | 调试残留/色值/硬编码中文零命中；新交互 aria 与键盘可达（行 role=button+tabindex、状态栏 aria-label、抽屉 Esc 走宿主 Dialog）；i18n/check/build 全绿 |
| 2026-10-03 | 循环B | 信源轮换：homebox（sysadminsmedia ★7.4k） | 分类/位置/标签+自定义字段、图片上传、保修追踪、维护日程、强搜索——全部印证既有设计（assets 列/BD12/P02/17 组/UG05/PM16/D09），**无新增吸收项**；回填 MODULES 附录 |
| 2026-10-03 | 循环B | 第五六七轮开发发现回填 | 新增 2 待办：详情抽屉展示用户自建列（C4b 收尾）、块菜单地址分流（C6c 收尾）；附验收标准 |
| 2026-10-03 | 主线 | 第八轮：H14 行级提前量 + 续期历史 + 示例数据 + 台账搜索 | remind_before 行级 > 用户 > 默认（clamp+单测三路对照）；详情抽屉续期历史段（删除行同步清流水）；demo.ts 示例生成/清除（【示例】前缀+清单回滚+失败不假清）；台账页搜索（双空态语义）；单测 97→99、i18n 555→569、gzip 43.9KB |
| 2026-10-03 | 主线 | 第九轮：显式删除收口 | 未处理备忘删除入口（H03 唯一物理删除路径补 UI）；详情抽屉行删除（双确认+端点失败引导手动删，供真机回归检验 removeLedgerRows）；单测 99、i18n 575、gzip 44.1KB |
| 2026-10-03 | 循环A | 八/九波走查 | console/色值/硬编码零命中；删除动作全部带确认；即修 1 项：行删除后 renewHistory 孤儿数据清理 |
| 2026-10-03 | 循环B | 信源轮换：grocy（★9.5k） | 条码录入记远期待办（🟢，相机/https 可行性先验证）；never-overdue 魔法日期被 longterm 枚举更优解决（不吸收）；feature flags=模块开关印证；回填 MODULES 附录 |
| 2026-10-03 | 主线 | 第十轮：QA 工程 + 细节收口 | 31 模块 schema 黄金快照（防漂移，与契约门禁互补）；settings v0.1→v0.2 迁移测试；coalescedNotify 同键 60s 抑制（宿主无关旧句柄的防轰炸适配，接两处重试易发路径）；台账列排序记忆；saveRuntime 无变化落盘跳过（PF09）；ColumnDef.default + 门禁（certs/medicine 显式默认）；单测 99→105、i18n 575→576、gzip 44.5KB |
| 2026-10-03 | 循环A | 第十波走查 | 新增测试/工具文件自查干净；PF09 模块级缓存的跨窗口语义复核（最坏多写一次，安全）；快照测试维护流程写入测试注释（-u + 原因记录） |
| 2026-10-03 | 循环B | ①新待办+②量化（③本轮回吐：上三轮已覆盖 bazaar/homebox/grocy，信源池休一轮） | 新增 1 待办：D11 剩余——其余 13 个 status 模块的显式默认声明（附验收：枚举重排不改变新行状态）；均写明依赖与验收标准 |
| 2026-10-03 | 主线 | 第十一轮：D11 收尾 + PF13 唤醒补扫 + A2c 附件上传 + 发行文档 | 13 个 status 模块全部显式 default（快照 -u 流程首次实战）；visibilitychange 唤醒补扫（10 分钟合并间隔）；uploadAsset 封装（可注入传输）+ 详情抽屉附件段（多文件上传追加 mAsset，[待实测]）；CHANGELOG 增 Unreleased 段（v0.2.0 后十轮变更摘要）；回归清单扩充 7.1–7.6 共 33 项新功能验收；单测 105→107、i18n 576→580、gzip 45.2KB |
| 2026-10-03 | 循环A | 第十一波走查 | 上传失败文案占位一致性即修（${msg} 统一）；快照 diff 逐行核对；CHANGELOG 相对链接有效 |
| 2026-10-03 | 循环B | 信源轮换恢复：开源用药提醒 TOP5（gh 检索，Dose ★634） | 按时服药/skip/服药历史 → 印证 P09 克制边界（服药记录是独立产品域，medicine 维持库存+效期+低库存）；无新增吸收；回填 MODULES 附录 |
| 2026-10-03 | 主线 | 第十二轮：🔴 发现并修复 provider 手工清单漂移 | refreshHub/ensureCoreLedgers 的两份手工清单与 schemaCatalog 脱节——**parenting/schooling 的提醒从未生效**（schema 声明了规则但没注册 provider）；改为 buildScanProviders 程序化派生（无规则模块不注册，PF04）+ providerCoverage 契约测试 4 例；ensureCoreLedgers 删除第二份 31 项清单；单测 107→111、gzip 45.2→44.9KB（清单删除后摇树更净）；CHANGELOG 修复段更新 |
| 2026-10-03 | 循环A | 手工清单漂移根因复盘 | 根因=B2a 建 17 provider 清单后、31 schema 批量时代未同步——教训：同类"代码清单 vs 数据目录"并列结构一律改为目录派生+契约测试；已扫 ensureCoreLedgers（本轮修）/schemaCatalog（单一源）无第三处 |
| 2026-10-03 | 循环B | D10 可行性检索（官方仓库） | 未见公开视图创建内核 API（#10863 数据库自动化仍 open）——D10 维持版本能力探测策略，注记回填 |
| 2026-10-03 | 主线 | 第十四轮：健壮性 + 周预告 + FAQ | loadDataSafe 损坏容错（settings/runtime 双侧，.corrupted.json 标记+onload 警告，默认值回退不崩启动）；每周预告摘要（ISO 周键周四锚点算法单测、周日/静默/零事项三边界）；向导建库起止提示；FAQ 备份指引节；单测 113→118、i18n 585→589、gzip 45.9KB |
| 2026-10-03 | 循环A | 第十四波走查 | 即修 1 处：编辑中误删 defaultSettings 已即时复原；损坏标记不回读原文件的诚实边界写入待办注记；118/118 全过 |
| 2026-10-03 | 循环B | ③轮休（近六轮已覆盖 bazaar/homebox/grocy/Dose/官方仓库×2） | ①② 不适用（无新待办）——记录轮休 |
| 2026-10-03 | 主线 | 第十三轮：PF06 增量刷新 + 17 组批量操作 | runScan 增 only 集（范围外沿用旧快照与数据时间；摘要/逾期提示仅全量评估防少报压制）；台账写行/删行/续期接单模块增量，附件与快速存入确认无提醒影响后彻底去掉扫描；提醒页批量模式（勾选/全选 → 批量完成/延后7/忽略，经 H01 队列）；单测 111→113、i18n 580→585、gzip 45.6KB |
| 2026-10-03 | 循环A | 第十三波走查 | 批量串行 await 语义复核（H01 队列天然串行，大批量耗时记回归观察项）；handled 筛选下全选为空集正确；测试修补 rt.cache 种子（生产由 index.ts 落盘） |
| 2026-10-03 | 循环B | ③轮休（Obsidian Bases 无开源可引源；近五轮已覆盖 bazaar/homebox/grocy/Dose/官方仓库检索） | ①② 不适用（本轮无新待办）——记录轮休 |

---

## 35. 2026-10-02 现状复核与调研扩充（只规划，未实施）

> 来源、源码证据与取舍见 [调研报告](docs/research/2026-10-02-开发状态与待办调研.md)。本组 60 项全部未实施；H/D/R/T 为旧大项的验收分解，V/P 含政策校核与业务增量。以下 ID 是引用键，不是新版本承诺。

### 35.1 提醒链路与运行态（H01–H16）

- [x] 🔴 **H01 运行态事务**（33.3/15）：动作成功须同步内存与持久化；验收连续添加两条备忘、延后后立即扫描、两个 Tab 同时操作，重启后均保留，不被旧 cache 覆写。 ✅ 2026-10-02（代码层：withRuntime 串行队列 + 每动作 load-modify-save 落盘，并发动作不互相覆盖——单测覆盖；思源 Tab 共享插件实例，in-page 队列即覆盖两 Tab 场景；真机回归见 docs/testing/v0.2.md）
- [x] 🔴 **H02 响应式状态桥**（32/33.4；依赖 H01）：扫描、动作、设置/成员修改向全部 Tab 发布可响应快照；留在当前页操作，列表/计数立即更新，不靠切页重挂载。 ✅ 2026-10-02（发现并修复既有缺口：tab-panel 的 tick 从未被模板消费，扫描/动作完成当前页不刷新——改为 hubListeners → version prop 驱动各屏 $derived 重算；动作后 notifyHubChanged 免重扫刷新；设置保存/成员增删走 refreshHub 广播；真机走查待回归）
- [x] 🔴 **H03 未处理备忘保留**（26.7/33.3）：31 天前到期但未完成的备忘仍可找到；明确完成/删除状态、保留期与恢复路径，清理不按到期时间永久删未办项。 ✅ 2026-10-02（applyRuntime 纯化不再带副作用；未办备忘永不按到期删；done 备忘保留 30 天可恢复，purgeHandled 仅清已完成记录且随后落盘；物理删除仅经显式 removeMemo；单测覆盖）
- [ ] 🔴 **H04 分模块成功快照**（33.3；依赖 D01/D12）：接口失败、未建库、必需列缺失、坏单行分别报告；失败模块保留旧提醒及数据时间，成功模块继续更新，不能误报全部处理完。（2026-10-02 进度：失败保留旧快照及旧数据时间、禁用模块不发请求、**提醒规则依赖列缺失显式报错**（H04 第二轮补）均有单测；坏单行/未建库的逐类报告仍待细化——未建库目前由健康检查报告，扫描侧静默为空）
- [x] 🔴 **H05 完成按规则与发生次处理**（B4a；依赖 H01/H02）：oneoff 业务完成、recurring 本期记录与下一期、anniversary 当次已办分开；生日本期消失次年恢复，周期事项下一次出现，完成不等于永久 mute。 ✅ 2026-10-02（complete 按 Reminder.kind 分派：anniversary→handledYear 当年隐藏次年重现、recurring→handledUntil 本期隐藏下期自动重现、oneoff→handled 记录、备忘→doneAt；restore 一键清标记；旧缓存缺 kind 按 ruleKey 推断；单测覆盖。台账行 last_done 写回仍属 A5/H10，运行态语义已闭环）
- [x] 🔴 **H06 延后与备忘动作**（B4c/B4d；依赖 H01）：保留真实到期日，仅改变处理计划；延后日过 3 天正确分级，备忘 snooze/mute 真正生效并可恢复。 ✅ 2026-10-02（snooze 仍只写运行态不改台账 due；延后日已过按延后日距今分级为 overdue、当天为 soon，不再沿用原级别；snooze/mute 经 H01 队列生效且 restore/unmute 可恢复；单测覆盖）
- [x] 🔴 **H07 已处理与忽略恢复**（C3a/29；依赖 H05/H06）：显示真实处理记录，区分完成/忽略/延后；忽略→管理入口→恢复→正常列表的链路全通，不能用占位空态代替。 ✅ 2026-10-02（提醒页"已处理"筛选改为真实数据源 listHandled：完成/忽略/周年当年/周期本期/备忘五类条目，标题从派生列表回查、缺失给降级文案；恢复按钮清标记回活跃列表，备忘可显式删除；真机走查待回归）
- [ ] 🔴 **H08 生日身份与农历接线**（C5b/15）：从独立 lunar 列及 avItemId 读稳定 memberId；成员过滤能选中其生日；删除引用但保留库行后的生日处理策略写清。（2026-10-02 第三轮进度：修复农历读列错位（原读 birthday 复选框，写入在独立 lunar 列——农历生日此前从未生效）；memberId 按 avItemId 反查已接通，成员过滤可选中生日并有单测；"删除引用保留库行后生日仍提醒但不可被过滤"的策略说明待写进 03 文档）
- [ ] 🔴 **H09 日期/周年端到端矩阵**（33.3/30）：统一本地日历运算；验收 UTC+8 凌晨、DST、2027-03 查看 2/29 生日得 2028-02-29、同闰月有/无、小月与无效日期，覆盖录入/扫描/展示。（2026-10-02 进度：展示层两处 UTC 截断已修——台账日期单元格与备忘默认到期日改 localDateKey；写入/扫描层此前已是本地时区；完整矩阵待真机走查）
- [ ] 🔴 **H10 续期目标字段与历史**（B4b/A5；依赖 H01）：按 ruleKey 分派 expiry/due/next_pay；缴费操作不改保障到期日；历史 note 可查，失败保留输入且不提前销毁 Dialog。（2026-10-02 第二轮进度：按规则自身 field 分派写回（next_pay 规则写 next_pay，缴费不再改保障到期日）、失败保留 Dialog 与输入、续期流水记入 runtime.renewHistory 均已落地并有单测；流水查看 UI 待补，见 29 组新项）
- [ ] 🔴 **H11 扫描合并与生命周期**（20/33.5；依赖 H01/H04）：心跳/首开/手动/写后刷新合并，旧请求不得覆写新结果或禁用后的状态；卸载后在途请求不再落盘/通知/更新 UI。
- [x] 🔴 **H12 摘要与逾期通知契约**（B3a/B3b；依赖 H04/H11）：共用静默规则，23 点首开不弹、结束后按规则补发；同次扫描不重复轰炸；当天新增逾期与每日去重的粒度明确。 ✅ 2026-10-03 第五轮（inSilentHours 共用：摘要+逾期提示同规则；静默期不弹且不标记已发→结束后自然补发（单测）；摘要按日去重 lastNotifiedDate、逾期提示按日去重 lastOverdueAlertDate；真机通知路径验收见 H13）
- [ ] 🟡 **H13 通知与后台能力矩阵**（S6/B3c/18）：分开应用内消息、系统通知、后台/锁屏/退出/唤醒；各前端记录真实结果、点击落点和降级；不把前端 30min 心跳称 kernel 常驻或精确 08:00 执行。
- [ ] 🔴 **H14 状态与提前量策略**（33.3/16）：按模块/规则声明活跃及终态，落实行级>用户>默认提前量，校验 NaN/Infinity；明确 0/7 天与固定 7 天窗口关系，终态不误报。（2026-10-02 第二轮进度：leadFor 校验 NaN/Infinity/负数回退默认、clamp 3650 已落地并有单测；行级 remind_before 的表单录入与 provider 合并仍缺——certs capture 不含该列，见新待办）
- [x] 🟡 **H15 数值阈值规则**（6/9/16）：medicine/stock 无效期但低库存也提醒；定案 < 或 ≤、零/缺值、单位/小数、补货解除与再次触发，效期和库存为可解释的独立规则。 ✅ 2026-10-02 第三轮（NumericRuleSpec 声明进 schema+门禁（D11 类型检查）；定案 ≤ 触发、0 算有值、缺值不评估、补货到阈值之上扫描自动解除、终态行跳过；与效期规则独立并存（独立 provider）；同一行重复触发由 mute/恢复管理；单位/小数换算留 P06；单测覆盖全部边界）
- [ ] 🔴 **H14 状态与提前量策略**（33.3/16）：按模块/规则声明活跃及终态，落实行级>用户>默认提前量，校验 NaN/Infinity；明确 0/7 天与固定 7 天窗口关系，终态不误报。（2026-10-02 第二轮进度：leadFor 校验 NaN/Infinity/负数回退默认、clamp 3650 已落地并有单测；行级 remind_before 的表单录入与 provider 合并仍缺——certs capture 不含该列，见新待办）
- [x] 🟡 **H16 跨屏筛选作用域**（C2e/C3a/C3d；依赖 H02/H08）：成员、多成员 relation、公共事项、adhoc 在总览/提醒/统计/下钻的范围一致且可解释；删除成员后失效筛选复位，通知范围单独声明。（主体 ✅ 2026-10-02 第三轮：删除成员自动复位总览与提醒页失效筛选、提醒页成员/模块筛选与总览同语义，均有实现与单测层保障；完整跨屏一致性矩阵待真机走查后转 🔴 收口）

### 35.2 数据读写、建库与 schema 执行（D01–D12）

- [ ] 🔴 **D01 完整读取与扫描视图隔离**（A2b/21）：覆盖 0/200/201/1000 行、默认视图筛选/排序；分页与总数核对，扫描不因首页或用户视图漏事项，不完整读取进入诊断而非空成功。（2026-10-02 进度：primaryRowItemIDs 全量分页（200/页+100 页上限）、renderLedger 返回 complete 标记、providers 对不完整读取显式抛错进诊断，0/250/分页不收敛均有单测；render 单次是否全量、用户视图筛选的影响仍需真机核对——视图隔离语义未动）
- [ ] 🔴 **D02 新行身份可靠返回**（A2b；依赖真实 AV fixture）：不用前后集合差首项作为充分证据；验收并发新增、>200 行、索引延迟，正确返回各自 itemID；身份未确认显示已提交待确认，不诱导重复创建。（2026-10-02 进度：addDetachedRow 三路确认——响应携带 ID 优先、全量集合 diff 兜底、多候选抛 RowIdentityPendingError 不猜；快速表单遇 pending 显示"已提交待确认"并禁止自动重试防重复建行；单测覆盖响应优先/兜底/多候选/并存四路径；真实内核响应形态待实测）
- [ ] 🔴 **D03 快速保存可恢复**（C6b；依赖 D02）：有 saving 防双击；第 1/中间/最后字段失败保留输入及已建 itemID，重试补写同一行；全成功后才清空并提供保存并查看。（2026-10-02 进度：saving 防双击、逐字段失败保留输入与 itemID、重试补写同一行、全成功才清空均落地并有单测层保障；"保存并查看"入口未做，归 C6b）
- [ ] 🔴 **D04 成员主数据契约**（A4/24/33.2）：定案姓名/角色/生日/农历/稳定 ID 的来源、同步方向与冲突处理；清空 settings 后可恢复哪些字段需实证，不能仅凭库行保留宣称成员恢复。（2026-10-02 第二轮进度：同步方向已定案并实现——settings.members 为主数据引用、台账行为思源侧档案，写路径统一走 members DAL；"清空 settings 后可恢复"实证仍需真机）
- [x] 🔴 **D05 成员统一双写与补偿**（A4/33.4；依赖 D02/D04）：设置页与成员页走同一 DAL；avItemId 精确更新姓名/角色/生日/农历及清空；AV 失败可见可重试，改名/同名/无生日均不误写他人。 ✅ 2026-10-02 第二轮（syncMembersToAv 差异同步 + updateMember 精确写回；清空生日 isNotEmpty:false；失败记 syncError 卡片可见；无关联行补建；按 avItemId 写不按姓名——单测覆盖同名不误写；真机走查待回归）
- [x] 🔴 **D06 同名迁移与关联校验**（15/33.2；依赖 D01/D04）：唯一候选才自动回填；同名返回歧义供选择，不能静默共用行；已有 avItemId 也验证存在，重复运行迁移不新增成员。 ✅ 2026-10-02 第二轮（backfillMemberLinks 四态结果：唯一回填/同名歧义报告/无匹配/失效关联清除；已有关联也验证行存在；重复运行幂等——单测覆盖；歧义人工选择 UI 待补，见 33.2 新项）
- [x] 🔴 **D07 笔记本 ID 与错误分类**（33.2）：区分 ID/名称、关闭/删除/无权限/短暂网络错误；重命名或网络失败不新建 ID 名称笔记本，不把所有 getHPath 错误当文档被删。 ✅ 2026-10-02 第二轮（dbRefs.notebook 兼容 ID 与历史名称；ID 查不到落回默认名绝不拿 ID 建笔记本；关闭→openNotebook 恢复；瞬态（网络/响应异常）记录不重建，内核 not found 才重建——保守方向"宁可不重建"；单测覆盖。真实内核 not-found 消息形态待实测）
- [ ] 🔴 **D08 原库恢复与补列续跑**（A3/33.2；依赖 D07）：已有文档、删设置、中断建 AV、缺列/AV 被删分别复用原库；恢复 avId/keyID/关系/视图登记并补缺，重跑无双库且保留用户自改项。（2026-10-02 第二轮进度：已有文档复用+按 root_id 找回 av 块+补列续跑（只增不改）已落地并有单测；AV 被删的自愈重建、relation 目标与视图登记恢复待后续）
- [ ] 🔴 **D09 真正执行 capture**（C6a；依赖 D03）：按 capture 顺序/类型渲染并写入；至少覆盖药箱数量/位置、会员 cycle/next_pay、保险 insurer/premium、事务 due、证件附件；不支持字段显式说明，不静默省略。（2026-10-02 第二轮进度：快速表单改为 capture 列集驱动——按列类型渲染 text/number/date/select/relation/url/checkbox 并按类型写值，enum 标签 i18n 回退；asset/mAsset/mSelect 显式声明"到台账文档编辑"不静默省略；证件附件上传（文件选择器）待补）
- [ ] 🟡 **D10 默认视图契约落地**（A3c/17；依赖 D08）：schema 定义过滤/排序/分组并登记 viewID；证件按成员/到期视图实际生效，重复初始化不重复建视图、不覆盖用户修改；各布局先做版本能力探测。（2026-10-03 第十二轮检索：官方仓库未见公开的视图创建内核 API（数据库自动化 #10863 仍 open）——维持能力探测策略，视图落地随真机阶段按当时版本验证）
- [ ] 🟡 **D11 schema 类型/默认值门禁**（33.2/21）：检查重复 key、日期/周期/农历类型、关系目标及 capture 可编辑范围；默认状态显式声明，调整枚举顺序不改变新行状态；catalog/建库/provider 覆盖差异可查。（2026-10-03 第十轮进度：ColumnDef.default + 门禁"default 必须命中枚举"落地，certs=valid / medicine=inuse 显式声明，表单/示例数据消费 default ?? options[0]；重复 key/capture≤5/数值类型见 2026-10-02；日期/周期/农历类型检查、其余 13 个 status 模块的显式默认、catalog 差异可查待补）
- [ ] 🔴 **D12 真实健康诊断**（A6/33.5；依赖 D01/D07）：所有启用模块检测文档/AV/列类型/关系/读取完整性/待补偿；结果带检查时间与恢复步骤，登记存在不等于健康，未注册规则 provider 单独报缺口。（2026-10-02 进度：runHealthCheck 最小版落地——逐启用模块实际读取，报行数/读取完整性/缺列/错误，设置·关于区"深度健康检查"按钮；列类型/关系/待补偿检测与恢复步骤指引待后续）

### 35.3 疫苗程序与政策模板（V01–V05）

- [ ] 🔴 **V01 官方程序逐剂校核**（8；依赖官方原始附件）：以 2026 国家免疫程序为基准校核全表；纠正 A 群第 2 剂 7 月龄、A+C 第 1 剂 12 月龄及旧百白破数据，逐剂有来源对照，未核验前不宣称可用排期。
- [ ] 🔴 **V02 模板政策元数据**（8/21；依赖 V01）：记录来源、版本、生效/复核日期、地区、适用年龄/人群与方案选择；“0–6 岁 22 剂”不代表所有现行国家免疫范围，更新需要可审计差异。
- [ ] 🟡 **V03 推荐计划与实际接种分离**（8/16；依赖 V01/D04）：出生日期、前剂实际日期、最小间隔、已种/缺失/改期分开；只生成缺失计划，月末/闰年/非法生日可验证，替代方案不双套重复生成。
- [ ] 🟡 **V04 政策升级预览**（24；依赖 V02/V03）：模板升级展示未种计划的增/改/取消及理由；用户确认后应用，既往已种日期/批号/接种点和手动改期保留，重复迁移不重复创建。
- [ ] 🟡 **V05 青少年扩展与来源呈现**（8/22；依赖 V01–V04）：按 2026 程序评估 HPV 等适用人群扩展，明确本模板范围并由用户确认；显示官方来源/复核状态，不自行推导补种医疗方案。

### 35.4 发行、平台与能力声明（R01–R09）

- [ ] 🔴 **R01 tag 提交完整门禁**（23/33.5）：发行提交自身跑 check/test/build/smoke/体积，任一失败不创建正式 Release；不能以 main 另一次成功 CI 替代 tag 验证。
- [ ] 🟡 **R02 预发布通道与说明**（23）：alpha/beta/rc 自动 prerelease，稳定版才进入 Latest；Release 正文含最终能力边界、已知问题与迁移说明，不再空正文。
- [ ] 🟡 **R03 附件不可变与溯源**（23）：记录 tag/commit/环境/SHA256；同 tag 重跑不能静默替换已发布附件，main 文档变化不冒充发行包文档。
- [ ] 🟡 **R04 包内文档链接**（33.5）：逐条检查 zip 中双语 README 本地链接；目标存在或改为该 tag 仓库链接；思源展示页点击可用，仍遵守 09 产品决策 D12 不夹带设计/测试文档。
- [ ] 🟡 **R05 元数据完整一致性**（0/33.5）：核对 manifest URL 与实际仓库、author/license/版本/UI/tag/CHANGELOG；故意制造不一致能被门禁拒绝；check/smoke 命令说明准确，纠正 check-meta 将 disabledInPublish 称为集市开关的提示。
- [ ] 🔴 **R06 功能声明证据矩阵**（33.1/33.5）：修正行即块双链、零配置共享、系统通知、强制证件后四位、自动恢复等过宽承诺；每项区分已实现/自动验证/实测/规划并指向证据，筛选或遮盖不宣称权限隔离。（2026-10-03 第二十轮进度：**"行即块双链"首处修正落地**——英文 README 替换为原生数据库表述、MODULES.md 同步修正（detached 行非块，Spike R1 实测）；余项（零配置共享/系统通知/强制脱敏/自动恢复）逐条证据链待续）
- [ ] 🟡 **R07 家庭使用可行性 Spike**（13/28；先研究后决定实现）：区分同账号多设备、同工作空间多人、只读发布、独立账号协作；验证读写权限、relations、settings/runtime、撤销共享与并发冲突，再定共享方案。
- [ ] 🟡 **R08 多前端入口与导航**（28/33.5；依赖 H13）：desktop/desktop-window/browser-desktop/browser-mobile/mobile 在实际版本验证面板、Dialog、文档定位、权限和降级；声明支持须有结果，不能只凭 SDK 类型。
- [ ] 🟡 **R09 CI 与加载预算复核**（20/23）：入口/首次加载依赖/全部 chunk/农历场景/zip 分层计量；复核 action runtime/runner 镜像更新与 pnpm 单一版本源，记录 Windows/Linux 打包差异，不能只测入口即宣称总包达标。

### 35.5 业务场景深化候选（P01–P12）

- [ ] 🟡 **P01 周期基准规格**（chores/memberships；依赖 H05/H09）：参考 Todoist/Homechart 区分原计划日/实际完成日，定案提前/迟办、跳过一期、终止日及跨月锚点；遵守 D6，若调整则另记决策后实现。
- [ ] 🟡 **P02 物品维护闭环**（assets-real/house/vehicles；依赖 D05/D08/H05）：参考 Homechart，让维护事项引用物品、显示最近处理/下次计划与历史；物品处置后停止维护提醒，引用缺失有说明。
- [ ] 🟡 **P03 采购执行清单**（stock/shopping；依赖 H15/D03）：在已有低库存建议上增加需买/已买、地点分组与已勾项沉底；同一需求不反复入清单，实际收货确认后才补库存。
- [ ] 🟡 **P04 周餐单到采购**（food/stock；依赖 P03/D09）：参考 Cozi，将已选菜谱组成周餐单，预览汇总食材及已有库存；用户确认数量/单位后添加缺口，不能只靠自由文本自动扣库存。
- [ ] 🟡 **P05 采购模板复用**（shopping；依赖 P03）：常购品、开学/节日/应急采购清单可复制到本次；模板与执行状态分离，复用不继承上次已购状态，不重复复制已存在需求。
- [ ] 🟡 **P06 库存批次与单位**（stock/medicine；依赖 H15/D09）：同商品分批效期/开封日期/数量单位可辨；按批次处理耗用/丢弃，不合并不同单位；阈值总量与到期批次分别解释，不扩展药量建议。
- [ ] 🟡 **P07 收纳容器与 QR 落点**（assets-real；依赖 D02/P12）：在已有 QR 生成/打印待办上补容器→内容物层级、移动记录和扫码落点；独立行没有块深链时明确方案，重命名/搬家不使标签失效。
- [ ] 🟡 **P08 家庭角色与可见范围规格**（13；依赖 R07）：分开信息关联成员、负责办理者、访问授权者；证件/健康/金额的共享范围有部署依据，同屏成员 chips 仅作筛选，先定权限能力再设计协作 UI。
- [ ] 🟢 **P09 用药计划/记录边界研究**（medicine/health；依赖 H13/P06）：参考 Apple taken/skipped，区分药品库存、用户给定计划与实际记录；评价时区/漏记/库存联动与提醒能力，暂不实施自动用药或补服建议。
- [ ] 🟡 **P10 打包清单复用与撤销**（travel-packing；依赖 D03）：参考家庭清单，模板→本次清单保留必带/数量/负责人，支持已装/未装与撤销；行李归属、多次旅行执行状态独立，不覆盖模板。
- [ ] 🟢 **P11 跨库日历呈现可行性**（17；依赖 D10/H05/H09）：先验证单库原生日历，再比较跨模块聚合、adhoc、重复发生次与农历的承载方式；不能假定一个原生 AV 日历自动汇总 31 库，也不要求用户二次录入。
- [ ] 🟢 **P12 独立行/绑定块/聚合 Spike**（R5/17；依赖 D02）：按实际思源版本验证创建、绑定/解绑、引用/定位/QR、relation/rollup 方向及删除撤销；明确 remove 行与 delete 底层块的差异，不为统计假定单向关系已有反向聚合。

### 35.6 面向真实失败的验收与测试（T01–T06）

- [ ] 🔴 **T01 动作与保存故障回归**（21；依赖 H01/D03/D05）：覆盖动作→内存→扫描→落盘、双击、并发、逐字段失败、成员双写中断；以结果不丢/不重复/不误写断言，不能只复刻函数内部步骤。
- [ ] 🔴 **T02 扫描与日期反例矩阵**（21；依赖 H04/H08/H09/H14）：加入 provider 身份/农历、跨闰年/同闰月、终态、行级提前量、分页/过滤、坏行及单模块失败保留快照的真实反例。
- [ ] 🟡 **T03 真实附件安装与升级**（D1/D6；依赖 R01/D08）：用 GitHub tag 附件而非开发链接，记录版本/hash/前端/截图；首次安装、alpha→0.2、重复安装、卸载重装与误删恢复逐项验收，失败写已知问题。
- [ ] 🟡 **T04 备份恢复演练**（24；依赖 D04/D08）：验证台账/AV/附件/relation/settings/runtime 的覆盖范围，恢复后逐字段核对；插件设置导出与思源工作空间备份区别写清，不能只写备份原则。
- [ ] 🟡 **T05 核心模块 ready 出口**（33.1/31）：certs/members/medicine 等逐个验证录入→提醒→处理→重启→恢复；维护能力矩阵和证据，再晋升 ready；默认启用项优先，31 schema 完成不批量认证可用。
- [ ] 🟡 **T06 可复现脱敏反馈**（31/33.5；依赖 D12/R08）：反馈包含 tag/hash/思源版本/前端、端点错误分类、最近成功/失败扫描与复现步骤；导出前可预览脱敏，异常详情不包含证件号/健康备注/token。

## 36. 功能与完整使用流程扩充（F01–F20，只规划）

> 本组 20 项。细化原第 17/24/32/33 组流程；从开始使用、录入、处理到恢复分别验收。依据与来源见 [多角度调研报告](docs/research/2026-10-02-多角度扩充与小驴系列联动调研.md)。

- [ ] 🟡 **F01 按目标开始使用**（依赖 D05/D08/D09；按 T05 能力矩阵选择可用场景）：个人证件、照护老人、家庭物品、学习备考给出最小起步路径；区分家庭角色选择与真实成员创建，完成后落到所选场景，后续模块可逐步开启。
- [ ] 🟡 **F02 保存后的结果闭环**（依赖 D03/H14/H16）：显示保存到哪个模块/成员、打开这条记录的入口及是否产生提醒；被当前筛选隐藏或缺提醒条件须解释，保留原筛选，避免用户因没看到而重复新增。
- [ ] 🟡 **F03 连续录入**（依赖 D03/D09/UI04/UI06）：定义“保存并继续”及逐字段继承规则，仅记住用户选择的上下文；连续录三条不沿用唯一编号，成功焦点回名称，失败保留本条并停止继续。
- [ ] 🟡 **F04 筛选范围解释与退出**（依赖 H04/H16/D01；细化旧第 17 组命名视图/筛选清除）：显示生效条件和结果数，区分未录入、筛选无结果与读取失败；命名视图也有清除入口，解除一个条件不清空其他条件。
- [ ] 🟡 **F05 跨入口下钻与返回**（依赖 H02/H16/R08/UI13；细化统计卡下钻与第 26.7 组返回上下文）：模块卡、成员卡、提醒、命令和文档入口保留来源上下文；返回恢复筛选/滚动/焦点，键盘与点击选中同一模块，定位文档后可继续原处理队列。
- [ ] 🟡 **F06 内核不可达时的继续路径**（依赖 D02/D03/H04/H11/D12）：按真实端点状态展示缓存时间和可读/可写能力；保留草稿与已提交待确认 itemID，恢复只补未完成步骤，不用 navigator.onLine 单独判定可保存。
- [ ] 🟡 **F07 单模块诊断到局部修复**（依赖 D08/D12/F05）：修复前说明目标与影响，仅重试失败模块/步骤；完成后返回原位置，不无提示地初始化所有启用库，其他成功状态及用户改动保留。
- [ ] 🟡 **F08 误操作恢复规格**（依赖 H05/H07/D03/P12）：分别声明忽略/延后、业务完成、值修改、移除行的恢复范围；撤销不覆盖后来编辑，不可撤销项先确认，插件恢复与思源全局撤销区别说明。
- [ ] 🟡 **F09 接管现有原生台账**（依赖 D08/D10/D11）：研究用户已有 AV 的模块/成员/列映射，接管前预览类型差异、需补列及提醒效果；不靠同名认库，不覆盖用户视图，取消不改原库，重复确认不复制记录。
- [ ] 🟡 **F10 备忘转正式记录**（依赖 H03/H07/D02/D03/D09）：用户选模块后预览字段映射和提醒变化；保留来源与目标身份，目标保存确认前保留原备忘，重复点击返回同一目标，避免两条提醒同时有效。
- [ ] 🟢 **F11 多行资料录入预览**（依赖 D03/D09/UI14）：粘贴清单后逐行确认字段、成员、日期与冲突；不确定内容保留原文供修改，成功/失败逐条回执，可补失败项，不用推测替用户静默写入。
- [ ] 🟡 **F12 复制为新条目**（依赖 D02/D09/D11）：明确哪些描述可复用、哪些身份/编号/状态/发生日期须重填；复制有预览，新旧行身份独立，完成与提醒历史不继承，支持同款资产而不误合并。
- [ ] 🟡 **F13 解释为什么提醒**（依赖 H09/H14/H15；细化旧第 17 组日期/双日期与规则解释）：每条可查源记录、规则、真实到期/阈值、采用的提前量与状态；区分处理计划日和业务到期日，调整后可预览影响，不以颜色替代解释。
- [ ] 🟡 **F14 从提醒到办妥的材料流程**（依赖 H05/H10/D09；MD02 为证件扩展条件）：把预约、材料准备、提交、取得凭证与业务完成串起来；打开入口或提交申请不算续期完成，新凭证保存后才按所选规则关闭本次事项。
- [ ] 🟢 **F15 一次事项的关联包**（依赖 D09/H16）：研究旅行、开学、搬家、就诊的关联汇总与下一步入口，先定事项身份/生命周期；引用现有记录，不复制第二套台账，移除关联不删除原始凭证。
- [ ] 🟡 **F16 收货分项转资产/库存/许可**（依赖 MD10/D02/D03/P03）：预览分项数量及目标，保存来源—目标映射；重复操作返回既有目标，部分失败补写同一条；退货后相关库存/资产处置须用户确认。
- [ ] 🟡 **F17 搬家变更核对**（依赖 MD18/MD21/D03）：列出地址、服务账户、物品位置及需人工核对的联系资料，逐项确认；保留旧地址和历史订单凭证，失败可续跑，不因改当前地址改写历史。
- [ ] 🟡 **F18 退出服务收尾**（依赖 MD11/MD12/MD21/H14）：核对取消确认、权益截止、押金/未结事项和凭证；停止提醒、服务结束与经济事项办妥分别确认，保留退出记录与重新打开路径。
- [ ] 🟡 **F19 出发前离线资料核对**（依赖 MD27/MD28/MD29/R08/T04）：检查本次行程和必要附件在目标设备能否打开，展示快照时间及缺件；先验证思源本机能力，再决定导出方案，离线承诺有设备与版本证据。
- [ ] 🟢 **F20 定期人工回顾入口**（依赖 H07/H14/D12）：提供待处理、待核对资料、未再使用模块及旧地址等回顾清单；逐项选择更新/保留/退出，缺失不等于过期，不自动删除未办事项或历史资料。

## 37. 性能与资源使用深化（PF01–PF20，只规划）

> 本组 20 项，细化原第 20 组。先测量后定预算；样本行数不构成容量承诺。分页、虚拟化、Worker、缓存与批量接口按证据选择，不预设技术方案。

- [ ] 🔴 **PF01 性能测量协议与规模分层**（依赖 D01/R08；承接旧第 20 组预算条目 TODO:121）：记录版本、前端、设备、模块数、行数和冷暖缓存；用空库/家庭样本/200/201/1000 行拆分请求、计算、渲染、落盘，实测后修订 05 的历史预算。（2026-10-03 第三十四轮进度：**performance.mark/measure 基线打点落地**——refreshHub 首尾标记 seq，DevTools Performance 面板可直接读取；真实测量数据需实例+样本）
- [ ] 🟡 **PF02 操作级响应测量**（依赖 PF01/H02；PF01 的操作级细化）：测首开、切模块、筛选、输入、提交和展开成员；分别计首次可见反馈与业务完成，记录插件 operation timing 与宿主页面 INP，二者不互相替代。
- [ ] 🟡 **PF03 首屏与维护工作调度**（依赖 PF01/H02/H04；D08 仅作为恢复场景）：先展示可响应且标明时间的缓存；建库检查/刷新/预取按实测排顺序，慢内核时仍可导航和输入，首屏不等所有库串行初始化。
- [ ] 🟡 **PF04 请求前裁剪 provider**（依赖 H11/H04/D11；D12 提供诊断验收）：按模块 freshness contract 判断禁用、无该类规则或缓存仍有效者，在 collect 前裁剪；关闭模块后其扫描请求为零，缺 provider/缺库仍有诊断，不将未读冒充健康成功。
- [ ] 🟡 **PF05 有界并发与读重试**（依赖 PF01/H11）：测不同请求并发对扫描及宿主编辑影响，定容量/退避/最长等待；合并重复读，慢模块不占满请求池，不自动重试身份未确认的新增写入。
- [ ] 🟡 **PF06 按变更增量刷新**（依赖 H01/H11/D01）：写一行优先刷新受影响模块及统计，外部变更合并触发，未知变更保留全量核对；单行保存不读所有库，最终结果与全量扫描一致。（2026-10-03 第十三轮进度：runScan 增 only 集——范围外沿用旧快照与数据时间、摘要/逾期提示仅全量评估（少报不压制当天提醒）；台账写行/删行/续期已接单模块增量，附件与常用语写入不触发扫描；"外部变更合并触发"待 ws 事件调研，一致性对照待 PF01 测量）
- [ ] 🟡 **PF07 过时读取取消与超时**（依赖 H11/D01）：核对 transport 取消能力，无法取消则丢弃过时结果；快速 A→B 时 A 不覆盖 B，取消与失败分开，有重试入口，不宣称客户端取消能撤回已提交写入。
- [ ] 🟡 **PF08 多字段批量写语义测量**（依赖 D02/D03/D11/PF01）：验证宿主批量写接口的版本及部分失败语义，比较同一行逐列/批量请求成本；降请求数仍不缺字段，失败可补同一 itemID，不假定批量具有原子性。
- [ ] 🟡 **PF09 序列化与无变化落盘**（依赖 H01/PF01）：分别测 cache、筛选偏好、通知标记的序列化与写入量；减少无变化全对象保存，筛选大量提醒不阻塞，必要修改即时持久化，重开后偏好和动作保留。（2026-10-03 第十轮进度：saveRuntime 序列化比对——无变化跳过落盘，已落地；逐类写入量测量仍属 PF01 测量协议）
- [ ] 🟡 **PF10 按快照复用派生索引**（依赖 H02/H16/PF01）：验证成员关联、计数、级别分组的热点，按快照版本失效；展开多个成员不反复全量 filter/find，结果一致，索引不随会话无限增长。
- [ ] 🟡 **PF11 大列表呈现比较**（依赖 D01/PF01/UI02；UI14 仅作为跨页选择场景扩展；细化旧第 17 组 >200 行与第 20 组 1000 行目标）：测原生表格、分页、渐进渲染、虚拟列表的 DOM 与操作表现；总数明确，跨页筛选/选择不漏行，键盘/读屏可知位置，不按 200 行机械选虚拟化。
- [ ] 🟡 **PF12 长会话资源回收**（依赖 H11/PF01）：反复开关面板/弹窗、扫描及启停插件，记录可归因的 listener/timer/请求/DOM/heap；关闭后无遗留可触发回调，区别宿主缓存，不只比较一次总内存。
- [ ] 🟡 **PF13 可见性与恢复事件合并**（依赖 H11/PF01；H13 仅用于通知能力分支）：区分窗口隐藏、内部 Tab 隐藏与前端退出，暂停无用重绘/预取；唤醒与数据变更合并，长期后台恢复不集中多轮补扫，必要提醒按真实后台能力执行。
- [ ] 🟡 **PF14 懒加载资源失败恢复**（依赖 H04/R09/PF01）：测农历 chunk 首次/再次成本，失败给局部状态及可恢复重试；一次拒绝 Promise 不阻断到重启，恢复后能再加载，普通导航和证件模块仍可用。
- [ ] 🟡 **PF15 附件与图片成本分层**（依赖 PF01；R08 作为跨前端扩展条件；扩展旧附件缩略图懒加载项）：分测文件元数据、缩略图、原图/PDF打开的内存与加载量；列表先按需取可见缩略图，失败和原件缺失可辨，退出预览释放资源，不预载全部附件。
- [ ] 🟡 **PF16 汇总计算范围与精度**（依赖 PF01/D01/D11/H16）：测成员/模块/时间范围变化的聚合成本，声明统计口径及数据时间；只算所需范围，未完整读取不显示完整总额，金额/小数计算不能为提速丢精度。
- [ ] 🟡 **PF17 搜索查询节奏与索引收益**（依赖 PF01/D09/UI04）：比较本地索引、按范围查源及输入合并的成本；中文组合输入不发无用请求，旧查询不覆盖新结果，说明搜索当前加载数据还是全部匹配数据。
- [ ] 🟢 **PF18 模块资源加载与预取收益**（依赖 PF01/R09；与已完成农历动态拆包区分）：分测 schema、专属逻辑、图标与面板加载，按收益决定拆包/预取；未启用模块不强载重资源，避免过多小请求，记录冷开和再次打开的总成本。
- [ ] 🟡 **PF19 内部事件/快照载荷与队列上限**（依赖 PF01/D01；跨插件场景另依 EC02/EC08）：定事件/快照分页、大小、订阅频率及待处理队列的界限；大批历史数据分段有进度，过量/截断可见，重连不一次灌满 UI，不无限缓存原始业务全文。
- [ ] 🟡 **PF20 可复现性能基线与回归判定**（依赖 PF01/PF02/Q08；由 Q08 的复现实测提供数据）：保存样本生成方式、环境、测量脚本规格与波动范围；在相同场景比较后续版本，报告最慢路径和收益，按实测设告警线，不以一次最佳值承诺所有设备。

## 38. UI 与交互深化（UI01–UI24，只规划）

> 本组 24 项，细化原第 13/15/17/32/33.4 组；依据 W3C APG/表单教程、WCAG 解释及中文输入实际行为。逐场景验证，不由添加 ARIA 属性推定全部无障碍达标。

- [ ] 🟡 **UI01 页签焦点与激活策略**（依赖 H02/PF02；细化第 33.4 组无障碍契约）：选普通导航或完整 tabs 契约，说明选中态/面板关系/方向键；按加载延迟选择手动或自动激活，键盘移焦不反复启动扫描。
- [ ] 🟡 **UI02 表格语义与行操作**（依赖 D09/D11；细化第 33.4 组无障碍契约）：静态展示用原生 table 与语义详情按钮，需要网格编辑再定义 grid 行为；列头/行身份可读，行内按钮不误触整行，键盘可进入详情。
- [ ] 🟡 **UI03 单元格编辑模式**（依赖 D03/D09/UI02）：定义进入、提交、取消、失焦及移动下一格；编辑时方向键服务光标/选项，Esc 恢复原值，失败留原格，Enter/Tab 不静默修改邻格。
- [ ] 🟡 **UI04 中文输入法组合态**（依赖 D09/UI03）：搜索/表单/网格的 Enter、Esc、快捷键识别 composition；拼音、五笔和移动键盘候选确认不提前保存、关闭或提交搜索，兼容策略按实际 WebView 验证。
- [ ] 🔴 **UI05 字段错误与可恢复提交**（依赖 D03/D05/D09；细化第 33.4 组表单契约）：必填/格式/关系错误显示字段旁说明和可跳转摘要，label 与错误关联；空名称、无 avItemId 成员、非法日期均保留输入，有明确纠正位置。
- [ ] 🔴 **UI06 切模块草稿隔离**（依赖 D03/D09/H02）：A 未保存切 B 可留存/丢弃，按模块隔离草稿并重算默认值；A→B→A 的内容可解释，不把 A 的日期、分类或 URL 写到 B。
- [ ] 🟡 **UI07 空值、零与输入格式**（依赖 D09/D11/UI03）：字段定义精度/单位/inputmode/清空行为，编号保持文本；0、0.5、12.34 与缺值正确区分，证件前导零保留，清空不自动变 0。
- [ ] 🟡 **UI08 行消失后的焦点与播报**（依赖 H02/H05/H07；细化第 33.4 组 aria-live/焦点契约）：完成/忽略/移除后焦点落到下一合理目标，失败保留操作位置；成功和计数变化简短播报，连续键盘处理不回到页顶或读整表。
- [ ] 🔴 **UI09 触屏、键盘、鼠标动作等价**（依赖 H02）：核对 CSS 级联及设备条件，宽屏触摸、窄屏键盘、触摸笔都有可发现操作；完成/延后/定位不只依赖 hover，目标不挤压，重验第 26.7 组。
- [ ] 🟡 **UI10 软键盘与可见视口**（依赖 R08/UI05）：实机验证竖横屏、旋转、分屏和软键盘；输入/提交可滚动到达，关闭后位置恢复，依据测试选择 CSS 或 visualViewport，焦点不被宿主遮挡。
- [ ] 🟡 **UI11 高对比与宿主主题**（依赖 UI01/UI02；细化第 33.4 组无障碍契约）：forced-colors 与代表性明暗主题下检验边界、选中、焦点、禁用、紧急程度；失去阴影/渐变仍可辨，不强制关闭系统配色，不只靠颜色表达状态。
- [ ] 🟡 **UI12 大字体与长内容重排**（依赖 R08/D09；细化第 33.4 组响应矩阵）：检查 200% 文字放大及适用前端 400% 缩放，长姓名/英文按钮/URL不遮动作；截断值可用键盘/触摸看全文，表格横滚与页面纵滚边界明确。
- [ ] 🟡 **UI13 刷新后保持工作位置**（依赖 H02/H11/UI02；PF11 仅在采用分页/虚拟列表时扩展验证）：用稳定行身份保存滚动锚点和焦点，编辑时刷新不突然移行；新增/重排有提示，在列表中部保存或刷新后仍可接着处理。
- [ ] 🟡 **UI14 批量选择范围与部分结果**（依赖 H05/D01/D03/UI02；细化旧第 17 组批量操作）：明确当前页/已加载/全部匹配，显示选择数与不可操作项；跨筛选分页规则一致，部分失败可单独补处理，成功项不重复提交。
- [ ] 🟡 **UI15 基础与进阶字段分层**（依赖 D09/T05）：常用字段先呈现，专属进阶入口可发现且标用途；未实现能力有明确状态，31 模块不一屏堆全，查看高级项不丢基础输入。
- [ ] 🟡 **UI16 空态、加载、失败、陈旧态**（依赖 H04/D12；细化第 32 组加载态与第 33.4 组真实接线）：区分无记录、筛选为空、缺库、无权限、部分失败和旧快照；每态有针对性的下一步，刷新失败不显示“全办完”，骨架屏不覆盖仍可用内容。
- [ ] 🟡 **UI17 信息层级与处理负担**（依赖 H14/H16）：总览优先呈现需处理、待确认、下次计划及数据健康，状态含文字；研究按成员/事项聚合而保留展开明细，普通到期不全部用高危视觉催促。
- [ ] 🟡 **UI18 日期呈现与语义一致**（依赖 H09/H14；MD27 为行程场景扩展）：绝对日期与相对天数可互查，区分当地日期/时区/业务截止/延后；未知或无效值不算逾期，跨午夜/农历/全年龄显示口径一致。
- [ ] 🟡 **UI19 单位、币种与总数标注**（依赖 D11；P06/MD24 为模块接入扩展）：数量/金额/次数/里程显示单位和范围，混币种不直接总计；缺换算给可核对状态，0 有明确值，不把记录数当实物数量或事件次数。
- [ ] 🟡 **UI20 附件与复制反馈**（依赖 D09；绑定原块/真实附件定位再依 P12，跨端交接另依 R08）：文件名/类型/缺失/打开方式清楚，复制区分字段值与整条资料；成功/失败可感知，超长文本可预览，复制敏感内容按用户选定范围处理。
- [ ] 🟡 **UI21 确认对话框表达实际影响**（依赖 D03；撤销/原块/退出服务/批量分支再依 F08/P12/33.4）：移除行、删除原块、退出服务和批量操作分别说明目标/影响/恢复范围；确认按钮有动作名，焦点默认合理，失败后可继续原流程。
- [ ] 🟢 **UI22 分享、打印与交接预览**（依赖 R06/D09；分享/照护交接另依 R07）：用户选成员/模块/字段/附件范围，默认最少信息并可核对脱敏结果；预览与导出一致，说明复制后的控制边界，不将界面遮盖宣传成访问权限。
- [ ] 🟢 **UI23 照护交接的任务视图**（依赖 R07/P08/UI22）：研究临时照护场景所需事实/任务/联系人和有效期，由用户逐项选择；先验证部署权限，接收者能知更新时间/负责者，撤销共享的实际能力写清。
- [ ] 🟢 **UI24 趋势图的可读替代与动效**（依赖 PF16/D09）：健康/库存/媒体图表配同口径表格、来源和时间范围，缺测点不自动补成真实值；缩放/键盘可查细节，减少动效偏好下无必要动画。

## 39. 31 模块深化与场景边界（MD01–MD31，只规划）

> 每个模块先定义身份、来源、历史、完成和提醒边界，再决定 UI。以下是候选能力，不表示 schema 已可用；外部产品只作为模型研究来源，具体来源索引见调研报告。

- [ ] 🟡 **MD01 members 成员偏好与尺码有效期**（依赖 D04/D05）：尺码、忌口、偏好带记录日期和人工来源，旧值可查；购物/餐饮引用时显示采用哪次档案，不覆盖健康原始记录。
- [ ] 🟡 **MD02 certs 办证材料档案**（依赖 D03/D09/H05）：保存地区、官方入口、核对日、材料和凭证；预约、提交、取得分开记录，未取得新证不自动完成续期。
- [ ] 🟡 **MD03 health 一次就诊归组**（依赖 D04/D09）：报告、处方、复诊安排和原始附件归同次就诊，补充报告不另造就诊；只记录用户资料，不推导诊断或用药建议。
- [ ] 🟡 **MD04 social 缴费归属核对**（依赖 D09/D11）：区分实际缴费日、账单归属月、地区和险种；政策参数有来源版本，晚缴不直接判漏缴。
- [ ] 🟡 **MD05 insurance 保单角色分离**（依赖 D04/D09/H16）：投保人、被保险人、受益人分开且支持一单多人；角色变更保留批单，成员筛选显示依据。
- [ ] 🟡 **MD06 exams 考试一轮档案**（依赖 D09/H05/H14）：报名、缴费、准考证、考试、成绩、证书分阶段；重考保留旧轮次，完成考试不自动判通过。
- [ ] 🟡 **MD07 pets 宠物稳定身份**（依赖 D04/D09）：种类、出生信息、照护人独立于家庭角色；就诊/接种/驱虫凭证按稳定宠物身份关联，不因同名混用。
- [ ] 🟡 **MD08 assets-real 同款与单件资产**（依赖 D02/D09/P12）：数量型物品和序列号单件分开；照片、保修、状态按单件维护，拆分/合并先预览。
- [ ] 🟢 **MD09 assets-virtual 授权档案**（依赖 D09/D11）：软件许可、域名等记录授权对象、席位、期限和管理入口位置；永久授权与续费分开，交接可追溯，不保存密码。
- [ ] 🟡 **MD10 shopping 订单分项收退**（依赖 D03/P03）：订单含商品分项，部分收货/退货/凭证逐项记录；转库存/资产按分项，不能把部分退货变整单退款。
- [ ] 🟡 **MD11 memberships 取消与权益截止**（依赖 H05/H10/H14）：取消意向、已提交、平台确认、服务截止分开；确认凭证可查，取消意向不清空仍有效权益。
- [ ] 🟡 **MD12 contracts 合同版本链**（依赖 D09/D11）：原合同、补充协议、续签版关联；当前版和历史附件可查，改摘要不静默改旧版日期。
- [ ] 🟡 **MD13 medicine 包装与批次**（依赖 D09/P06）：名称、规格、剂型、厂家及说明书来源来自人工/原件；同名不同规格不合并，不生成用量建议。
- [ ] 🟡 **MD14 stock 盘点调整凭据**（依赖 D03/P06/H15）：保存账面量、实量、差额、原因和时间；支持冲销，耗用/损坏/盘点与采购分别解释。
- [ ] 🟡 **MD15 favors 礼仪事件归组**（依赖 D09/D11）：事件主档关联多笔收送记录及参与人；退回引用原记录，统计区分事件数、记录数和金额，避免双算。
- [ ] 🟡 **MD16 chores 家务凭据与耗材**（依赖 H05/P01/P06）：执行可附日期、备注、照片和耗材；扣库存前预览，撤销执行能撤销关联耗用并保留更正。
- [ ] 🟡 **MD17 food 菜谱份数与换算**（依赖 P04/P06）：保存基准份数，人数变化先预览倍数；不可换算单位要求确认，一周多次使用不能重复抵扣同份库存。
- [ ] 🟡 **MD18 address 地址用途与版本**（依赖 D09/D11）：住址、收货、登记地址分别关联成员和生效区间；改址保留旧版，订单历史保留当时地址。
- [ ] 🟡 **MD19 bookmarks 办事网址适用信息**（依赖 D09）：记录地区、用途、适用对象、登录要求和人工核对日；能访问不等于业务仍适用，过期由用户更新。
- [ ] 🟢 **MD20 snippets 常用语时效**（依赖 D09）：记录适用成员/场景、版本、失效日；失效片段退出常用入口但可恢复，历史使用不因更新改写。
- [ ] 🟡 **MD21 house 多住处与服务归属**（依赖 D09/P02）：物业、水电、维护分别关联房屋/地址和账户；旧住处历史保留，退出事项不靠隐藏代替。
- [ ] 🟡 **MD22 parenting 成长原始记录**（依赖 D04/D09）：测量值带日期、单位、来源、附件和修正历史；照片/里程碑不当测量值，曲线只用明确可用记录。
- [ ] 🟡 **MD23 schooling 课时执行台账**（依赖 D09/H05）：购入课时、上课、请假、取消、补课、退款分开；用户规则决定是否扣课时，结余可追溯到各次记录。
- [ ] 🟡 **MD24 allowance 多账户结余**（依赖 D09/D11）：现金/储蓄期初值明确，内部转账关联转出转入不双算；支持冲销，0 元与缺值分开。
- [ ] 🟡 **MD25 vehicles 日期与里程维护**（依赖 H15/P02/H05）：用户配置日期/里程触发组合，完成关联实际值；修正历史不覆盖最新，不估算实时行驶。
- [ ] 🟢 **MD26 transit 卡与权益期限**（依赖 D09/H14）：卡片、月票、年审分开；充值不延长年审，补卡关联旧卡，挂失/更换处理可查。
- [ ] 🟡 **MD27 travel-plan 行程段时区**（依赖 H09/D09）：保存出发/到达地点和各自时区，跨日和全天标记正确，显示当地时间，不凭设备时区改业务日期。
- [ ] 🟡 **MD28 travel-booking 订单变更链**（依赖 D09/MD27）：预订关联旅客、行程段和当前凭证；改签/退订保留旧版，取消凭证不列为待使用，附件指向对应段。
- [ ] 🟡 **MD29 travel-packing 装包归还**（依赖 P10/P06/P07）：装包只改变本次携带状态，不自动扣库存；返还与耗用分开确认，下次旅行不继承旧状态。
- [ ] 🟢 **MD30 travel-log 行后复盘**（依赖 MD27/MD28/D09）：日志引用计划与实际到访/取消/变更，计划时间不冒充实际时间，重复复盘不建重复足迹。
- [ ] 🟡 **MD31 media 弃看暂停重读**（依赖 D09/D11）：除想看/在看/完成外支持暂停、放弃；每次读看起止日和进度保留，完成次数与作品数分开，撤销可恢复。

## 40. 小驴系列插件联动（EC01–EC30，只规划）

> 六个邻近项目均有源码，但“存在入口”不等于“已完成互测”。先做身份、运输、授权、所有权和幂等，再做场景联动；管家 `kernel.ts` 当前仅生命周期日志，05 中 `home.*` 全为规划。雷切是实际品牌名，旧文档“快切”仅作历史称呼。本组拆解并承接旧生态条目（约 133–135、155、167、188、201–203、208、309–314、323、355），不把同一实现重复算作独立完成。

- [x] 🔴 **EC01 六插件身份清单**：登记 manifest ID、显示名、版本、协议/能力版本、最低思源版本、状态和源码证据；不能把声明当联动验收。 ✅ 2026-10-03 第二十二轮（本地六兄弟仓 plugin.json 全量登记 + src/ 能力面 grep 实证：**window.LvContacts.searchPeople/recordInteraction、registerQuickAction、registerHomeModule、occasions.read/complete、lv-exam 事件总线均真实存在**——EC13/16/17/12 前置假设从想象契约升级为源码证据；清单见 docs/research/2026-10-03-EC01-六插件身份清单.md；互测验收仍属 EC30）
- [ ] 🔴 **EC02 运输边界矩阵**：分别实测同窗口 `window.*`、宿主事件、同 Kernel RPC/通知、多窗口、独立设备；broadcast 只表示通知，收到后重新读源数据。
- [ ] 🔴 **EC03 就绪与版本协商**：区分协议标识/协议版本/插件版本，覆盖未安装、未启用、未初始化、不兼容、无权限、失败和 ready；按 capability 探测方法。
- [ ] 🔴 **EC04 最小授权模型**：按插件、读写动作、模块或成员选择范围；拒绝/撤销后停止消费；设置开关不宣传为恶意插件隔离沙箱。
- [ ] 🔴 **EC05 跨插件 ID 映射**：定义成员、联系人 docId/itemId、台账 itemID、习惯 itemId、题库/牌组/计划 ID 的映射；不按同名自动绑定，缺失显示快照并可重选。
- [ ] 🔴 **EC06 事件幂等与回执**：规定 `home:` 等 source/externalRef 命名空间、发生时刻、原始幂等键、逐项结果和墓碑；重试不换键、不新增重复行。
- [ ] 🔴 **EC07 回路与生命周期**：定义主数据所有者、来源标记、订阅/注销回调；重复事件不互相回写，按真实函数 disposer 验证禁用/重载/切换无悬挂。
- [ ] 🔴 **EC08 离线与丢事件恢复**：窗口未开、未 ready、断连、超时、部分失败均保留待处理和原键；重连先读有界快照再补偿，不假定 window 事件可重放。
- [ ] 🟡 **EC09 打卡指标绑定**（依赖 D04/D09/H14/H16）：从 `siyuanCheckin.queryItems` 选择习惯/项目并绑定成员与健康、成长、车辆指标；次数/数量/时长/单位/目标值差异显式，不把次数当体重。（2026-10-03 第四十二轮进度：**只读消费 v1 落地**——`pullCheckinSummary` 拉 getStrengthSummary top 5 缓存进 runtime；绑定 UI 仍待产品决策）
- [x] 🟡 **EC10 打卡数值承接（只读 v1）**（依赖 EC06/EC09/D01/D03）：先定只读趋势还是写入管家指标；用 `getEventsInRange` 有界读取，保存源事件 ID/日期/单位；删除/修改按所有者对账，不复制私有存储。 ✅ 2026-10-03 第四十二轮（只读消费：checkin:* 三种事件 → 60s 节流 → getStrengthSummary top 5 缓存进 runtime；**不写打卡数据**——只读消费，写入侧属 EC09 绑定 UI；[待实测] 同实例联调随 EC30。原"EC09 先行"结论修订为"只读消费可先行，绑定 UI 仍待决策"）
- [ ] 🟡 **EC11 家务/备考绑定已有习惯**（依赖 EC03/EC04/D09）：展示已有项目和绑定效果；一键新建仅在提供方公开能力存在时启用，否则引导到打卡创建后返回，不使用不存在的 `habits.list`。
- [ ] 🟡 **EC12 生日/纪念日提醒归属**（依赖 H08/H09/H12/EC03）：先验证打卡 v5 的 `occasions.read/occasions.complete` 能力及其所有者，生日来源另定；无生日写入契约时只引用，不生成双份提醒。（2026-10-03 契约摘录：occasions.read/complete **v4 即存在、localOnly、effect read/write**；打卡 v5 形式化契约含 20 能力 since 矩阵+8 种集成事件+硬限制——EC10 触发源用 checkin:* 事件比 ws-main 更精准；owner 定案点保持）
- [ ] 🟡 **EC13 人脉办理者选择**：通过 `LvContacts.searchPeople/getPerson` 选择合同、保单、学校等联系人；保存公开 docId/itemId/名称快照，v1 不假定电话邮箱生日可取。（2026-10-03 契约摘录：**源码签名确认**——`window.LvContacts` protocol 1，capabilities=[searchPeople,getPerson,ensurePerson,recordInteraction]；未初始化时全部方法抛错须引导；另有 ensurePerson 按名建人（幂等）；见 docs/research/2026-10-03-EC-源码契约摘录.md §1） ✅ 2026-10-03 第二十六轮 v1 落地（contracts/insurance/schooling/exams 四 schema 增 contact 文本列（D08 补列续跑自动迁移）；详情抽屉编辑模式加「从人脉选择」——searchPeople 关键字实时搜索+旧请求丢弃+键盘可选；快照存 `名称 [docId]`；人脉未装/未初始化/搜索失败三态降级；schema 快照 -u 更新（仅 contact 列））
- [x] 🟡 **EC14 家庭成员与人脉映射**：显式绑定/解绑家庭成员和联系人，处理同名候选；双向回链需提供方新契约，不直接改人脉数据库。 ✅ 2026-10-03 第二十九轮（成员卡「关联联系人/解除关联」——共享 openContactPicker（同 EC13 对话框）；FamilyMember.contactSnapshot 存 `名称 [docId]` 快照；settings 侧持久化、人脉数据零改写；双向回链维持提供方契约注记；同名候选由选人列表自然呈现）
- [x] 🟡 **EC15 人情/旅行交互记录**：用户确认人物后调用 `recordInteraction`，使用稳定事务 ref、日期、地点和最小备注；重试幂等，不因打开台账自动记会面。 ✅ 2026-10-03 第三十一轮（人情详情抽屉「记录到人脉」——ensurePerson(对手方) + recordInteraction([docId], {ref: `favor:<rowId>`, date, note: 方向+金额})；externalRef 幂等重复点击不重记；runtime.favorSyncs 留痕；自动触发点=用户点击按钮，不因打开台账自动记——**旅行记录不在 v1 范围**（需 travel 侧需求先确认）；[待实测] 同实例联调随 EC30）
- [x] 🟡 **EC16 雷切管家动作入口**：用真实实例 `registerQuickAction/Adapter` 注册打开面板、提醒、备忘等动作；重复加载不重复注册，返回函数可注销，不模拟 DOM 点击。 ✅ 2026-10-03 第二十五轮（管家侧代码落地：app.plugins 探测 siyuan-speed-switch + registerQuickAction 方法存在性校验（打卡同款已验证模式）；注册"打开管家/打开提醒中枢"两动作（提醒预选 pendingScreen）；disposer 收集 + 卸载全注销 + 重试上限 10 次防泄漏；[待实测] 与雷切同实例联调随 EC30）
- [x] 🟡 **EC17 雷切家庭摘要组件**：用 `registerHomeModule` 提供有界计数/标题/更新时间；loading、error、stale 分开，默认不共享生日/金额/证件，点击落到真实管家位置。 ✅ 2026-10-03 第二十七轮（`lvhome.summary` 只读模块落地：read 返回 normalizeSnapshot v2.1 形态——stat 英雄区（逾期+今日计数）+ items 两行（逾期/7 天，command 深链 `siyuan-home::openButler`）+ sourceHealth fresh/stale + emptyHint；**只共享计数，不共享标题/日期/生日/金额**（EC17 边界）；错误降级为空态快照；卸载注销；[待实测] 同实例渲染随 EC30。摘录 §4.1 read 载荷已定案）
- [ ] 🟢 **EC18 雷切书签入口**：拟定只读 `home.getBookmarks` 的字段、限量和授权，URL 仅 http(s)，点击才打开；非法/缺失目标及关闭模块有提示，账号备注不默认共享。
- [ ] 🟢 **EC19 雷切常用语承接**：管家纯文本 snippets 与雷切 HTML/CSS/JS 片段严格分开；复制/插入由用户选择，不把家庭文本变成可执行代码。
- [ ] 🟡 **EC20 考试计划关联**（依赖 EC03/EC04/EC05/MD06）：区分报名/考试日期和证书到期/复审日期；稳定绑定计划/题库 ID，考试当前无公开计划服务，先定最小契约再实现。（2026-10-03 源码挖掘：闪卡侧 **ExamPlan 形状确认**——{id,name,examDate YYYY-MM-DD,scopeKind all|deck|notebook,scopeId,scopeName,cramDays,totalCards?,enabled,archived?}，存于闪卡内部无对外桥；EC23 最小契约候选=管家 exams.expiry ↔ ExamPlan.examDate 日期互查，绑定 id 需闪卡方暴露）
- [x] 🟡 **EC21 考试统计快照**（依赖 EC02/EC03/EC08）：消费 `lv-exam:stats` 聚合数据，不读题目/答案；明确当前仅见首发事件，先设计快照查询、重放或持续更新依赖，不能宣称实时。 ✅ 2026-10-03 第三十轮 v1 落地（window CustomEvent 监听——校验后缓存 latest-only 子集 {streak,accuracy,attempts,generatedAt} 进 runtime；考试模块卡展示"备考连续 N 天 · 正确率 M%"带更新日期 tooltip；**不读题目/答案、不宣称实时**——广播时机为考试启动/刷新后，已在模块卡与契约摘录 §6.2 如实标注；卸载移除监听）
- [ ] 🟡 **EC22 考试成果归档**（依赖 D03/D09/EC05）：用户选择成绩单/错题总结文档关联考证台账，保留源文档和日期；重复归档不复制文档，撤销关联不删除原文。
- [ ] 🟡 **EC23 闪卡考试计划协同**（依赖 EC03/EC04/EC05/MD06）：关联 Cards ExamPlan 与考证事项，保留范围和类型；日期变更预览双方影响，提醒唯一发送者，避免 30/7/1 天重复轰炸。
- [ ] 🟡 **EC24 管家资料到闪卡**（依赖 D03/D09/P12/EC05）：用户选择资料后打开制卡或绑定牌组；绑定块与 detached 台账行分开，原文不覆盖，创建失败可重试。
- [ ] 🟡 **EC25 riff 数据与评分一致性**（依赖 EC02/EC03/EC08/EC23）：考试错题、拾遗摘录、闪卡引用校核 card/deck/block 身份与 Gateway 版本；事件不双记复习，不复制第二套调度。
- [ ] 🟡 **EC26 拾遗归档到台账**（依赖 D03/D09/P12/EC05）：拟定 `home.archiveRef` 输入为可信 doc/block/sourceRef；拾遗五态属性仍由拾遗负责，归档幂等、失败可重试，接口未挂载前标提供方依赖。**（2026-10-03 第二十四轮源码确认：拾遗无任何外部桥——GleanFacade 为内部 UI 契约，EC26-28 提供方依赖坐实，需拾遗方先行）**
- [ ] 🟡 **EC27 拾遗阅读完成链**（依赖 EC06/EC08/EC10）：复用“显式已读→打卡 v5”，打开/归档不等完成；管家只读完成来源，不再次向打卡写相同事件。
- [ ] 🟡 **EC28 拾遗摘录溯源**（依赖 D03/D09/P12/EC05）：关联资料保存来源文档/URL/摘录 ID 和共享范围预览；不绕过拾遗改 `custom-clip-*`，`siyuanGlean` 未挂载时只登记契约。
- [ ] 🟡 **EC29 生态发现与配置帮助**：设置展示真实安装/ready/授权、数据流和去配置/重试；首次开启先预览效果，普通用户不展示 RPC 调试细节。
- [ ] 🔴 **EC30 六插件组合验收**：每插件至少两条用户流程，覆盖加载顺序、旧协议、拒绝授权、重复点击、离线、跨窗口、禁用重装和误删；按最低 3.8.5 分层记录，诊断脱敏。

## 41. 宣传、介绍与用户支持素材（CM01–CM20，只准备不发布）

> 宣传素材只在能力证据矩阵确认后准备，不把 schema、候选或规划写成已实现；发布、发帖和集市上架仍需单独决定。

- [ ] 🟡 **CM01 核心定位证据化**（依赖 R06）：以“家庭档案+到期提醒+本地优先”写一句话，标注 31 schema 与实际 ready 能力差异。
- [ ] 🟡 **CM02 场景型入口文案**：分别为证件到期、照护家人、物品保修、学习备考、出行准备写结果导向文案，不按模块堆功能名。
- [ ] 🟡 **CM03 能力地图**：按用户任务展示模块、输入、提醒和当前状态，每项链接证据/限制；未实现和实验项有明确标签。
- [ ] 🟡 **CM04 边界与替代关系**：说明思源原生数据库、任务/记账/密码/地图应用各自负责什么，不使用“无竞品”等未经证实表述。
- [ ] 🟡 **CM05 README 新手路径**（依赖 F01/R06）：安装→启用→建立成员→第一条记录→看到提醒→备份，以真实 v0.2 包验证链接和截图。
- [ ] 🟡 **CM06 分层文档导航**：入门只保留最小路径，设置、数据模型、生态协议、故障排查按需展开；高级文档入口名称可预期。
- [ ] 🟡 **CM07 合成家庭演示数据**：制作无真实隐私的固定 fixture，覆盖成员、证件、资产、提醒、失败态和联动说明，可一键清除。
- [ ] 🟡 **CM08 真实状态截图规范**：截图来自可复现 tag 和合成数据，标注版本/平台/已知限制，禁止用原型图冒充现状。
- [ ] 🟢 **CM09 GIF/短视频素材**：准备低带宽、字幕、静态替代和减少动效版本，展示捕捉→提醒→处理完整故事，不剪掉失败边界。
- [ ] 🟢 **CM10 60 秒演示脚本**：三个短片分别讲问题、操作和结果；每句能力声明可回指 R06，未实现联动用“计划”措辞。
- [ ] 🟡 **CM11 六插件生态图**：使用真实 manifest 名称与能力状态，区分已存在入口、待提供方契约和未互测，不画成已完成数据流。
- [ ] 🟡 **CM12 双语术语表**：统一“雷切”品牌、模块名、提醒状态、台账/记录/引用/快照等中英文，避免“快切”混用。
- [ ] 🟢 **CM13 GitHub 社交预览素材**：按官方预览尺寸制作可裁切源文件、浅深色版本、无障碍替代文字；不把 preview 当集市截图。
- [ ] 🟡 **CM14 仓库元数据与主题**：准备实际 description/topics/about，反映当前能力与隐私边界；主题词不冒充平台认证或市场排名。
- [ ] 🟡 **CM15 隐私与本地存储说明**：用普通语言说明台账、附件、设置、通知和联动各存哪里，哪些不会外传；不承诺权限隔离超出平台能力。
- [ ] 🟡 **CM16 安装/升级/卸载指南**：给出一条受支持路径、版本前置条件、备份与回滚检查；高级多设备/协作单独列实验状态。
- [ ] 🟡 **CM17 已知限制 FAQ**：覆盖未建库、部分失败、无公开接口、事件陈旧、移动端后台、旧版本协议和数据恢复，不用“刷新即可”掩盖根因。
- [ ] 🟡 **CM18 发布说明草稿**（依赖 R01/R02/R06）：准备事实、变更、迁移、已知问题、验证环境和附件 hash；不自动创建 Release 或发帖。
- [ ] 🟢 **CM19 反馈入口与脱敏模板**：准备 issue/讨论/内测反馈表，收集复现环境和结果，不要求上传证件、健康、联系人全文；不配置遥测。
- [ ] 🟢 **CM20 宣传维护清单**：登记素材作者/许可证、来源链接、版本、复核日期和失效链接；每次能力/接口变化触发人工回看。

## 42. 质量、可维护性与长期验证（Q01–Q15，只规划）

- [ ] 🔴 **Q01 需求追踪矩阵**：每项候选关联来源、schema/API/UI位置、验收证据和状态；事实、推导、实验、已实现四态可筛选。
- [ ] 🟡 **Q02 场景优先级评分**：按家庭价值、数据风险、使用频率、实现/维护成本和依赖评分，避免 160 项同时开工；记录暂缓理由。
- [ ] 🟡 **Q03 固定合成 fixture 包**：为 31 模块准备可重建最小/边界/损坏数据，包含时间、关系、附件和失败态；禁止混入真实家庭数据。
- [ ] 🟡 **Q04 schema 演进 fixture**：用规则与语义断言验证新增列、枚举、关系、日期和未知字段兼容；不把实现快照当唯一黄金标准。
- [ ] 🔴 **Q05 联动契约 fixture**：覆盖缺 provider、旧协议、最小 payload、超量、重复、损坏和部分成功；每个回执可重放且可脱敏。
- [ ] 🟡 **Q06 升级/降级兼容证据**：记录版本、备份、未知字段、禁用联动和回滚边界；不凭 semver 推断数据可逆，验证保留与恢复。
- [ ] 🔴 **Q07 失败链重放**：模拟延迟、重复、乱序、断连和部分写入，确认不新增重复行、不互相回写，恢复后可查原幂等键。
- [ ] 🟡 **Q08 性能测量复现**（依赖 PF01/PF02；为 PF20 提供复现实测数据）：保存硬件、前端、思源、fixture、缓存状态和分布统计，报告方差而非单一最好值；不在此项预先引用尚未建立的回归阈值。
- [ ] 🟡 **Q09 手工无障碍证据**：按实际设备、键盘、读屏、主题、高对比、缩放和触屏任务记录结果；不能只以 ARIA 属性或静态扫描宣称通过。
- [ ] 🟢 **Q10 UI 资产回归**：为真实主题/断点/字体准备截图与 token 检查，版本化图标、预览和动效替代；变更后人工确认长文本与焦点。
- [ ] 🟡 **Q11 文档声明漂移检查**：在发布节点人工对照 README、MODULES、ROADMAP、API、FAQ 和实测矩阵；修正过时接口名、能力和版本限制。
- [ ] 🟢 **Q12 外部政策来源维护**：给疫苗、协议、宿主 API、竞品参考登记来源、版本、责任人和复核日期，不创建未经授权的自动推送任务。
- [ ] 🟡 **Q13 反馈分级与重开规则**：按数据丢失、重复写入、阻断、误提醒、可访问性和一般体验分级；修复证据不足时重新打开，不靠投票关闭。
- [ ] 🟡 **Q14 适配层进入条件**：两个以上真实提供方契约重复需求且 fixture 通过后，才抽公共 adapter；先保留小范围实现，避免过早框架化。
- [ ] 🟡 **Q15 关闭与回滚开关**：联动逐项可禁用并停止消费/通知，保留来源数据和诊断；回滚不靠删除用户台账，恢复步骤可在无联动时执行。

## 43. 家庭管理产品能力延伸（HP01–HP72，只规划）

> 本组来自 Cozi、FamilyWall、Apple Reminders、Google Calendar/Tasks、Microsoft To Do、Todoist、Any.do Family 和 Homechart 的官方功能资料。外部产品能力不等于本项目应照搬；优先吸收权限、时间语义、共享清单和降级边界。

- [ ] 🟡 **HP01 家庭/个人日历分层**（依赖 R07/P08/P11）：定义家庭事件与成员私有事件的来源、颜色、默认可见范围；成员筛选不伪装成权限隔离。
- [ ] 🔴 **HP02 日历权限梯度**（依赖 R07）：验证忙闲、看详情、编辑、管理共享和撤销在思源部署中的真实能力；共享笔记本不等细粒度权限。
- [ ] 🟡 **HP03 提醒与变更通知分离**（依赖 H12/H13）：区分到期、被分派、清单被改三类通知，逐类静音和去重，静音不等于漏掉任务。
- [ ] 🟡 **HP04 成员退出/移除/撤销后的数据状态**（依赖 R07/D08/T04）：明确缓存、所有权、历史副本、再加入行为和停用提示。
- [ ] 🟡 **HP05 日历事件语义矩阵**（依赖 H09/MD27）：区分全天、定时、跨午夜、当地时区和业务截止，不能把日期字符串直接当提醒时间。
- [ ] 🟡 **HP06 外部日历导入/订阅边界**（依赖 R07/P11）：先研究只读导入、来源标识、重复检测、断开恢复和权限撤销，再决定是否回写。
- [ ] 🟢 **HP07 家庭日报/周议程**（依赖 H12/H13）：研究应用内摘要、状态栏和外部邮件等出口，按收件人/时区生成，失败显示快照时间，不默认发邮件。
- [ ] 🟢 **HP08 参与者/出席状态**（依赖 P08/F15）：区分需谁到场、已确认、待确认、办理人和成员关系，不把邀请当权限。
- [ ] 🟢 **HP09 家庭时间冲突提示**（依赖 HP01/HP05/P11）：只提示重叠和缺席风险，展示日历范围/时区，用户决定调整，不自动移动原事件。
- [ ] 🟢 **HP10 轮班/隔周/学期模板**（依赖 P01/MD23）：验证隔周、节假日例外和终止规则，模板实例独立保存。
- [ ] 🟡 **HP11 共享任务负责人模型**（依赖 P08/EC05）：定义负责人、协助者、观察者；多人事项拆子任务或关联任务，避免“大家负责”。
- [ ] 🟡 **HP12 任务上下文与变更记录**（依赖 D09/EC06/Q11）：显示来源、最近变更者、附件和评论范围，任务评论与聊天分开，支持导出脱敏。
- [ ] 🟡 **HP13 分派/完成/改派通知偏好**（依赖 H12/H13）：按用户/事项配置通知，自己的操作不重复通知自己。
- [ ] 🔴 **HP14 邀请链接与成员生命周期**（依赖 R07/P08）：验证链接过期、撤销、重复加入、待接受和被移除，显示谁可加入及权限。
- [ ] 🟡 **HP15 离线共享清单合并**（依赖 F19/PF19/R07）：设计离线勾选、重连合并、重复添加/删除和冲突收敛；先验证思源同步，不直接承诺离线协作。
- [ ] 🟡 **HP16 清单完成/归档/恢复语义**（依赖 P03/P05/MD10）：区分本次已买、长期模板、误勾恢复和历史保留，避免勾选后永久删除。
- [ ] 🟡 **HP17 杂货分类本地化与纠错**（依赖 P03/UI19）：中文商品和单位先进入未分类，用户修正可记忆、可撤销，不把自动分类当事实。
- [ ] 🟢 **HP18 清单分组/看板边界**（依赖 P03/UI15/UI24）：比较按商店区域、成员、地点分组与表格/看板；分组只改变视图，不改变库存事实。
- [ ] 🟡 **HP19 清单模板版本与执行实例**（依赖 P05/P10/Q04）：模板拥有者、版本、必备项、执行实例和归档策略分开。
- [ ] 🟡 **HP20 菜谱→餐单→采购→库存闭环**（依赖 P04/MD17/P06）：保存份数/单位、库存抵扣、替代食材和用户确认，计划餐不自动扣库存。
- [ ] 🟢 **HP21 季节/节日家庭例行包**（依赖 P05/HP19/MD23）：研究开学、春节、露营、应急包的日期、负责人和材料来源，模板更新不改已执行实例。
- [ ] 🟢 **HP22 位置提醒与定位边界**（依赖 R08/H13/R07）：只做权限、耗电、后台可行性研究，默认关闭，不记录实时家庭成员位置。
- [ ] 🟢 **HP23 家庭目录与紧急信息快照**（依赖 MD21/UI22/CM15）：定义离线/打印最小字段、更新时间、过期和脱敏，不泄露健康/证件全量。
- [ ] 🟢 **HP24 任务评论与家庭聊天边界**（依赖 R07/EC06/CM04）：比较结构化评论、临时聊天、通知和保留期限，默认不引入实时聊天。
- [ ] 🟢 **HP25 家庭照片/视频与台账附件边界**（依赖 PF15/R07）：研究附件引用、权限、缩略图、空间和删除恢复，不把管家变成云相册。
- [ ] 🟡 **HP26 外部来源快速捕捉**（依赖 F11/D03/EC05）：定义邮件/文档/语音/剪贴板捕捉的来源 ID、附件范围、待确认队列和失败回执；无外部账户权限时提供手动粘贴。
- [ ] 🟡 **HP27 个人视图与共享事实分离**（依赖 H16/P08/UI17）：共享台账只存一份事实，今日/分派给我/待确认是可撤销视图，不复制任务或改变全家状态。
- [ ] 🟡 **HP28 共享任务能力缺口降级**（依赖 EC03/EC11/P01）：提供方不支持子任务/重复时，拆为独立事项并回链父项，不伪造同步成功。
- [ ] 🟡 **HP29 共享日历/任务所有权转移与备份**（依赖 D08/T04/R07）：验证负责人退出、设备丢失、恢复、导入导出后关系与提醒是否仍有效。
- [ ] 🔴 **HP30 家庭产品跨平台能力矩阵**（依赖 R08/H13/Q11）：按桌面、窗口、浏览器、移动端、登录、前后台和离线逐项实测，区分“产品有能力”和“本插件已接通”。
- [ ] 🟡 **HP31 个人清单迁移到共享台账**（依赖 F09/D08/R08）：预览来源/目标，保留原清单，不隐式合并；声明 Web/移动端差异。
- [ ] 🟡 **HP32 共享空间容量与退化**（依赖 R07/P08）：成员/共享板达到上限时明确提示，超限新建默认私有，不能静默丢入共享空间。
- [ ] 🟡 **HP33 个人今日视图的清空语义**（依赖 H05/H16）：清空 My Day/今日列表只改变个人视图，不完成、不删除源任务。
- [ ] 🟢 **HP34 共享清单导出/转发边界**（依赖 UI22/HP15）：导出副本显示快照时间和敏感字段，明确副本不再同步。
- [ ] 🔴 **HP35 对象可见性与容器权限**（依赖 R07/P08/UI22）：区分参与者可见、关联数据可见和容器访问；若宿主只能库级权限，明确降级，不用筛选伪装权限。
- [ ] 🟡 **HP36 任务时间建模**（依赖 H09/P11/HP05）：定义业务截止、计划开始、耗时、提醒点，避免把提醒时间当截止。
- [ ] 🟡 **HP37 周期基准双模式**（依赖 P01/H05/H09）：验证按原计划日或按实际完成日重复，并覆盖逾期完成、跳过、终止和迁移。
- [ ] 🟢 **HP38 外部日历交换层**（依赖 HP06/R07/R08）：把只读订阅、可写同步、手动 ICS 导出分三档研究，凭证可撤销，失败不覆盖源台账。
- [ ] 🟢 **HP39 家庭共享屏/厨房平板**（依赖 R08/HP23/UI22）：研究超时退出、敏感字段遮罩和只读快照，不把全屏浏览器当权限隔离。
- [ ] 🟢 **HP40 个人/家庭通讯录交换**（依赖 MD18/HP23）：研究成员主数据、social/address、vCard/CardDAV 导入重复、冲突和敏感字段导出。
- [ ] 🟡 **HP41 任务关联对象与预算边界**（依赖 MD08/MD14/MD21/P12）：只关联已有资产/库存/事项，预算金额不自动推导为记账。
- [ ] 🟢 **HP42 多模块统一日历口径**（依赖 P11/H16/PF16）：聚合交易、餐单、健康、任务和事件时标记数据源、更新时间、权限失败和重复事件，未读源不显示为完整日历。

- [ ] 🟡 **HP43 家庭邀请待接受状态**（依赖 R07/HP14）：区分已发邀请、待接受、已接受、撤回和过期，未接受不能当成员或授予访问。
- [ ] 🟡 **HP44 共享笔记/清单删除恢复**（依赖 D03/H07/Q07）：记录来源、删除者、回收期和全员可删影响；无法恢复时提前说明。
- [ ] 🟢 **HP45 第三方家庭组限制说明**（依赖 R06/CM16）：说明账号家庭组的地区、单组、邀请和离组限制，不把插件成员等同账号家庭成员。
- [ ] 🟢 **HP46 家长控制非目标边界**（依赖 R06/CM04/R07）：明确不接管设备定位、屏幕时间和应用权限，只记录用户明确录入的家庭事项。
- [ ] 🟡 **HP47 家务频率/季节/房间模型**（依赖 P01/MD16）：任务可有独立间隔、季节性、房间和努力量，区分周期到期与一次性完成。
- [ ] 🟡 **HP48 按完成日/原计划日周期对比**（依赖 P01/H05）：覆盖逾期、提前、跳过、补做和换频率，下一次 due 与历史分开。
- [ ] 🟢 **HP49 家庭负担报告**（依赖 P08/MD16）：按次数、努力、耗时和负责人统计，先做诊断报表，不自动判定谁“应该”承担更多。
- [ ] 🟢 **HP50 轮换分派与可用时间模拟**（依赖 HP11/P01）：模拟负责人轮换和可用时间，拒绝或失败回到人工确认，不静默改负责人。
- [ ] 🟢 **HP51 儿童任务审核与奖励边界**（依赖 MD16/MD24/HP11）：研究家长审核、证据、奖励和撤销，不把积分当完成事实。
- [ ] 🟢 **HP52 游戏化/连续记录可关闭**（依赖 UI17/CM04）：提供无竞赛、无连续计数和低压力模式，禁止把游戏化宣传成核心能力。
- [ ] 🟡 **HP53 清洁度状态与完成分离**（依赖 MD16/P01）：环境状态估计与用户确认的执行记录分开，不用颜色把估计冒充卫生结论。
- [ ] 🟡 **HP54 日计划生成可解释**（依赖 PF16/HP47）：按可用时间、努力和紧急度生成建议，展示取舍，不改变原周期和负责人。
- [ ] 🟢 **HP55 家务心理负担与提醒克制**（依赖 H12/UI17）：以最小行动、暂缓、跳过和回顾替代连续红色催促，不把未完成直接判责。
- [ ] 🟡 **HP56 资产证据链**（依赖 MD08/MD12）：物品→位置→照片→收据→保修→序列号→服务记录→提醒可追溯，缺件/未知来源单独标识。
- [ ] 🟡 **HP57 维护与项目生命周期分离**（依赖 MD21/P02/MD08）：例行维护、维修工单和装修项目分开，完成维护附成本/照片/凭证。
- [ ] 🟡 **HP58 物品/房屋服务历史时间线**（依赖 MD08/MD21/H05）：保留技师、零件、日期、读数、费用和建议来源；更换设备不覆盖旧历史。
- [ ] 🟢 **HP59 灾备/保险快照包**（依赖 UI22/T04/MD08）：按房间/物品选择最小字段生成打印/导出清单，标拍摄/核对日，不宣称自动理赔。
- [ ] 🟡 **HP60 QR/条码标签隐私与生命周期**（依赖 P12/MD08）：标签只含不可猜测稳定 ID 或本地跳转；重印、转移、出售、报废和丢失可撤销。
- [ ] 🟡 **HP61 离线盘点与借出归还冲突**（依赖 PF19/R07/MD08）：移动端离线记录按稳定 itemID 合并，重复扫描和部分失败有回执，先验证宿主能力。
- [ ] 🟡 **HP62 房屋/房间/收纳层级历史**（依赖 MD08/MD18/MD21）：位置关系可变且保留时间线，同名房间不自动合并。
- [ ] 🟢 **HP63 CSV/照片/收据批量接管向导**（依赖 F09/D08/D09）：导入前预览字段、附件和重复，保留原文件与来源，逐行可重试。
- [ ] 🟢 **HP64 本地维护计划与外部气象/AI边界**（依赖 MD21/HP57/R06）：研究地区/季节模板和来源；不吸收未经验证的实时气象或专业安全建议。
- [ ] 🟡 **HP65 临时照护圈邀请与角色**（依赖 R07/P08/UI23）：区分家庭成员、亲友、专业人员和临时志愿者；邀请待接受/到期/撤回，访问范围与期限可核对。
- [ ] 🟡 **HP66 照护任务认领与交接**（依赖 F14/HP11）：接送、餐食、陪诊等任务支持认领、转交、拒绝和替补，防止重复认领与无人认领。
- [ ] 🔴 **HP67 敏感资料分组共享**（依赖 MD03/MD04/HP35）：医疗、财务、法律附件按指定对象和有效期共享，默认最小字段、查看/下载边界和撤销证据。
- [ ] 🟢 **HP68 照护更新流与源台账分离**（依赖 MD03/EC06）：状态更新、留言和照片作为有来源的时间摘要，不改写病历或证件原始记录；撤回/删除保留关联说明。
- [ ] 🟡 **HP69 漏做与未确认提示分层**（依赖 H12/H14）：区分“任务未回执/待确认”和“业务失败/医疗异常”，只基于用户记录与超时规则，不诊断、不自动升级医疗警报。
- [ ] 🟢 **HP70 支持社区一次性任务模板**（依赖 HP19/F15）：出院、术后、照护轮班、临时搬家等包可复制任务与联系人，实例保留完成/取消/替代状态，不把模板当医嘱。
- [ ] 🟢 **HP71 紧急联系人与离线卡片**（依赖 HP23/MD21/UI22）：可打印/离线最小联系字段，含更新时间与数据来源；不默认包含完整病历或证件号。
- [ ] 🟢 **HP72 隐私、心理安全与退出机制**（依赖 CM15/R07）：参与者可见加入者、暂停接收更新、撤回分享；通知与动态保持克制，不做照护完成率责备排行榜。

## 44. 数据生命周期与可携带性深化（DL01–DL30，只规划）

> 本组吸收 Notion、Obsidian、Airtable、Homebox、Grocy、Joplin、Standard Notes 的官方导出、恢复、版本、冲突和共享资料。目标是让“本地优先”有可验证的恢复与迁移产品体验，而不是只写一句原则。
> DL 定义通用数据/包/权限/版本契约；HP 引用其家庭场景，NX 引用其照护/注意力场景，PM 统一对象和视图。交叉能力只实现一次，不各建一套恢复或权限机制。

- [ ] 🔴 **DL01 生命周期状态机**（依赖 H03/H07/D08）：区分 active、archived、trash、retained、purged，状态转换和恢复后提醒行为可查。
- [ ] 🔴 **DL02 回收站与恢复预览**（依赖 T04/D08/UI21）：按行/模块显示保留倒计时、原位置、关系和附件，恢复前预览影响。
- [ ] 🔴 **DL03 归档、删除、永久清除分离**（依赖 H03/P12）：归档可隐藏但双链仍可达，父级级联可预览，永久清除单独确认。
- [ ] 🔴 **DL04 删除墓碑与旧快照复活防护**（依赖 H11/EC08/Q07）：跨窗口/设备冲突时删除标记不会被旧缓存重新创建。
- [ ] 🟡 **DL05 分层版本历史**（依赖 D03/Q06）：按行、字段、附件、设置分别定义作者、设备、时间、来源和保留期。
- [ ] 🟡 **DL06 差异查看与选择性恢复**（依赖 DL05/UI21）：可按字段/块恢复，恢复本身产生新历史，不覆盖后来编辑。
- [ ] 🟡 **DL07 升级/导入前命名快照**（依赖 D08/T04）：先恢复到克隆笔记本或工作区核对，再由用户决定替换原数据。
- [ ] 🟡 **DL08 快照元数据**（依赖 R01/Q01）：记录插件、思源、协议、schema、模块/行/附件计数、哈希、创建者和过期时间。
- [ ] 🔴 **DL09 导出 manifest**（依赖 R06/Q01）：列出字段、视图、关系、设置、模板、附件、外部来源、版本、计数、哈希和不支持项。
- [ ] 🔴 **DL10 导出范围选择**（依赖 UI22/R07）：可选模块、成员、字段、附件、关系闭包和脱敏 profile，导出前显示包含/排除/无法导出。
- [ ] 🟡 **DL11 可携带格式分层**（依赖 R06）：区分可回导 JSON、通用 CSV、可读 HTML/Markdown/PDF，并说明各格式丢失边界。
- [ ] 🔴 **DL12 导入 dry-run**（依赖 D11/UI16）：预览列、类型、枚举、单位、日期时区、关系映射和歧义，零写入；变化统计要有新增/更新/跳过。
- [ ] 🔴 **DL13 分批导入 checkpoint**（依赖 D03/PF19）：支持暂停、恢复、取消、逐行回执和重试，不重复写入。
- [ ] 🔴 **DL14 外部 ID 去重策略**（依赖 D02/D06）：skip/update/create/ask 四选一，保留 sourceRef 和映射表，禁止只按姓名合并。
- [ ] 🔴 **DL15 附件迁移完整性**（依赖 D09/PF15）：校验内容 hash、文件名、路径、重复、缺件和孤儿附件，引用通过后才提交。
- [ ] 🔴 **DL16 导入后回读校验**（依赖 DL12/DL15/Q03）：逐项核对计数、关系闭包、附件 hash、日期、单位和状态并生成报告。
- [ ] 🟡 **DL17 模块归档包**（依赖 H11/D08）：停用 UI/提醒但保留 schema、数据、附件和历史，重新启用可原位恢复。
- [ ] 🔴 **DL18 删除层级与双确认**（依赖 D03/H07/UI21）：设置、模块、行、附件分层删除，显示快照、倒计时和不可恢复提示。
- [ ] 🟡 **DL19 设置/模板/业务数据恢复分离**（依赖 D08/T04）：恢复设置不覆盖台账，恢复台账不重置视图和用户偏好。
- [ ] 🔴 **DL20 离线队列产品语义**（依赖 F06/EC08/PF19）：记录操作 ID、排队、过期、重试、回退和用户确认，不只显示“网络正常”。
- [ ] 🔴 **DL21 source-of-truth 目录**（依赖 EC07/Q01）：每字段/模块声明主数据、只读镜像或允许回写，防止跨插件 ping-pong。
- [ ] 🔴 **DL22 冲突策略分级**（依赖 R07/EC08）：按模块声明自动合并、字段合并、手工复制或禁止合并，保留双方来源。
- [ ] 🔴 **DL23 冲突收件箱**（依赖 DL22/UI16）：按待解决筛选，显示差异，逐字段采用/合并/放弃并标记已解决，不能静默覆盖。
- [ ] 🟡 **DL24 同步/备份健康卡**（依赖 T04/R07）：展示每模块/设备最近拉取、推送、备份、陈旧、阻塞和未上传附件，与 navigator.onLine 分离。
- [ ] 🟡 **DL25 共享角色矩阵**（依赖 R07/P08）：验证 owner/editor/contributor/viewer/commenter 及敏感字段/附件范围；显示有效权限而非角色名。
- [ ] 🟡 **DL26 权限继承移动预览**（依赖 DL25/UI22）：共享模块、行或关联移动时列出新增/失效访问，检测最宽权限覆盖。
- [ ] 🟡 **DL27 临时共享与导出链接生命周期**（依赖 R07/UI22）：范围、有效期、撤销和轮换可查，明确已复制内容不可远程撤回。
- [ ] 🟡 **DL28 访问/导出/下载/共享/恢复审计**（依赖 Q01/Q13）：按角色、模块、时间过滤，可脱敏导出，失败操作也记录。
- [ ] 🟡 **DL29 模板包版本与覆盖保护**（依赖 P05/Q04）：记录 packageId、版本、来源、许可证和 schema 依赖；升级区分填空字段与覆盖字段，子记录影响先预览。
- [ ] 🟢 **DL30 跨产品可携带性演练**（依赖 Q03/R06）：用 Notion/Joplin/Homebox/Grocy/Airtable 示例包导入空工作区，形成可迁移/需人工/不可携带矩阵，不承诺全兼容。

## 45. 注意力、照护与可信内容深化（NX01–NX37，只规划）

> 本组吸收 Todoist/Google Calendar/Apple/Microsoft/YouTube、WHO/NIH/CDC 和 W3C 资料，重点是通知可靠性、照护代理、健康内容可信度、内容消费与认知无障碍；不把外部产品行为当作本项目已有能力。

- [ ] 🔴 **NX01 通知预算与优先级**（依赖 H12/EC03）：按日/时段/渠道设最大提醒量，超额进入可预览摘要，同语义事件只保留一个发送者。
- [ ] 🔴 **NX02 静默/专注上下文**（依赖 H06/H13）：工作、睡眠、出行、会议上下文延后提醒，记录原计划和下一投递，不覆盖用户手动关键提醒。
- [ ] 🔴 **NX03 通知审计时间线**（依赖 H12/H13/Q01）：展示源记录、规则、计划时间、投递尝试、成功/失败、点击、延后/忽略及当前状态。
- [ ] 🔴 **NX04 提醒动作语义**（依赖 H05/H06）：区分完成、延后、跳过本次、修改规则；重复任务不生成幽灵实例。
- [ ] 🔴 **NX05 漏提醒恢复**（依赖 H11/H13/F06）：恢复后分组显示漏掉、仍有效、已过期，由用户选择补发/跳过/改期，限制批量弹窗。
- [ ] 🔴 **NX06 递归日期解释器验收**（依赖 H05/H09/P01）：区分按日历日、完成日、滚动周期、截止日+计划日，覆盖逾期、农历和时区。
- [ ] 🟡 **NX07 日历负载/冲突检查**（依赖 HP05/HP09/P11）：分开事件、任务、计划日、deadline，按时长/开始结束/全天/重复规则提示超载，不自动改时间。
- [ ] 🟡 **NX08 家庭日历变更通知分层**（依赖 HP01/HP03）：分开即将开始、新增/编辑/删除和权限变更消息，分别可开关并写明默认行为。
- [ ] 🟡 **NX09 通知可达性与替代通道**（依赖 H13/R08）：逐项测应用内、系统、摘要、读屏、邮件/Webhook，不能把不可达包装成已通知。
- [ ] 🟢 **NX10 注意力数据边界**（依赖 Q01/R06）：若统计专注/响应，只统计用户同意的本地交互，提供暂停/删除/解释，不推断健康或性格。
- [ ] 🔴 **NX11 角色矩阵**（依赖 HP11/DL25/R07）：分开资料所属人、办理者、查看者、临时代理和共享管理员，不能用成员筛选冒充权限。
- [ ] 🔴 **NX12 照护同意与变更审计**（依赖 R07/DL28）：儿童/老人等敏感场景记录授权者、范围、有效期、撤销时间和被影响者通知。
- [ ] 🔴 **NX13 照护班次交接**（依赖 HP11/F18）：按负责人、最后确认、下一动作和升级联系人生成交接包，接收者确认后才转移。
- [ ] 🟡 **NX14 角色生命周期复核**（依赖 HP04/HP43/DL26）：成员成年、离家、照护结束、设备移除时复核共享范围、提醒接收者和遗留任务。
- [ ] 🟡 **NX15 代理操作防误写**（依赖 NX11/DL21）：记录原负责人、代办人、原因和原始输入，支持回退；只读外部来源不假装可代写。
- [ ] 🟡 **NX16 健康内容来源卡**（依赖 V02/R06）：保存机构、作者/审核者、原文、发布日期、复审日、地区和适用人群。
- [ ] 🟡 **NX17 内容新鲜度与版本**（依赖 NX16/DL05）：标记过期/待复审/政策变化，保留旧版和用户当时看到的快照，不静默改历史。
- [ ] 🟡 **NX18 平衡证据表达**（依赖 NX16/R06）：同时展示益处、风险、不确定性和适用边界，不生成诊断、处方或个体结论。
- [ ] 🟢 **NX19 健康内容可读性**（依赖 UI11/UI12）：普通语言、术语展开、同义词检索、字号/对比/读屏替代，避免污名化表达。
- [ ] 🟢 **NX20 健康内容个性化边界**（依赖 NX16/EC04）：语言、地区、年龄段由用户选择，不根据敏感数据暗推人群，变更可见可撤销。
- [ ] 🟡 **NX21 引用与分享保真**（依赖 UI22/DL10）：复制/导出健康卡片保留来源、更新时间、原文链接和免责声明，摘要可回到原文段落。
- [ ] 🟡 **NX22 内容历史控制**（依赖 MD31/DL18）：阅读/观看历史可暂停、删除、按时段清理，并说明对统计和回顾的影响。
- [ ] 🟢 **NX23 内容时长与休息**（依赖 MD31/R08）：可设置个人/儿童休息间隔，触发后提供继续/改频率/关闭，跨设备和离线重置可解释。
- [ ] 🟡 **NX24 内容消费队列**（依赖 MD31/F20）：区分想看、进行中、暂停、放弃、重看，状态变化不重复创建提醒。
- [ ] 🟢 **NX25 内容推荐解释**（依赖 MD31/R06）：显示推荐来源是历史、标签、家庭共享还是手动；无远程推荐时明确只用本地规则。
- [ ] 🟡 **NX26 月/季/年复盘向导**（依赖 HP42/PM23/DL10）：选择时间、成员、模块，展示完成/逾期/暂停/缺失，允许记录原因和下一步，不用排名强迫用户。
- [ ] 🟡 **NX27 回顾数据充分性**（依赖 PM18/PM24/D01）：生成前检查样本、时间覆盖、隐私范围和缺失来源，标注口径/更新时间，补录后可重算。
- [ ] 🟡 **NX28 回顾快照与历史稳定**（依赖 DL08/DL10）：分享前预览字段、成员、附件并保存不可变快照，后续改名/规则不篡改已发布回顾。
- [ ] 🟡 **NX29 目标—行动链**（依赖 P01/F20）：目标含理由、基线、周期、里程碑、记录和完成判定；调整保留版本和放弃原因，不自动判定失败。
- [ ] 🟡 **NX30 复盘转计划**（依赖 NX26/HP13）：从复盘生成候选行动，逐项确认负责人、日期、通知量和来源；取消/忽略有记录，不自动轰炸。
- [ ] 🟡 **NX31 提醒创建与个性化同意**（依赖 H12/UI17）：提醒只在用户请求或明确规则下创建，方法、频率可改，不默认强推。
- [ ] 🟡 **NX32 时间限制可延长/暂停**（依赖 UI10/UI21）：长流程提供继续入口，提醒不只依赖短暂 toast，用户可延长或隐藏时间限制。
- [ ] 🟡 **NX33 动态状态消息带上下文**（依赖 UI08）：播报“已保存、下一次提醒时间和查看入口”等完整句子，不只读单独数字。
- [ ] 🟢 **NX34 低刺激模式**（依赖 UI11/UI24/H12）：减少动效、声音、红色高危滥用和批量弹窗，先预览摘要再进明细。
- [ ] 🟢 **NX35 个性化熟悉界面**（依赖 UI12/Q09）：字号、间距、标签、图标文本、默认排序和阅读顺序可保存，设置导出不带个人资料。
- [ ] 🟡 **NX36 今日处理台与次日建议**（依赖 F20/H12）：今日列表是有限的个人工作区；清空或未完成不删除/不自动完成，次日以建议让用户确认是否重排。
- [ ] 🟡 **NX37 高优先级提醒显式授权**（依赖 H13/R08）：普通提醒、漏记跟进和越过静音的 critical alert 分级；逐项开启/撤销并显示系统可达性，不默认高优先级。

## 46. 产品信息模型与视图语义深化（PM01–PM42，只规划）

> 本组吸收 Obsidian Bases/Properties、Notion 数据库/自动化以及现有 31 schema 的产品化差距，先定义用户能理解的对象和状态，再谈字段数量与实现方式。

- [ ] 🔴 **PM01 信息层级地图**（依赖 Q01）：明确家庭、成员、模块、记录、事件、附件、来源、视图和提醒的关系，避免同一对象在不同页叫不同名字。
- [ ] 🔴 **PM02 对象类型目录**（依赖 D04/D09）：区分主档、事实记录、计划、发生事件、引用、模板、快照和派生提醒。
- [ ] 🔴 **PM03 状态与事件分离**（依赖 H05/D03）：状态表示当前事实，事件表示一次发生；完成/取消/修正不能只改一个布尔值抹掉历史。
- [ ] 🔴 **PM04 稳定身份策略**（依赖 D02/D04/EC05）：为成员、模块行、附件、外部引用、模板实例定义生成、复制、合并、删除后的身份规则。
- [ ] 🟡 **PM05 来源与可信度标记**（依赖 D09/R06）：显示用户输入、原生台账、外部插件、附件、政策来源和推导值，空值不自动变成未知事实。
- [ ] 🟡 **PM06 生命周期词汇统一**（依赖 H05/DL01/CM12）：统一 active、planned、due、done、skipped、archived、expired、purged 等中英文语义。
- [ ] 🟡 **PM07 关系基数与方向**（依赖 D11/P12）：明确一对一、一对多、多对多、反向读取和删除影响，不依赖同名自动关联。
- [ ] 🟡 **PM08 主数据所有权**（依赖 EC07/DL21）：每个字段指定唯一写入者、只读镜像和冲突处理，跨模块引用不复制主数据。
- [ ] 🟡 **PM09 变更归因模型**（依赖 Q01/DL28）：记录用户、插件、导入、同步、规则和恢复造成的变更，批量操作可展开到单行。
- [ ] 🟡 **PM10 日期字段分类**（依赖 H09/HP36）：区分发生日、计划日、截止日、提醒日、生效日、失效日和复核日。
- [ ] 🟡 **PM11 重复规则分类**（依赖 P01/NX06）：按固定日历、完成后、滚动间隔、学期/节日、手动下一次分别建模。
- [ ] 🟡 **PM12 时区与地区策略**（依赖 H09/HP05）：字段声明本地时间、固定时区、浮动时间、全天或未知时区，设备时区变化不改历史。
- [ ] 🟡 **PM13 数值单位与精度**（依赖 D11/UI19）：数量、金额、次数、时长、里程和测量值分开，换算规则可追溯，不能为显示截断事实。
- [ ] 🟡 **PM14 附件与引用关系**（依赖 D09/P12/DL15）：区分附件副本、原文链接、文档块、外部 URL、截图快照和失效引用。
- [ ] 🟡 **PM15 外部链接快照**（依赖 D09/EC06）：保存打开地址、标题快照、核对日和失效状态，链接可访问不代表内容仍适用。
- [ ] 🟡 **PM16 自定义字段边界**（依赖 D11/R06）：允许扩展但声明类型、迁移、搜索、提醒、导出和升级兼容，不让任意字段绕过校验。
- [ ] 🟡 **PM17 视图不是数据**（依赖 UI15/D10）：过滤、排序、分组、颜色、看板列和个人视图只改变呈现，不复制或改变源事实。
- [ ] 🟡 **PM18 查询结果的完整性标记**（依赖 D01/H04）：结果显示全部、范围内、缓存、部分失败或未知，不能将当前页当全库统计。
- [ ] 🟡 **PM19 快速捕捉到正式记录**（依赖 F10/F11/DL12）：捕捉先保留原文和待确认状态，转档预览字段、关系和提醒变化。
- [ ] 🟡 **PM20 模块启停语义**（依赖 H11/DL17）：停用模块隐藏入口、停止提醒还是只暂停读取分别定义；数据和附件不因关闭被删除。
- [ ] 🟡 **PM21 表单字段分层**（依赖 UI15/D09）：必填、常用、进阶、系统生成、只读和来源字段分层，默认不把全部 schema 展示给新用户。
- [ ] 🟡 **PM22 列表/卡片/日历同源**（依赖 UI02/P11）：同一记录在不同视图保持身份、状态和操作语义，视图缺字段要明确降级。
- [ ] 🟡 **PM23 统计口径目录**（依赖 PF16/Q01）：记录数、事件数、金额、数量、作品数、完成次数和去重规则逐项定义。
- [ ] 🟡 **PM24 统计缺失与不确定性**（依赖 D01/H04/UI16）：缺库、缺列、未完整读取、无单位、冲突和估算不显示为零或精确总额。
- [ ] 🟡 **PM25 规则解释对象**（依赖 H14/F13）：提醒可回到源字段、规则版本、提前量、计算日期和下一次实例。
- [ ] 🟡 **PM26 用户覆盖与系统默认**（依赖 D09/DL29）：默认值、模板值、用户修改、导入值和规则重算优先级可解释，升级不覆盖用户改动。
- [ ] 🟡 **PM27 批量操作范围**（依赖 UI14/D03）：当前页、已加载、筛选结果、全部匹配、关联闭包和不可操作项分别声明。
- [ ] 🟡 **PM28 复制、派生与合并**（依赖 F12/D02/DL14）：复制生成新身份，派生保留来源，合并先预览字段/附件/关系和冲突。
- [ ] 🟡 **PM29 删除与外部引用**（依赖 DL03/DL04/P12）：删除源记录时引用显示墓碑/快照/断链，不静默删除关联模块数据。
- [ ] 🟡 **PM30 归档与搜索**（依赖 DL01/UI16）：归档默认隐藏但可按来源、时间和关系检索，搜索结果标注当前状态。
- [ ] 🟡 **PM31 模板与实例**（依赖 P05/HP19/DL29）：模板改版只影响新实例或用户确认的空字段，已执行实例保留原版本。
- [ ] 🟡 **PM32 关系选择器语义**（依赖 D04/D06/EC05）：同名、已失效、无权限、快照和新建候选分别显示，不自动选第一个。
- [ ] 🟡 **PM33 表单草稿范围**（依赖 UI06/F03）：草稿按模块/记录/设备隔离，重开可恢复，过期和敏感字段清理规则明确。
- [ ] 🟡 **PM34 空态下一步**（依赖 UI16/CM06）：空库、无结果、缺权限、未启用、失败和陈旧快照各给对应动作，不都显示“暂无”。
- [ ] 🟡 **PM35 搜索同义词与术语**（依赖 CM12/PF17）：成员称谓、模块别名、中文日期、编号和拼音检索规则可测试，结果说明匹配原因。
- [ ] 🟡 **PM36 规则/自动化触发防回路**（依赖 EC07/NX04）：用户动作、定时规则、外部事件、恢复和导入触发边界明确，不互相无限回写。
- [ ] 🟡 **PM37 自动化权限前置**（依赖 R07/DL25）：动作执行前检查页面/字段/附件权限，失败说明缺哪项权限，不静默部分完成。
- [ ] 🟡 **PM38 结构锁定与内容编辑**（依赖 D11/R07）：研究“可改数据但不可改结构”的角色，防止共享成员误删字段、视图和规则。
- [ ] 🟡 **PM39 版本升级的语义迁移**（依赖 Q06/DL08）：schema、枚举、关系、规则和视图升级分别有迁移说明、预览和回滚。
- [ ] 🟡 **PM40 模块完成度标签**（依赖 T05/R06）：ready、skeleton、planned、experimental、blocked 由证据矩阵驱动，不能只看 schema 是否存在。
- [ ] 🟡 **PM41 产品词典与帮助入口**（依赖 CM12/CM17）：每个关键术语、字段、状态和动作都有用户可读解释与上下文帮助。
- [ ] 🟡 **PM42 产品能力边界卡**（依赖 R06/Q11）：在模块、联动、导入、通知、共享、备份页面显示已实现/可试用/规划中标签和证据入口。

## 47. 家庭生命周期与实际服务流程（LS01–LS32，只规划）

> 本组研究独居/多代家庭、租赁搬家、新生儿/学校、临时照护、宠物、行程中断与数字遗产；来源与地区边界见 [第三轮产品调研](docs/research/2026-10-02-生活阶段服务治理与跨地区产品调研.md)。不改变医疗/法律/密码/实时数据/云协作的克制边界；借用现有通用契约，不建立第二份台账。

- [ ] 🟡 **LS01 家庭关系与居住阶段分离**（依赖 D04/MD18/MD21/PM07）：独居、多代、两地、暂住按起止时间记录，一个成员保留多个历史住处；迁入不改旧凭证、不自动共享。
- [ ] 🟡 **LS02 日程例外申请与确认**（依赖 P01/HP08/HP11/PM11）：换接送、节日和假期例外经历提出/待确认/接受/拒绝/生效，未确认保留基础日程，取消可回原计划。
- [ ] 🟡 **LS03 独居者备用办理路径**（依赖 P08/HP23/DL10）：用户选择可交接事项、备用联系人确认与线下资料位置；未响应不推断失能或死亡。
- [ ] 🟡 **LS04 租赁入住与退租条件对照**（依赖 MD08/MD12/MD21/DL05）：按房间/设施对照原始照片、备注、日期与版本，缺项可见；不自动判定责任或赔偿。
- [ ] 🟡 **LS05 交房物品、钥匙与读数交接**（依赖 MD08/MD21/F18/UI22）：交出/收到/缺失/争议分开，数量、原始读数和照片可查；仅记钥匙编号与位置，不保存门锁密码。
- [ ] 🟡 **LS06 房屋缺陷到维修申请回执**（依赖 MD21/H05/PM03/HP57）：发现→报修编号→预约→施工→人工验收追溯，受理消息不等于缺陷已修复。
- [ ] 🟡 **LS07 押金与退租未结事项**（依赖 MD12/MD21/F18/UI19）：预计、对方确认、到账、差额待核对分别存凭证；不计算法定赔偿或自动记账。
- [ ] 🟡 **LS08 搬家新旧服务重叠期**（依赖 MD11/MD12/MD21/F18）：宽带/物业/水电分别记录申请、确认和实际开始/结束，新地址启用不静默结束旧合同。
- [ ] 🟡 **LS09 地址变更逐机构回执**（依赖 F17/MD18/PM15）：银行、保险、学校等逐项记录官方入口、提交/确认和地址类型，改住址不批量标为已通知；不套用国外手续。
- [ ] 🟡 **LS10 新生儿预备事项转实际档案**（依赖 D04/MD22/PM02/PM10）：预产期与实际出生分开，转换由用户确认姓名/日期/来源，保留原计划，不凭预产期生成健康事实。
- [ ] 🟡 **LS11 多照护者日常事件认领**（依赖 D02/EC06/DL22/PM03）：同次喂养/睡眠有 ID、记录者、实际时间和计时归属，重复候选人工核对，不按近似时间自动合并。
- [ ] 🟡 **LS12 婴儿日常观察原始语义**（依赖 D09/UI19/PM03/PM13）：喂养/睡眠/尿布事件保留单位、起止、补录和原备注，缺记录不等于未发生，图表不输出医学建议。
- [ ] 🟡 **LS13 托育照护结班事实摘要**（依赖 LS11/LS12/NX13/HP68）：按班次汇总已记录、待确认和附件，接班确认具体摘要版本；不把空白补为正常或完成。
- [ ] 🟡 **LS14 学校托育接送授权档案**（依赖 P08/MD23/PM05）：记录机构实际获准接送者、有效期、来源与撤销；管家负责人不等于学校授权，不存签到口令。
- [ ] 🟡 **LS15 学校通知到行动与回执**（依赖 F11/F15/MD23/PM03）：原文、行动、截止、提交和机构回执关联，已读、家长确认、受理和办妥分别显示。
- [ ] 🟡 **LS16 转学托育更换双机构收尾**（依赖 MD23/F18/LS14/LS15）：旧机构退出与新机构开始分别核对材料、课时、退费和接送授权，不自动清除旧课程或推定到账。
- [ ] 🟡 **LS17 陪诊准备与实际到场分离**（依赖 F14/MD03/HP08/HP66）：预约、用户/机构给定材料、接送、到场和取得文件分别确认，不推导诊疗方案。
- [ ] 🟡 **LS18 外部机构待回应队列**（依赖 H14/PM03/NX01）：请求、渠道/编号、最近回应和约定跟进日可查，用户决定下一步，不自动拨号或升级医疗警报。
- [ ] 🟡 **LS19 临时照护指令版本确认**（依赖 UI23/DL05/NX12/NX13）：保留原始来源、版本与接收确认，新版不能静默替换已确认旧版，由用户选择重新核对。
- [ ] 🟡 **LS20 宠物预约请求到就诊确认**（依赖 MD07/PM03/H14）：申请、诊所确认、改期、取消和实际就诊分开，保留历史，不假定已连接诊所系统。
- [ ] 🟡 **LS21 宠物续方领取与使用分离**（依赖 MD07/MD13/P06/LS18）：只记录原始指令、申请/领取凭证和实际库存，不推导剂量、疗程、换药或自动补方。
- [ ] 🟢 **LS22 宠物寄养代养交接包**（依赖 MD07/MD29/UI22/LS19）：用户选指令版本与最小联系人，交出、耗用、归还逐项确认，代养结束保留原档案。
- [ ] 🟡 **LS23 行程中断下游影响核对**（依赖 MD27/MD28/F15/PM07）：交通变化列出接驳/住宿/活动/代养影响，用户逐项联络和选择，不自动取消订单。
- [ ] 🟡 **LS24 备选行程与正式预订分层**（依赖 MD28/PM02/PM03）：候选→联络供应商→确认→新凭证分开，候选不是可用票证，原订单及差价凭证保留。
- [ ] 🟡 **LS25 出行状态时效与出处**（依赖 PM05/PM15/H04）：人工/官方/外部产品状态标获取时间与未知项，过时登机口/延误快照不冒充实时信息。
- [ ] 🟡 **LS26 取消退款与替代费用凭证链**（依赖 MD28/UI19/DL05）：原单、取消确认、退款申请/确认/部分到账、新订单分别关联，不判断赔付资格、法律责任或记账结余。
- [ ] 🟢 **LS27 数字遗产计划分账户登记**（依赖 MD09/P08/PM05）：记录官方计划、信任联系人、资料范围与人工核对日，家庭关系不自动产生接管资格。
- [ ] 🟢 **LS28 接管凭证位置与交付确认**（依赖 MD09/DL10/UI22）：只登记访问密钥/纸质凭证保管位置及接收确认，不保存密钥正文；遗失指向官方流程。
- [ ] 🟢 **LS29 不活跃计划与逝世接管分离**（依赖 NX12/PM02/PM05）：分别记录服务官方状态与凭证位置，不依前端活动自行触发分享、删除或死亡判断。
- [ ] 🟢 **LS30 官方接管申请与补件状态**（依赖 LS27/LS28/LS18/PM03）：未申请、待审、需补件、批准、拒绝和撤回分开，批准前不显示已接管。
- [ ] 🟢 **LS31 数字资料与购买权益继承边界**（依赖 R06/MD09/MD11/PM42）：逐服务列可访问、明确排除、未核对范围和官方链接，不宣称订阅/购买/支付/密码全可继承。
- [ ] 🟢 **LS32 接管取回窗口与多联系人影响**（依赖 LS30/DL08/DL09/H14）：以批准通知记录起算/期限、待取回范围和副本核对，永久删除影响可见；不自动删账户或外发资料。

## 48. 用户支持、模板治理与持续维护（OP01–OP28，只规划）

> 本组吸收 Home Assistant Repairs/Blueprints/Diagnostics、Notion 模板审核、WordPress 插件说明和 GitHub 开源治理资料。D12/F07 负责检测/局部修复，本组负责跨会话解决过程；DL29/PM31 负责包和实例，本组负责作者/审核/退出。来源见 [第三轮产品调研](docs/research/2026-10-02-生活阶段服务治理与跨地区产品调研.md)。

- [ ] 🟡 **OP01 持久修复事项簿**（依赖 D12/F07/H01）：待处理、待用户、待外部条件、待复核和已解决跨会话保留，同一故障不重复建项，回检通过才解决。
- [ ] 🟡 **OP02 已知问题适用性查询**（依赖 CM17/Q11/R08）：按实装版本、前端、启用模块显示适用范围、核对日、临时措施和修复版本，未知不推断为不受影响。
- [ ] 🟡 **OP03 有界诊断采集会话**（依赖 D12/T06/PF01）：用户选择单模块与最长时长，复现→停止→预览，状态可见、到期停止，敏感字段不入日志。
- [ ] 🟡 **OP04 临时故障隔离实验**（依赖 H11/Q15/EC29/R08）：按范围和期限暂时暂停模块/联动，比较前后结果，退出恢复配置，不重建台账或补执暂停的业务动作。
- [ ] 🟡 **OP05 本地反馈草稿与路由**（依赖 CM19/T06/PM33）：疑问、建议、数据故障、安全问题各有入口，草稿可续接与预览公开范围，无账号时手动复制/导出，提交由用户执行。
- [ ] 🟡 **OP06 最小复现样本辅助**（依赖 Q03/T06/PM07）：限定故障类型生成合成行与必要关系，空环境仍复现后由用户预览导出，不能复现明确说明，不上传原家庭资料。
- [ ] 🟡 **OP07 模板作者与维护状态卡**（依赖 DL29/HP19/CM20）：作者、实际维护者、适用版本、核验日和支持入口可查，无人维护可见，无证据不标已验证。
- [ ] 🟡 **OP08 模板外部依赖核对**（依赖 DL29/EC29/PM14/R07）：复制前预览外链、附件、权限、插件和人工步骤，取消零写入，失去访问给替代路径。
- [ ] 🟢 **OP09 模板投稿与审核流程**（依赖 CM07/Q03/Q01/DL29）：草稿→自测→审核→可用/退回，检查复制、语言、截图、许可证和空库演练，变更需复核；不引入收费或锁定。
- [ ] 🟡 **OP10 模板接管与分叉责任**（依赖 PM31/DL29/PM26）：接管说明停止来源跟随，保留出处/版本与本地派生标记，既有实例不重建，后续更新明确选择。
- [ ] 🟡 **OP11 模板撤回停更与替代**（依赖 OP07/DL29/PM31/Q12）：标原因、范围、替代和待核对实例，停止推荐不删除/替换已执行实例。
- [ ] 🟡 **OP12 当前用户升级影响摘要**（依赖 CM18/PM39/R06/PM20）：按版本与启用模块列受影响、需操作、无需操作和已知限制，可展开全文，不据版本号推定兼容。
- [ ] 🟡 **OP13 升级人工任务清单**（依赖 OP12/Q06/DL07/CM16）：备份、宿主/依赖更新和迁移列前置、执行位置、证据、阻断，支持中断续看，必需步骤未完不标已就绪。
- [ ] 🟡 **OP14 延后升级与紧急变更解释**（依赖 OP12/H12/CM18/Q12）：可延后且看到受影响问题，紧急程度有发行方来源；离线不伪装已获最新版本、不执行更新。
- [ ] 🟡 **OP15 升级后用户任务复核**（依赖 Q06/T05/PM39/DL16）：提供原记录、提醒、样例录入的可选复核，失败/未核验保留，样例可清理，不以维护者检查代替工作区确认。
- [ ] 🟡 **OP16 实验能力退出稳定路径**（依赖 PM40/Q15/Q06/DL19）：试用前列依赖与退出条件，退出保留原记录并停止实验消费，实验数据需处理项可见，无法降级事先说明。
- [ ] 🟡 **OP17 按任务寻找跨插件设置**（依赖 PM41/CM06/EC29/CM12）：减少提醒、换笔记本、调成员、关联动按任务搜索，定位实际控制方，帮助链接不冒充可操作设置。
- [ ] 🟡 **OP18 已修改设置工作台**（依赖 PM26/DL19/PM20）：集中显示与默认不同的值、来源和范围，单区重置先预览，台账不受影响，失败保留待修改项。
- [ ] 🟡 **OP19 设置修改业务影响预览**（依赖 H14/PM26/D12/PM20）：保存前列模块、提醒及依赖变化，读取不完整说明估算范围，取消零写入，确认只应用所选修改。
- [ ] 🟡 **OP20 设备与工作区配置作用域**（依赖 R07/DL19/DL24/PM26）：先核验存储/同步，再显示当前有效值、工作区值和本机覆盖，只列实际可核验设备，撤回前预览。
- [ ] 🟡 **OP21 真实工作区操作手册**（依赖 PM01/PM08/D12/EC29/CM16）：整理台账位置、模块、联动控制方、备份、未结问题与操作入口，缺项标明，不含密码/token。
- [ ] 🟡 **OP22 替代管理员能力演练**（依赖 R07/DL25/T04/OP21）：在合成/克隆环境完成定位、权限核对、样例恢复与异常联动关闭，阻断可查，双方确认才交接完成。
- [ ] 🟡 **OP23 未结维护事项交接**（依赖 OP01/OP13/OP21/Q13）：问题、升级任务、模板核验含上次检查、负责人、下一步和外部条件，接收确认保留原事项身份。
- [ ] 🟢 **OP24 维护主体与仓库变化核对**（依赖 R05/CM20/OP07/Q11）：核对新旧仓库、发行附件、支持入口和重定向边界后更新说明，不假定静态站点自动重定向。
- [ ] 🟡 **OP25 模块维护责任与接班条件**（依赖 Q01/Q02/T05/EC30）：schema/provider/UI/文档/验证分别列实际负责人或无人维护、所需环境和证据，不虚构人手。
- [ ] 🟡 **OP26 支持窗口与版本退役**（依赖 R05/Q06/R08/EC30）：最低、实测、维护中版本与退出日期分开，退役给升级/保留方案，未知组合不标受支持。
- [ ] 🟢 **OP27 非编码贡献与处理约定**（依赖 Q13/CM12/OP09/Q09）：翻译/模板/文档/复现/无障碍材料、审核、署名和退出明确，响应符合实际维护容量，未处理不冒充排期。
- [ ] 🟢 **OP28 停更退出资料包**（依赖 DL09/DL11/DL30/OP21/OP26/R06）：最后验证版本、适配范围、原生台账、可读导出、未结风险和替代路径可演练，声明与入口同步。

## 49. 产品发现、导航与小驴组合体验（UX01–UX28，只规划）

> 本组侧重产品假设与用户结果的验证，区别于 F/UI 的实现契约和 EC 的接口回归。来源包括 Apple HIG、IBM Carbon、VS Code Profiles、GOV.UK 用户需求与 W3C 导航/语音/一致标识资料，见 [第三轮产品调研](docs/research/2026-10-02-生活阶段服务治理与跨地区产品调研.md)。访谈、用户测试和外部联络均留待后续，本轮不执行。

- [ ] 🟡 **UX01 未使用与弃用者问题证据**（依赖 Q01/CM01）：研究不安装、弃用、只用原生 AV 的触发/约束/办法，直接证据与假设分开，不只收集希望增加哪些功能。
- [ ] 🟡 **UX02 替代办法维护成本对照**（依赖 UX01/CM04）：同一证件/物品任务比较原生 AV、手工笔记与管家录入/纠错/检索成本，保留失败及选择理由，不预设优势。
- [ ] 🟡 **UX03 场景首次价值判定**（依赖 F01/F02/T05）：证件、照护、物品、备考各定义可确认结果与最少输入，观察用户能否独立继续，不把安装/保存成功当价值。
- [ ] 🟡 **UX04 产品假设否证与停做条件**（依赖 Q01/Q02/UX01）：每个新场景先写问题、证据要求和停止/改方向条件，保留负面结果，不默认所有候选都会开发。
- [ ] 🟢 **UX05 零业务写入交互试用**（依赖 CM07/Q03/R06）：研究隔离合成体验，不建真实 AV、不写台账/外部接口、不通知家人，退出无残留，不向真实工作区灌演示数据。
- [ ] 🟡 **UX06 教学跳过与重访状态**（依赖 CM06/PM41）：教程可跳过/重开/按上下文提示，退出不重复全屏教学，看完教程不等于完成业务。
- [ ] 🟡 **UX07 首次动作的按需设置时机**（依赖 F01/EC04/H13）：非必要定制到首次需要时解释、请求和给拒绝后路径，未装系列插件或拒通知仍能完成独立核心任务。
- [ ] 🟡 **UX08 长期未用后的再进入**（依赖 PM39/H04/F20）：只呈现影响原任务的结构/规则变化和待核对资料，不重走完整引导、不自动接纳新增模块，旧快照可辨。
- [ ] 🟡 **UX09 31模块用户分类研究**（依赖 PM01/CM12/UX01）：用真实任务做开放/封闭分类，保留证件/保险/合同、库存/药品/购物歧义，菜单不先由 schema 决定。
- [ ] 🟡 **UX10 导航树与首选入口验证**（依赖 UX09/PM41）：找材料、建备考事项、查保修观察第一选择、错路与回退，改名称/层级后复测，不以信息地图代替可发现性。
- [ ] 🟡 **UX11 核心对象多路径可达**（依赖 F05/PM30/PF17）：成员/档案/事项有浏览与搜索/索引另一途径，归档可找回，键盘/读屏不要求记模块树，流程中间页按标准例外处理。
- [ ] 🟡 **UX12 导航、视图与状态开关分层**（依赖 UI01/PM17/PM22）：切模块、切同源视图、启停不用相同外观混淆，用户可预测结果，切视图不修改事实。
- [ ] 🟡 **UX13 全局与局部搜索切换**（依赖 PF17/PM18/PM35）：一个明显总搜索与模块内范围可辨，扩展范围保留查询并需确认，未读取插件明确排除。
- [ ] 🟡 **UX14 组合筛选可读逻辑**（依赖 H16/PM17/PM27）：成员/模块/状态/日期 AND/OR/排除/未填值显示可读条件，逐项移除可预览，不把零匹配当全家无事项。
- [ ] 🟡 **UX15 搜索建议与最近项隐私**（依赖 R07/HP39/DL18）：共用设备敏感搜索/最近项可关闭清除，声明本机/同步范围，清历史不删原资料、切场景不泄露旧建议。
- [ ] 🟡 **UX16 展开行与专用详情阈值**（依赖 UI02/UI17/PM14）：摘要、延迟补充项、复杂附件关系分别选展开/详情，避免无限嵌表，窄屏和读屏可辨展开边界。
- [ ] 🟢 **UX17 同类记录比较视图**（依赖 PM13/PM14/D09）：新旧证件/保单/合同和候选服务并排核对日期、权益、金额、来源、不可比字段；比较零写入，采纳另确认。
- [ ] 🟢 **UX18 场景配置与身份权限分离**（依赖 F20/NX35/R07）：家庭/照护/备考界面组合可预览，切换不改授权或共享事实，配置导出不含敏感资料和机器路径。
- [ ] 🟡 **UX19 当前操作上下文可见**（依赖 NX11/DL25/EC05）：工作区、资料成员、实际操作者、代理状态明显且在敏感确认中复现，同名家庭/成员不误写。
- [ ] 🔴 **UX20 共用设备表面信息清点**（依赖 HP39/CM15/UX15）：清点标题、通知预览、最近项、剪贴板、打印和返回缓存，说明清除/遮蔽边界，UI 遮蔽不宣称权限隔离。
- [ ] 🟢 **UX21 演示配置私密资料隔离**（依赖 UX05/UX18/CM08）：仅合成或用户明确选定资料，不继承真实搜索/通知/姓名，退出恢复原配置，截图不混入私密原数据。
- [ ] 🟡 **UX22 语音控制可见名一致性**（依赖 UI02/UI05/Q09）：可见动作包含于可访问名称，重复按钮有行上下文，系统语音可按可见名命中，不以键盘检查代替语音验证。
- [ ] 🟡 **UX23 跨模块系列帮助入口一致性**（依赖 CM06/CM19/PM41）：自助/上报入口位置可预期且保留任务环境，指向实际归属插件，如实说明支持可用性，不自动上传或联络。
- [ ] 🟡 **UX24 系列动作标识与反馈语义**（依赖 PM06/CM12/EC06）：打开/关联/导入/已读/完成/归档/解绑图标与回执一致，领域差异有说明，同图标不暗指相反动作。
- [ ] 🟡 **UX25 系列组合收益与选择成本**（依赖 EC29/CM11/UX01）：备考/阅读/人情/照护列最小插件组合、各自结果与维护成本，允许只用管家，不强制安装全系列。
- [ ] 🟡 **UX26 跨插件接力任务预告**（依赖 F05/EC03/EC05/EC08）：跳转前说明目标动作、传递上下文与回程，未 ready 可保存进度/走替代路径，完成步骤可确认且无重复录入。
- [ ] 🟢 **UX27 系列教学去重复**（依赖 UX06/EC29/PM41）：共有操作与特有操作分开，新插件只解释任务新增能力，可跳过与找回帮助，不向未授权插件分享学习记录。
- [ ] 🟡 **UX28 组合体验用户结果验证**（依赖 EC30/UX03/Q01）：报名→复习→成绩归档、摘录→完成→回顾观察重复输入、迷失、结果理解与独立使用对照，负面证据保留，不以接口通了证明价值。

## 50. 地区、多语言与日历交换深度（LC01–LC24，只规划）

> 本组把旧第 30 组的界面翻译延伸到真实数据输入与交换；依据 W3C 姓名/时区资料、Unicode CLDR/ICU、RFC 5545 和 Google Calendar 导入说明。PM 定义通用时间/单位/身份契约，本组验证跨地区使用与格式互换的边界。

- [ ] 🟡 **LC01 语言、地区与业务时区分开**（依赖 PM12/UI17）：界面语言不自动更改成员地区、事件时区、币种或模板适用政策；变更偏好有影响预览。
- [ ] 🟡 **LC02 周起点、周号与隔周计划**（依赖 HP10/PM11）：周日/周一开始、ISO 周年和学期周分别标识，跨年“第1周”不重排已执行实例。
- [ ] 🟡 **LC03 日期输入歧义确认**（依赖 D09/H09）：03/04/05、两位年份和相对日期保留原文与解析基准，给候选预览，不按设备语言静默选日期。
- [ ] 🟡 **LC04 家庭活动日的切分**（依赖 PM12/NX27）：夜班、跨午夜旅行与自然日统计区分；自定义复盘日界线只改变分组，不改业务发生时间。
- [ ] 🟡 **LC05 年龄与未知出生年**（依赖 D04/MD22）：精确生日、仅月日、估计年龄和纪念日分别建模；缺出生年不能推导儿童学段、法定资格或医疗计划。
- [ ] 🟡 **LC06 法定名、常用名与称谓**（依赖 MD01/D04）：支持完整原文、常用称谓和可选法定名，不强制姓/名拆分、大小写转换或家庭同姓。
- [ ] 🟡 **LC07 转写与同音姓名检索**（依赖 PM35/D06）：拼音/拉丁转写仅作搜索别名，同音、简繁或重音归一匹配不得当稳定身份。
- [ ] 🟡 **LC08 本地化排序与稳定次序**（依赖 UI15/PF17）：比较拼音、笔画、数字片段和语言排序；偏好变化不改变 ID，同排序值有可解释的次序。
- [ ] 🟢 **LC09 国际地址与原文保留**（依赖 MD18/F17）：地址允许自由文本与可选结构，不强制州/邮编或固定国别字段；打印/分享保留原文与地区提示。
- [ ] 🟡 **LC10 电话与标识符不当数值**（依赖 MD18/HP40）：国家区号、分机、前导零、字母和空格保留为字符串，拨号/导出前预览，不把联系人号码转成金额格式。
- [ ] 🟡 **LC11 数字分隔与输入规则**（依赖 UI19/PM13）：小数逗号、分组空格、非拉丁数字及负数表示先确认含义，显示格式与原始精度分离。
- [ ] 🟡 **LC12 币种代码与混币汇总**（依赖 PM13/PM23）：同为 ¥ 的 CNY/JPY 和原始币种明确；混币只分项，折算需用户给汇率/核对日，不自动获取行情。
- [ ] 🟡 **LC13 单位偏好与事实换算**（依赖 PM13/P06）：英制/公制显示切换不二次换算源值；采购单位和库存单位映射由用户确认，未知换算不扣库存。
- [ ] 🟢 **LC14 节日、校历与地区来源**（依赖 HP10/HP21/V02）：法定假日、调休、学校学期和家庭习俗分开；来源有年份/地区/复核日，更新只生成候选差异。
- [ ] 🟡 **LC15 出行双时区呈现**（依赖 MD27/PM12）：出发地、目的地与当前设备时间并列，跨日/国际日期线不改行程原始时间，提醒明确采用哪一时区。
- [ ] 🟡 **LC16 导出展示与机器字段分离**（依赖 DL09/DL11）：本地化日期/金额留给可读视图，回导字段保留标准值、币种、单位和时区；CSV 分隔和字符编码在预览中说明。
- [ ] 🟡 **LC17 iCalendar 稳定 UID 映射**（依赖 HP38/DL14/PM04）：标题、地点或负责人变更不生成新事件身份；来源日历与 UID 联合去重，重复导入返回同一映射。
- [ ] 🟡 **LC18 重复例外与编辑范围**（依赖 HP37/PM11）：保留 RRULE/RDATE/EXDATE/RECURRENCE-ID，分别预览本次、此后、全部；不支持的规则保持只读与原文件。
- [ ] 🟡 **LC19 全天、浮动时间与结束边界**（依赖 H09/PM12）：验证 RFC 5545 的 DATE、floating、TZID 和非包含结束时间，未知时区进入待确认，不把两天事件缩成一天。
- [ ] 🟡 **LC20 不支持日历字段的保留**（依赖 DL09/PM14）：VEVENT/VTODO、附件、扩展字段和关联关系列出支持/保留/损失，不能把部分解析称无损导入。
- [ ] 🟡 **LC21 日历修订与旧包防覆盖**（依赖 DL14/DL22）：同 UID 的 SEQUENCE/DTSTAMP 与本地编辑形成修订预览；旧导入不默默复活已取消事件。
- [ ] 🟡 **LC22 导入邀请与闹钟隔离**（依赖 NX31/DL12）：ATTENDEE、组织者、会议链接和 VALARM 先显示差异；导入不自动发邀请、发邮件、访问外链或开启高优先级通知。
- [ ] 🟡 **LC23 日历导入与同步说明**（依赖 HP06/HP38/CM17）：导入副本、订阅、可写同步分别展示来源与更新时间，参与者/会议字段损失写入回执，断开不声称副本会继续更新。
- [ ] 🟢 **LC24 多语混排与复制保真**（依赖 UI11/UI12/LC06）：中文、长数字、阿拉伯/希伯来文字、重音与组合字符在名称/编号中可读可复制，截断与排序不改变原始内容。

## 51. 定位、作用与价值边界（PV01–PV24，只规划）

> 每条是可被支持或否证的具体产品命题，不是新的默认决策。按承担者/资料主体/使用节奏/采用成本/退出价值判断作用，来源与取舍见 [定位与宽深研究](docs/research/2026-10-02-定位作用与宽深扩展研究.md)。研究后保留适用条件和负面结果；不改 D1–D12。

- [ ] 🟡 **PV01 家庭录入者的净收益**（依赖 P08/HP49/UX03）：比较少查找/少催办/少解释与新增补录劳动，列实际承担者及配合条件，不让主记录者成为无限秘书。
- [ ] 🟡 **PV02 被登记家人的自主受益**（依赖 NX11/NX12/R07）：研究本人确认、拒绝非必要记录和取得结果的路径，保留资料主体与录入者利益冲突及处理边界。
- [ ] 🟡 **PV03 独居用户最小核心价值**（依赖 F01/LS01/UX03）：只管理自己的证件、物品、服务也能取得一个结果，家庭邀请/亲属资料不成为前提；默认开关另按决策调整。
- [ ] 🟡 **PV04 两地家庭共同与独立事务**（依赖 LS01/HP27/P08）：验证异地家人各自维护和只共享结果的适用事项，不将家庭等同一住处/账号，独立保管范围可说明。
- [ ] 🟡 **PV05 非思源家人最低受益路径**（依赖 R07/UI22/HP23）：打印、离线卡和可读副本能否支持具体任务分别验证，不能要求全家安装思源，副本陈旧及不能做的动作明确。
- [ ] 🟡 **PV06 非思源用户采用成本**（依赖 UX01/UX02/CM16）：把宿主安装、工作区理解、备份和维护纳入单场景收益，给适合/不适合条件，不用免费推断采用容易。
- [ ] 🟡 **PV07 原生台账用户增量价值**（依赖 F09/D10/UX02）：原库仅接入提醒、检索或聚合能完成一个结果，无须迁整套结构；不能接管和收益不足的情况可查。
- [ ] 🟡 **PV08 不完整资料的最低有用信息**（依赖 UI15/PM05/UX03）：比较名称/出处/可信日期的有限价值、必须补齐字段与不可承诺结果，避免为档案完整强收私密资料。
- [ ] 🟡 **PV09 年度低频成功口径**（依赖 UX08/H13/DL24）：长期未打开后可找记录、识别时效并续办，定义低频成功与维护失败，不用日活或每日提醒制造价值。
- [ ] 🟡 **PV10 日常资料复用收益**（依赖 PF17/UX13/PM14）：查地址/收据/保修/上次维护比较步骤与重复问询，收益以少录入、快找到验证，不以新增条数或连续打卡判断。
- [ ] 🟡 **PV11 人生变化资料重组成本**（依赖 LS08/LS09/F15/PM20）：搬家/转学/临时照护分别识别真正需改、应留历史和无关资料，不重建整家档案，新增管理负担可量化。
- [ ] 🟡 **PV12 成长档案逐步自主**（依赖 NX14/DL25/LS01）：家人独立生活后能理解出处、取回自己的资料并选择维护范围，权限与本人选择有依据，不自动推定成年资格或所有权转移。
- [ ] 🟡 **PV13 整理后的安心结果**（依赖 NX34/HP55/UX03）：观察能否说清需办/未知事项及被催促、被评判、强补资料的压力，负面感受保留，不以绿色清零或完成率证明安心。
- [ ] 🟡 **PV14 办妥凭证的事后价值**（依赖 H05/PM14/DL05）：回答去年是否办理、在哪办理、凭证在哪，区分用户记录/机构凭证/未知内容，验证是否减少重找与重复说明。
- [ ] 🟡 **PV15 库存精度与维护负担对照**（依赖 P06/MD14/H15/UX02）：比较完整出入库、周期盘点、只记关键低库存，给适用商品和遗漏误导条件，深度由收益决定。
- [ ] 🟡 **PV16 不同模块有效深度分层**（依赖 UI15/T05/PM40）：证件/资产/健康/教育各确定最低独立结果与只适合引用/提醒的能力，字段齐全不认证可用，不自动改默认启用。
- [ ] 🟡 **PV17 高后果事项承诺上限**（依赖 H13/R06/PM42）：复诊/缴费/证件失效按档案索引、辅助提醒与实际依赖研究，通知不可可靠到达时限定声明，列应并用正式渠道的条件。
- [ ] 🟡 **PV18 新模块核心职责纳入准则**（依赖 PM02/PM08/Q01）：以具体对象/来源/退出路径说明如何查资料、辨时间、处理家庭事务，形成纳入/引用外部/暂不做结论。
- [ ] 🟡 **PV19 专业替代的停止判据**（依赖 CM04/R06/PM42）：具体候选若必须输出医疗/法律/实时账户/专业调度才成立，记录停止条件与仍可提供的事实整理/官方入口帮助。
- [ ] 🟡 **PV20 管家与系列插件产品分工**（依赖 EC07/PM08/UX26）：原文、联系人、学习活动与生活资料/日期/办理责任分别说明负责方，每个用户结果有明确承接者。
- [ ] 🟡 **PV21 零联动下完整核心承诺**（依赖 EC03/Q15/T05）：禁用全部系列插件后，证件提醒、资料检索和台账保留的生命周期仍可验证，独立能力及降级限制明确。
- [ ] 🟡 **PV22 学习结果与现实办理结果**（依赖 EC20/EC23/EC27/MD06）：刷题/复习/已读与报名/参加/取得证书分别理解，学习进度不自动关闭业务事项，用户能说清两类结果。
- [ ] 🟡 **PV23 扩模块后的维护负债**（依赖 PM20/UX03/OP25）：核心组合与加采购/库存/家务后的更新、故障、提醒负担对照，保留少用更适合的结论，关闭不删原数据。
- [ ] 🟡 **PV24 退出后的原生资料价值**（依赖 DL09/DL11/OP28/PM14）：卸载/停用后仍能通过文档、AV、可读副本找到关键记录和出处，失去的提醒/偏好明确，不以能导出证明实际可用。

## 52. 权益、凭证与资源的业务深度（BD01–BD24，只规划）

> 来自 GOV.UK 证件、Apple 订阅/退款、Lemonade、IKEA、Snipe-IT、Library of Things、Zotero 官方资料。国外期限/费用/资格仅作案例；原始条件、当事主体、实际确认与结果凭证分别保存。F/AF 管通用办理，BD 管不同业务的独特含义，见 [定位与宽深研究](docs/research/2026-10-02-定位作用与宽深扩展研究.md)。

- [ ] 🟡 **BD01 证件挂失补发与找回**（依赖 MD02/F14/PM03/DL05）：遗失、挂失回执、申请、新证和旧实物找回可追溯，找回不自动启用已挂失证件，效力按发证机关事实核对。
- [ ] 🟡 **BD02 特定用途证件要求卡**（依赖 MD02/MD27/MD28/PM10/PM15）：身份/签发地/目的地/转机地/旅行日/用途绑定官方要求和核对日，签发日与余期条件可并存，不设全球通则。
- [ ] 🟡 **BD03 换号后关联资料核对**（依赖 F14/D03/PM07/PM29）：预订/账户/申请列需更新、已提交、对方确认，旧号与历史票证保留，新证取得不自动改全部来源。
- [ ] 🟡 **BD04 缴费与保障生效条件分离**（依赖 H09/H10/MD05/PM10/PM15）：缴费、保障起止、原件等待期/宽限期分别存来源，付款完成不宣称所有保障生效，不判断理赔资格。
- [ ] 🟡 **BD05 逐物品附加保障审批**（依赖 MD05/MD08/HP56/PM03）：物品、照片/收据、补件、批准/拒绝和确认起始可查，上传不等承保，单项拒绝不使整张保单失效。
- [ ] 🟡 **BD06 一次事故多份理赔申请**（依赖 MD05/F15/PM04/PM07）：事故关联多保单/机构/申请编号，重交不新建事故，单申请办妥不关其他申请，不分配赔付或判断重复索赔。
- [ ] 🟡 **BD07 理赔材料实际提交版本**（依赖 BD06/DL05/PM14/F14）：机构要求版本、提交日、附件快照和补件分别留存，本地后来修改不改旧提交，缺项按申请批次可辨。
- [ ] 🟡 **BD08 理赔决定与分批到账**（依赖 BD06/UI19/PM03/PM13）：原样记录机构决定、通知支付、用户确认各次到账和未结，首笔/批准不自动结案，不推算应赔额。
- [ ] 🟡 **BD09 订阅扣费方与管理账号**（依赖 MD11/D04/PM05/PM14）：品牌、收费渠道、非秘密账号标识、付款成员与可取消者分开，同名不同渠道可辨，入口由原回执定位。
- [ ] 🟡 **BD10 家庭共享权益逐成员核对**（依赖 BD09/D04/MD11/P08/PM07）：购买/付款/服务家庭组/实际权益分开，购买共享关闭不一律终止订阅共享，外部服务权限不变成管家权限。
- [ ] 🟡 **BD11 套餐变更过渡期**（依赖 MD11/H10/DL05/PM10）：原套餐、拟选、变更回执、确认生效日分开，选择不覆写当前权益/历史价格，不默认即时生效或算退补款。
- [ ] 🟡 **BD12 保修条件与凭证适用性**（依赖 MD08/MD12/HP56/PM15）：型号/批次/保修文本/凭证/条件/待核对关联，期限内仅说明日期事实，覆盖与费用按厂商确认。
- [ ] 🟡 **BD13 物品部件保障范围**（依赖 BD12/MD08/PM07/PM10）：整机、部件、耗材原件范围和期限可辨，修部件不延长整机保障，不用最长/最短日期代替全部部件。
- [ ] 🟡 **BD14 维修授权与费用确认**（依赖 BD12/HP57/HP58/PM03）：报修、厂商覆盖决定、授权范围、报价、用户确认、实际凭证分开，预约/报价不当已授权或已修复。
- [ ] 🟡 **BD15 售后换新身份与权益连续性**（依赖 BD12/MD08/F16/PM04/PM07）：旧物、案件、新序列号、交回/收到及确认保修关联，寄出不当新物已收，不自动重获完整保修。
- [ ] 🟡 **BD16 退换实物与配件回执**（依赖 MD10/F16/P06/PM03）：按分项存打包、承运、收到/验收、退回/替换，退款批准不恢复库存，缺配件可见，换货不重复当首次收货。
- [ ] 🟡 **BD17 合同通知窗口与送达核对**（依赖 MD12/H09/PM10/PM15）：用户核对版本的取消/不续约窗口、通知方式、回执可查，结束日与通知日分开，不推算法定送达。
- [ ] 🟡 **BD18 合同具体承诺履约验收**（依赖 MD12/F15/PM03/PM07）：双方逐项承诺、交付、人工验收、整改和证据关联，部分/签署/服务结束不等全部履约，不判断违约责任。
- [ ] 🟡 **BD19 公共物品请求与实际占用**（依赖 MD08/D04/PM03/PM07）：所有者、请求人、具体实物/可接受型号、分配、领取确认分开，预约不改所有权/位置，不承诺实时锁定。
- [ ] 🟡 **BD20 借还套件与部分归还**（依赖 BD19/P06/MD08/PM13）：主体/配件/数量、归还状况、接收确认和未还逐项可查，主体返还不关缺配件事项，不自动判责或扣款。
- [ ] 🟡 **BD21 借期延期申请与确认**（依赖 BD19/BD20/H09/PM03）：原期限、拟延期、接受/拒绝和生效留存，申请不改现行日，后续预约冲突由用户协调，不自动算罚费。
- [ ] 🟡 **BD22 账面总量与可用数量**（依赖 P06/MD14/BD19/BD20/PM13/PM23）：在库、已借、待领取分配、坏/待检和可用分别计，解除占用不制造入库，单位不可比不精确汇总。
- [ ] 🟡 **BD23 按办理用途找正确凭证**（依赖 HP56/PM14/PM18/PM35/UX13）：从物品/订单/保单/申请找到本次所需证据，显示对象/版本/用途/打开状态，近似型号同名不自动选。
- [ ] 🟡 **BD24 纸质原件与实际保管位置**（依赖 PM14/P07/HP62/F19/BD19）：原件/复印/扫描、要求来源、地点/交给谁/待取回分开，附件可开不表示原件在家，仅有扫描件可辨。

## 53. 思源原生知识、事实与资料深度（NV01–NV23，只规划）

> 本组将字段、原文段落、附件、长文档案与现实事实相连；PM/DL 管通用来源/历史/权限，本组管依据和实际使用。思源 v3.8.5 固定 tag API 文档仅证明声明，仍待真实实例验证，引用关系不能当访问权限。来源见 [定位与宽深研究](docs/research/2026-10-02-定位作用与宽深扩展研究.md)。

- [ ] 🟡 **NV01 字段级原文依据**（依赖 D09/P12/PM05/PM14）：日期/地址/保修值回到准确原文块或PDF标注，显示核对日与手工补充，来源不可读不标已核验。
- [ ] 🟡 **NV02 材料反向业务使用清单**（依赖 NV01/PM07/PM08/R07）：一份材料列被哪些字段/事项/决定用于何目的，可返回使用处，读取范围与无权项明确。
- [ ] 🟡 **NV03 原文变更使核验待复核**（依赖 NV01/DL05/PM09/H11）：相关段落变化与无关变化分开，受影响字段待复核、旧依据保留，不由新原文自动改事实。
- [ ] 🟡 **NV04 现实资料矛盾待核对**（依赖 NV01/PM05/PM13/UI16）：不同文件矛盾值、原文和适用区间并列，可选当前/历史/暂不定案，两原件保留，不以新写入裁决。
- [ ] 🟡 **NV05 按目的核对资料充分性**（依赖 F14/F15/NV01/PM02）：用户给目的与要求，齐备/缺失/待核验/不适用可查，字段满或附件在不等于能支持此步骤，不判资格。
- [ ] 🟡 **NV06 事实与知识时间分离**（依赖 PM10/DL05/NV01）：事实适用、资料形成、登记/核验日分开，今天补录不冒充去年已知，缺当时记录不重建当时结论。
- [ ] 🟡 **NV07 对象真实经历纪事索引**（依赖 PM04/PM07/PM03/HP58/MD01/R07）：同成员/物品跨模块事实按实际时间归组回源，同事项多材料合并呈现，补录不当发生。
- [ ] 🟡 **NV08 凭证业务替代关系**（依赖 PM04/PM07/MD12/NV01）：新证/批单/更正报告之间补充、纠正、替代、并行适用有范围与日，旧凭证及历史事项原依据保留。
- [ ] 🟡 **NV09 家庭决定理由与后续结果**（依赖 F15/PM14/UX17）：普通笔记保留比较资料、当时约束、为何选择和事后结果，评价作为新记录，不改当时理由或自动判好坏。
- [ ] 🟡 **NV10 未链接提及关联建议**（依赖 PM35/LC07/PM32/PF17/R07）：查选定对象名称/别名的原文上下文供逐项确认，同名/代称/模糊匹配不自动变身份引用。
- [ ] 🟡 **NV11 原文依据上下文阅读**（依赖 NV01/P12/PM14/UI16）：展开标题、相邻块及原顺序并定位，截取边界可见，孤立日期/条款不被概括成更强事实。
- [ ] 🟡 **NV12 原生段落建立办理行动**（依赖 P12/F14/PM03/PM19/D03）：选现有段落确认行动/负责人/日期，保留源块与原文位置，重复创建幂等，打开原文不算办妥。
- [ ] 🟡 **NV13 档案待澄清问题**（依赖 NV01/NV04/NV05/PM34）：问题绑定字段/原文、确认对象、下一步和答复依据，回答留过程，未知不填猜测，区别软件故障。
- [ ] 🟡 **NV14 摘要与原生长文档案分工**（依赖 D09/PM14/PM21/P12）：结构化字段关联用户长文块，摘要回说明，原生标题/列表/引用可编辑，不塞全文进备注或运行缓存。
- [ ] 🟡 **NV15 笔记重组依据连续性**（依赖 P12/PM04/NV01/PM29）：移块/拆分/合并/提取验证身份与范围，保持则更新位置，变更需重新指定，不靠同名近似文本续接。
- [ ] 🟡 **NV16 跟随引用与当时依据意图**（依赖 NV01/DL05/DL08/PM14）：用户选持续阅读或当时采用，固定依据保版本/内容/核对日、现原文另入口，链接有效不等于历史未变。
- [ ] 🟡 **NV17 原生字段修改后的依据脱钩**（依赖 NV01/NV03/PM09/PM26/H11）：值与旧核验不再对应时标手改/待复核，保原文并可重新关联，不继续显示旧核验标记。
- [ ] 🟡 **NV18 原生文档上下文台账**（依赖 P12/D10/PM07/NV14/R07）：成员/房屋长文研究同AV上下文镜像，同源修改、范围可查，关联失效零结果须解释，过滤不当权限。
- [ ] 🟡 **NV19 原生索引局部更新边界**（依赖 NV14/NV18/PM08/D08）：仅改确认属插件的索引块，用户说明/排序保留，未知编辑先预览，不整页重建长文档案。
- [ ] 🟡 **NV20 搜索事实与文字提及分层**（依赖 PF17/PM02/PM18/PM35/UX13/NV01）：当前事实/历史依据/未确认提及/计划标类型与命中位置，同源可归组，文字命中不当有效事实。
- [ ] 🟡 **NV21 家庭问题可查证检索卡**（依赖 NV01/NV07/NV09/PM18/PM23/PF17）：上次换什么零件/为何取消服务按明确对象时间条件回到记录和依据，缺口可见，不生成无依据答案。
- [ ] 🟡 **NV22 原生解绑后的资料回退**（依赖 P12/PM29/H03/D08/NV14）：独立行删除、绑定解绑、底层块删除分开，原文仍在可定位，提醒/统计状态解释，重新关联需确认。
- [ ] 🟡 **NV23 原生模板复制或镜像选择**（依赖 DL29/PM31/NV18/P12）：copy独立库/reference同库目的预览，依赖/数据/视图明确，副本不误接原成员，镜像不宣传隔离副本。

## 54. 从资料到办妥的轻量事务闭环（AF01–AF24，只规划）

> 本组深化 F14/F15/F18 的具体办理语义，以证件换发、理赔、维修、退订等现有台账场景为样本。参考 GOV.UK 多任务、答案核对和确认页设计；正式要求和外部受理结果以用户保存的原始机构资料为准，所有步骤引用既有记录。

- [ ] 🟡 **AF01 事项结果与关闭证据**（依赖 F15/PM02/PM03）：每次办理明确目标、受益对象及何种凭证算办妥；材料齐、已提交、已受理、已取得结果分别显示。
- [ ] 🟡 **AF02 办理日期与自主准备计划**（依赖 PM10/H09/HP36）：外部截止、预约、个人准备、答复承诺和结果有效期各存来源，准备计划变化不修改业务截止。
- [ ] 🟡 **AF03 前置步骤与可并行步骤**（依赖 F15/PM07）：用户说明哪些步骤必须先办、哪些可同时准备，未就绪项显示原因和可做动作；变更不静默完成下游。
- [ ] 🟡 **AF04 可选材料与替代路径**（依赖 F14/PM05）：区分必需、可选、满足其一和替代材料，引用机构要求版本，由用户确认适用路线，不凭字段非空自动判资格。
- [ ] 🟡 **AF05 材料就绪与事实缺失**（依赖 D09/PM05/NV01）：待找原件、待更新、需复印、缺来源、已核对分开，未知不当不需要，模块有记录不当材料已齐。
- [ ] 🟡 **AF06 要求变化对进行中事项影响**（依赖 V02/NX17/DL05）：来源更新列新增/替换/待核对材料与受影响步骤，保留当时依据，用户确认后调整。
- [ ] 🟡 **AF07 本次办理材料清单**（依赖 F14/F15/PM14）：按办理目的挑选现有附件/原件位置/办理对象，标需携带/需提交/仅参考，核对缺件与失效，不复制第二套档案。
- [ ] 🟡 **AF08 材料复用的用途与有效性**（依赖 AF07/PM14/UI22）：同一资料用于不同机构时分别确认有效期、版本、授权用途和必要字段，旧用途确认不能替代新用途核对。
- [ ] 🟡 **AF09 提交材料包不可变快照**（依赖 DL08/DL10/AF07）：保存用户实际提交的字段/文件清单与时间，源资料后来修改不改已交包，重交生成新版本。
- [ ] 🟡 **AF10 提交前统一核对页**（依赖 UI05/PM21/AF09）：办理人、受益对象、机构、材料、截止和下一步可查改，返回修改保留输入；核对通过与正式提交分开。
- [ ] 🟡 **AF11 办理渠道与实际执行位置**（依赖 PM15/MD19/F05）：柜台、电话、邮寄、官方网站分别保存官方入口和要求，打开网址只记进入，不自动标提交或代填外部账号。
- [ ] 🟡 **AF12 外部提交回执登记**（依赖 LS18/PM03/PM05）：登记参考号、渠道、实际提交时间、受理范围、回执原文和预计下一步，提交失败/未确认不显示受理。
- [ ] 🟡 **AF13 等待期与人工跟进计划**（依赖 LS18/NX01/AF12）：等待对方、待用户补件、可继续下一步分开，约定跟进日与截止独立，不每日催促无可执行动作。
- [ ] 🟡 **AF14 补件与重新提交接续**（依赖 AF09/AF12/DL05）：补件原因、要求版本、所补附件和新回执关联原申请，不重建整件事项，成功不会掩盖其他未受理步骤。
- [ ] 🟡 **AF15 阻断解除后的下一步**（依赖 AF03/AF13/H14）：缺材料/无权限/机构未回应/资源不可用显示具体解除条件，解除后供用户确认继续，不自动执行外部动作。
- [ ] 🟡 **AF16 部分办妥与部分未结**（依赖 F15/PM03）：多人/多项目申请逐项记录结果、凭证和未结原因，整体状态可展开，不因一个结果关闭所有关联提醒。
- [ ] 🟡 **AF17 结果凭证与源台账更新**（依赖 D03/H10/PM04）：新证件/合同/许可/退款确认绑定本次事项，预览应更新字段，保留旧记录与业务身份，失败可补同一结果。
- [ ] 🟡 **AF18 本次办妥与后续义务**（依赖 H05/H14/PM11）：完成后解释何时复核/续期/取回原件，用户决定是否建下一步，办妥不等于所有义务永久结束。
- [ ] 🟡 **AF19 取消、撤回与放弃原因**（依赖 F18/PM03/DL05）：用户意向、外部撤回确认、实际退出和保留义务分开，取消不删除凭证或替用户终止第三方合同。
- [ ] 🟡 **AF20 已办结果纠正与重开**（依赖 H07/F08/PM03）：发现办错对象、材料失效或结果被更正时记录原结果/理由/新步骤，恢复相关处理计划而不抹旧历史。
- [ ] 🟡 **AF21 重复办理发现与合并预览**（依赖 D02/DL14/PM28）：同成员/来源/事项的并行申请仅提示候选，参考号、时间和原始凭证核对后选择关联/保留，不能按标题自动合并。
- [ ] 🟡 **AF22 进行中事项的人工交接**（依赖 NX13/UI23/AF12）：交出当前依据、已交材料、回执、未结步骤与下一联系点，接收确认具体版本，资料查看权限另核验。
- [ ] 🟢 **AF23 办理复盘与下次准备包**（依赖 F20/HP19/PM31）：记录实际缺件、补件和等待原因，供用户更新下次清单；本次结果不变成普遍机构要求，不自动复用敏感附件。
- [ ] 🟡 **AF24 单步与多步承载选择**（依赖 UX03/UX04/AF01）：比较一条记录、一份清单和多步状态三种复杂度，仅在跨会话/依赖证据存在时选多步；简单到期事项仍可直接处理。

## 关键路径速览

```
已完成基线：S0–S5 / Tab 外壳 / 31 schema / GitHub v0.2.0 发行 / 自动门禁
后续开发顺序（本轮不执行）：
  **G0 范围与证据冻结**：D1–D12 / PV / PM / OR01–OR08 → **G1 数据与宿主契约**：S 余项 / D01–D12 / H 基础 / R08 / Q 最小 fixture
      → **G2 核心纵向闭环**：certs+members / F01–F08 / UI 基础 / PF 首测 / T 真实回归
      → **G3 提醒与恢复可用**：H01–H16 / D12 / DL 最低线 → **G4 领域办理结果**：MD 分批 / HP·BD·NV·AF 样例
      → **G5 AI 只读协作**：SA01–SA12/18–21 / AX01–AX16 → **G6 AI 草稿采用**：SA13–16/22–24 / AX17–28 / MA 分批
      → **G7 生态接力**：EC01–EC08 后按收益扩展 → **G8 可携带与运营**：DL 完整线 / Q·T / R / CM / OP
  旧编号对照（不是第二条开发路径）：H01–H03 运行态/响应/备忘 + D01–D03 完整读取/身份/保存
      → D07/D12 诊断最小支撑 + H04 失败快照
      → D04–D12 成员/恢复/capture + H05–H16 动作/规则/通知
      → R01–R06 发行与能力声明 → T01–T06 故障及真实附件验收
  V01 官方程序校核可先行；政策模板接线依赖 V02–V04
  P01–P12 按依赖选取，不同时开启 31 模块深化
  F/PF/UI 分层并行：D/H 核心后先落 UI02–UI06 基础契约；PF01/PF02 与 UI 测量互相提供数据，再按场景验收 F01–F20（不要求整组 F 先于整组 PF/UI）→ MD01–MD31 分批
  EC01–EC08 先定运输/授权/幂等 → EC09–EC30 按现有接口分插件验证；CM01–CM20 只在证据矩阵后准备
  Q01–Q15 作为跨组验证与维护门槛，不替代真实用户回归
  产品研究并行：PM01–PM04 统一对象/身份；HP/DL/NX 交叉引用权限、恢复、通知和可信来源契约
  UX01–UX04 先验证需求/首次价值/停做条件；UX09/UX10 校验导航；UX26/UX28 验证系列接力结果
  LS01–LS32 延伸家庭变化与外部服务状态；OP01–OP28 延伸支持/模板/升级/交接/停更；LC01–LC24 校验跨地区输入和日历交换
  PV01–PV24 检验承担者/受益者/采用/低频/退出价值；BD01–BD24 深入权益/售后/借还；NV01–NV23 打通字段与原文依据
  AF01–AF24 以少数真实场景验证准备→提交→等待/补件→结果→后续，单步/多步按复杂度证据选择；核心H/D门槛保持优先
实测条件：思源真实实例、双设备/移动端、测试数据与具体平台版本；各项单独标明。
```

## 55. 思源 Agent 接入契约与能力治理（SA01–SA24，只规划）

> 本组把“注册能力”“准备提示词”“把提示词送入原生 Agent”拆开。固定版本证据、公开 API 边界与降级方案见 [AI 融入与思源智能体调研](docs/research/2026-10-02-AI融入与思源智能体调研.md)。前端 `addAgentCapability`、内核 `registerCapability` 均未在本轮实现。

- [ ] 🔴 **SA01 固定版本接入矩阵**（依赖 R05/R08/EC01）：分别记录思源 3.8.0/3.8.5、SDK 1.2.8、sample 0.5.0 的声明/源码/真机状态，不因接口存在提高完成标签。
- [ ] 🔴 **SA02 总体与模块能力目录**（依赖 PM01/PM40/R06）：按查询、材料整理、模块解释、提醒解释、办理准备登记输入、输出、依赖和副作用；skeleton 模块不暴露可执行写能力。
- [ ] 🔴 **SA03 前端与内核职责划分**（依赖 EC02/H11/SA02）：面板导航和用户选择由前端处理；领域读写按真实所有权选择一层；相同动作不注册冲突工具。
- [ ] 🟡 **SA04 稳定能力身份与名称**（依赖 PM04/EC01）：保存宿主返回 ID/完整名称与版本，显示标题变化不改变身份，不手拼哈希工具名。
- [ ] 🔴 **SA05 注册失败与生命周期恢复**（依赖 SA03/H11）：部分注册失败可诊断，重载不重复注册；内核按 localName 注销，停用时拒绝新写动作。
- [ ] 🔴 **SA06 readiness 与独立核心使用**（依赖 EC29/PM42）：区分插件加载、kernel running、能力注册、Agent 配置和能力允许；AI 不可用时核心档案仍可用。
- [ ] 🟡 **SA07 前端动态停用和卸载核查**（依赖 SA05/Q15）：核验宿主自动注销与 generation 行为；不引入内部 registry 依赖。
- [ ] 🔴 **SA08 输入 Schema 与业务校验**（依赖 D09/PM13/PM32）：定义对象、枚举、数量、日期、范围并校验真实身份；同名文本不能替代稳定 ID。
- [ ] 🔴 **SA09 两种输出包装适配**（依赖 SA08/Q05）：前端适配 result/structuredContent/error，内核适配普通可序列化结果与异常；模型侧语义一致。
- [ ] 🔴 **SA10 输出契约与部分结果**（依赖 PM18/H04/SA09）：带范围、时间、来源、未读模块、截断、待核验和部分失败；Schema 通过不等于业务完整。
- [ ] 🔴 **SA11 effects 与 actionEffects 准确性**（依赖 SA02/SA08）：按读、写、外传、费用逐动作声明并与实际调用对照，不用只读总括掩盖写 action。
- [ ] 🔴 **SA12 宿主权限与家庭范围分离**（依赖 R07/DL25/EC04/SA11）：先尊重宿主 policy，再核对管家模块、成员和字段范围；自动批准不扩大业务授权。
- [ ] 🔴 **SA13 AI 动作准备与提交分离**（依赖 D03/AF24/SA12）：先返回具体草稿和前置状态，确认后重新回读；宿主确认不代替业务差异预览。
- [ ] 🔴 **SA14 插件自有操作身份**（依赖 D02/D03/Q07）：prepare 生成 operationID，commit 使用并幂等；不依赖拿不到的 `_toolCallID`。
- [ ] 🔴 **SA15 取消与超时语义**（依赖 H11/DL20/SA14）：区分未开始、取消等待、执行中未知和已提交；无 AbortSignal 时不承诺停止按钮撤回写入。
- [ ] 🔴 **SA16 未知结果回读与禁止盲重试**（依赖 D03/SA09/SA15）：连接丢失、校验失败按 operationID 回查；未知前不重复新增，迟到结果可核对。
- [ ] 🟡 **SA17 多窗口前端身份与上下文**（依赖 R08/EC05/SA03）：确认能力在哪个 app 实例执行；窗口切换不读取另一窗口选择，内核不假定前端存活。
- [ ] 🔴 **SA18 用户选择捕获与范围预览**（依赖 NV01/NV11/P12）：使用公开 command/menu/block context 捕获文字和块身份，显示本次范围，不临时读取全局 selection。
- [ ] 🟡 **SA19 异步结果的原生锚点复核**（依赖 SA18/D03/NV15）：采用前核对 tracked range/原块/字段是否变化；锚点失效让用户重选，不按相似文字续接。
- [ ] 🟡 **SA20 原生 Agent 上下文与插件输入分工**（依赖 SA18/NV01/EC05）：区分引用 ID、插件范围与 Agent 编辑器上下文，保留回原文入口，不假设 handler 收到隐藏 references。
- [ ] 🔴 **SA21 原生 Agent 提示词入口研究**（依赖 SA01/CM17/PM42）：向上游确认打开、预填、引用传递契约；无稳定入口时不调用 private sendMessage 或内部 DOM。
- [ ] 🟡 **SA22 内置提示词包与 capability 映射**（依赖 SA02/SA21/OP07/DL29）：模板记录 ID、版本、语言、变量、适用能力、输出要求和示例；不写入不存在的 capability `prompt` 字段。
- [ ] 🟡 **SA23 原生 Skills/全局指令接入边界**（依赖 SA21/SA22/OP18）：核查正式扩展方式、作用范围和覆盖保护；不自动改写用户全局指令。
- [ ] 🔴 **SA24 接入验收与声明证据**（依赖 Q05/Q07/Q13/SA01）：覆盖未配置模型、拒绝能力、部分注册、选区失效、多窗口、插件停止、取消、超时和非法返回；静态核查不等于模型调用通过。

## 56. AI 全局任务、上下文与质量治理（AX01–AX28，只规划）

> 任务目录、最小上下文、来源、冲突、陈旧、差异预览、人工回执和评估；共用基底与 8 个跨模块模板见 [11-内置AI提示词模板](docs/design/11-内置AI提示词模板.md)。

- [ ] 🟡 **AX01 全局 AI 任务目录**（依赖 PV18/PM02/AF01）：登记抽取、查证、解释、准备、比较、交接、复盘、接力；标明 AI/规则/人工责任。
- [ ] 🟡 **AX02 按任务选择 AI 入口**（依赖 F05/PM41/UX03）：入口显示范围与“解释/草稿/提议修改”，不暗示直接执行。
- [ ] 🟡 **AX03 任务与实际能力匹配**（依赖 EC03/PM42/R08）：按文本、图片、PDF、检索、动作能力给可用/不可用/未知和人工路径。
- [ ] 🔴 **AX04 最小上下文选择**（依赖 R07/DL25/EC04）：选择成员、模块、原文、时间、附件并显示读取和排除范围。
- [ ] 🔴 **AX05 上下文证据清单**（依赖 PM18/NV01/NV06）：保存来源 ID、定位、取得/核对日、完整性和快照版本。
- [ ] 🟡 **AX06 可审阅的检索计划**（依赖 PF17/UX13/NV20）：问题转对象、字段、时间和来源范围，歧义先给候选。
- [ ] 🔴 **AX07 原文片段与上下文边界**（依赖 NV01/NV11/PM14）：保留必要相邻内容、截取边界和回源入口；资料内命令不取控制权。
- [ ] 🔴 **AX08 冲突资料回答策略**（依赖 NV04/NV06/PM05）：并列矛盾值、适用区间、来源性质，不替用户裁决正确版本。
- [ ] 🟡 **AX09 图片/PDF 抽取可靠性标记**（依赖 AX03/NV01/D09）：标页码、不可辨认字段和 OCR 候选；不认证身份/金额/日期。
- [ ] 🟡 **AX10 长资料与上下文不足降级**（依赖 AX05/PF01）：分段保覆盖清单；读不全就收窄回答，不宣称全面审查。
- [ ] 🔴 **AX11 AI 结果陈旧判定**（依赖 NV03/NV17/H11/DL05）：来源、schema、规则或权限变化使结果待复核，应用草稿前核对快照。
- [ ] 🟡 **AX12 内置提示词登记表**（依赖 Q01/PM41）：记录 ID、用途、变量、输入、输出、边界、版本和验证；缺关键变量不得空跑。
- [ ] 🟡 **AX13 用户改写与安全底座分离**（依赖 AX12/PM26/DL29）：可改语气格式，不可取消来源/权限/执行门禁；可恢复默认。
- [ ] 🔴 **AX14 AI 输出独立校验**（依赖 D11/PM04/NV01）：校验字段、类型、单位、身份、来源 ID 和目标版本；置信度不代替校验。
- [ ] 🔴 **AX15 事实、建议、草稿分层**（依赖 PM05/PM02/R06）：明确事实、候选、建议和待应用差异，不直接显示为已核验。
- [ ] 🟡 **AX16 引用查看与资料最小展示**（依赖 NV11/UI20/UX20）：事实可开证据，复制/交接/导出重新预览敏感字段。
- [ ] 🔴 **AX17 AI 修改统一差异预览**（依赖 D03/PM27/AF17）：逐字段显示原值、拟值、理由、依据和影响，支持部分采用。
- [ ] 🟡 **AX18 缺口与澄清问题队列**（依赖 NV13/UI16）：只问影响下一步的问题，并先交付已能完成部分。
- [ ] 🔴 **AX19 应用授权与逐项回执**（依赖 D03/EC06/AF17）：独立检查范围、权限、版本和确认；部分成功/草稿/点击链接均不算办妥。
- [ ] 🟡 **AX20 AI 会话取消与接续**（依赖 PM33/F06/AX11）：区分请求、生成、待审阅、应用、取消、失败；重开带来源版本。
- [ ] 🟡 **AX21 原生与人工替代路径**（依赖 PV21/PM42/UX07）：Agent 未就绪或关闭时可查原文、手录和处理提醒。
- [ ] 🔴 **AX22 基于证据回答评估集**（依赖 Q03/NV21/AX14）：覆盖可回答、无依据、部分读取、冲突、历史与错对象。
- [ ] 🔴 **AX23 结构化抽取评估集**（依赖 D11/LC03/LC11/LC13）：逐字段验证身份、日期、金额、单位、缺值和人工修正。
- [ ] 🟡 **AX24 办理与修改流程评估**（依赖 AF01/AF17/AF24/AX17）：覆盖提交未受理、部分办妥、材料失效和取消。
- [ ] 🔴 **AX25 不可信资料干扰评估**（依赖 AX07/EC04/R07）：验证范围不扩张、引用不伪造、外部动作不发生。
- [ ] 🟡 **AX26 跨时间、版本与模块评估**（依赖 H09/NV06/PM39/LC01）：覆盖旧快照、规则/时区变化和相似字段误用。
- [ ] 🟡 **AX27 AI 任务资源与隐私成本**（依赖 PF01/CM15/NX10）：记录资料量、等待、调用和人工修正成本，不新增默认遥测。
- [ ] 🟡 **AX28 提示词变更与质量回归**（依赖 AX12/AX22/AX23/AX24/Q11）：正反例比较新旧模板，区分用户改写与内置版本。

## 57. 31 模块 AI 任务卡与领域提示词（MA01–MA31，只规划）

> 每模块至少两个变体、最小字段白名单、输出结构和人工边界；完整卡片见 [11-内置AI提示词模板](docs/design/11-内置AI提示词模板.md)。条目不表示 31 个模块已 ready，也不扩大 OCR、语音、实时外部查询或专业判断边界。

- [ ] 🟡 **MA01 members 成员偏好冲突卡**（依赖 MD01/AX04/AX14）：尺码/忌口整理与冲突核对；不猜关系、疾病或权限。
- [ ] 🟡 **MA02 certs 证件材料卡**（依赖 MD02/BD01–BD03/AX08）：办证材料与特定用途要求；不传完整编号、不套全球余期规则。
- [ ] 🟡 **MA03 health 就诊资料卡**（依赖 MD03/NX05/AX15）：时间线与问诊问题；只转述专业来源，不诊断/给治疗剂量。
- [ ] 🟡 **MA04 social 社保快照卡**（依赖 MD04/BD04/AX08）：资料归属与余额口径；不传账号号、不判退休资格。
- [ ] 🟡 **MA05 insurance 保单依据卡**（依赖 MD05/BD04–BD08/AX17）：条款要点与材料对照；不判承保、理赔或受益人身份。
- [ ] 🟡 **MA06 exams 考试行动卡**（依赖 MD06/LS15/AX03）：官方通知行动与备考草稿；不自动标通过或报名完成。
- [ ] 🟡 **MA07 pets 照护交接卡**（依赖 MD07/HP18/AX16）：专业指令/疫苗凭证整理；先处理未声明 cycle，不给频次/剂量。
- [ ] 🟡 **MA08 assets-real 物品证据卡**（依赖 MD08/BD12–BD15/AX05）：收据/说明形成物品卡与维护索引；不把保修日当免费维修。
- [ ] 🟡 **MA09 assets-virtual 授权交接卡**（依赖 MD09/LS27/AX04）：期限、平台和非秘密交接；不索取凭据、不承诺继承。
- [ ] 🟡 **MA10 shopping 订单售后卡**（依赖 MD10/BD16/AX14）：订单分项与退换材料；取件码不传，收货/退款不自动完成。
- [ ] 🟡 **MA11 memberships 套餐变化卡**（依赖 MD11/BD09–BD11/AX17）：账单、权益、变更回执；意向不改当前订阅状态。
- [ ] 🟡 **MA12 contracts 条款承诺卡**（依赖 MD12/BD17–BD18/AX07）：版本、通知、交付和询问；不判法律效力/责任。
- [ ] 🟡 **MA13 medicine 包装差异卡**（依赖 MD13/P06/AX08）：名称、规格、批次、效期和单位；不提供服用或替代建议。
- [ ] 🟡 **MA14 stock 盘点采购卡**（依赖 MD14/BD22/AX14）：宿主阈值＋实盘备注；不换算缺单位、不改库存或采购。
- [ ] 🟡 **MA15 favors 往来回复卡**（依赖 MD15/NX31/AX15）：收送事实与消息草稿；不推回礼义务、不发送。
- [ ] 🟡 **MA16 chores 家务安排卡**（依赖 MD16/HP11/AX02）：周期结果与本周安排；不代认领、不记完成。
- [ ] 🟡 **MA17 food 餐单食材卡**（依赖 MD17/HP32/AX04）：菜谱/偏好餐单与食材草稿；不保证过敏安全、不扣库存。
- [ ] 🟡 **MA18 address 地址用途卡**（依赖 MD18/LC02/AX07）：地址原文与用途版本冲突；不猜行政区、不改旧订单。
- [ ] 🟡 **MA19 bookmarks 办事入口卡**（依赖 MD19/EC08/AX03）：已选网址候选与适用条件；不登录、不执行页面命令。
- [ ] 🟡 **MA20 snippets 常用语治理卡**（依赖 MD20/CM07/AX13）：改写与占位符差异；不增价格、期限或承诺。
- [ ] 🟡 **MA21 house 房屋事项卡**（依赖 MD21/HP56/AX18）：通知摘要与报修草稿；不把受理/施工当完成。
- [ ] 🟡 **MA22 parenting 成长观察卡**（依赖 MD22/NX05/AX09）：实际测量/事件与照护摘要；due 未声明，不推断发育或接种。
- [ ] 🟡 **MA23 schooling 学校通知卡**（依赖 MD23/LS15/AX06）：通知行动/材料/问题；不报名、缴费或判入学完成。
- [ ] 🟡 **MA24 allowance 零花钱复盘卡**（依赖 MD24/HP40/AX14）：逐笔草稿与范围内回顾；不补零余额、不发放。
- [ ] 🟡 **MA25 vehicles 车辆维护卡**（依赖 MD25/BD12/AX03）：手册/年检材料核对；不估实时里程、不判安全。
- [ ] 🟡 **MA26 transit 卡证权益卡**（依赖 MD26/LC15/AX08）：年审/补卡/权益材料；卡号默认排除，充值不等年审。
- [ ] 🟡 **MA27 travel-plan 行程候选卡**（依赖 MD27/LC15/AX10）：约束内计划与确认预订冲突；不虚构实时可订/耗时。
- [ ] 🟡 **MA28 travel-booking 凭证差异卡**（依赖 MD28/BD03/AX11）：预订事实与旧新版本；不改签、不判退款资格。
- [ ] 🟡 **MA29 travel-packing 行李卡**（依赖 MD29/HP36/AX04）：本次清单与缺项；不继承上次状态、不预测天气。
- [ ] 🟡 **MA30 travel-log 行后事实卡**（依赖 MD30/LC15/AX15）：实际到访与计划差异；预订不等到访，不自动记账。
- [ ] 🟡 **MA31 media 阅读观影卡**（依赖 MD31/EC27/AX13）：摘录卡与重读草稿；不虚构引文/评分，遵守剧透偏好。

## 58. AI 产品宽度、深度与长期运营（AI01–AI16，只规划）

> 本组补足 AI 作为产品层、使用体验、维护与生态能力的研究面，避免只有 API 和提示词工程。仍不等于商业化、自动代理或云服务承诺。

- [ ] 🟡 **AI01 分层价值承诺**（依赖 PV01/PV16/AX01）：把“找依据、少补录、少解释、接续办理”分别验证，禁止用 AI 使用次数代替用户结果。
- [ ] 🟡 **AI02 AI 开关与粒度选择**（依赖 NX10/UX03/SA06）：总开关、任务开关、模块开关和单次同意互不混淆，关闭后核心手动路径可完成。
- [ ] 🟡 **AI03 模型服务与成本可见**（依赖 CM15/DL25/AX27）：展示模型位置、资料传输、等待和已知费用；插件不保存 token 或偷偷换服务。
- [ ] 🟡 **AI04 小模型/大模型任务路由**（依赖 AX22/AX27/SA02）：以字段准确、延迟、费用和隐私 fixture 决定任务路由，不按宣传名称默认更强。
- [ ] 🟡 **AI05 离线降级和重试**（依赖 DL20/SA15/AX21）：无网络/模型不可达时保留原生规则与手录，重试不造成重复草稿或写入。
- [ ] 🟡 **AI06 中文、方言与地区语义**（依赖 LC01/LC03/MA02/MA27）：测试姓名、农历、时区、币种、单位和地区政策，不把翻译抹掉原文。
- [ ] 🟡 **AI07 无障碍 AI 交互**（依赖 UI07/UI08/UX20）：键盘、屏幕阅读器、触屏、低动效和长文本均可预览来源/差异/取消。
- [ ] 🟡 **AI08 家庭主体与照护同意**（依赖 HP27/NX13/PV02）：被登记者、录入者、接收者和模型资料同意分别核对；不因家庭关系默认可见。
- [ ] 🟡 **AI09 敏感字段的按需解密/脱敏**（依赖 D10/DL25/AX04）：对模型上下文使用临时最小字段，预览、缓存、复制和导出重新检查。
- [ ] 🟡 **AI10 AI 使用审计和可撤回**（依赖 NX06/NX17/DL08）：记录模板/模型/上下文/用户确认及结果版本，支持清理草稿和停止后续使用。
- [ ] 🟡 **AI11 用户纠错回流**（依赖 AX14/AX28/CM18）：把字段修正分类为模板、schema、来源或用户选择问题；不默认把个人资料用于训练。
- [ ] 🟡 **AI12 宣传与演示证据**（依赖 CM01–CM20/Q07）：演示用合成家庭资料，明确“草稿/引用/人工确认”；截图不声称已接通原生 Agent。
- [ ] 🟡 **AI13 帮助、解释和失败教育**（依赖 OP01/UX07/AX21）：用任务语言说明 AI 能做/不能做/如何手工继续，不把失败归咎用户。
- [ ] 🟡 **AI14 小驴插件 AI 能力协商**（依赖 EC01–EC08/SA02）：各插件声明版本、字段、权限、结果和唯一负责人；不因有 Agent 就读取私有库。
- [ ] 🟡 **AI15 模板包分享与来源治理**（依赖 OP07/DL29/SA22）：模板含版本、适用地区、数据要求和撤回路径；社区模板不能覆盖安全底座或偷偷外传资料。
- [ ] 🟡 **AI16 停止、退出与替代产品研究**（依赖 PV19/PV24/OP28/DL30）：定义何时停做某 AI 任务、导出可读草稿/来源、卸载后核心资料和手工流程仍可用。

## 59. 待办归并、依赖与路线治理（OR01–OR16，只规划）

> 本组不是新的业务功能，而是把现有待办变成可执行路线的控制面。主责矩阵、重复项归并和阶段出口见 [待办归并与路线重排调研](docs/research/2026-10-02-待办归并与路线重排调研.md)。

- [ ] 🔴 **OR01 主责登记**：每条开放项标唯一主责组、协作组、验收人和证据位置；同一结果不能有两个实现主项。
- [ ] 🔴 **OR02 历史项归并表**：将旧编号映射到 H/D/UI/PF/Q/R 等主责项；重复项改为引用或门禁，不重复实现。
- [ ] 🔴 **OR03 依赖图自动检查**：引用不存在的 ID、循环依赖、跨阶段倒置和已移除 ID 时让检查失败。
- [ ] 🔴 **OR04 阶段出口模板**：每个 G 阶段记录前置、输入、产物、真实验收、降级和停止条件。
- [ ] 🔴 **OR05 状态词典**：区分规划、源码存在、契约核验、fixture 通过、真机通过、用户验证和已发布。
- [ ] 🟡 **OR06 证据等级**：为源码、类型、单测、fixture、真机、双设备和用户研究定义证据等级及过期规则。
- [ ] 🟡 **OR07 变更影响检查**：schema、提醒、AI 模板、生态协议和宣传声明变化时列出受影响待办与文档。
- [ ] 🟡 **OR08 版本承载矩阵**：每条标记 core、next、research 或 blocked；研究项不自动承诺版本，blocked 写真实条件。
- [ ] 🟡 **OR09 WIP 限额**：每阶段限制同时进行的纵向切片数量，完成一个可用结果后才打开下一个领域包。
- [ ] 🟡 **OR10 关键路径视图**：从开放项生成只含阻塞项、可并行项和等待输入项的短列表，避免平铺清单造成错误优先级。
- [ ] 🟡 **OR11 复盘与关闭规则**：研究结论必须转为保留、合并、否决或延后；没有结果的探索不无限追加子任务。
- [ ] 🟡 **OR12 用户决策记录同步**：默认开关、AI 外传、家庭共享、字段新增和专业边界变化统一回写 D 记录，防止待办悄悄改变定位。
- [ ] 🔴 **OR13 最小纵向样例与退出标准**：至少维护证件→提醒→材料→回执、资产保修→维修、旅行证件核对、AI 证据问答四条样例；样例未通过不扩同类模块，收益不足可停止。
- [ ] 🔴 **OR14 模块 ready 晋级与回退门**：模块须通过 schema/读写/提醒/错误恢复/手工替代和对应 AI 模板检查才标 ready；失败回退 skeleton 不影响已存数据。
- [ ] 🟡 **OR15 单一事实与契约变更传播**：PM/DL/NV/AI 模板/模块卡任一字段、状态或来源契约变化，自动列出受影响提醒、流程、生态、宣传和评估项。
- [ ] 🟡 **OR16 研究决策门**：每项产品研究输出继续、合并、暂缓或停止及理由；研究结论没有用户结果或证据时不继续拆分待办。

## 60. 工作台页面、内容与跨页面体验（PP01–PP28，只规划）

> 本组不是重新增加 31 个模块页面，而是补足“家庭档案 + 到期提醒 + 事务工作台”在页面层的断点。现有 UI01–UI24 负责组件交互，UX09–UX18 负责导航研究；本组负责跨页面信息架构、内容语义和候选二级页面。详细设计见 [工作台页面与内容架构深化](docs/design/12-工作台页面与内容架构.md)。

- [ ] 🟡 **PP01 总览行动卡分层**（依赖 UI17/H16/AF01）：将逾期、近期到期、正在办理、待确认、数据健康分开；“无提醒”不显示为“无事务”。
- [ ] 🟡 **PP02 事项工作台候选页**（依赖 AF01–AF04/PM29）：承载准备、提交、等待、补件、部分结果和后续义务；提醒仍保持日期派生职责。
- [ ] 🟡 **PP03 事项详情状态步进器**（依赖 AF10–AF18/UI21）：展示当前事实、证据、负责人、阻断、下一步和实际回执；状态转换不能由摘要自动推进。
- [ ] 🟡 **PP04 资料与依据中心候选页**（依赖 NV01/NV11/NV16/PM05）：按来源、对象、版本和适用区间浏览，字段可回原文，不复制第二份全文库。
- [ ] 🟡 **PP05 收件箱与未整理入口**（依赖 F10/F11/DL01/AX04）：接收主动捕捉、失败结果和 AI 草稿，区分待分类、待补字段、疑似重复、已采用和可恢复丢弃。
- [ ] 🟡 **PP06 全局搜索结果页**（依赖 UX13/PM18/PM35/PF17）：结果按记录、来源、事项、提醒、成员分类，显示范围、权限、更新时间和命中片段。
- [ ] 🟡 **PP07 搜索与最近项隐私**（依赖 UX15/UX20/DL18）：共用设备可关闭/清除历史，清历史不删原资料，最近项不跨授权范围泄露。
- [ ] 🟡 **PP08 成员时间线二级视图**（依赖 NV07/NV18/PM10/UI17）：区分发生、形成、采用、核验和补录时间；成员名、资料主体和负责人不混用。
- [ ] 🟡 **PP09 资料版本与冲突页**（依赖 NV03/NV04/DL05/AX08）：并列版本、适用区间、采用意图和待复核字段，用户选择前不覆盖旧来源。
- [ ] 🟡 **PP10 健康与恢复中心**（依赖 D12/H04/DL20/OR14）：将缺库、缺列、无权限、陈旧、部分失败、待补偿分级并给修复步骤。
- [ ] 🟡 **PP11 页面上下文条**（依赖 UI18/UI19/UX19/PM17）：显示成员、模块、时间范围、数据状态和刷新时间，返回后恢复筛选、滚动和焦点。
- [ ] 🟡 **PP12 详情抽屉与专页阈值**（依赖 UI16/UI20/AF24）：短记录使用抽屉，跨来源/多材料/多状态事项进入专页，关闭不丢草稿。
- [ ] 🟡 **PP13 跨页面动作语义**（依赖 UI21/AF17/PM06）：查看、复制、草稿、创建事项、改字段、提交外部、标完成使用不同动作和回执文案。
- [ ] 🟡 **PP14 批量操作统一预览**（依赖 UI14/D03/AX17）：统一当前页/筛选结果/全部匹配范围，显示跳过、失败、目标版本和部分成功。
- [ ] 🟡 **PP15 保存与异步结果面板**（依赖 H01/H11/SA15/AX20）：保存、生成、导出、归档和联动区分进行中、成功、部分、失败、未知，不只用 Toast。
- [ ] 🟡 **PP16 事项与提醒互相引用**（依赖 PP02/H05/AF01）：提醒可打开关联事项，事项显示相关提醒和真实处理回执；两者不生成重复事实。
- [ ] 🟡 **PP17 内容文案状态表**（依赖 CM06/UI16/R06）：统一空、无权限、陈旧、部分失败、待确认、已归档、未知结果等文案，禁止过度乐观措辞。
- [ ] 🟡 **PP18 来源与 AI 草稿内容表**（依赖 AX15/AX16/AX19/PP04）：显示值、来源定位、形成/核对日、适用范围、未知和采用按钮，不把摘要渲染成事实。
- [ ] 🟡 **PP19 渐进式首次引导**（依赖 UX06/UX07/F01/CM05）：引导首次结果后再介绍事项、来源、AI 和生态，支持跳过、回访和按上下文重现。
- [ ] 🟡 **PP20 模块目录与 ready 门禁页**（依赖 PM40/T05/OR14）：显示 schema、provision、provider、reminder、AI、evidence 六项能力状态、依赖、数据范围和人工替代；skeleton/planned 不出现在可执行入口；对应 PX11/PX20/PX34/PX48。
- [ ] 🟡 **PP21 总览中的 AI 任务启动器**（依赖 SA21/AX02/AX04/AI02）：从卡片启动解释、找依据、准备下一步，预览资料范围和模型服务，关闭 AI 后仍可手工处理。
- [ ] 🟡 **PP22 事项中的草稿区**（依赖 AX17/AF17/SA13）：集中展示材料清单、字段候选、交接稿和差异，逐项采用并记录目标版本。
- [ ] 🟡 **PP23 资料页面的敏感范围预览**（依赖 AX04/AI09/DL25/UI22）：显示提供给模型、复制、打印或交接的字段和附件，脱敏不是权限隔离。
- [ ] 🟡 **PP24 移动端首层导航**（依赖 R08/UI10/UX10）：小屏首层聚焦总览、提醒、收件箱、更多；事项/资料用全屏页，底部操作避开安全区。
- [ ] 🟡 **PP25 移动端陈旧与离线状态**（依赖 DL20/PF07/H13）：显示最近成功时间、待同步/未知结果和手动恢复路径，不能把缓存当实时。
- [ ] 🟡 **PP26 页面级键盘与读屏路径**（依赖 UI01/UI02/UI08/Q09）：验证上下文条、详情、批量预览、来源回跳、草稿采用和错误恢复的焦点顺序。
- [ ] 🟡 **PP27 打印/导出/交接内容一致性**（依赖 UI22/DL09/AF22）：预览与输出使用同一字段范围、来源和脱敏结果，输出后明确复制件的时效和控制边界。
- [ ] 🟡 **PP28 合成演示与帮助内容**（依赖 CM07/CM08/CM17/OR13）：制作包含正常、空、失败、陈旧和草稿状态的可清除演示数据；补充 PX39–PX43 的类名/DOM、主题 token、减弱动效、状态文案和视觉回归证据；帮助页面不以原型图冒充现状。

> 页面契约分解：PP01–PP28 的 PX01–PX49 验收矩阵，以及 PX50–PX60 的二级入口候选、升格条件和停止条件，见 [工作台页面与内容架构](docs/design/12-工作台页面与内容架构.md)。PX 编号用于追踪页面证据，不按编号另建顶层页面或重复计算独立工作量。

## 61. 原型质感与生产实现差距（PL01–PL24，只规划）

> 本组把原型的层次、状态和交互转成可在思源宿主中验证的契约；不增加顶层页面，也不把原型截图当作生产完成证据。每项均需保留目标、降级、错误、关闭/恢复四类证据。

- [ ] 🔴 **PL01 宿主容器几何与断点矩阵**（主责 UI12；协作/验收 R08/UI10/PP24/PX38）：测 Tab、窄面板、独立窗口、移动 WebView 的宽高、safe-area、抽屉/弹层阈值；形成可执行断点表和 fixture。
- [ ] 🔴 **PL02 弹层状态机与层级管理**（主责 UI21；协作/验收 PP12/PX38）：统一蒙层、抽屉、快速录入、确认框、错误面板的层级、Esc、返回键和销毁路径；高层关闭不能误关底层。
- [ ] 🔴 **PL03 焦点生命周期与 focus trap**（主责 UI21；协作/验收 PL02/UI08/PP26/Q09）：定义打开落点、循环范围、错误聚焦、背景不可操作、关闭恢复和组件重挂载行为；以键盘录像和读屏树验收。
- [ ] 🔴 **PL04 鼠标、键盘、触屏与触控笔操作等价**（主责 UI09；协作/验收 PP13/PP26/Q09）：每个关键动作提供可见文本或详情入口，触控命中区达到规范，悬浮不再是唯一发现方式；覆盖触控笔和键盘。
- [ ] 🟡 **PL05 图标登记与可访问命名契约**（主责 Q10；协作/验收 Q09/PP28/PX39）：登记图标语义、禁用/加载状态、文字替代和 tooltip 规则；禁止 emoji、字符图标在同一语义中漂移，并为装饰图标提供空名称。
- [ ] 🟡 **PL06 主题变量、对比度与系统强制颜色证据**（主责 UI11；协作/验收 Q09/Q10/PX40）：在思源明暗主题、自定义主题、高对比和 forced-colors 下核对文本、边框、状态色和焦点环；同时检查宿主 CSS scope、stacking context 和 fallback，输出截图及失败清单。
- [ ] 🟡 **PL07 滚动归属、锚点与恢复**（主责 UI13；协作/验收 PP11/PP12/PX08/PX09）：明确页面、列表、抽屉和弹层的滚动所有权，切 Tab/关闭详情/返回后恢复筛选、锚点和焦点；覆盖长列表与浏览器返回。
- [ ] 🔴 **PL08 数据范围与真实性标识**（主责 PP11；协作/验收 PM18/PM23/PM24）：所有数量、金额、进度、健康状态显示范围、来源、更新时间、单位和完整性；缺库、权限、陈旧或部分失败不得伪装成 0 或健康，遮盖/脱敏也不得冒充权限隔离。
- [ ] 🟡 **PL09 事实、草稿、建议、未知与采用状态视觉语法**（主责 PP18；协作/验收 AX15/AX17）：统一事实、用户输入、AI 草稿、建议、未知、已采用、失败和陈旧的标签/颜色/动作；草稿不能进入提醒或统计。
- [ ] 🟡 **PL10 统计视觉诚实**（主责 UI24；协作/验收 PF16/UI19/PM23/PM24）：趋势条、进度条和数字动画标明公式、时间范围、样本量、缺测和文本替代；缺测不补零，动效关闭仍可读。
- [ ] 🟡 **PL11 表单语义保真**（主责 D09；协作/验收 D11/UI05/UI07/UI18/UI19/AX17）：验证金额/币种、日期基准、时区、0 与空、枚举、附件和失败保留输入；区分长期有效/不适用与未知/未登记，显示值与提交值可追溯。
- [ ] 🟡 **PL12 原型、设计与生产组件三方矩阵**（主责 Q10；协作/验收 PP28/PX01/PX39）：为原型类名、设计 token、生产组件和状态 fixture 建映射，新增或改名必须有漂移检查。
- [ ] 🟡 **PL13 控件语义、页面密度与信息节奏**（主责 UI01；协作/验收 UI02/UI17/PP01/PP11/Q09）：同步 tab/chip/switch/card 的 selected、pressed、expanded、disabled、read-only 视觉与 ARIA；补齐设置开关 label/状态文本、role=button 的 Enter/Space 行为，再按任务优先级校准首屏、卡片、表格、留白和折叠，小屏不靠横向滚动承载关键动作。
- [ ] 🟡 **PL14 生产组件状态样本**（主责 Q03；协作/验收 UI16/H04/D12/PP17/PX43）：为 loading、empty、stale、partial、error、permission 和 recovery 建可清除 fixture，页面截图必须标注状态来源。
- [ ] 🟡 **PL15 视觉回归截图基线**（主责 Q10；协作/验收 Q03/PX43/PL06/PL13/PL14）：固定视口、主题、字体、数据快照和宿主，建立总览/提醒/台账/成员/抽屉/弹层基线；差异需可定位。
- [ ] 🟡 **PL16 主题切换与用户主题适配**（主责 UI11；协作/验收 UI12/LC24/PL06/PP11/UI13）：切换主题不丢筛选、滚动和焦点，跟随思源主题变量，用户自定义主题下状态仍有文字和形状冗余；同步验证 200%/400% 缩放、中文/英文长词和数字对齐。
- [ ] 🟢 **PL17 低端设备与长列表动效性能**（主责 PF02；协作/验收 PF01/PF11/PF12/PF20/PX41）：测首屏、切 Tab、长列表、抽屉和数字动画的 CPU、内存与帧率；根据实测形成低端设备降级方案。
- [ ] 🟢 **PL18 动画预算与取消行为**（主责 UI24；协作/验收 PX41/PF02/PL10）：定义每类动效预算、reduced-motion、用户取消和失败中断；动画不得遮挡状态或阻塞输入。
- [ ] 🟡 **PL19 快速录入/抽屉/确认框动作反馈**（主责 PP15；协作/验收 UI08/D03/H01/PL02/UI02/UI09）：保存、生成、导出、完成、延后分别显示进行中、成功、部分、失败和未知，回执可回到原上下文；保存并查看聚焦回执，收起后恢复稳定入口；嵌套卡片/行内按钮不得重复触发或误打开详情。
- [ ] 🟡 **PL20 设置开关的预览/保存/失败回执**（主责 OP19；协作/验收 PM20/PM26/PP15/PP20/PX49；AI 场景 AI02/SA06）：总开关、模块开关和单次选择显示影响范围、待保存和回滚，失败不静默改变后续行为。
- [ ] 🟡 **PL21 AI 入口范围预览/结果分层/人工替代**（主责 PP21；协作/验收 AI02/AX04/AX17）：AI 动作先预览资料范围、模型服务和输出类型，结果分草稿/证据/未知，关闭 AI 后手工路径仍可完成。
- [ ] 🟡 **PL22 移动端单手操作/安全区/软键盘**（主责 PP24；协作/验收 R08/UI10/PL01；输入法场景 UI04）：验证底部操作、输入焦点、键盘顶起、横竖屏、safe-area 和抽屉返回；关键动作不被键盘或刘海遮挡。
- [ ] 🟢 **PL23 帮助、术语与空态文案视觉审校**（主责 PP17；协作/验收 PM06/PM34/PM41/CM12/UI16/CM17）：统一“未扫描、无权限、待确认、未知、演示数据”等文案，给下一步和人工替代，避免把原型目标写成已实现。
- [ ] 🟡 **PL24 原型状态清除、合成 fixture 与宣传截图证据**（主责 CM08；协作/验收 CM07/PP28/Q03/PL14）：演示数据可一键清除并恢复初始状态，截图标版本/平台/合成资料/已知限制；宣传素材不得冒充生产能力。

## 62. 版本、安全、质量与可维护性研究池（UG01–UG12，只规划）

> 这是对功能、性能和 UI 之外的系统性产品研究补充。研究结论按 OR11/OR16 归入既有主责，未通过证据门禁前不形成开发承诺。

- [ ] 🔴 **UG01 版本升级与回滚兼容**（回归主责 PM39；研究输入 Q06/DL07/DL08/Q04/OR14；提示词分支 AX28）：演练 schema、设置和提示词迁移中断、失败回滚、降级阻断、旧字段保留与能力重算；验收使用可恢复真实 fixture。
- [ ] 🔴 **UG02 无遥测支持与可观测性**（回归主责 OP03；研究输入 T06/CM19/OP05/PP10/CM15）：设计用户同意后生成的脱敏诊断包，包含版本、宿主、能力矩阵、阶段失败和复现步骤；本地可预览、可取消、无网络可保存。
- [ ] 🔴 **UG03 家庭共享威胁建模**（回归主责 第 19 组安全加固；研究输入 R07/DL25/EC04/DL27/DL28/UX20/NX12）：覆盖共用设备肩窥、通知泄露、误操作、脚本/路径穿越、剪贴板和被撤销者旧副本；形成攻击者—资产—控制—剩余风险矩阵。
- [ ] 🔴 **UG04 数据质量与事实治理**（回归主责 PM28；研究输入 PM04/PM05/PM08/PM09/PM13/DL14/NV04）：研究单位/日期/人名规范化、重复候选、来源冲突、事实主记录、手工修订理由和可撤销审计；多来源同一事实必须可解释。
- [ ] 🟡 **UG05 检索与信息可发现性**（回归主责 UX13；研究输入 PP06/PM18/PM35/PF17/LC07）：验证台账、原文、附件、提醒和事项的权限过滤、模糊/拼音命中、空/陈旧解释、排序依据和可清理索引。
- [ ] 🟡 **UG06 自动化安全边界**（回归主责 PM36；研究输入 PM37/EC06/EC07/D03/Q15；Agent 分支 SA11/SA12/SA15）：研究自定义规则的 dry-run、频率/并发/循环限制、冲突优先级、撤销和审计；外部提交与通知外发默认保持人工确认。
- [ ] 🟡 **UG07 低端设备与能耗**（回归主责 PF20；研究输入 PF01/PF13/PF15/R08/H13/PL17）：测移动 WebView 前后台、锁屏、省电、断网、大附件和高 DPI 下 CPU、内存、电量、流量；降级到手动刷新与最近成功时间。
- [ ] 🟡 **UG08 模块包质量与版本化**（回归主责 DL29；研究输入 PM31/PM39/Q04/Q12/OP07/OP11/OR14；AI 模板分支 AI15/AX28）：建立 schema、提示词、模板、来源和政策版本矩阵；模块改名、禁用、撤回、重启或跨地区后数据和提醒不漂移。
- [ ] 🟡 **UG09 用户教育与帮助可测试性**（回归主责 UX06；研究输入 UX07/UX03/PM41/CM05/CM17；文案验收 PL23）：为非技术家庭成员设计首条价值教程、术语表、边界、失败自救和打印卡，以任务成功率与误解点人工验证。
- [ ] 🟢 **UG10 可持续维护与开源治理**（回归主责 OP25；研究输入 OP26/OP27/OP28/OR01/Q12；模板审核 OP09/OP11）：登记 schema、提示词、政策、翻译、依赖许可证和责任人，定义 关键维护人员缺位风险、社区响应、模板签名、停更与数据出口。
- [ ] 🟢 **UG11 标准互操作与能力协商**（回归主责 DL30；研究输入 LC16–LC23/DL11–DL16；协议协商 EC03–EC08）：用 ICS/vCard/CSV/JSON 验证字段损失、时区、重复例外、附件来源、dry-run、幂等和系列插件 能力协商。
- [ ] 🟡 **UG12 责任与合规边界矩阵**（回归主责 CM04；研究输入 R06/PM42/NX12/DL25/UX20/Q12/V02；AI 分支 AI08/AI09）：按健康、证件、财务、照护、教育和出行标注后果等级、同意、免责声明、政策有效期和人工核对出口；分享默认最小字段。

> 2026-10-03 复核统计：**66 个编号分组、1223 条 checkbox（勾选 151、未勾选 1072）**；第 35 组新增 60 项、第 36–42 组新增 160 项、第 43–46 组新增 181 项、第 47–50 组新增 112 项、第 51–54 组新增 95 项、第 55–58 组新增 99 项、第 59 组新增 16 项、第 60 组新增 28 项、第 61 组新增 24 项、第 62 组新增 12 项。按条目计数，含父项与验收分解，不等于独立工作量；⛔ 的实际条件各不相同，不能统称思源未启动。兜底协议见第 34 组；2026-10-02/03 用户下达开发指令，主线开发十七轮收尾可自主项后执行兜底循环（见循环执行记录末行）。
