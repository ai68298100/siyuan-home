/**
 * 提醒中枢运行态（docs/design/03 §5、09 D1）：
 * HubState 缓存 + snooze/mute/已办缓存 + 快速备忘（adhoc，D1 定案：允许，运行态不入台账）。
 * 持久化：loadData（随思源同步）；业务数据仍在思源侧，本文件只存运行态（ADR-7）。
 *
 * 语义定案（H03/H05/H06/H07，2026-10-02）：
 * - applyRuntime 为纯派生函数，不改运行态；清理只经 purgeHandled 显式执行并落盘。
 * - 未处理备忘永不按到期自动删除；完成（doneAt）的备忘保留 30 天可恢复，之后才清除。
 * - 完成 = 完成那一期/那一次：anniversary 记当年、recurring 记本期（dueDate ≤ 已办期隐藏），
 *   oneoff 记已办条目；恢复后重现。完成不等于永久 mute。
 * - 延后过期的提醒按延后日距今分级（过期即 overdue），不再沿用原级别。
 */
import type { Plugin } from "siyuan";
import type { Reminder, ReminderKind, ReminderLevel } from "@/types";
import { localDateKey } from "./rule";

const RUNTIME_NAME = "hub-runtime.json";

/** 快速备忘（adhoc）：独立于台账的一次性提醒（09 D1） */
export interface AdhocMemo {
    id: string;
    title: string;
    dueDate: string; // yyyy-MM-dd
    createdAt: string;
    /** 完成时间（ISO）：有值则不进活跃列表，可在"已处理"恢复（H03/H07） */
    doneAt?: string;
}

/** 已处理记录（H07）：oneoff 完成动作的真实留痕，可恢复 */
export interface HandledRecord {
    title: string;
    moduleId: string;
    ruleKey: string;
    dueDate: string;
    at: string; // ISO
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
        /** 运行态合并前的派生列表（H02：动作后免重扫即时重算可见集合） */
        derived: Reminder[];
        /** 各模块上次成功快照与数据时间（H04：失败模块保留旧数据） */
        byModule: Record<string, { reminders: Reminder[]; at: string }>;
    };
    /** 延后：提醒 id → 新到期日 */
    snoozed: Record<string, string>;
    /** 忽略：提醒 id → true（可在提醒页恢复） */
    muted: Record<string, boolean>;
    /** 周年类"今年已办"：提醒 id → 年份（当年隐藏，次年重现） */
    handledYear: Record<string, number>;
    /** recurring 本期已办：提醒 id → 已办那期的 dueDate（下一期自动重现） */
    handledUntil: Record<string, string>;
    /** oneoff 已办记录（可在已处理视图恢复） */
    handled: Record<string, HandledRecord>;
    /** 快速备忘 */
    memos: AdhocMemo[];
    /** 每日摘要去重：最后通知日期 */
    lastNotifiedDate?: string;
    /** 逾期即时提醒去重：最后提示日期（B3b） */
    lastOverdueAlertDate?: string;
}

export function defaultRuntime(): HubRuntime {
    return { schemaVersion: 1, snoozed: {}, muted: {}, handledYear: {}, handledUntil: {}, handled: {}, memos: [] };
}

/** 旧缓存迁移（33.3）：缺字段补默认值；byModule/derived 为 H02/H04 新增 */
export async function loadRuntime(plugin: Plugin): Promise<HubRuntime> {
    const data = await plugin.loadData(RUNTIME_NAME);
    if (!data || typeof data !== "object") return defaultRuntime();
    const base = defaultRuntime();
    const merged: HubRuntime = {
        ...base,
        ...data,
        snoozed: data.snoozed ?? {},
        muted: data.muted ?? {},
        handledYear: data.handledYear ?? {},
        handledUntil: data.handledUntil ?? {},
        handled: data.handled ?? {},
        memos: data.memos ?? [],
    };
    if (merged.cache) {
        merged.cache.derived = merged.cache.derived ?? merged.cache.reminders ?? [];
        merged.cache.byModule = merged.cache.byModule ?? {};
    }
    return merged;
}

export async function saveRuntime(plugin: Plugin, rt: HubRuntime): Promise<void> {
    await plugin.saveData(RUNTIME_NAME, rt);
}

/** 已完成运行态记录的保留期（天）：过期后才可被 purgeHandled 清除 */
export const HANDLED_KEEP_DAYS = 30;

/**
 * 显式清理（H03）：只清"已完成"的运行态记录——done 备忘超保留期、oneoff 已办超保留期、
 * 已失效的 recurring 已办期。未处理项（备忘/延后/忽略/未到期已办）永不按到期自动删除。
 * 调用方负责随后落盘（refreshHub）。
 */
