/**
 * 家庭月度预算分类限额与超限告警（§16/§17 315波，调研缺口 G6）：
 * 依据台账月度开支与用户设定的分类限额（budgetLimits），按月核算各分类预算执行进度，
 * 智能识别逼近限额（≥80%）与已超支（≥100%）项，提供事前预算控制屏障。
 * 纯函数，无网络，100% 可单元测试。
 */

import { toMonthKey } from "./expense-trend";

export interface ExpenseRowInput {
    date: string;
    amount: number;
    category?: string;
}

export type BudgetStatus = "safe" | "warning" | "exceeded";

export interface CategoryBudgetUsage {
    category: string;
    spent: number;
    limit: number;
    /** 支出比例 (0 - 1+) */
    ratio: number;
    /** 剩余预算（若超支则为 0） */
    remaining: number;
    /** 超支金额（未超支则为 0） */
    overflow: number;
    status: BudgetStatus;
}

export interface BudgetEvaluationResult {
    month: string;
    totalSpent: number;
    totalLimit: number;
    overallRatio: number;
    overallRemaining: number;
    overallOverflow: number;
    overallStatus: BudgetStatus;
    categories: CategoryBudgetUsage[];
    warningCount: number;
    exceededCount: number;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * 评估指定月份的各分类预算执行情况
 */
export function evaluateBudgetUsage(
    entries: ExpenseRowInput[],
    limits: Record<string, number> = {},
    targetMonth?: string,
): BudgetEvaluationResult {
    const today = new Date();
    const month = targetMonth || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    // 1. 过滤并按分类累加指定月份的支出
    const spentByCat = new Map<string, number>();
    for (const e of entries ?? []) {
        if (!e) continue;
        const m = toMonthKey(e.date);
        if (m !== month) continue;
        const amt = Number(e.amount);
        if (!Number.isFinite(amt) || amt <= 0) continue;
        const cat = (e.category ?? "other").trim() || "other";
        spentByCat.set(cat, (spentByCat.get(cat) ?? 0) + amt);
    }

    // 2. 收集所有配置了限额或已有支出的分类
    const allCategories = new Set<string>([...Object.keys(limits), ...spentByCat.keys()]);
    const categories: CategoryBudgetUsage[] = [];

    let totalSpent = 0;
    let totalLimit = 0;
    let warningCount = 0;
    let exceededCount = 0;

    for (const cat of allCategories) {
        const limitVal = Number(limits[cat]);
        const hasLimit = Number.isFinite(limitVal) && limitVal > 0;
        const limit = hasLimit ? round2(limitVal) : 0;
        const spent = round2(spentByCat.get(cat) ?? 0);

        totalSpent += spent;
        totalLimit += limit;

        if (limit > 0) {
            const ratio = round2(spent / limit);
            const overflow = round2(Math.max(0, spent - limit));
            const remaining = round2(Math.max(0, limit - spent));
            let status: BudgetStatus = "safe";
            if (ratio >= 1.0) {
                status = "exceeded";
                exceededCount++;
            } else if (ratio >= 0.8) {
                status = "warning";
                warningCount++;
            }
            categories.push({
                category: cat,
                spent,
                limit,
                ratio,
                remaining,
                overflow,
                status,
            });
        } else if (spent > 0) {
            // 无限额但有支出项
            categories.push({
                category: cat,
                spent,
                limit: 0,
                ratio: 0,
                remaining: 0,
                overflow: 0,
                status: "safe",
            });
        }
    }

    // 排序：超支 > 预警 > 支出比例高 > 金额大
    categories.sort((a, b) => {
        const rank = (s: BudgetStatus) => (s === "exceeded" ? 2 : s === "warning" ? 1 : 0);
        return rank(b.status) - rank(a.status) || b.ratio - a.ratio || b.spent - a.spent;
    });

    totalSpent = round2(totalSpent);
    totalLimit = round2(totalLimit);
    const overallRatio = totalLimit > 0 ? round2(totalSpent / totalLimit) : 0;
    const overallRemaining = round2(Math.max(0, totalLimit - totalSpent));
    const overallOverflow = round2(Math.max(0, totalSpent - totalLimit));
    const overallStatus: BudgetStatus =
        overallRatio >= 1.0 ? "exceeded" : overallRatio >= 0.8 ? "warning" : "safe";

    return {
        month,
        totalSpent,
        totalLimit,
        overallRatio,
        overallRemaining,
        overallOverflow,
        overallStatus,
        categories,
        warningCount,
        exceededCount,
    };
}

/**
 * 快速检测当前月份是否有预算超限或逼近预警项
 */
export function detectBudgetOverflow(
    entries: ExpenseRowInput[],
    limits: Record<string, number>,
    targetMonth?: string,
): { hasIssues: boolean; exceeded: CategoryBudgetUsage[]; warnings: CategoryBudgetUsage[] } {
    const res = evaluateBudgetUsage(entries, limits, targetMonth);
    const exceeded = res.categories.filter((c) => c.status === "exceeded");
    const warnings = res.categories.filter((c) => c.status === "warning");
    return {
        hasIssues: exceeded.length > 0 || warnings.length > 0,
        exceeded,
        warnings,
    };
}

/**
 * 格式化输出预算执行简报文本
 */
export function formatBudgetLimitReport(
    res: BudgetEvaluationResult,
    labelOf: (cat: string) => string = (c) => c,
): string {
    const lines: string[] = [
        `💰 家庭月度预算执行简报（${res.month}）`,
        `总预算：${res.totalLimit} 元 · 已支出：${res.totalSpent} 元（执行率 ${Math.round(res.overallRatio * 100)}%）`,
    ];

    if (res.overallStatus === "exceeded") {
        lines.push(`🚨 整体已超支：超额 ${res.overallOverflow} 元`);
    } else {
        lines.push(`剩余总预算：${res.overallRemaining} 元`);
    }

    if (res.categories.length === 0) {
        lines.push("", "本月暂无支出记录或未设置分类预算限额。");
        return lines.join("\n");
    }

    lines.push("", "各分类执行明细：");
    for (const c of res.categories) {
        const catName = labelOf(c.category);
        if (c.limit > 0) {
            const badge = c.status === "exceeded" ? "🚨 超支" : c.status === "warning" ? "⚠️ 预警" : "🟢 正常";
            const overTxt = c.overflow > 0 ? `（超 ${c.overflow} 元）` : `（剩 ${c.remaining} 元）`;
            lines.push(`  • ${catName}：${c.spent} / ${c.limit} 元 · ${Math.round(c.ratio * 100)}% ${badge} ${overTxt}`);
        } else {
            lines.push(`  • ${catName}：已支出 ${c.spent} 元（未设限额）`);
        }
    }

    return lines.join("\n");
}
