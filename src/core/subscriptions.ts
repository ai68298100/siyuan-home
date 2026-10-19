/**
 * 会员与周期订阅支出折算与统计（§16/288波）：
 * 统计有效会员、订阅与预付费服务的周期金额，将不同周期（日/周/月/季/年）
 * 统一年化与月化折算，提供月均开销、年化总支出、自动续费占比及按金额排序清单。
 */
import type { AvRow } from "@/core/siyuan";

export type SubscriptionCycle = "day" | "week" | "month" | "quarter" | "half_year" | "year";

export interface SubscriptionItemStat {
    id: string;
    name: string;
    rawAmount: number;
    cycle: string;
    monthlyCost: number;
    annualCost: number;
    autoRenew: boolean;
    category?: string;
    seatRole?: string;
    nextPay?: string;
}

export interface SubscriptionCategoryStat {
    category: string;
    monthlyCost: number;
    annualCost: number;
    count: number;
}

export interface SubscriptionOverviewReport {
    activeCount: number;
    totalMonthlyCost: number;
    totalAnnualCost: number;
    autoRenewCount: number;
    autoRenewRate: number; // 0-100 百分比
    items: SubscriptionItemStat[];
    categoryBreakdown: SubscriptionCategoryStat[];
}

function cellString(row: AvRow, keyID?: string): string | undefined {
    if (!keyID) return undefined;
    const cell = row.cells?.[keyID];
    if (!cell) return undefined;
    if (cell.type === "text" && cell.text?.content) return String(cell.text.content).trim();
    if (cell.type === "block" && cell.block?.content) return String(cell.block.content).trim();
    if (cell.type === "date" && cell.date?.content) return String(cell.date.content).trim();
    if (cell.type === "select" && cell.select?.content) return String(cell.select.content).trim();
    return undefined;
}

function cellNumber(row: AvRow, keyID?: string): number | undefined {
    if (!keyID) return undefined;
    const cell = row.cells?.[keyID];
    if (!cell) return undefined;
    if (cell.type === "number" && typeof cell.number?.content === "number" && Number.isFinite(cell.number.content)) {
        return cell.number.content;
    }
    return undefined;
}

function cellBoolean(row: AvRow, keyID?: string): boolean {
    if (!keyID) return false;
    const cell = row.cells?.[keyID];
    return cell?.type === "checkbox" ? !!cell.checkbox?.checked : false;
}

/**
 * 将任意周期金额折算为月均与年化金额
 */
export function normalizeCycleCost(amount: number, cycle: string | undefined): { monthly: number; annual: number } {
    if (!Number.isFinite(amount) || amount <= 0) {
        return { monthly: 0, annual: 0 };
    }

    const c = String(cycle ?? "month").toLowerCase().trim();

    let annual = 0;
    let monthly = 0;

    switch (c) {
        case "day":
            annual = amount * 365;
            monthly = (amount * 365) / 12;
            break;
        case "week":
            annual = amount * 52;
            monthly = (amount * 52) / 12;
            break;
        case "month":
            annual = amount * 12;
            monthly = amount;
            break;
        case "quarter":
            annual = amount * 4;
            monthly = amount / 3;
            break;
        case "half_year":
        case "6month":
            annual = amount * 2;
            monthly = amount / 6;
            break;
        case "year":
        default:
            annual = amount;
            monthly = amount / 12;
            break;
    }

    return {
        monthly: Math.round(monthly * 100) / 100,
        annual: Math.round(annual * 100) / 100,
    };
}

/**
 * 汇总计算全部有效会员与订阅的支出折算报告
 */
export function calculateSubscriptionStats(
    rows: AvRow[],
    cols: Record<string, string>,
): SubscriptionOverviewReport {
    const items: SubscriptionItemStat[] = [];
    const catMap = new Map<string, { monthlyCost: number; annualCost: number; count: number }>();

    let totalMonthlyCost = 0;
    let totalAnnualCost = 0;
    let autoRenewCount = 0;

    for (const row of rows) {
        const status = cellString(row, cols.status) || "active";
        // 排除已过期与已退款项目
        if (status === "m_expired" || status === "refunded") {
            continue;
        }

        const name = cellString(row, cols.name) || "未命名服务";
        const amount = cellNumber(row, cols.amount) ?? 0;
        const cycle = cellString(row, cols.cycle) || "year";
        const autoRenew = cellBoolean(row, cols.auto_renew);
        const category = cellString(row, cols.category) || "subscription";
        const seatRole = cellString(row, cols.seat_role);
        const nextPay = cellString(row, cols.next_pay);

        const { monthly, annual } = normalizeCycleCost(amount, cycle);

        if (autoRenew) {
            autoRenewCount++;
        }

        totalMonthlyCost += monthly;
        totalAnnualCost += annual;

        const statItem: SubscriptionItemStat = {
            id: row.itemID,
            name,
            rawAmount: amount,
            cycle,
            monthlyCost: monthly,
            annualCost: annual,
            autoRenew,
            category,
            seatRole,
            nextPay,
        };
        items.push(statItem);

        // 类别聚合
        let cStat = catMap.get(category);
        if (!cStat) {
            cStat = { monthlyCost: 0, annualCost: 0, count: 0 };
            catMap.set(category, cStat);
        }
        cStat.count++;
        cStat.monthlyCost += monthly;
        cStat.annualCost += annual;
    }

    // 排序：年化开销降序
    items.sort((a, b) => b.annualCost - a.annualCost);

    const activeCount = items.length;
    const autoRenewRate = activeCount > 0 ? Math.round((autoRenewCount / activeCount) * 100) : 0;

    const categoryBreakdown: SubscriptionCategoryStat[] = Array.from(catMap.entries())
        .map(([category, stat]) => ({
            category,
            monthlyCost: Math.round(stat.monthlyCost * 100) / 100,
            annualCost: Math.round(stat.annualCost * 100) / 100,
            count: stat.count,
        }))
        .sort((a, b) => b.annualCost - a.annualCost);

    return {
        activeCount,
        totalMonthlyCost: Math.round(totalMonthlyCost * 100) / 100,
        totalAnnualCost: Math.round(totalAnnualCost * 100) / 100,
        autoRenewCount,
        autoRenewRate,
        items,
        categoryBreakdown,
    };
}
