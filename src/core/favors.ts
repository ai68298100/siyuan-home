/**
 * 人情往来年度报告与收送统计（§16/283波）：
 * 统计指定年度或全量的收礼/送礼总额、净人情差额、TOP 往来亲友及事件类别分布，
 * 并支持格式化导出为结构化文本分享。
 */
import type { AvRow } from "@/core/siyuan";
import { formatAmount } from "@/core/format";

export interface FavorsPersonStat {
    person: string;
    inAmount: number;
    outAmount: number;
    net: number;
    count: number;
}

export interface FavorsCategoryStat {
    category: string;
    inAmount: number;
    outAmount: number;
    count: number;
}

export interface FavorsReport {
    year: number | "all";
    totalIn: number;
    totalOut: number;
    netAmount: number;
    countIn: number;
    countOut: number;
    topPersons: FavorsPersonStat[];
    categoryBreakdown: FavorsCategoryStat[];
    availableYears: number[];
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

/**
 * 汇总计算人情往来年度报告
 */
export function buildFavorsReport(
    rows: AvRow[],
    cols: Record<string, string>,
    targetYear: number | "all" = new Date().getFullYear(),
): FavorsReport {
    const yearSet = new Set<number>();
    let totalIn = 0;
    let totalOut = 0;
    let countIn = 0;
    let countOut = 0;

    const personMap = new Map<string, { inAmount: number; outAmount: number; count: number }>();
    const catMap = new Map<string, { inAmount: number; outAmount: number; count: number }>();

    for (const row of rows) {
        const dateStr = cellString(row, cols.date);
        let rowYear: number | undefined;
        if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            rowYear = Number(dateStr.slice(0, 4));
            if (Number.isFinite(rowYear)) yearSet.add(rowYear);
        }

        // 年份过滤
        if (targetYear !== "all" && rowYear !== targetYear) {
            continue;
        }

        const direction = cellString(row, cols.direction) || "out";
        const person = cellString(row, cols.person) || "未指定";
        const category = cellString(row, cols.category) || "other_fv";
        const amount = cellNumber(row, cols.amount) ?? 0;

        if (direction === "in") {
            totalIn += amount;
            countIn++;
        } else {
            totalOut += amount;
            countOut++;
        }

        // 亲友汇总
        let pStat = personMap.get(person);
        if (!pStat) {
            pStat = { inAmount: 0, outAmount: 0, count: 0 };
            personMap.set(person, pStat);
        }
        pStat.count++;
        if (direction === "in") pStat.inAmount += amount;
        else pStat.outAmount += amount;

        // 类别汇总
        let cStat = catMap.get(category);
        if (!cStat) {
            cStat = { inAmount: 0, outAmount: 0, count: 0 };
            catMap.set(category, cStat);
        }
        cStat.count++;
        if (direction === "in") cStat.inAmount += amount;
        else cStat.outAmount += amount;
    }

    const availableYears = Array.from(yearSet).sort((a, b) => b - a);
    if (availableYears.length === 0) {
        availableYears.push(new Date().getFullYear());
    }

    // TOP 往来亲友：按往来总额 (收 + 支) 降序排列
    const topPersons: FavorsPersonStat[] = Array.from(personMap.entries())
        .map(([person, stat]) => ({
            person,
            inAmount: stat.inAmount,
            outAmount: stat.outAmount,
            net: stat.inAmount - stat.outAmount,
            count: stat.count,
        }))
        .sort((a, b) => (b.inAmount + b.outAmount) - (a.inAmount + a.outAmount))
        .slice(0, 10);

    // 类别分布：按总笔数与金额排序
    const categoryBreakdown: FavorsCategoryStat[] = Array.from(catMap.entries())
        .map(([category, stat]) => ({
            category,
            inAmount: stat.inAmount,
            outAmount: stat.outAmount,
            count: stat.count,
        }))
        .sort((a, b) => (b.inAmount + b.outAmount) - (a.inAmount + a.outAmount));

    return {
        year: targetYear,
        totalIn,
        totalOut,
        netAmount: totalIn - totalOut,
        countIn,
        countOut,
        topPersons,
        categoryBreakdown,
        availableYears,
    };
}

/**
 * 格式化生成人情简报纯文本（方便一键复制分享）
 */
export function formatFavorsReportText(
    report: FavorsReport,
    categoryNameFn: (cat: string) => string = (c) => c,
): string {
    const yearLabel = report.year === "all" ? "全量累计" : `${report.year} 年度`;
    const netSign = report.netAmount >= 0 ? "+" : "-";
    const netDesc = report.netAmount >= 0 ? "净盈余" : "净支出";

    const lines: string[] = [
        `【${yearLabel}人情往来简报】`,
        `· 收礼总额：¥${formatAmount(report.totalIn)} (${report.countIn} 笔)`,
        `· 送礼总额：¥${formatAmount(report.totalOut)} (${report.countOut} 笔)`,
        `· 净人情差额：${netSign}¥${formatAmount(Math.abs(report.netAmount))} (${netDesc})`,
    ];

    if (report.topPersons.length > 0) {
        lines.push("---------------------------");
        lines.push("【往来亲友 TOP】");
        for (const p of report.topPersons) {
            const pNetSign = p.net >= 0 ? "+" : "-";
            lines.push(`· ${p.person}：收 ¥${formatAmount(p.inAmount)} / 送 ¥${formatAmount(p.outAmount)} (差额 ${pNetSign}¥${formatAmount(Math.abs(p.net))})`);
        }
    }

    if (report.categoryBreakdown.length > 0) {
        lines.push("---------------------------");
        lines.push("【按类别统计】");
        for (const c of report.categoryBreakdown) {
            const cname = categoryNameFn(c.category);
            lines.push(`· ${cname}：收 ¥${formatAmount(c.inAmount)} / 送 ¥${formatAmount(c.outAmount)} (${c.count} 笔)`);
        }
    }

    return lines.join("\n");
}
