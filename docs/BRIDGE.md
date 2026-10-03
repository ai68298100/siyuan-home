# Lv Home 服务桥（window.LvHome）· v1

> 对外契约文档，模式对齐小驴人脉 `window.LvContacts`（protocol + capabilities + 卸载注销）。
> 纪律：管家桥**只提供服务**，不读取/监听其他插件的私有存储。实现唯一事实源：`src/bridge/external-bridge.ts`。

## 挂载与就绪

- 挂载时机：插件 `onload` 末尾（设置已加载后）。
- 访问方式：`window.LvHome`（调用前必须检查存在性——插件卸载/未启用时为 `undefined`，不存在挂载中途消失）。
- 就绪语义：桥挂载即代表设置已加载、可调用；`whenReady()` 恒 resolve `true`（对齐打卡/雷切 whenReady 惯例）。
- 卸载：插件 `onunload` 时 `delete window.LvHome`，不留悬挂引用。
- **多实例**：挂载时若 `window.LvHome` 已存在（其他实例先挂），本实例**不覆盖、跳过**——首个实例持有桥；该实例卸载时也不会删除他人的桥（disposer 为空操作）。

## 协议

```ts
window.LvHome = {
    readonly protocol: 1;
    readonly capabilities: ["whenReady", "openButler", "openReminders", "addMemo", "summary"];

    whenReady(): Promise<boolean>;
    openButler(): void;
    openReminders(): void;
    addMemo(title: string, dueDate: string): Promise<void>;
    summary(): { overdue: number; soon: number; today: number; updatedAt: string };
};
```

## 方法语义

| 方法 | 语义 | 错误 |
|---|---|---|
| `whenReady()` | 就绪探测（恒成功；挂载即可用） | — |
| `openButler()` | 打开管家面板（总览页签） | — |
| `openReminders()` | 打开管家并预选提醒中枢 | — |
| `addMemo(title, dueDate)` | 快速备忘进提醒中枢（`yyyy-MM-dd`）；**运行态数据**，不写台账；标题会先做首尾修剪 | 空标题抛错 |
| `summary()` | 计数快照：`overdue`/`soon`/`today`（daysLeft≤0）+ `updatedAt` ISO；**只含计数，不含标题/日期/成员**（EC17 同边界） | — |

## 隐私边界

- `summary()` 只暴露**计数**；不提供任何标题、日期、成员、金额的读取能力。
- 管家不读取/监听其他插件的私有存储；其他插件也不应假设可经此桥读取台账内容。

## 版本

- `protocol: 1`。破坏性变更升 protocol；新增可选方法只加 capabilities 并保持旧方法不动。
- 当前范围即 v0.3 生态首批（window 版）；kernel 私有路由（更完整的 RPC）待实例验证后另立协议。
