# 小驴管家（Lv Home）· 对外服务与生态 API 文档（API & Bridge Reference）

> 版本：v0.5.17 · 协议版本：Protocol 1 · 更新日期：2026-10-15

小驴管家对外提供标准服务桥接口（`window.LvHome`）及全局事件通道，遵循零外部私有存储访问与按需最小授权原则。

---

## 一、服务桥对象：`window.LvHome`

### 1. 访问与挂载时机
- **挂载时机**：插件 `onload` 完成并加载偏好设置后自动挂载；
- **卸载行为**：插件 `onunload` 时自动安全清理 `delete window.LvHome`；
- **调用检查**：调用方调用前须检查 `typeof window.LvHome !== "undefined"`。

### 2. 接口契约定义（TypeScript）

```ts
export interface BridgeSummary {
    /** 逾期事项数 */
    overdue: number;
    /** 7天内即将到期事项数 */
    soon: number;
    /** 今日及之前到期事项数（daysLeft <= 0） */
    today: number;
    /** 统计快照更新时刻（ISO 8601） */
    updatedAt: string;
}

export interface LvHomeBridgeApi {
    /** 协议版本号（当前固定为 1） */
    readonly protocol: number;
    /** 支持的能力清单 */
    readonly capabilities: readonly ["whenReady", "openButler", "openReminders", "addMemo", "summary"];

    /** 就绪探测：插件就绪并可响应请求时 resolve true */
    whenReady(): Promise<boolean>;

    /** 打开小驴管家主面板（总览页） */
    openButler(): void;

    /** 打开小驴管家并预选提醒中枢页 */
    openReminders(): void;

    /**
     * 快速添加待办备忘（写入运行态缓存，不直接修改底层台账文档）
     * @param title 备忘标题（非空字符串，自动执行去首尾空格）
     * @param dueDate 截止日期（YYYY-MM-DD 格式）
     */
    addMemo(title: string, dueDate: string): Promise<void>;

    /**
     * 获取当前提醒事项有界计数快照
     * @returns 仅包含数字计数与时间戳，严禁且绝不泄露具体事项标题、金额、成员或日期隐私
     */
    summary(): BridgeSummary;
}
```

---

## 二、方法使用示例

### 1. 探测就绪与打开面板
```javascript
if (window.LvHome) {
    await window.LvHome.whenReady();
    window.LvHome.openButler();
}
```

### 2. 跨插件快速创建备忘
```javascript
if (window.LvHome) {
    try {
        await window.LvHome.addMemo("汽车保养预约", "2026-10-25");
        console.log("备忘添加成功");
    } catch (err) {
        console.error("添加失败：", err.message);
    }
}
```

### 3. 获取概要计数仪表数据
```javascript
if (window.LvHome) {
    const stats = window.LvHome.summary();
    console.log(`今日待办：${stats.today} 件，近期到期：${stats.soon} 件`);
}
```

---

## 三、兄弟插件事件集成规范

### 1. 小驴雷切（SpeedSwitch）
- **Action ID**：`lvhome.open-overview`（打开总览）、`lvhome.open-reminders`（打开提醒中枢）；
- **HomeModule ID**：`lvhome.summary`（家庭事项状态看板，提供实时计数与直达入口）。

### 2. 小驴人脉（Contacts）
- **联系人选择**：通过 `window.LvContacts.searchPeople(keyword)` 异步检索联系人，并将快照存储为 `姓名 [docId]`，在人脉未安装时具备优雅降级说明。

### 3. 小驴考试（Exam）
- **统计同步事件**：监听 `lv-exam:stats` 事件并同步 `{ streak, accuracy, attempts, generatedAt }`，在总览页展示备考成果。

### 4. 小驴打卡（Checkin）
- **打卡联动事件**：监听 `checkin:event-recorded`、`checkin:event-deleted`、`checkin:item-updated`，通过 60 秒节流机制更新健康与习惯摘要。

---

## 四、安全与隐私边界声明

1. **零私有存储渗透**：管家不主动直接读取或篡改其他插件的 `data/storage/petal/*` 内部配置文件；其他插件亦不可通过服务桥穿透访问家庭台账原文档。
2. **入参严格防御**：`addMemo` 对标题与日期执行类型校验与空值防护，杜绝脏数据注入。
3. **输出有界脱敏**：`summary()` 仅输出宏观统计计数，绝不输出真实人名、证件号、金额或具体待办内容。
