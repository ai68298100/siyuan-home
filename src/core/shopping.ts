/**
 * 囤货采购建议（16 组/188 波）：低库存行汇总为可编辑采购清单。
 * 纯逻辑，无思源依赖，可单测。评估口径与 H15 数值阈值规则一致：
 * qty 与阈值均有值且 qty ≤ 阈值才入清单（缺列/缺值不评估，不误报）。
 */
import type { AvRow } from "./siyuan";

export interface ShoppingItem {
    name: string;
    qty: number;
    threshold: number;
    /** 建议购买量 = 补回阈值（至少 1）——对话框可改，复制清单按此值 */
    suggest: number;
}

function num(v: any): number | undefined {
    return v?.number?.isNotEmpty && typeof v.number.content === "number" ? v.number.content : undefined;
}

function nameOf(v: any): string {
    return String(v?.text?.content ?? v?.block?.content ?? "").trim();
}

export function buildShoppingList(
    rows: AvRow[],
    keys: { nameKey: string; qtyKey: string; thresholdKey: string },
): ShoppingItem[] {
    const out: ShoppingItem[] = [];
    for (const r of rows) {
        const name = nameOf(keys.nameKey ? r.cells[keys.nameKey] : undefined);
        const qty = num(keys.qtyKey ? r.cells[keys.qtyKey] : undefined);
        const threshold = num(keys.thresholdKey ? r.cells[keys.thresholdKey] : undefined);
        if (!name || qty === undefined || threshold === undefined) continue;
        if (qty > threshold) continue;
        out.push({ name, qty, threshold, suggest: Math.max(1, threshold - qty) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}
