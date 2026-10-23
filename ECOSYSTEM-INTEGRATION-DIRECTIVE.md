# 【小驴生态中枢统领指令】小驴管家 (siyuan-home) 全方位升级与跨插件协同执行手册

> **统领下发方**：小驴快门中枢（`siyuan-quickgate`）
> **执行接收方**：小驴管家（`siyuan-home`）开发 Agent
> **架构基线**：Epoch 6 联邦规范 · 零强依赖优雅降级 · 暖木金+红宝火种 Bento 美学 · 历史排雷防线

---

## 一、 核心定位与视觉资产状态
- **生态角色**：**【家庭生活与效期中枢（Life & Expiry Hub）】**——管理 31 个家庭台账模块与统一到期提醒中枢。
- **专属主题色**：**威尼斯暖木金（`#D97706`）＋ 鸽血红宝石壁炉火种（`#E11D48`）**。
- **根目录 `icon.png`**：**已由快门中枢完成 256×256 殿堂级“金底配红宝石火种”高反差头像替换，请勿覆盖回退！**
- **本地已就绪 SDK**：`src/libs/ecosystem-bridge-kit.ts`（零外部依赖，可直接 `import`）。

---

## 二、 必做任务 1：跨插件联邦联动（Epoch 6 标准）

### 1. 四别名挂载与安全注销 (`src/index.ts` & `src/bridge/external-bridge.ts`)
- 挂载 `window.LvHome` 时，同步挂载 `window.lvHome`、`window.xiaolvHome`、`window.siyuanHome`，实行 **First-Instance-Wins**；
- 卸载时核验身份：`if (w[alias] === this.bridge) delete w[alias]`；
- 暴露 `whenReady()`、`hasCapability()`、`getOverview()`；`summary()` 严守隐私边界（只返回 `overdue`, `today`, `soon` 计数，绝不暴露金额与姓名）。

### 2. 与小驴人脉选人联动——双轨智能回退 (`src/ui/member-card.svelte` 等)
- 录入家庭成员、医生、保单顾问时，调用 SDK 的 `callBridge("contacts", "searchPeople", ...)`：
  - **已安装人脉**：展示选人下拉框并绑定 `docId`；
  - **未安装人脉（优雅降级）**：自动隐藏选人按钮，平滑回退为普通单行文本框 `[ 请输入姓名 ]` 与 `[ 电话 ]`，绝不报错，保障单插件 100% 独立可用！

### 3. 事务完成联动打卡 & 向雷切注册到期组件
- 家庭例行事务办理完成时，调用 `logCheckinEventSafely`（`externalRef: "home:<module>:<rowId>:<today>"`）；
- 在 `onload` 调用 `registerRaikiriModuleSafely` 注册 `home-expiry-reminders` 小组件。

---

## 三、 必做任务 2：顶栏图标重大修复——彻底弃用 `iconEmoji` 笑脸 (`src/index.ts`)

- **严重问题定位**：`src/index.ts` 的 `createTopBarOptions()` 目前竟然写死了 `icon: "iconEmoji"`（思源默认笑脸表情），且 `iconLvHomeApp` 仅在移动端分支注册！
- **修复要求**：
  1. 在 `onload` 顶部**全端无条件注册** `iconLvHome`（与新版 Logo 1:1 映射的山墙小屋 + 烟囱火种）：
     ```xml
     <symbol id="iconLvHome" viewBox="0 0 32 32">
       <path d="M20 9V6h3v5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
       <path d="M4 14 16 4.5 28 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
       <path d="M7 13.5V26c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V13.5" fill="none" stroke="currentColor" stroke-width="2"/>
       <path d="M13 28v-6c0-1.7 1.3-3 3-3s3 1.3 3 3v6" fill="currentColor"/>
       <circle cx="21.5" cy="4" r="2.5" fill="currentColor"/>
     </symbol>
     ```
  2. 将 `createTopBarOptions()` 中的 `icon: "iconEmoji"` 改为 `icon: "iconLvHome"`，移动端按钮同样引用 `#iconLvHome`。

---

## 四、 必做任务 3：UI 轻量统一与参考图 Bento 软性美学升级 (`src/index.scss`)

1. **修复全局 CSS 污染**：
   - 排查 `src/index.scss` 中的 `.dialog-content .lv-home` 等顶层选择器，确保所有样式严格封闭在 `.lv-home` 命名空间内，不污染宿主其他弹窗。
2. **注入专属品牌色与 Bento 软性美学**：
   ```scss
   --lv-brand: #D97706; /* 暖木金 */
   --lv-brand-soft: color-mix(in srgb, var(--lv-brand) 12%, transparent);
   --lv-accent-ruby: #E11D48; /* 鸽血红点缀 */
   ```
   - 总览页吸收最初参考图的 **Bento 双拼方块 + 午夜黑金档案卡** 质感（参考快门中枢 `docs/fleet-sync/fleet-bento-prototype.html`）；
   - 状态徽标统一为 `9999px` 药丸胶囊；按钮挂载 `:active` 下沉微触感；Dialog 标题栏统一使用 `.lv-dialog-title-wrap`。

---

## 五、 必做任务 4：深层工程规范与历史排雷加固

1. **`plugin.json` 关键对齐（必改）**：
   - **补齐品牌关键词**：当前 `keywords` 完全没有“小驴”！必须前置加入 `["小驴", "小驴管家", "xiaolv", "lv", ...]`；
   - 新增 `"settingsWindow": true`（开启独立桌面设置大窗）；
   - `minAppVersion` 统一为 `"3.8.4"`。
2. **命令 `langKey` 防冲突**：
   - 将通用 `quickCapture` 规范化或确保与 `xiaolv-common` 不产生全局快捷键冲突；精简默认占用的 5 个 `Ctrl+Alt+*` 快捷键，仅保留主入口默认热键，其余设为空字符串 `""` 交由用户按需绑定。
3. **移动端虚拟键盘避让 & 日志/i18n 规范**：
   - 移动端快速录入弹层挂载 `window.visualViewport` 动态抬升底边距，防键盘遮挡提交按钮；
   - 控制台日志前缀统一由 `[siyuan-home]` 规范为 `[LvHome]`；Toast 提示前缀统一为 `[小驴管家]`；
   - 确保构建产出包含下划线格式的 `dist/i18n/zh_CN.json`。

---

## 六、 验收标准
执行完毕后，在根目录运行：
```bash
pnpm check && pnpm test
```
确保全量 791+ 项单测与门禁 100% 全绿通过！
