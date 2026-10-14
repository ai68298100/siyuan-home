/**
 * 会员与订阅领域逻辑（MOD-02）：
 * 周期性开销统计、月均支出折算与年度支出预测。
 */
import { selectCellContent } from "@/core/avcell";

export interface MembershipSummary {
    /** 每月等效总支出（元） */
    monthlyTotal: number;
    /** 每年等效总支出（元） */
    annualTotal: number;
    /** 有效订阅数（排除已退款/已过期） */
    activeCount: number;
    /** 开启自动续费的项数 */
    autoRenewCount: number;
    /** 支出最高的前 3 项订阅（名称与月均费用） */
    topItems: { name: string; monthlyCost: number }[];
}

export interface MembershipRowLike {
    itemID: string;
    cells: Record<string, any>;
}

/** 周期换算为每月等效系数 */
export const CYCLE_TO_MONTHLY_FACTORS: Record<string, number> = {
    year: 1 / 12,
    quarter: 1 / 3,
    month: 1,
    week: 52 / 12,
    day: 365 / 12,
};

function readNumber(cell: any): number {
    if (!cell) return 0;
    const n = cell?.number?.content ?? cell?.number ?? cell?.content;
    const val = typeof n === "number" ? n : Number(n);
    return Number.isFinite(val) && val > 0 ? val : 0;
}

function readText(cell: any): string {
    if (!cell) return "";
    return String(cell?.text?.content ?? cell?.content ?? cell ?? "").trim();
}

function readCheckbox(cell: any): boolean {
    if (!cell) return false;
    return cell?.checkbox?.checked === true || cell?.checked === true || cell === true;
}

export function calculateMembershipSpending(
    rows: MembershipRowLike[],
    columns?: Record<string, string>,
): MembershipSummary {
    if (!columns || rows.length === 0) {
        return { monthlyTotal: 0, annualTotal: 0, activeCount: 0, autoRenewCount: 0, topItems: [] };
    }

    const nameKey = columns.name;
    const amountKey = columns.amount;
    const cycleKey = columns.cycle;
    const statusKey = columns.status;
    const autoRenewKey = columns.auto_renew;

    let monthlySum = 0;
    let activeCount = 0;
    let autoRenewCount = 0;
    const itemCosts: { name: string; monthlyCost: number }[] = [];

    for (const row of rows) {
        // 过滤非活跃项（已过期 m_expired、已退款 refunded）
        const status = statusKey ? (selectCellContent(row.cells[statusKey]) || "active") : "active";
        if (status === "m_expired" || status === "refunded") {
            continue;
        }

        activeCount++;
        if (autoRenewKey && readCheckbox(row.cells[autoRenewKey])) {
            autoRenewCount++;
        }

        const amount = amountKey ? readNumber(row.cells[amountKey]) : 0;
        const cycle = cycleKey ? (selectCellContent(row.cells[cycleKey]) || "month") : "month";
        const factor = CYCLE_TO_MONTHLY_FACTORS[cycle] ?? 1;
        const monthlyCost = amount * factor;

        monthlySum += monthlyCost;

        if (monthlyCost > 0) {
            const name = nameKey ? readText(row.cells[nameKey]) : "";
            itemCosts.push({ name: name || "—", monthlyCost });
        }
    }

    itemCosts.sort((a, b) => b.monthlyCost - a.monthlyCost);

    return {
        monthlyTotal: Math.round(monthlySum * 100) / 100,
        annualTotal: Math.round(monthlySum * 12 * 100) / 100,
        activeCount,
        autoRenewCount,
        topItems: itemCosts.slice(0, 3),
    };
}
