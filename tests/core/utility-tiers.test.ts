import { describe, it, expect } from "vitest";
import {
    calculateTieredCost,
    analyzeMeterReadingsUtility,
    formatUtilityReportText,
    DEFAULT_ELECTRICITY_TIERS,
    type MeterEntry,
} from "@/core/utility-tiers";

describe("core/utility-tiers 家庭公用事业阶梯用量与能耗测算（299波）", () => {
    describe("calculateTieredCost 阶梯累进计费核心纯函数", () => {
        it("用量在第 1 阶梯内（0-260 度）", () => {
            // 200 度，单价 0.612 -> 122.4 元
            const res = calculateTieredCost(200, [...DEFAULT_ELECTRICITY_TIERS], "度");
            expect(res.totalUsage).toBe(200);
            expect(res.currentTier).toBe(1);
            expect(res.isHighTier).toBe(false);
            expect(res.totalCost).toBe(122.4);
            expect(res.nextTierRemaining).toBe(60); // 260 - 200 = 60
            expect(res.breakdowns[0].usageInTier).toBe(200);
            expect(res.breakdowns[1].usageInTier).toBe(0);
        });

        it("用量跨入第 2 阶梯（261-400 度）", () => {
            // 300 度：前 260 度以 0.612 计算 (=159.12)，超出的 40 度以 0.662 计算 (=26.48) -> 185.6 元
            const res = calculateTieredCost(300, [...DEFAULT_ELECTRICITY_TIERS], "度");
            expect(res.totalUsage).toBe(300);
            expect(res.currentTier).toBe(2);
            expect(res.isHighTier).toBe(true);
            expect(res.totalCost).toBe(185.6);
            expect(res.nextTierRemaining).toBe(100); // 400 - 300 = 100
            expect(res.breakdowns[0].usageInTier).toBe(260);
            expect(res.breakdowns[1].usageInTier).toBe(40);
        });

        it("用量跨入第 3 阶梯高能耗累进档（>400 度）", () => {
            // 500 度：前 260 度 (=159.12)，261-400度共 140 度以 0.662 (=92.68)，超出的 100 度以 0.912 (=91.2) -> 343 元
            const res = calculateTieredCost(500, [...DEFAULT_ELECTRICITY_TIERS], "度");
            expect(res.totalUsage).toBe(500);
            expect(res.currentTier).toBe(3);
            expect(res.isHighTier).toBe(true);
            expect(res.totalCost).toBe(343);
            expect(res.nextTierRemaining).toBe(0); // 最高档无下一阶梯
            expect(res.breakdowns[0].usageInTier).toBe(260);
            expect(res.breakdowns[1].usageInTier).toBe(140);
            expect(res.breakdowns[2].usageInTier).toBe(100);
        });

        it("边界零用量与异常输入处理", () => {
            const res = calculateTieredCost(0, [...DEFAULT_ELECTRICITY_TIERS]);
            expect(res.totalUsage).toBe(0);
            expect(res.totalCost).toBe(0);
            expect(res.currentTier).toBe(1);
        });
    });

    describe("analyzeMeterReadingsUtility 抄表流水分析与历史账单推算", () => {
        const readings: MeterEntry[] = [
            { date: "2026-07-01", reading: 1000, at: "2026-07-01T08:00:00Z" },
            { date: "2026-08-01", reading: 1250, usage: 250, at: "2026-08-01T08:00:00Z" }, // 250度 (第1档)
            { date: "2026-09-01", reading: 1600, usage: 350, at: "2026-09-01T08:00:00Z" }, // 350度 (第2档)
        ];

        it("计算累计与最新用量及阶梯预警", () => {
            const report = analyzeMeterReadingsUtility(readings, "electricity");

            expect(report.totalRecordedReadings).toBe(3);
            expect(report.totalUsageSum).toBe(600); // 250 + 350
            expect(report.latestPeriodUsage).toBe(350);
            expect(report.averageUsage).toBe(200); // 600 / 3
            expect(report.latestCalculation.currentTier).toBe(2);
            expect(report.latestCalculation.isHighTier).toBe(true);
            expect(report.history.length).toBe(3);
        });

        it("格式化简报文本包含各项统计与明细", () => {
            const report = analyzeMeterReadingsUtility(readings, "electricity");
            const text = formatUtilityReportText(report);

            expect(text).toContain("【电费阶梯测算】");
            expect(text).toContain("最新:350度");
            expect(text).toContain("第2档");
            expect(text).toContain("第1档");
            expect(text).toContain("第2档");
        });
    });
});
