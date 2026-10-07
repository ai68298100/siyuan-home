/**
 * 管家对外服务桥 v1（window.LvHome）——EC03 就绪协商 / v0.3 生态 RPC 首批的 window 版。
 * 模式对齐小驴人脉 window.LvContacts（protocol + capabilities + 卸载注销）；
 * 纪律相同：只提供服务，不读取/监听其他插件的私有存储。
 * 契约文档：docs/BRIDGE.md（本文件为实现的唯一事实源）。
 */
import type { HomeSettings } from "@/types";

export const LVHOME_BRIDGE_PROTOCOL = 1;

export interface BridgeSummary {
    overdue: number;
    soon: number;
    today: number;
    updatedAt: string;
}

export interface LvHomeBridgeApi {
    readonly protocol: number;
    readonly capabilities: readonly string[];
    /** 就绪信号（桥挂载即代表设置已加载、可调用）；对齐打卡/雷切 whenReady 惯例 */
    whenReady(): Promise<boolean>;
    /** 打开管家总览 */
    openButler(): void;
    /** 打开提醒中枢（预选提醒页签） */
    openReminders(): void;
    /** 快速备忘（运行态，不落台账；幂等语义由运行态管理） */
    addMemo(title: string, dueDate: string): Promise<void>;
    /** 有界计数快照（只读——仅计数，不含标题/日期/成员；EC17 同边界） */
    summary(): BridgeSummary;
}

export interface BridgeHost {
    settings: HomeSettings;
    scan?: { reminders: Array<{ level: string; daysLeft: number }>; stale: boolean };
    showTab(): void;
    openRemindersTab(): void;
    addMemo(title: string, due: string): Promise<void>;
    /** 桥卸载钩子（onunload 时置空 window 引用） */
    onBridgeDisposed(): void;
}

export function buildLvHomeBridge(host: BridgeHost): LvHomeBridgeApi {
    return {
        protocol: LVHOME_BRIDGE_PROTOCOL,
        capabilities: ["whenReady", "openButler", "openReminders", "addMemo", "summary"],

        whenReady() {
            return Promise.resolve(true);
        },

        openButler() {
            host.showTab();
        },

        openReminders() {
            host.openRemindersTab();
        },

        async addMemo(title, dueDate) {
            if (!title.trim()) throw new Error("备忘标题不能为空");
            await host.addMemo(title.trim(), dueDate);
        },

        summary() {
            const rems = host.scan?.reminders ?? [];
            return {
                overdue: rems.filter((r) => r.level === "overdue").length,
                soon: rems.filter((r) => r.level === "soon").length,
                today: rems.filter((r) => r.daysLeft <= 0).length,
                updatedAt: new Date().toISOString(),
            };
        },
    };
}

/** 挂载桥到 window（onload 末尾调用——settings 已加载）；返回卸载函数 */
export function mountLvHomeBridge(host: BridgeHost): () => void {
    const w = window as unknown as { LvHome?: LvHomeBridgeApi };
    if (w.LvHome) {
        // 已有桥（多实例/重复加载）：不覆盖，跳过——首个实例持有窗口期
        return () => undefined;
    }
    const bridge = buildLvHomeBridge(host);
    w.LvHome = bridge;
    let disposed = false;
    return () => {
        // 多实例/重复卸载时只能移除自己挂载的桥；新实例接管后旧 disposer
        // 不得误删新桥，也不得重复触发宿主卸载钩子。
        if (disposed || w.LvHome !== bridge) return;
        disposed = true;
        delete w.LvHome;
        host.onBridgeDisposed();
    };
}
