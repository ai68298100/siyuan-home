/**
 * 影音书库在看/想看/已读状态与年度统计（MOD-14 / §10 影音三视图与年度统计）：
 * 纯函数、本地计算、零网络：
 * - 汇总想看/想读（wishlist）、在看/在读（consuming）、已看/已读（done）状态分布；
 * - 计算当年度完成总数（本年观影/阅读量）与平均评分；
 * - 提取正在追剧/在读的实时进度列表（consumingList）；
 * - 提取高分力荐榜单（topRated，评分 ≥ 4.5 或最高分作品）。
 */

export interface MediaRowData {
    id?: string;
    name?: string;
    category?: "movie" | "tv" | "variety" | "book" | "comic" | "novel" | string;
    status?: "wishlist" | "consuming" | "done" | "dropped" | string;
    rating?: number;
    progress?: string;
    next_update?: string;
    date?: string;
}

export interface ConsumingMediaItem {
    id?: string;
    name: string;
    category: string;
    progress: string;
}

export interface TopRatedMediaItem {
    id?: string;
    name: string;
    category: string;
    rating: number;
    progress?: string;
}

export interface MediaSummary {
    year: number;
    totalCount: number;
    wishlistCount: number;
    consumingCount: number;
    doneCount: number;
    doneThisYearCount: number;
    droppedCount: number;
    averageRating: number;
    ratedCount: number;
    consumingList: ConsumingMediaItem[];
    topRated: TopRatedMediaItem[];
}

/**
 * 计算影音书库状态与年度进度统计
 */
export function calculateMediaSummary(
    rows: MediaRowData[],
    currentYear?: number,
): MediaSummary {
    const year = currentYear ?? new Date().getFullYear();
    const yearPrefix = `${year}-`;

    let wishlistCount = 0;
    let consumingCount = 0;
    let doneCount = 0;
    let doneThisYearCount = 0;
    let droppedCount = 0;
    let totalRatingSum = 0;
    let ratedCount = 0;

    const consumingList: ConsumingMediaItem[] = [];
    const ratedItems: TopRatedMediaItem[] = [];

    for (const r of rows) {
        const name = (r.name ?? "").trim();
        if (!name || name === "—") continue;

        const st = (r.status ?? "wishlist").toLowerCase().trim();
        const cat = (r.category ?? "").trim() || "movie";
        const progress = (r.progress ?? "").trim();

        if (st === "wishlist") {
            wishlistCount++;
        } else if (st === "consuming") {
            consumingCount++;
            consumingList.push({
                id: r.id,
                name,
                category: cat,
                progress: progress && progress !== "—" ? progress : "进行中",
            });
        } else if (st === "done") {
            doneCount++;
            if (r.date && r.date.startsWith(yearPrefix)) {
                doneThisYearCount++;
            }
        } else if (st === "dropped") {
            droppedCount++;
        }

        // 评分统计
        if (typeof r.rating === "number" && Number.isFinite(r.rating) && r.rating > 0) {
            totalRatingSum += r.rating;
            ratedCount++;
            ratedItems.push({
                id: r.id,
                name,
                category: cat,
                rating: r.rating,
                progress,
            });
        }
    }

    const averageRating = ratedCount > 0 ? Math.round((totalRatingSum / ratedCount) * 10) / 10 : 0;
    const topRated = ratedItems.sort((a, b) => b.rating - a.rating).slice(0, 5);

    return {
        year,
        totalCount: rows.length,
        wishlistCount,
        consumingCount,
        doneCount,
        doneThisYearCount,
        droppedCount,
        averageRating,
        ratedCount,
        consumingList: consumingList.slice(0, 4),
        topRated,
    };
}
