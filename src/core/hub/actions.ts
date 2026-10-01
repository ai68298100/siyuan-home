/**
 * 提醒处理动作（03 §5）：完成/延后/忽略/备忘增删 —— 只改台账行或运行态，不产生影子数据。
 * 续期（renew）依赖 certs 行写回（setCell），v0.2 提供 oneoff 场景。
 */
import type { Plugin } from "siyuan";
import type { Reminder } from "@/types";
import { setCell } from "../siyuan";
import { loadRuntime, saveRuntime, type HubRuntime } from "./runtime";

export async function withRuntime(plugin: Plugin, fn: (rt: HubRuntime) => void | Promise<void>): Promise<HubRuntime> {
    const rt = await loadRuntime(plugin);
    await fn(rt);
    await saveRuntime(plugin, rt);
    return rt;
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
 * 完成：
 * - anniversary（生日）→ 记「今年已办」，明年自动重现
 * - adhoc → 删除备忘
 * - oneoff/recurring → v0.2 记 mute（台账行的归档/last_done 写回在 A5 行编辑 API 中补）
 */
export function complete(plugin: Plugin, r: Reminder, year = new Date().getFullYear()) {
    return withRuntime(plugin, async (rt) => {
        if (r.ruleKey === "birthday") {
            rt.handledYear[r.id] = year;
        } else if (r.moduleId === "adhoc") {
            rt.memos = rt.memos.filter((m) => `adhoc::${m.id}` !== r.id);
        } else {
            rt.muted[r.id] = true;
        }
    });
}

/** 续期（certs oneoff）：写回台账行到期日；成功后清除该提醒的 snooze/mute（历史链见 TODO 16 组） */
export async function renew(plugin: Plugin, r: Reminder, newDueISO: string, dbRef: { avId?: string; columns?: Record<string, string> }) {
    const expiryKey = dbRef.columns?.expiry;
    if (!dbRef.avId || !expiryKey) throw new Error("ledger not provisioned");
    const ms = new Date(`${newDueISO}T00:00:00`).getTime();
    await setCell(dbRef.avId, expiryKey, r.rowId, {
        type: "date", date: { content: ms, isNotEmpty: true, hasEndDate: false, isNotTime: true },
    });
    return withRuntime(plugin, (rt) => {
        delete rt.snoozed[r.id];
        delete rt.muted[r.id];
    });
}

/** 快速备忘（D1） */
export function addMemo(plugin: Plugin, title: string, dueDate: string) {
    return withRuntime(plugin, (rt) => {
        rt.memos.push({ id: `m-${Date.now().toString(36)}`, title, dueDate, createdAt: new Date().toISOString() });
    });
}
