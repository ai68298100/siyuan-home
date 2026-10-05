/**
 * 提醒处理动作（03 §5）：完成/延后/忽略/备忘增删 —— 只改台账行或运行态，不产生影子数据。
 * 续期（renew）依赖 certs 行写回（setCell），v0.2 提供 oneoff 场景。
 *
 * 语义定案（H01/H05/H07，2026-10-02）：
 * - 运行态写操作经模块级 promise 链串行执行：读-改-写不互相覆盖，连续动作全部落盘。
 * - 完成按规则类型分派（完成≠永久忽略）：anniversary 记当年已办、recurring 记本期已办、
 *   oneoff 记已办条目、备忘标记 doneAt；均可经 restore 恢复。
 */
import type { Plugin } from "siyuan";
import type { Reminder } from "@/types";
import { setCell } from "../siyuan";
import { loadRuntime, saveRuntime, reminderKind, type HubRuntime, type HandledRecord } from "./runtime";

/** 运行态写队列（H01）：同一页面内所有动作串行；队列内失败不断链（吞掉让调用方各自的 promise 报错） */
let runtimeChain: Promise<unknown> = Promise.resolve();

export function withRuntime(plugin: Plugin, fn: (rt: HubRuntime) => void | Promise<void>): Promise<HubRuntime> {
    const run = runtimeChain.then(async () => {
        const rt = await loadRuntime(plugin);
        // 226 波修复（真机 e2e 发现的数据丢失竞态）：写回后必须同步插件活引用——
        // 否则 notifyHubChanged/扫描仍持有旧对象并整体回写，把刚落盘的备忘/延后/已办覆盖丢失
        (plugin as unknown as { runtime: HubRuntime }).runtime = rt;
        await fn(rt);
        await saveRuntime(plugin, rt);
        return rt;
    });
    runtimeChain = run.catch(() => undefined);
    return run;
}

function ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 延后 N 天（运行态，不改真实 due） */
export function snooze(plugin: Plugin, reminderId: string, days: number, today = new Date()) {
    return withRuntime(plugin, (rt) => {
        rt.snoozed[reminderId] = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days));
    });
}

/** 忽略此类（可恢复） */
export function mute(plugin: Plugin, reminderId: string) {
    return withRuntime(plugin, (rt) => { rt.muted[reminderId] = true; });
}

/** 恢复被忽略的提醒 */
export function unmute(plugin: Plugin, reminderId: string) {
    return withRuntime(plugin, (rt) => { delete rt.muted[reminderId]; });
}

/**
 * 完成（H05：完成那一期/那一次，不是永久 mute）：
 * - anniversary → 记「今年已办」，当年隐藏、明年自动重现
 * - recurring → 记本期已办（dueDate ≤ 已办期隐藏；台账 due 滚动后下一期自动重现）
 * - adhoc 备忘 → 标记 doneAt（保留在运行态可恢复，不物理删除，H03）
 * - oneoff → 记已办条目（可在已处理视图恢复）
 */
export function complete(plugin: Plugin, r: Reminder, year = new Date().getFullYear()) {
    return withRuntime(plugin, (rt) => {
        const rec: HandledRecord = {
            title: r.title, moduleId: r.moduleId, ruleKey: r.ruleKey,
            dueDate: r.dueDate, at: new Date().toISOString(),
        };
        if (r.moduleId === "adhoc") {
            const m = rt.memos.find((m) => `adhoc::${m.id}` === r.id);
            if (m) m.doneAt = rec.at;
            else rt.handled[r.id] = rec;
        } else if (reminderKind(r) === "anniversary") {
            rt.handledYear[r.id] = year;
        } else if (reminderKind(r) === "recurring") {
            rt.handledUntil[r.id] = r.dueDate;
        } else {
            rt.handled[r.id] = rec;
        }
        // 29 组月度完成率：按月计数（restore 不递减——"恢复 ≠ 取消完成事实"）
        const monthKey = rec.at.slice(0, 7);
        rt.monthlyCompletions = { ...(rt.monthlyCompletions ?? {}), [monthKey]: (rt.monthlyCompletions?.[monthKey] ?? 0) + 1 };
    });
}

/** 恢复（H07）：清掉该提醒的所有运行态隐藏标记（已办/已办期/当年已办/忽略/备忘完成） */
export function restore(plugin: Plugin, reminderId: string) {
    return withRuntime(plugin, (rt) => {
        delete rt.muted[reminderId];
        delete rt.handled[reminderId];
        delete rt.handledYear[reminderId];
        delete rt.handledUntil[reminderId];
        const memoId = reminderId.startsWith("adhoc::") ? reminderId.slice("adhoc::".length) : undefined;
        if (memoId) {
            const m = rt.memos.find((m) => m.id === memoId);
            if (m) delete m.doneAt;
        }
    });
}

/**
 * 续期（H10）：写回规则自己的 field 列（缴费动作不改保障到期日——next_pay 规则写 next_pay，
 * 签注写 due，默认效期列），成功后清除该提醒的 snooze/mute/已办，并留续期流水。
 * fieldKey 由调用方从 schema.reminders 解析（actions 不依赖 schema）。
 */
export async function renew(
    plugin: Plugin,
    r: Reminder,
    newDueISO: string,
    dbRef: { avId?: string; columns?: Record<string, string> },
    fieldKey = "expiry",
) {
    const targetKey = dbRef.columns?.[fieldKey] ?? dbRef.columns?.expiry ?? dbRef.columns?.due;
    if (!dbRef.avId || !targetKey) throw new Error("ledger not provisioned");
    const ms = new Date(`${newDueISO}T00:00:00`).getTime();
    await setCell(dbRef.avId, targetKey, r.rowId, {
        type: "date", date: { content: ms, isNotEmpty: true, hasEndDate: false, isNotTime: true },
    });
    return withRuntime(plugin, (rt) => {
        delete rt.snoozed[r.id];
        delete rt.muted[r.id];
        delete rt.handled[r.id];
        rt.renewHistory[r.rowId] = [
            ...(rt.renewHistory[r.rowId] ?? []),
            { from: r.dueDate, to: newDueISO, at: new Date().toISOString() },
        ];
    });
}

/** 快速备忘（D1） */
export function addMemo(plugin: Plugin, title: string, dueDate: string) {
    return withRuntime(plugin, (rt) => {
        rt.memos.push({ id: `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title, dueDate, createdAt: new Date().toISOString() });
    });
}

/** 删除备忘（显式用户动作；未处理备忘永不自动删除，H03） */
export function removeMemo(plugin: Plugin, reminderId: string) {
    return withRuntime(plugin, (rt) => {
        const memoId = reminderId.startsWith("adhoc::") ? reminderId.slice("adhoc::".length) : reminderId;
        rt.memos = rt.memos.filter((m) => m.id !== memoId);
    });
}
