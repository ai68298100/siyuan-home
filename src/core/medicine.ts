/**
 * 家庭药箱领域逻辑（MOD-01）：
 * 药品效期盘点、临期告警、低库存统计与一键生成补货/清理清单。
 */
import { selectCellContent } from "@/core/avcell";
import { localDateKey } from "@/core/hub/rule";

export interface RestockItem {
    id: string;
    name: string;
    issue: "expired" | "expiring" | "low_stock";
    expiry?: string;
    stockQty?: number;
    threshold?: number;
    location?: string;
    suggestQty: number;
}

export interface MedicineSummary {
    totalCount: number;
    expiredCount: number;
    expiringSoonCount: number;
    lowStockCount: number;
    itemsNeedingAttention: RestockItem[];
}

export interface MedicineRowLike {
    itemID: string;
    cells: Record<string, any>;
}

function readNumber(cell: any): number | undefined {
    if (!cell) return undefined;
    const n = cell?.number?.content ?? cell?.number ?? cell?.content;
    const val = typeof n === "number" ? n : Number(n);
    return Number.isFinite(val) ? val : undefined;
}

function readText(cell: any): string {
    if (!cell) return "";
    return String(cell?.text?.content ?? cell?.content ?? cell ?? "").trim();
}

function readDateString(cell: any): string | undefined {
    if (!cell) return undefined;
    const raw = cell?.date;
    if (raw?.isNotEmpty && typeof raw.content === "number") {
        return localDateKey(new Date(raw.content));
    }
    const str = cell?.date?.content ?? cell?.content;
    if (typeof str === "string" && /^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    return undefined;
}

export function calculateMedicineSummary(
    rows: MedicineRowLike[],
    columns?: Record<string, string>,
    todayStr: string = localDateKey(new Date()),
): MedicineSummary {
    if (!columns || rows.length === 0) {
        return {
            totalCount: 0,
            expiredCount: 0,
            expiringSoonCount: 0,
            lowStockCount: 0,
            itemsNeedingAttention: [],
        };
    }

    const nameKey = columns.name;
    const expiryKey = columns.expiry;
    const stockQtyKey = columns.stock_qty;
    const lowStockAtKey = columns.low_stock_at;
    const locationKey = columns.location;
    const statusKey = columns.status;

    let expiredCount = 0;
    let expiringSoonCount = 0;
    let lowStockCount = 0;
    const attentionMap = new Map<string, RestockItem>();

    // 计算 30 天后的日期字符串
    const [y, m, d] = todayStr.split("-").map(Number);
    const in30Days = new Date(y, m - 1, d + 30);
    const in30DaysStr = localDateKey(in30Days);

    for (const row of rows) {
        const status = statusKey ? (selectCellContent(row.cells[statusKey]) || "inuse") : "inuse";
        if (status === "discarded") continue; // 排除已丢弃的历史废药

        const name = nameKey ? readText(row.cells[nameKey]) : "";
        const location = locationKey ? readText(row.cells[locationKey]) : undefined;
        const expiry = expiryKey ? readDateString(row.cells[expiryKey]) : undefined;
        const qty = stockQtyKey ? readNumber(row.cells[stockQtyKey]) : undefined;
        const threshold = lowStockAtKey ? readNumber(row.cells[lowStockAtKey]) : undefined;

        let hasIssue = false;
        let issue: RestockItem["issue"] = "low_stock";
        let suggest = 1;

        // 1. 检查效期
        if (expiry) {
            if (expiry < todayStr) {
                expiredCount++;
                hasIssue = true;
                issue = "expired";
                suggest = 1;
            } else if (expiry <= in30DaysStr) {
                expiringSoonCount++;
                hasIssue = true;
                issue = "expiring";
                suggest = 1;
            }
        }

        // 2. 检查低库存
        if (qty !== undefined && threshold !== undefined && threshold > 0 && qty <= threshold) {
            lowStockCount++;
            hasIssue = true;
            // 如果同时过期和低库存，issue 优先标记为过期
            if (issue !== "expired") {
                issue = "low_stock";
                suggest = Math.max(1, threshold - qty + 1);
            }
        }

        if (hasIssue) {
            attentionMap.set(row.itemID, {
                id: row.itemID,
                name: name || "—",
                issue,
                expiry,
                stockQty: qty,
                threshold,
                location,
                suggestQty: suggest,
            });
        }
    }

    const itemsNeedingAttention = Array.from(attentionMap.values());
    // 排序：已过期 > 缺货 > 临期
    const priority = { expired: 1, low_stock: 2, expiring: 3 };
    itemsNeedingAttention.sort((a, b) => priority[a.issue] - priority[b.issue]);

    return {
        totalCount: rows.length,
        expiredCount,
        expiringSoonCount,
        lowStockCount,
        itemsNeedingAttention,
    };
}

export function formatMedicineRestockText(
    summary: MedicineSummary,
    t: (key: string) => string,
): string {
    const lines: string[] = [];
    const dateStr = localDateKey(new Date());
    lines.push(`【${t("medicine.banner.title")}】· ${dateStr}`);

    if (summary.itemsNeedingAttention.length === 0) {
        lines.push(t("medicine.banner.allHealthy"));
        return lines.join("\n");
    }

    const expired = summary.itemsNeedingAttention.filter((it) => it.issue === "expired");
    const lowStock = summary.itemsNeedingAttention.filter((it) => it.issue === "low_stock");
    const expiring = summary.itemsNeedingAttention.filter((it) => it.issue === "expiring");

    if (expired.length > 0) {
        lines.push(`\n🚨 ${t("medicine.banner.expiredGroup")} (${expired.length})：`);
        for (const it of expired) {
            const loc = it.location ? ` [${it.location}]` : "";
            lines.push(`- ${it.name}${loc} (到期日: ${it.expiry ?? "—"}) · 建议丢弃清理`);
        }
    }

    if (lowStock.length > 0) {
        lines.push(`\n📦 ${t("medicine.banner.lowStockGroup")} (${lowStock.length})：`);
        for (const it of lowStock) {
            const qtyDesc = it.stockQty !== undefined && it.threshold !== undefined ? ` (余量 ${it.stockQty} ≤ 警戒线 ${it.threshold})` : "";
            lines.push(`- ${it.name}${qtyDesc} · 建议补齐 ${it.suggestQty}`);
        }
    }

    if (expiring.length > 0) {
        lines.push(`\n⚠️ ${t("medicine.banner.expiringGroup")} (${expiring.length})：`);
        for (const it of expiring) {
            lines.push(`- ${it.name} (将于 ${it.expiry} 到期)`);
        }
    }

    return lines.join("\n");
}