export function purgeHandled(rt: HubRuntime, today: Date, keepDays = HANDLED_KEEP_DAYS): void {
    const cutoff = today.getTime() - keepDays * 86400000;
    rt.memos = (rt.memos ?? []).filter((m) => !m.doneAt || new Date(m.doneAt).getTime() >= cutoff);
    for (const [id, rec] of Object.entries(rt.handled)) {
        if (new Date(rec.at).getTime() < cutoff) delete rt.handled[id];
    }
    const todayKey = localDateKey(today);
    for (const [id, until] of Object.entries(rt.handledUntil)) {
        // 已办期已翻篇（下一期 due 晚于该期），条目不再起隐藏作用，可安全清除
        if (until < todayKey) delete rt.handledUntil[id];
    }
}

/** 规则类型分派（H05）：旧缓存无 kind 时按 ruleKey 推断（birthday=周年，其余 oneoff） */
export function reminderKind(r: Pick<Reminder, "kind" | "ruleKey" | "moduleId">): ReminderKind {
    if (r.kind) return r.kind;
    return r.ruleKey === "birthday" ? "anniversary" : "oneoff";
}

/** 运行态合并后的可见列表是否包含该提醒（供恢复/已办判断复用） */
export function isHiddenByHandled(rt: HubRuntime, r: Reminder, today: Date): boolean {
    const year = today.getFullYear();
    if (rt.muted[r.id]) return true;
    if (rt.handled[r.id]) return true;
    if (rt.handledYear[r.id] === year && r.dueDate.startsWith(String(year))) return true;
    const until = rt.handledUntil[r.id];
    return !!until && r.dueDate <= until;
}

/**
 * 派生提醒 → 呈现列表（纯函数，不改 rt）：
 * 合并 mute/已办隐藏/延后改期，追加未完成 adhoc 备忘。
 */
export function applyRuntime(
    derived: Reminder[],
    rt: HubRuntime,
    today: Date,
): Reminder[] {
    const out: Reminder[] = [];
    const todayKey = localDateKey(today);
    for (const r of derived) {
        if (isHiddenByHandled(rt, r, today)) continue;
        const snoozeDate = rt.snoozed[r.id];
        if (snoozeDate) {
            // snooze 未到 → 隐藏；已到 → 显示为"延后日"事项，按延后日距今分级（H06）
            if (todayKey < snoozeDate) continue;
            const daysLeft = Math.round((parseLocal(snoozeDate) - today.getTime()) / 86400000);
            const level: ReminderLevel = daysLeft < 0 ? "overdue" : "soon";
            out.push({ ...r, dueDate: snoozeDate, daysLeft, level });
            continue;
        }
        out.push(r);
    }
    for (const m of rt.memos ?? []) {
        if (m.doneAt) continue; // 已办备忘不进活跃列表（已处理视图可见可恢复）
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
            kind: "oneoff",
        });
    }
    return out.sort((a, b) => a.daysLeft - b.daysLeft || a.dueDate.localeCompare(b.dueDate));
}

/** 已处理视图条目（H07）：完成/忽略/备忘的真实记录，含恢复所需 id */
export interface HandledEntry {
    id: string;
    title: string;
    moduleId: string;
    dueDate?: string;
    at?: string;
    kind: "done" | "muted" | "year" | "period" | "memo";
}

/**
 * 已处理列表（提醒页"已处理"筛选的真实数据源）：
 * oneoff 已办 + 忽略中 + 周年当年已办 + recurring 本期已办 + 已完成备忘。
 * title 尽量从派生列表回查；不在扫描结果时给出可读的降级说明。
 */
export function listHandled(rt: HubRuntime, derived: Reminder[]): HandledEntry[] {
    const byId = new Map(derived.map((r) => [r.id, r]));
    const out: HandledEntry[] = [];
    for (const [id, rec] of Object.entries(rt.handled)) {
        out.push({ id, title: rec.title, moduleId: rec.moduleId, dueDate: rec.dueDate, at: rec.at, kind: "done" });
    }
    for (const id of Object.keys(rt.muted)) {
        const r = byId.get(id);
        out.push({ id, title: r?.title ?? "", moduleId: r?.moduleId ?? "", dueDate: r?.dueDate, kind: "muted" });
    }
    for (const [id, year] of Object.entries(rt.handledYear)) {
        const r = byId.get(id);
        out.push({ id, title: r?.title ?? "", moduleId: r?.moduleId ?? "", dueDate: r?.dueDate, at: String(year), kind: "year" });
    }
    for (const [id, until] of Object.entries(rt.handledUntil)) {
        const r = byId.get(id);
        out.push({ id, title: r?.title ?? "", moduleId: r?.moduleId ?? "", dueDate: until, kind: "period" });
    }
    for (const m of rt.memos ?? []) {
        if (!m.doneAt) continue;
        out.push({ id: `adhoc::${m.id}`, title: m.title, moduleId: "adhoc", dueDate: m.dueDate, at: m.doneAt, kind: "memo" });
    }
    return out.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

function parseLocal(ymd: string): number {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}
