import { describe, expect, it } from "vitest";
import { calculateMediaSummary, type MediaRowData } from "../../src/core/media";

describe("calculateMediaSummary (MOD-14 影音书库在看/收藏/已看年度统计)", () => {
    const rows: MediaRowData[] = [
        { name: "肖申克的救赎", category: "movie", status: "done", rating: 5, date: "2026-02-10" },
        { name: "奥本海默", category: "movie", status: "done", rating: 4.8, date: "2026-05-01" },
        { name: "老电影", category: "movie", status: "done", rating: 4.0, date: "2025-08-15" },
        { name: "三体第一季", category: "tv", status: "consuming", progress: "第 8 集", rating: 4.5 },
        { name: "百年孤独", category: "book", status: "consuming", progress: "第 120 页" },
        { name: "沙丘2", category: "movie", status: "wishlist" },
        { name: "烂片", category: "movie", status: "dropped", rating: 2.0 },
    ];

    it("正确汇总状态分布与年度完成数", () => {
        const summary = calculateMediaSummary(rows, 2026);
        expect(summary.totalCount).toBe(7);
        expect(summary.wishlistCount).toBe(1);
        expect(summary.consumingCount).toBe(2);
        expect(summary.doneCount).toBe(3);
        // 2026 年完成的两部
        expect(summary.doneThisYearCount).toBe(2);
        expect(summary.droppedCount).toBe(1);
    });

    it("正确计算评分与提取最高分榜单", () => {
        const summary = calculateMediaSummary(rows, 2026);
        expect(summary.ratedCount).toBe(5);
        expect(summary.averageRating).toBeGreaterThan(4.0);
        expect(summary.topRated[0].name).toBe("肖申克的救赎");
        expect(summary.topRated[0].rating).toBe(5);
        expect(summary.topRated[1].name).toBe("奥本海默");
    });

    it("正确提取在看/在读进行中列表", () => {
        const summary = calculateMediaSummary(rows, 2026);
        expect(summary.consumingList).toHaveLength(2);
        expect(summary.consumingList[0].name).toBe("三体第一季");
        expect(summary.consumingList[0].progress).toBe("第 8 集");
        expect(summary.consumingList[1].name).toBe("百年孤独");
        expect(summary.consumingList[1].progress).toBe("第 120 页");
    });

    it("空记录返回全零默认值", () => {
        const summary = calculateMediaSummary([], 2026);
        expect(summary.totalCount).toBe(0);
        expect(summary.doneCount).toBe(0);
        expect(summary.consumingCount).toBe(0);
        expect(summary.averageRating).toBe(0);
        expect(summary.topRated).toHaveLength(0);
        expect(summary.consumingList).toHaveLength(0);
    });
});
