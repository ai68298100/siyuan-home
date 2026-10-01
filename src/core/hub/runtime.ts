/**
 * 提醒中枢运行态（docs/design/03 §5、09 D1）：
 * HubState 缓存 + snooze/mute/已办缓存 + 快速备忘（adhoc，D1 定案：允许，运行态不入台账）。
 * 持久化：loadData（随思源同步）；业务数据仍在思源侧，本文件只存运行态（ADR-7）。
 */
import type { Plugin } from "siyuan";
import type { Reminder, ReminderLevel } from "@/types";
import { localDateKey } from "./rule";

const RUNTIME_NAME = "hub-runtime.json";

/** 快速备忘（adhoc）：独立于台账的一次性提醒（09 D1） */
export interface AdhocMemo {
    id: string;
    title: string;
    dueDate: string; // yyyy-MM-dd
    createdAt: string;
}

export interface HubRuntime {
    /** 运行态版本（33.3：协议版本化） */
    schemaVersion: 1;
    /** 上次全量扫描时间（ISO） */
    scannedAt?: string;
    /** 总览成员过滤（C2e：持久化） */
    filterMemberId?: string;
    /** 提醒中枢筛选（C3d：持久化） */
    hubFilter?: string;
    /** 上次扫描摘要缓存（通知与总览首屏直读，扫描失败时保留 stale 数据） */
    cache?: {
        reminders: Reminder[];
        counts: { overdue: number; soon: number; lead: number };
        /** 单模块扫描失败记录（不得全局显示"暂无事项"，33.3） */
        errors: { moduleId: string; message: string }[];
    };
    /** 延后：提醒 id → 新到期日 */
    snoozed: Record<string, string>;
    /** 忽略：提醒 id → true（可在提醒页恢复） */
    muted: Record<string, boolean>;
    /** 周年类"今年已办"：提醒 id → 年份 */
    handledYear: Record<string, number>;
    /** 快速备忘 */
    memos: AdhocMemo[];
    /** 每日摘要去重：最后通知日期 */
    lastNotifiedDate?: string;
}

export function defaultRuntime(): HubRuntime {
    return { schemaVersion: 1, snoozed: {}, muted: {}, handledYear: {}, memos: [] };
}

export async function loadRuntime(plugin: Plugin): Promise<HubRuntime> {
    const data = await plugin.loadData(RUNTIME_NAME);
    if (!data || typeof data !== "object") return defaultRuntime();
    const base = defaultRuntime();
    return { ...base, ...data, snoozed: data.snoozed ?? {}, muted: data.muted ?? {}, handledYear: data.handledYear ?? {}, memos: data.memos ?? [] };
}

export async function saveRuntime(plugin: Plugin, rt: HubRuntime): Promise<void> {
    await plugin.saveData(RUNTIME_NAME, rt);
}

/** 派生提醒 → 呈现列表：合并 snooze/mute，追加 adhoc 备忘 */
export function applyRuntime(
    derived: Reminder[],
    rt: HubRuntime,
    today: Date,
): Reminder[] {
    const out: Reminder[] = [];
    for (const r of derived) {
        if (rt.muted[r.id]) continue;
        const snoozeDate = rt.snoozed[r.id];
        if (snoozeDate) {
            // snooze 到今天仍要显示（当天到期）；未到期则隐藏
            if (localDateKey(today) < snoozeDate) continue;
            out.push({ ...r, dueDate: snoozeDate, daysLeft: 0, level: r.level === "overdue" ? "overdue" : "soon" });
            continue;
        }
        out.push(r);
    }
    const year = today.getFullYear();
    for (const m of rt.memos) {
        const daysLeft = Math.round((parseLocal(m.dueDate) - today.getTime()) / 86400000);
        const level: ReminderLevel = daysLeft < 0 ? "overdue" : daysLeft <= 7 ? "soon" : "lead";
        out.push({
            id: `adhoc::${m.id}`,
            moduleId: "adhoc",
            ruleKey: "memo",
            rowId: m.id,
            title: m.title,
            dueDate: m.dueDate,
            daysLeft,
            level,
        });
    }
    void year;
    return out.sort((a, b) => a.daysLeft - b.daysLeft || a.dueDate.localeCompare(b.dueDate));
}

function parseLocal(ymd: string): number {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}
