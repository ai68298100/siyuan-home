/**
 * 管家对外服务桥 v1（window.LvHome / window.siyuanHome / window.xiaolvHome / window.lvHome）
 * EC03 就绪协商 / v0.3 生态 RPC 首批的 window 版。
 * 模式对齐小驴人脉 / 小驴常用 / 小驴打卡（protocol + capabilities + 别名矩阵 + 安全卸载注销）；
 * 纪律相同：只提供服务，不读取/监听其他插件的私有存储。
 * 契约文档：docs/BRIDGE.md（本文件为实现的唯一事实源）。
 */
import type { HomeSettings } from "@/types";

export const LVHOME_BRIDGE_PROTOCOL = 1;

export const LVHOME_API_NAME = "LvHome";

export const LVHOME_API_ALIASES = [
    "LvHome",
    "siyuanHome",
    "xiaolvHome",
    "lvHome",
] as const;

export type LvHomeApiAlias = typeof LVHOME_API_ALIASES[number];

export interface BridgeSummary {
    overdue: number;
    soon: number;
    today: number;
    updatedAt: string;
}

export interface BridgeOverview {
    protocol: number;
    enabledModules: readonly string[];
    remindersCount: number;
    overdueCount: number;
    todayCount: number;
    scanStale: boolean;
    updatedAt: string;
}

export interface HomeChangedEventDetail {
    plugin: string;
    v: number;
    action: "add-memo" | "open-module" | "open-butler" | "open-reminders";
    payload?: Record<string, unknown>;
    occurredAt: string;
    idempotencyKey?: string;
}

export function dispatchHomeChangedEvent(detail: Omit<HomeChangedEventDetail, "plugin" | "v" | "occurredAt"> & Partial<Pick<HomeChangedEventDetail, "occurredAt">>): void {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
    try {
        const fullDetail: HomeChangedEventDetail = {
            plugin: "siyuan-home",
            v: 1,
            occurredAt: detail.occurredAt || new Date().toISOString(),
            ...detail,
        };
        window.dispatchEvent(new CustomEvent("lv-home:changed", { detail: fullDetail }));
    } catch {
        // fail-soft
    }
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
    /** 导航并打开指定台账模块（如 "assets" | "members" | "medicine" | "vehicle" 等） */
    openModule(moduleId: string): boolean;
    /** 快速备忘（运行态，不落台账；幂等语义由运行态管理） */
    addMemo(title: string, dueDate: string): Promise<void>;
    /** 有界计数快照（只读——仅计数，不含标题/日期/成员；EC17 同边界） */
    summary(): BridgeSummary;
    /** 高层只读概览（包含启用模块、提醒总量与扫描时效，防敏感信息泄露） */
    getOverview(): BridgeOverview;
}

export interface BridgeHost {
    settings: HomeSettings;
    scan?: { reminders: Array<{ level: string; daysLeft: number }>; stale: boolean };
    showTab(): void;
    openRemindersTab(): void;
    openModuleTab?(moduleId: string): void;
    addMemo(title: string, due: string): Promise<void>;
    /** 桥卸载钩子（onunload 时置空 window 引用） */
    onBridgeDisposed(): void;
}

export function buildLvHomeBridge(host: BridgeHost): LvHomeBridgeApi {
    return {
        protocol: LVHOME_BRIDGE_PROTOCOL,
        capabilities: [
            "whenReady",
            "openButler",
            "openReminders",
            "addMemo",
            "summary",
            "openModule",
            "getOverview",
        ],

        whenReady() {
            return Promise.resolve(true);
        },

        openButler() {
            host.showTab();
            dispatchHomeChangedEvent({ action: "open-butler" });
        },

        openReminders() {
            host.openRemindersTab();
            dispatchHomeChangedEvent({ action: "open-reminders" });
        },

        openModule(moduleId: string) {
            if (!moduleId || typeof moduleId !== "string") return false;
            const cleanId = moduleId.trim();
            if (!cleanId) return false;
            if (typeof host.openModuleTab === "function") {
                host.openModuleTab(cleanId);
                dispatchHomeChangedEvent({ action: "open-module", payload: { moduleId: cleanId } });
                return true;
            }
            host.showTab();
            dispatchHomeChangedEvent({ action: "open-module", payload: { moduleId: cleanId } });
            return true;
        },

        async addMemo(title, dueDate) {
            if (!title || !title.trim()) throw new Error("备忘标题不能为空");
            const cleanTitle = title.trim();
            await host.addMemo(cleanTitle, dueDate);
            dispatchHomeChangedEvent({
                action: "add-memo",
                payload: { title: cleanTitle, dueDate },
                idempotencyKey: `memo:${Date.now()}:${cleanTitle.slice(0, 20)}`,
            });
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

        getOverview() {
            const rems = host.scan?.reminders ?? [];
            const overdue = rems.filter((r) => r.level === "overdue").length;
            const today = rems.filter((r) => r.daysLeft <= 0).length;
            return {
                protocol: LVHOME_BRIDGE_PROTOCOL,
                enabledModules: Object.freeze([...(host.settings?.enabledModules ?? [])]),
                remindersCount: rems.length,
                overdueCount: overdue,
                todayCount: today,
                scanStale: !!host.scan?.stale,
                updatedAt: new Date().toISOString(),
            };
        },
    };
}

/** 挂载桥到 window（多别名挂载）；返回卸载函数 */
export function mountLvHomeBridge(host: BridgeHost): () => void {
    if (typeof window === "undefined") return () => undefined;
    const w = window as unknown as Record<string, unknown>;
    if (w[LVHOME_API_NAME]) {
        // 已有主桥（多实例/重复加载）：不覆盖，跳过——首个实例持有窗口期
        return () => undefined;
    }
    const bridge = buildLvHomeBridge(host);
    const mounted: string[] = [];

    for (const alias of LVHOME_API_ALIASES) {
        if (!w[alias] || w[alias] === bridge) {
            w[alias] = bridge;
            mounted.push(alias);
        }
    }

    let disposed = false;
    return () => {
        if (disposed || w[LVHOME_API_NAME] !== bridge) return;
        disposed = true;
        for (const alias of mounted) {
            if (w[alias] === bridge) {
                delete w[alias];
            }
        }
        host.onBridgeDisposed();
    };
}
