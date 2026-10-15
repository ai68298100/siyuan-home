import { describe, expect, it } from "vitest";
import { calculatePetCareSummary, type PetRowData } from "../../src/core/pets";

describe("calculatePetCareSummary (MOD-15 宠物疫苗与驱虫健康周期管理)", () => {
    const today = "2026-10-15";

    const rows: PetRowData[] = [
        {
            name: "咪咪",
            species: "cat",
            breed: "英短蓝猫",
            vaccine_due: "2026-10-25", // 10 天后，soon (30天内)
            deworm_due: "2026-10-20", // 5 天后，soon (14天内)
        },
        {
            name: "旺财",
            species: "dog",
            breed: "金毛",
            vaccine_due: "2026-09-01", // 已逾期
            deworm_due: "2026-12-01", // 正常
        },
        {
            name: "小黑",
            species: "cat",
            breed: "中华田园猫",
            vaccine_due: "2027-03-01", // 正常
            deworm_due: "2026-11-15", // 正常
        },
    ];

    it("正确计算即将到期与逾期指标", () => {
        const summary = calculatePetCareSummary(rows, today);
        expect(summary.totalPets).toBe(3);
        // 咪咪的疫苗在 30 天内 (10月25日)
        expect(summary.upcomingVaccineCount).toBe(1);
        // 咪咪的驱虫在 14 天内 (10月20日)
        expect(summary.upcomingDewormCount).toBe(1);
        // 旺财的疫苗逾期
        expect(summary.overdueCount).toBe(1);
        // 小黑全部正常
        expect(summary.healthyCount).toBe(1);
    });

    it("正确标记需要留意的爱宠项目", () => {
        const summary = calculatePetCareSummary(rows, today);
        expect(summary.pets[0].name).toBe("咪咪");
        expect(summary.pets[0].needsCare).toBe(true);
        expect(summary.pets[0].vaccineStatus).toBe("soon");
        expect(summary.pets[0].dewormStatus).toBe("soon");

        expect(summary.pets[1].name).toBe("旺财");
        expect(summary.pets[1].needsCare).toBe(true);
        expect(summary.pets[1].vaccineStatus).toBe("overdue");

        expect(summary.pets[2].name).toBe("小黑");
        expect(summary.pets[2].needsCare).toBe(false);
        expect(summary.pets[2].vaccineStatus).toBe("ok");
    });

    it("空记录返回全零默认值", () => {
        const summary = calculatePetCareSummary([], today);
        expect(summary.totalPets).toBe(0);
        expect(summary.overdueCount).toBe(0);
        expect(summary.upcomingVaccineCount).toBe(0);
        expect(summary.pets).toHaveLength(0);
    });
});
