/**
 * 提醒展示合并（29 组，第一百七十九波自组件抽出可单测）：
 * 同成员同日多条合并为一条可展开卡（"儿子的 3 件事"）；单条与无成员事项保持独立。
 * 顺序语义：输出按输入首次出现序；合并组的 items 按输入序保留。
 * 形态为单一平铺接口（第一百八十一波）：svelte-check 下模板 each key 与 {:else}
 * 分支不收窄可辨识联合，平铺字段让消费方无需收窄；单条 row=自身、items=[自身]。
 */
import type { Reminder } from "@/types";

export interface DisplayEntry {
    merged: boolean;
    /** 合并卡：`${memberId}|${dueDate}`；单条：row.id */
    key: string;
    memberId: string;
    dueDate: string;
    items: Reminder[];
    /** 单条 = 自身；合并卡 = items[0]（模板不渲染该字段，仅占位） */
    row: Reminder;
}

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
        if (!r.memberId) { out.push({ merged: false, key: r.id, memberId: "", dueDate: r.dueDate, items: [r], row: r }); continue; }
        const k = `${r.memberId}|${r.dueDate}`;
        const g = groups.get(k);
        if (g && g.length > 1) {
            if (used.has(k)) continue; // 同键后续行并入合并条目
            used.add(k);
            out.push({ merged: true, key: k, memberId: r.memberId, dueDate: r.dueDate, items: g, row: g[0] });
        } else {
            out.push({ merged: false, key: r.id, memberId: r.memberId, dueDate: r.dueDate, items: [r], row: r });
        }
    }
    return out;
}
