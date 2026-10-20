import { describe, it, expect } from "vitest";
import {
    calculateFamilyLifeIndex,
    formatLifeIndexReportText,
    type FamilyLifeContext,
} from "@/core/life-index";

describe("core/life-index 家庭生活指数与年度全景盘点（300波里程碑）", () => {
    describe("calculateFamilyLifeIndex 综合加权评分与分级", () => {
        it("典范高质生活评定为卓越（excellent）", () => {
            const ctx: FamilyLifeContext = {
                memberCount: 4,
                totalReminders: 10,
                overdueReminders: 0, // 零逾期
                medicineCount: 8,
                expiredMedicineCount: 0, // 零过期
                vaccineCompletionRate: 95,
                contractsActiveCount: 3,
                totalDepositAmount: 15000,
                mediaCompletedCount: 12,
                mediaTotalCount: 15,
                hasEmergencyKit: true,
            };

            const report = calculateFamilyLifeIndex(ctx);
            expect(report.overallScore).toBeGreaterThanOrEqual(90);
            expect(report.level).toBe("excellent");
            expect(report.levelLabel).toBe("幸福卓越");
            expect(report.topHighlights.length).toBeGreaterThan(0);
        });

        it("存在过期药品和较多逾期时扣分并给出建议", () => {
            const ctx: FamilyLifeContext = {
                memberCount: 2,
                totalReminders: 8,
                overdueReminders: 5, // 超过一半逾期
                medicineCount: 5,
                expiredMedicineCount: 2, // 有过期药品
                contractsActiveCount: 0,
                totalDepositAmount: 0,
                mediaCompletedCount: 0,
                mediaTotalCount: 3,
                hasEmergencyKit: false,
            };

            const report = calculateFamilyLifeIndex(ctx);
            expect(report.overallScore).toBeLessThan(80);
            expect(report.dimensions.health_safety.score).toBeLessThan(80);
            expect(report.dimensions.daily_efficiency.score).toBeLessThan(70);
            expect(report.topSuggestions.some((s) => s.includes("过期"))).toBe(true);
            expect(report.topSuggestions.some((s) => s.includes("逾期"))).toBe(true);
        });

        it("空数据基础场景稳健运行", () => {
            const ctx: FamilyLifeContext = {
                memberCount: 1,
                totalReminders: 0,
                overdueReminders: 0,
                medicineCount: 0,
                expiredMedicineCount: 0,
                contractsActiveCount: 0,
                totalDepositAmount: 0,
                mediaCompletedCount: 0,
                mediaTotalCount: 0,
            };

            const report = calculateFamilyLifeIndex(ctx);
            expect(report.overallScore).toBeGreaterThanOrEqual(60);
            expect(report.topSuggestions.length).toBeGreaterThan(0);
        });
    });

    describe("formatLifeIndexReportText 格式化简报文本", () => {
        it("包含四大维度得分与亮点建议", () => {
            const ctx: FamilyLifeContext = {
                memberCount: 3,
                totalReminders: 5,
                overdueReminders: 0,
                medicineCount: 6,
                expiredMedicineCount: 0,
                contractsActiveCount: 2,
                totalDepositAmount: 8000,
                mediaCompletedCount: 5,
                mediaTotalCount: 6,
                hasEmergencyKit: true,
            };

            const report = calculateFamilyLifeIndex(ctx);
            const text = formatLifeIndexReportText(report);

            expect(text).toContain("【生活指数盘点】");
            expect(text).toContain("健康:");
            expect(text).toContain("合约:");
            expect(text).toContain("日常:");
            expect(text).toContain("文化:");
            expect(text).toContain("亮点:");
        });
    });
});
