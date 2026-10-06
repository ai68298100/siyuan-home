/**
 * 面板侧插件接口（32 组 props any 清零）：
 * 各屏以结构性类型引用插件能力——LvHomePlugin 类实例天然满足（多余成员不影响）。
 * 数据边界：scan/reminders 为运行态 JSON（内核派生），rows/cells 维持宽类型并由
 * 21 组"SQL 结果类型化"逐模块收紧；本接口只约束面板与插件的契约面。
 */
import type { Plugin, JSONValue } from "siyuan";
import type { HomeSettings, Reminder } from "./index";
import type { HubRuntime, HandledEntry } from "@/core/hub/runtime";
import type { ScanResult } from "@/core/hub/scanner";
import type { ModuleSchema } from "@/core/schema";

export interface HomePluginLike extends Plugin {
    i18n: Record<string, JSONValue>;
    name: string;
    settings: HomeSettings;
    runtime: HubRuntime;
    scan?: ScanResult;
    /** moduleId → schema 目录（UI 按需读取列定义/枚举） */
    schemaCatalog: Record<string, ModuleSchema>;
    hubListeners: Set<() => void>;
    activeLedger: string;
    /** 状态栏/通知入口预选页签（消费后清空） */
    pendingScreen?: string;

    refreshHub(only?: string | string[], force?: boolean): Promise<ScanResult>;
    ensureCoreLedgers(): Promise<void>;
    showTab(): void;
    showTabDocs(docId?: string): void;
    openSetting(): void;
    setActiveLedger(id: string): void;
    listHandled(): HandledEntry[];
    /** C7：向导完成（家庭构成 + 预选模块 → 建库 + 首扫） */
    finishOnboarding(household: { roles: string[]; children: number }, moduleIds: string[]): Promise<void>;

    complete(r: Reminder): Promise<void>;
    snooze(id: string, days: number): Promise<void>;
    mute(id: string): Promise<void>;
    unmute(id: string): Promise<void>;
    restore(id: string): Promise<void>;
    renew(r: Reminder, iso: string): Promise<unknown>;
    addMemo(title: string, due: string): Promise<void>;
    removeMemo(id: string): Promise<void>;
    updateMemo(id: string, patch: { title?: string; dueDate?: string }): Promise<void>;
}
