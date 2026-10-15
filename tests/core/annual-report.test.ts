import { describe, expect, it } from "vitest";
import { generateAnnualReport, formatAnnualReportText, type AnnualReportOptions } from "../../src/core/annual-report";

describe("generateAnnualReport (MOD-20 家庭年度生活报告生成器)", () => {
    it("综合汇总履约、人情、文化与资产家底", () => {
        const options: AnnualReportOptions = {
            year: 2026,
            membersCount: 4,
            monthlyCompletions: {
                "2026-01": 10,
                "2026-02": 15,
                "2026-03": 8,
                "2025-12": 5, // 上一年不应计入
            },
            favorsSummary: {
                totalIn: 5000,
                totalOut: 3000,
                netAmount: 2000,
                countIn: 3,
                countOut: 2,
            },
            mediaSummary: {
                doneThisYearCount: 18,
                consumingCount: 3,
                averageRating: 4.6,
            },
            assetValuation: {
                totalValuation: 86000,
                activeItemCount: 12,
            },
        };

        const report = generateAnnualReport(options);

        expect(report.year).toBe(2026);
        expect(report.membersCount).toBe(4);
        expect(report.totalRemindersCompleted).toBe(33); // 10 + 15 + 8
        expect(report.favors.netAmount).toBe(2000);
        expect(report.media.doneCount).toBe(18);
        expect(report.media.averageRating).toBe(4.6);
        expect(report.assets.totalValuation).toBe(86000);
        expect(report.assets.itemCount).toBe(12);
    });

    it("空数据安全回退到零值默认结构", () => {
        const report = generateAnnualReport({});
        expect(report.totalRemindersCompleted).toBe(0);
        expect(report.favors.totalIn).toBe(0);
        expect(report.media.doneCount).toBe(0);
        expect(report.assets.totalValuation).toBe(0);
    });
});

describe("formatAnnualReportText", () => {
    it("正确生成温情生活年报排版文本", () => {
        const report = generateAnnualReport({
            year: 2026,
            membersCount: 3,
            monthlyCompletions: { "2026-05": 20 },
            favorsSummary: { totalIn: 2000, totalOut: 1000, netAmount: 1000, countIn: 2, countOut: 1 },
            mediaSummary: { doneThisYearCount: 12, consumingCount: 2, averageRating: 4.5 },
            assetValuation: { totalValuation: 50000, activeItemCount: 8 },
        });

        const txt = formatAnnualReportText(report, (n) => String(n));
        expect(txt).toContain("【小驴管家 · 2026 年度家庭生活总结】");
        expect(txt).toContain("共 3 位家庭成员");
        expect(txt).toContain("高效完成 20 件");
        expect(txt).toContain("人情往来：收礼 ¥ 2000");
        expect(txt).toContain("观影与阅读 12 部/本");
        expect(txt).toContain("均分 ★ 4.5");
        expect(txt).toContain("资产家底：保有在用实物与虚拟资产 8 件");
    });
});
