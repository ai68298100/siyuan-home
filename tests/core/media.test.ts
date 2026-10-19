import { describe, it, expect } from "vitest";
import { calculateMediaReport, formatMediaReportText } from "@/core/media";
import type { AvRow } from "@/core/siyuan";

describe("media.calculateMediaReport（书影音年度/全量消费统计）", () => {
    const cols = {
        name: "m-name",
        category: "m-cat",
        status: "m-stat",
        rating: "m-rate",
        date: "m-date",
        progress: "m-prog",
    };

    const makeRow = (
        id: string,
        name: string,
        category: string,
        status: "wishlist" | "consuming" | "done" | "dropped",
        opts?: { rating?: number; date?: string; progress?: string },
    ): AvRow => ({
        itemID: id,
        cells: {
            "m-name": { type: "text", text: { content: name } },
            "m-cat": { type: "select", select: { content: category } },
            "m-stat": { type: "select", select: { content: status } },
            "m-rate": opts?.rating ? { type: "number", number: { content: opts.rating } } : {},
            "m-date": opts?.date ? { type: "date", date: { content: opts.date } } : {},
            "m-prog": opts?.progress ? { type: "text", text: { content: opts.progress } } : {},
        },
    });

    const rows: AvRow[] = [
        makeRow("1", "星际穿越", "movie", "done", { rating: 5, date: "2026-03-15" }),
        makeRow("2", "三体", "book", "done", { rating: 4.8, date: "2026-05-20" }),
        makeRow("3", "进击的巨人", "comic", "done", { rating: 4.5, date: "2026-07-01" }),
        makeRow("4", "百年孤独", "book", "consuming", { progress: "第5章", date: "2026-10-01" }),
        makeRow("5", "烂尾剧集", "tv", "dropped", { rating: 2, date: "2026-08-10" }),
        makeRow("6", "奥本海默", "movie", "done", { rating: 4.5, date: "2025-11-20" }), // 2025年
    ];

    it("正确过滤指定年份并统计完结数、均分与完结率", () => {
        const report = calculateMediaReport(rows, cols, 2026);
        expect(report.year).toBe(2026);
        expect(report.totalCount).toBe(5);
        expect(report.doneCount).toBe(3);
        expect(report.consumingCount).toBe(1);
        expect(report.droppedCount).toBe(1);
        expect(report.wishlistCount).toBe(0);
        expect(report.completionRate).toBe(60); // 3 / (3 + 1 + 1) = 60%
        expect(report.ratedCount).toBe(4);
        // 均分: (5 + 4.8 + 4.5 + 2) / 4 = 16.3 / 4 = 4.1
        expect(report.averageRating).toBe(4.1);
        expect(report.availableYears).toEqual([2026, 2025]);
    });

    it("支持全量累计统计", () => {
        const report = calculateMediaReport(rows, cols, "all");
        expect(report.totalCount).toBe(6);
        expect(report.doneCount).toBe(4);
    });

    it("提取高分作品 TOP 榜单", () => {
        const report = calculateMediaReport(rows, cols, 2026);
        expect(report.topRatedItems).toHaveLength(3);
        expect(report.topRatedItems[0].name).toBe("星际穿越");
        expect(report.topRatedItems[1].name).toBe("三体");
        expect(report.topRatedItems[2].name).toBe("进击的巨人");
    });

    it("formatMediaReportText 生成结构化文本", () => {
        const report = calculateMediaReport(rows, cols, 2026);
        const text = formatMediaReportText(report, (cat) => cat === "movie" ? "电影" : cat);
        expect(text).toContain("【2026 年度书影音阅览简报】");
        expect(text).toContain("· 阅毕/看完：3 部");
        expect(text).toContain("· 正处于在看/在读：1 部");
        expect(text).toContain("· 完结率：60%");
        expect(text).toContain("星际穿越");
    });
});
