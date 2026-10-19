/**
 * 影音书库年度消费报告与状态统计（§16/§17 293波）：
 * 统计指定年度或全量的书影音消费数量、完结率、在看/在读项目、平均评分、
 * 六大分类分布（电影/剧集/综艺/书籍/动漫/小说）与高分代表作榜单。
 */
import type { AvRow } from "@/core/siyuan";

export type MediaCategory = "movie" | "tv" | "variety" | "book" | "comic" | "novel";
export type MediaStatus = "wishlist" | "consuming" | "done" | "dropped";

export interface MediaItemStat {
    id: string;
    name: string;
    category: string;
    status: MediaStatus;
    rating?: number;
    date?: string;
    progress?: string;
    note?: string;
}

export interface MediaCategoryBreakdown {
    category: string;
    total: number;
    done: number;
    consuming: number;
    averageRating?: number;
}

export interface MediaReport {
    year: number | "all";
    totalCount: number;
    doneCount: number;
    consumingCount: number;
    wishlistCount: number;
    droppedCount: number;
    completionRate: number; // 0-100%
    averageRating?: number;
    ratedCount: number;
    categoryBreakdown: MediaCategoryBreakdown[];
    topRatedItems: MediaItemStat[];
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
 * 计算书影音年度/全量消费报告
 */
export function calculateMediaReport(
    rows: AvRow[],
    cols: Record<string, string>,
    targetYear: number | "all" = new Date().getFullYear(),
): MediaReport {
    const yearSet = new Set<number>();
    const items: MediaItemStat[] = [];

    const catMap = new Map<string, { total: number; done: number; consuming: number; sumRating: number; ratedCount: number }>();

    let doneCount = 0;
    let consumingCount = 0;
    let wishlistCount = 0;
    let droppedCount = 0;
    let sumRating = 0;
    let ratedCount = 0;

    for (const row of rows) {
        const dateStr = cellString(row, cols.date);
        let rowYear: number | undefined;
        if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            rowYear = Number(dateStr.slice(0, 4));
            if (Number.isFinite(rowYear)) yearSet.add(rowYear);
        }

        // 年度筛选（若选定特定年份，则只统计该年份有记录或该年份完结的项目；对于在看/想看项无日期的，仅在全量时纳入或当年纳入）
        if (targetYear !== "all") {
            if (rowYear !== targetYear) {
                continue;
            }
        }

        const name = cellString(row, cols.name) || "未命名作品";
        const category = cellString(row, cols.category) || "movie";
        const status = (cellString(row, cols.status) as MediaStatus) || "wishlist";
        const rating = cellNumber(row, cols.rating);
        const progress = cellString(row, cols.progress);
        const note = cellString(row, cols.note);

        switch (status) {
            case "done":
                doneCount++;
                break;
            case "consuming":
                consumingCount++;
                break;
            case "wishlist":
                wishlistCount++;
                break;
            case "dropped":
                droppedCount++;
                break;
        }

        if (typeof rating === "number" && rating > 0) {
            ratedCount++;
            sumRating += rating;
        }

        // 类别统计
        let cStat = catMap.get(category);
        if (!cStat) {
            cStat = { total: 0, done: 0, consuming: 0, sumRating: 0, ratedCount: 0 };
            catMap.set(category, cStat);
        }
        cStat.total++;
        if (status === "done") cStat.done++;
        if (status === "consuming") cStat.consuming++;
        if (typeof rating === "number" && rating > 0) {
            cStat.ratedCount++;
            cStat.sumRating += rating;
        }

        items.push({
            id: row.itemID,
            name,
            category,
            status,
            rating,
            date: dateStr,
            progress,
            note,
        });
    }

    const availableYears = Array.from(yearSet).sort((a, b) => b - a);
    if (availableYears.length === 0) {
        availableYears.push(new Date().getFullYear());
    }

    const totalCount = items.length;
    const baseForRate = doneCount + droppedCount + consumingCount;
    const completionRate = baseForRate > 0 ? Math.round((doneCount / baseForRate) * 100) : 0;
    const averageRating = ratedCount > 0 ? Math.round((sumRating / ratedCount) * 10) / 10 : undefined;

    const categoryBreakdown: MediaCategoryBreakdown[] = Array.from(catMap.entries())
        .map(([category, stat]) => ({
            category,
            total: stat.total,
            done: stat.done,
            consuming: stat.consuming,
            averageRating: stat.ratedCount > 0 ? Math.round((stat.sumRating / stat.ratedCount) * 10) / 10 : undefined,
        }))
        .sort((a, b) => b.done - a.done);

    // 高分代表作（按评分降序排列）
    const topRatedItems = items
        .filter((it) => typeof it.rating === "number" && it.rating >= 4)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 8);

    return {
        year: targetYear,
        totalCount,
        doneCount,
        consumingCount,
        wishlistCount,
        droppedCount,
        completionRate,
        averageRating,
        ratedCount,
        categoryBreakdown,
        topRatedItems,
        availableYears,
    };
}

/**
 * 格式化书影音简报文本用于复制分享
 */
export function formatMediaReportText(
    report: MediaReport,
    categoryLabelFn: (cat: string) => string = (c) => c,
): string {
    const yearLabel = report.year === "all" ? "全量累计" : `${report.year} 年度`;
    const ratingStr = report.averageRating !== undefined ? ` (均分 ${report.averageRating}★)` : "";

    const lines: string[] = [
        `【${yearLabel}书影音阅览简报】`,
        `· 阅毕/看完：${report.doneCount} 部${ratingStr}`,
        `· 正处于在看/在读：${report.consumingCount} 部`,
        `· 待消费愿望单：${report.wishlistCount} 部`,
        `· 完结率：${report.completionRate}%`,
    ];

    if (report.categoryBreakdown.length > 0) {
        lines.push("---------------------------");
        lines.push("【分类明细】");
        for (const c of report.categoryBreakdown) {
            const label = categoryLabelFn(c.category);
            const rStr = c.averageRating !== undefined ? ` · 均分 ${c.averageRating}★` : "";
            lines.push(`· ${label}：已完结 ${c.done} / 总计 ${c.total}${rStr}`);
        }
    }

    if (report.topRatedItems.length > 0) {
        lines.push("---------------------------");
        lines.push("【高分作品推荐 TOP】");
        for (const it of report.topRatedItems) {
            lines.push(`· ${it.name} (${categoryLabelFn(it.category)})：${it.rating}★${it.date ? ` · ${it.date}` : ""}`);
        }
    }

    return lines.join("\n");
}
