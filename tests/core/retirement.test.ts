import { describe, it, expect } from "vitest";
import { calculateRetirement } from "@/core/retirement";

describe("retirement.calculateRetirement（法定与渐进式延迟退休测算）", () => {
    it("2025年之前已满退休年龄的成员：按原法定年龄退休，不参与延迟", () => {
        const res = calculateRetirement({
            birthday: "1960-05-15",
            sex: "male",
            today: "2026-10-19",
        });
        expect(res).not.toBeNull();
        expect(res?.originalRetireAge).toBe(60);
        expect(res?.delayedMonths).toBe(0);
        expect(res?.targetRetireAge).toBe(60);
        expect(res?.targetRetireDate).toBe("2020-05");
        expect(res?.isRetired).toBe(true);
        expect(res?.daysLeft).toBe(0);
        expect(res?.ruleType).toBe("traditional_pre2025");
        expect(res?.careerProgressPercent).toBe(100);
    });

    it("2025年首月到达原退休年龄的男职工：延迟 1 个月", () => {
        // 1965年1月出生男职工，原退休年月 2025-01，属于第 1 个月，延迟 1 个月 -> 2025-02
        const res = calculateRetirement({
            birthday: "1965-01-10",
            sex: "male",
            today: "2024-01-01",
        });
        expect(res).not.toBeNull();
        expect(res?.originalRetireAge).toBe(60);
        expect(res?.delayedMonths).toBe(1);
        expect(res?.targetRetireDate).toBe("2025-02");
        expect(res?.ruleType).toBe("statutory_2025");
    });

    it("改革完全过渡后的年轻人（如1990年出生男职工）：封顶延迟 36 个月（63周岁退休）", () => {
        const res = calculateRetirement({
            birthday: "1990-06-15",
            sex: "male",
            today: "2026-10-19",
        });
        expect(res).not.toBeNull();
        expect(res?.originalRetireAge).toBe(60);
        expect(res?.delayedMonths).toBe(36); // 上限 3 年
        expect(res?.targetRetireAge).toBe(63);
        expect(res?.targetRetireDate).toBe("2053-06");
        expect(res?.isRetired).toBe(false);
        expect(res?.daysLeft).toBeGreaterThan(0);
        expect(res?.careerProgressPercent).toBeGreaterThan(0);
        expect(res?.careerProgressPercent).toBeLessThan(100);
    });

    it("原55岁女职工测算（封顶延迟 36 个月至 58 岁）", () => {
        const res = calculateRetirement({
            birthday: "1995-03-20",
            sex: "female",
            femaleCategory: "55",
            today: "2026-10-19",
        });
        expect(res).not.toBeNull();
        expect(res?.originalRetireAge).toBe(55);
        expect(res?.delayedMonths).toBe(36);
        expect(res?.targetRetireAge).toBe(58);
        expect(res?.targetRetireDate).toBe("2053-03");
    });

    it("原50岁女职工测算（每2个月延1个月，封顶延迟 60 个月至 55 岁）", () => {
        const res = calculateRetirement({
            birthday: "1995-03-20",
            sex: "female",
            femaleCategory: "50",
            today: "2026-10-19",
        });
        expect(res).not.toBeNull();
        expect(res?.originalRetireAge).toBe(50);
        expect(res?.delayedMonths).toBe(60);
        expect(res?.targetRetireAge).toBe(55);
        expect(res?.targetRetireDate).toBe("2050-03");
    });

    it("支持用户自定义目标退休年龄覆盖", () => {
        const res = calculateRetirement({
            birthday: "1990-01-01",
            sex: "male",
            customRetireAge: 65,
            today: "2026-10-19",
        });
        expect(res).not.toBeNull();
        expect(res?.originalRetireAge).toBe(65);
        expect(res?.targetRetireAge).toBe(65);
        expect(res?.targetRetireDate).toBe("2055-01");
        expect(res?.delayedMonths).toBe(0);
        expect(res?.ruleType).toBe("custom");
    });

    it("非法生日输入返回 null", () => {
        expect(calculateRetirement({ birthday: "invalid" })).toBeNull();
        expect(calculateRetirement({ birthday: "" })).toBeNull();
    });
});
