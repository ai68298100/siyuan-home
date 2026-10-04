/**
 * 提醒展示合并（29 组，第一百七十九波自组件抽出可单测）：
 * 同成员同日多条合并为一条可展开卡（"儿子的 3 件事"）；单条与无成员事项保持独立。
 * 顺序语义：输出按输入首次出现序；合并组的 items 按输入序保留。
 */
import type { Reminder } from "@/types";

export interface MergedEntry {
    merged: true;
    key: string;
    memberId: string;
    dueDate: string;
    items: Reminder[];
}

export interface SingleEntry {
    merged: false;
    row: Reminder;
}

export type DisplayEntry = MergedEntry | SingleEntry;

export function buildDisplay(items: Reminder[]): DisplayEntry[] {
    const groups = new Map<string, Reminder[]>();
    for (const r of items) {
        if (!r.memberId) continue;
        const k = `${r.memberId}|${r.dueDate}`;
        let g = groups.get(k);
        if (!g) { g = []; groups.set(k, g); }
        g.push(r);
    }
    const used = new Set<string>();
    const out: DisplayEntry[] = [];
    for (const r of items) {
        if (!r.memberId) { out.push({ merged: false, row: r }); continue; }
        const k = `${r.memberId}|${r.dueDate}`;
        const g = groups.get(k);
        if (g && g.length > 1) {
            if (used.has(k)) continue; // 同键后续行并入合并条目
            used.add(k);
            out.push({ merged: true, key: k, memberId: r.memberId, dueDate: r.dueDate, items: g });
        } else {
            out.push({ merged: false, row: r });
        }
    }
    return out;
}
