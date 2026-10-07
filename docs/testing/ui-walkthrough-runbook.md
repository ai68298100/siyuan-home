# UI 走查靶场手册（UI Walkthrough Runbook）

> 一页编排：截图驱动的视觉 / 交互 / 规模走查，与 [真机批 runbook](device-batch-runbook.md)（功能验收）互补。
> 编制：2026-10-07 第 264–265 波（250–260 波 UI 对齐期间沉淀）。脚本在 `scripts/ui-walkthrough/`，
> 临时侦察脚本不入库（tmp/ 为 gitignore）。执行前先核对「前置与坑位」表是否仍成立。

## 靶场前置与坑位（265 波已验证，执行时复核）

| 项 | 状态 / 做法 |
|---|---|
| 内核启动 | `SiYuan-Kernel.exe serve --workspace <ws> --port 14680 --lang zh-CN`（新版内核用子命令，旧 `--workspace` 顶级旗标已废）；`scripts/ui-walkthrough/lib.mjs ensureKernel()` 幂等拉起 |
| **集市信任门槛** | 桌面端 `bazaar.trust=false` 时 loadPetals 返回空、插件静默不加载（无报错）——新靶场必须先 `POST /api/setting/setBazaar {"trust":true}` |
| **插件部署** | putFile 到 `/data/plugins/siyuan-home/` + petals.json upsert（先启动后部署会把注册表重写为空，见 CONTRIBUTING 靶场约定）|
| **访问授权码** | e2e 脚本（裸开无 cookie）要求无锁屏：本地 `setAccessAuthCode {"accessAuthCode":""}` 允许清空（禁用锁屏不做长度限制）；浏览器走查则用授权码登录换会话 cookie |
| **cookie ≠ token** | API 用 `Authorization: Token <api token>`；前端会话用 `siyuan=<session>` cookie（登录后保存复用，脚本 `lib.mjs login()`） |
| **前端路径** | 浏览器端入口是 `/stage/build/desktop/`（`/stage/build/app/` 是残废路径——工具栏为空且无报错） |
| **主题切换** | 必须连 `modeOS:false` 一起设，否则跟随系统覆盖 `mode`（headless 恒报 light） |
| **入场动画** | reparent 面板到 body 会重置 `lv-rise` 编排（backwards+delay），整屏截图前等 ≥600ms，否则截到半透明中间态 |
| **kernel 自动退出** | 无前端心跳一段时间后内核退出——走查脚本开头统一 `ensureKernel()` |

## 库分工

- `scripts/lib/smoke-kernel.mjs`：写型冒烟防呆（scratch 清扫/共享守卫）+ API 调用器 `makeApi`；
- `scripts/ui-walkthrough/lib.mjs`：内核生命周期（拉起/就绪等待）+ 浏览器会话（登录/cookie）+ 面板操作 helpers；
- 数据注入类脚本（bulk-stress）复用 `makeApi`，不重复实现调用器。
## 主脚本

```bash
# 四页签（+日历）双主题全高截图 + 横向溢出检测 → tmp/ui-shots/ui3/
node scripts/ui-walkthrough/shoot-tabs.mjs light
node scripts/ui-walkthrough/shoot-tabs.mjs dark

# 满数据压测注入（默认 50 行 + 60 备忘；注入后需重扫）
node scripts/ui-walkthrough/bulk-stress.mjs 50 60
```

`shoot-tabs` 覆盖：总览/提醒/提醒-日历/台账/成员，逐页签输出 scrollWidth−clientWidth（≠0 即横向溢出）。

## 扩展走查要点（按需手写，片段级）

- **媒体态**：`page.emulateMedia({ media: "print" })`（打印需双主题各打一张——lv token 在 print 块整体翻纸面）、`{ reducedMotion: "reduce" }`（断言 `animationName === "none"`）、`{ forcedColors: "active" }`（断言卡片边框为 CanvasText）。
- **交互态**：`el.hover()` 后 500ms 截元素图（提醒行 ops 浮现/色轨泛光、模块卡浮起、成员卡按钮浮现）；键盘 `el.focus()` 截 focus-visible 轮廓。
- **弹窗**：插件 Dialog 挂 body 层——截 `querySelectorAll(".b3-dialog__container")` 的**最后一个**，且先把 `.b3-dialog__content` scrollTop 归零。
- **语言**：`setAppearance { lang: "en" }` + locale en-US；走查后记得切回 zh-CN。
- **满数据注入**：`bulk-stress.mjs` 后在提醒中枢点「重新扫描」（或 refreshHub），随后走查分组计数/批量全选/日历点数/台账色点分布。263 波基线：100 行 + 60 备忘 → 110 提醒，重扫+渲染 61s（31 模块全启用口径）。
- **规模/响应性**：设置「全部启用/仅保留默认 + 保存」后**不切页签**轮询 `.lv-mod` 数与台账下拉 options——总览模块卡与台账下拉均为 version 驱动（250–264 波修复），2 秒内应即时收缩/扩展。

## 已知边界

- 真实 Android WebView / 独立窗口 / 兄弟插件 / 双端冲突不在本手册范围（见真机批 runbook 残余项）。
- 「欢迎使用思源」首启弹窗、Edge 兼容性提示条是思源应用层 UI，会出现在整页截图里，属测试噪音。
