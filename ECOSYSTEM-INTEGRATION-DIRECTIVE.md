# 【小驴生态中枢统领指令】小驴管家 (siyuan-home) 专项排查与全方位升级执行手册

> **统领下发方**：小驴快门中枢（`siyuan-quickgate`）
> **执行接收方**：小驴管家（`siyuan-home`）开发 Agent
> **当前状态**：底座测试全绿 (791项) · 规范评分 80% ➔ 目标 100%
> **核心原则**：零强依赖 · 暖木金+红宝火种 Bento 美学 · 严禁私有存储穿透

---

## 一、 核心资产状态确认
1. **根目录 `icon.png`**：**已由中枢完成 256×256 殿堂级“暖木金配红宝火种”高清头像替换，请严格保留勿覆盖！**
2. **本地就绪 SDK**：`src/libs/ecosystem-bridge-kit.ts`（零外部依赖，直接 import 使用）。

---

## 二、 当前排查出的本插件专项缺陷与必修任务清单

### 【P0 级：集市获客与设置窗口升级】
1. **`plugin.json` 补齐品牌关键词（严重影响集市获客！）**：
   - 当前 `keywords` 完全没有“小驴”中文词，集市搜“小驴”搜不出管家！
   - **必修修改**：前置强制补齐 `["小驴", "小驴管家", "xiaolv", "lv", ...]`。
2. **开启独立桌面设置大窗（`settingsWindow: true`）**：
   - 在 `plugin.json` 根级增加 `"settingsWindow": true`，彻底打通思源 3.8.8+ 独立大窗口设置体验。

---

### 【P1 级：顶栏图标换新与跨插件联邦】
3. **彻底替换桌面顶栏 `iconEmoji` 笑脸表情 (`src/index.ts`)**：
   - 目前 `createTopBarOptions()` 写死了 `icon: "iconEmoji"`（思源默认笑脸小表情），严重违背品牌一致性！
   - 请在 `onload` 顶部全端注册全新 32×32 单色图标 `iconLvHome`，并将 `createTopBarOptions()` 中的 `icon: "iconEmoji"` 替换为 `icon: "iconLvHome"`：
   ```xml
   <symbol id="iconLvHome" viewBox="0 0 32 32">
     <path d="M20 9V6h3v5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
     <path d="M4 14 16 4.5 28 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
     <path d="M7 13.5V26c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V13.5" fill="none" stroke="currentColor" stroke-width="2"/>
     <path d="M13 28v-6c0-1.7 1.3-3 3-3s3 1.3 3 3v6" fill="currentColor"/>
     <circle cx="21.5" cy="4" r="2.5" fill="currentColor"/>
   </symbol>
   ```
4. **与人脉选人联动（双轨智能回退）& 事务打卡联动**：
   - 录入成员/保单时调用 `callBridge("contacts", "searchPeople", ...)`：人脉在装时点选，未安装时回退为普通单行文本框，绝不报错！
   - 事务办理完成调用 `logCheckinEventSafely`（`externalRef: "home:<module>:<rowId>:<today>"`）。

---

### 【P2 级：样式隔离与快捷键精简】
5. **消灭 SCSS 顶层裸类 (`src/index.scss`)**：
   - 排查 `.dialog-content .lv-home` 等裸选择器，确保所有样式严格收敛在 `.lv-home` 专属前缀内。
6. **精简默认快捷键 & 移动端键盘避让**：
   - 精简默认占用的 5 个 `Ctrl+Alt+*`，仅保留 1 个主入口快捷键，其余设为 `""` 由用户自定义绑定；
   - 快速录入弹层挂载 `window.visualViewport` 动态抬升底边距，防软键盘遮挡保存按钮。

---

## 三、 验收指令
修改完成后，在根目录执行：
```bash
pnpm check && pnpm test
```
确保全量 791+ 项单测与门禁 100% 全绿通过！
