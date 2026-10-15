import { describe, expect, it } from "vitest";
import { calculateFavorsSummary, formatFavorsReportText, type FavorRow } from "../../src/core/favors";

describe("calculateFavorsSummary (MOD-08 人情往来年度统计)", () => {
    const rows: FavorRow[] = [
        { name: "张伟婚礼随礼", direction: "out", amount: 1000, person: "张伟", date: "2026-03-15", category: "wedding" },
        { name: "大姑妈生病慰问", direction: "out", amount: 500, person: "大姑妈", date: "2026-05-20", category: "other_fv" },
        { name: "小宝满月礼金", direction: "in", amount: 2000, person: "外婆", date: "2026-06-01", category: "full_moon" },
        { name: "小宝满月礼金", direction: "in", amount: 1000, person: "张伟", date: "2026-06-01", category: "full_moon" },
        { name: "去年老账", direction: "out", amount: 800, person: "老李", date: "2025-12-10", category: "wedding" },
    ];

    it("只统计目标年份（2026）的收送记录", () => {
        const summary = calculateFavorsSummary(rows, 2026);
        expect(summary.year).toBe(2026);
        expect(summary.totalIn).toBe(3000);
        expect(summary.totalOut).toBe(1500);
        expect(summary.netAmount).toBe(1500); // 3000 - 1500
        expect(summary.countIn).toBe(2);
        expect(summary.countOut).toBe(2);
        expect(summary.totalCount).toBe(4);
    });

    it("正确排序收礼与送礼 TOP 对象", () => {
        const summary = calculateFavorsSummary(rows, 2026);
        expect(summary.topIn).toHaveLength(2);
        expect(summary.topIn[0].person).toBe("外婆");
        expect(summary.topIn[0].totalIn).toBe(2000);

        expect(summary.topOut).toHaveLength(2);
        expect(summary.topOut[0].person).toBe("张伟");
        expect(summary.topOut[0].totalOut).toBe(1000);
    });

    it("空记录返回零值", () => {
        const summary = calculateFavorsSummary([], 2026);
        expect(summary.totalIn).toBe(0);
        expect(summary.totalOut).toBe(0);
        expect(summary.netAmount).toBe(0);
        expect(summary.totalCount).toBe(0);
        expect(summary.topIn).toHaveLength(0);
        expect(summary.topOut).toHaveLength(0);
    });
});

describe("formatFavorsReportText", () => {
    it("正确生成年度人情文本报告", () => {
        const summary = calculateFavorsSummary([
            { name: "婚礼", direction: "out", amount: 1000, person: "好友甲", date: "2026-02-01" },
            { name: "压岁", direction: "in", amount: 2000, person: "爷爷", date: "2026-02-10" },
        ], 2026);

        const txt = formatFavorsReportText(summary, (n) => String(n));
        expect(txt).toContain("【2026 年度人情往来报告】");
        expect(txt).toContain("收礼总额：¥ 2000");
        expect(txt).toContain("送礼总额：¥ 1000");
        expect(txt).toContain("人情净额：¥ 1000");
        expect(txt).toContain("1. 爷爷：¥ 2000");
        expect(txt).toContain("1. 好友甲：¥ 1000");
    });
});
