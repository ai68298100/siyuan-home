import { describe, it, expect } from "vitest";
import { calculateRetirement } from "@/core/retirement";

describe("calculateRetirement (MOD-03 法定延迟退休计算器)", () => {
    const fixedNow = new Date("2026-10-15T00:00:00");

    it("非法日期输入安全返回 null", () => {
        expect(calculateRetirement("")).toBeNull();
        expect(calculateRetirement("invalid")).toBeNull();
        expect(calculateRetirement("1800-01-01")).toBeNull();
        expect(calculateRetirement("2020-13-01")).toBeNull();
    });

    it("改革前已达到原法定退休年龄的人员不受影响", () => {
        // 男职工，1964年12月出生，满60岁为2024年12月（改革前）
        const res = calculateRetirement("1964-12-15", "male", fixedNow);
        expect(res).not.toBeNull();
        expect(res!.delayMonths).toBe(0);
        expect(res!.targetAgeYears).toBe(60);
        expect(res!.targetAgeMonths).toBe(0);
        expect(res!.retireDateStr).toBe("2024年12月");
        expect(res!.isRetired).toBe(true);
        expect(res!.totalMonthsLeft).toBe(0);
    });

    it("男职工（60岁档）渐进延迟计算符合官方算法", () => {
        // 1965年1月出生：改革首月达到60岁，每4个月延1个月，延迟1个月
        const r1 = calculateRetirement("1965-01-01", "male", fixedNow);
        expect(r1).not.toBeNull();
        expect(r1!.delayMonths).toBe(1);
        expect(r1!.targetAgeYears).toBe(60);
        expect(r1!.targetAgeMonths).toBe(1);
        expect(r1!.retireDateStr).toBe("2025年02月");
        expect(r1!.isRetired).toBe(true); // 2026年已退休

        // 1965年4月出生：原退休2025年4月（第4个月），延迟1个月
        const r2 = calculateRetirement("1965-04-10", "male", fixedNow);
        expect(r2!.delayMonths).toBe(1);
        expect(r2!.targetAgeYears).toBe(60);
        expect(r2!.targetAgeMonths).toBe(1);
        expect(r2!.retireDateStr).toBe("2025年05月");

        // 1965年5月出生：原退休2025年5月（第5个月），延迟2个月
        const r3 = calculateRetirement("1965-05-20", "male", fixedNow);
        expect(r3!.delayMonths).toBe(2);
        expect(r3!.targetAgeYears).toBe(60);
        expect(r3!.targetAgeMonths).toBe(2);
        expect(r3!.retireDateStr).toBe("2025年07月");

        // 1980年1月出生：达到36个月上限，退休年龄延至63岁整
        const r4 = calculateRetirement("1980-01-01", "male", fixedNow);
        expect(r4!.delayMonths).toBe(36);
        expect(r4!.targetAgeYears).toBe(63);
        expect(r4!.targetAgeMonths).toBe(0);
        expect(r4!.retireDateStr).toBe("2043年01月");
        expect(r4!.isRetired).toBe(false);
        expect(r4!.yearsLeft).toBe(16); // 2043年1月 距 2026年10月 为 16年3个月
        expect(r4!.monthsLeft).toBe(3);
    });

    it("女职工（55岁档）延迟计算符合官方算法", () => {
        // 1970年1月出生：原退休2025年1月，延迟1个月
        const r1 = calculateRetirement("1970-01-05", "female_55", fixedNow);
        expect(r1!.delayMonths).toBe(1);
        expect(r1!.targetAgeYears).toBe(55);
        expect(r1!.targetAgeMonths).toBe(1);
        expect(r1!.retireDateStr).toBe("2025年02月");

        // 1985年1月出生：封顶36个月，退休年龄延至58岁整
        const r2 = calculateRetirement("1985-01-01", "female_55", fixedNow);
        expect(r2!.delayMonths).toBe(36);
        expect(r2!.targetAgeYears).toBe(58);
        expect(r2!.targetAgeMonths).toBe(0);
        expect(r2!.retireDateStr).toBe("2043年01月");
    });

    it("女职工（50岁档）每2个月延1个月，封顶60个月至55岁", () => {
        // 1975年1月出生：原退休2025年1月（第1个月），延迟1个月
        const r1 = calculateRetirement("1975-01-15", "female_50", fixedNow);
        expect(r1!.delayMonths).toBe(1);
        expect(r1!.targetAgeYears).toBe(50);
        expect(r1!.targetAgeMonths).toBe(1);
        expect(r1!.retireDateStr).toBe("2025年02月");

        // 1975年3月出生：原退休2025年3月（第3个月），延迟2个月
        const r2 = calculateRetirement("1975-03-20", "female_50", fixedNow);
        expect(r2!.delayMonths).toBe(2);
        expect(r2!.targetAgeYears).toBe(50);
        expect(r2!.targetAgeMonths).toBe(2);
        expect(r2!.retireDateStr).toBe("2025年05月");

        // 1985年1月出生：达到60个月上限，退休年龄延至55岁整
        const r3 = calculateRetirement("1985-01-01", "female_50", fixedNow);
        expect(r3!.delayMonths).toBe(60);
        expect(r3!.targetAgeYears).toBe(55);
        expect(r3!.targetAgeMonths).toBe(0);
        expect(r3!.retireDateStr).toBe("2040年01月");
    });
});
