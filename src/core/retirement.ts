/**
 * 退休年龄测算与倒计时计算（§16/§17 286波）：
 * 支持中国最新《关于实施渐进式延迟法定退休年龄的决定》（2025年1月1日起施行）测算，
 * 以及传统基准退休年龄（男60/女55/女50）与自定义目标退休年龄测算。
 */
import { localDateKey } from "@/core/hub/rule";

export type FemaleRetirementCategory = "55" | "50";

export interface RetirementInput {
    birthday: string; // YYYY-MM-DD or YYYY-MM
    sex?: "male" | "female";
    femaleCategory?: FemaleRetirementCategory;
    customRetireAge?: number;
    today?: string; // YYYY-MM-DD for testing
}

export interface RetirementResult {
    originalRetireAge: number;
    delayedMonths: number;
    targetRetireAge: number; // 岁（支持小数）
    targetRetireDate: string; // YYYY-MM
    targetRetireFullDate: string; // YYYY-MM-DD
    currentAge: number; // 当前年龄
    daysLeft: number; // 剩余天数
    isRetired: boolean;
    careerProgressPercent: number; // 18岁至退休的生活/职业进程百分比 (0-100)
    ruleType: "statutory_2025" | "custom" | "traditional_pre2025";
}

function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
    const parts = ymd.split("-").map(Number);
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
    return {
        year: parts[0],
        month: parts[1],
        day: Number.isFinite(parts[2]) ? parts[2] : 1,
    };
}

/**
 * 计算个人法定与渐进式延迟退休年龄及倒计时
 */
export function calculateRetirement(input: RetirementInput): RetirementResult | null {
    const birth = parseYmd(input.birthday);
    if (!birth) return null;

    const todayStr = input.today || localDateKey(new Date());
    const today = parseYmd(todayStr) || { year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: new Date().getDate() };

    const sex = input.sex || "male";
    const femaleCat = input.femaleCategory || "55";

    // 自定义年龄覆盖
    if (typeof input.customRetireAge === "number" && Number.isFinite(input.customRetireAge) && input.customRetireAge > 0) {
        const customAge = input.customRetireAge;
        const totalMonths = Math.round(customAge * 12);
        const addYears = Math.floor(totalMonths / 12);
        const addMonths = totalMonths % 12;

        let targetYear = birth.year + addYears;
        let targetMonth = birth.month + addMonths;
        if (targetMonth > 12) {
            targetYear += Math.floor((targetMonth - 1) / 12);
            targetMonth = ((targetMonth - 1) % 12) + 1;
        }

        const retireMonthStr = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
        const retireFullDate = `${retireMonthStr}-${String(birth.day).padStart(2, "0")}`;

        const birthTime = new Date(birth.year, birth.month - 1, birth.day).getTime();
        const nowTime = new Date(today.year, today.month - 1, today.day).getTime();
        const retireTime = new Date(targetYear, targetMonth - 1, birth.day).getTime();

        const currentAge = Math.round(((nowTime - birthTime) / (365.25 * 24 * 60 * 60 * 1000)) * 10) / 10;
        const daysLeft = Math.round((retireTime - nowTime) / (24 * 60 * 60 * 1000));
        const isRetired = nowTime >= retireTime;

        // 18岁至退休职业进度
        const startCareerTime = new Date(birth.year + 18, birth.month - 1, birth.day).getTime();
        const progress = retireTime > startCareerTime
            ? Math.min(100, Math.max(0, Math.round(((nowTime - startCareerTime) / (retireTime - startCareerTime)) * 100)))
            : (isRetired ? 100 : 0);

        return {
            originalRetireAge: customAge,
            delayedMonths: 0,
            targetRetireAge: customAge,
            targetRetireDate: retireMonthStr,
            targetRetireFullDate: retireFullDate,
            currentAge,
            daysLeft: Math.max(0, daysLeft),
            isRetired,
            careerProgressPercent: progress,
            ruleType: "custom",
        };
    }

    // 基准法定退休年龄
    const originalRetireAge = sex === "male" ? 60 : femaleCat === "50" ? 50 : 55;

    // 原退休年月
    const origRetireYear = birth.year + originalRetireAge;
    const origRetireMonth = birth.month;

    // 政策实施基准：2025年1月1日
    // 2025年1月之前已满原退休年龄的，不参与延迟
    const isPrePolicy = origRetireYear < 2025 || (origRetireYear === 2025 && origRetireMonth < 1);

    let delayedMonths = 0;
    if (!isPrePolicy) {
        // 从2025年1月起算的月数序号
        const elapsedMonths = (origRetireYear - 2025) * 12 + (origRetireMonth - 1);
        if (sex === "male") {
            // 男职工：每4个月延迟1个月，最高延迟至63周岁（延迟36个月）
            delayedMonths = Math.min(36, Math.ceil((elapsedMonths + 1) / 4));
        } else if (femaleCat === "55") {
            // 原55周岁女职工：每4个月延迟1个月，最高延迟至58周岁（延迟36个月）
            delayedMonths = Math.min(36, Math.ceil((elapsedMonths + 1) / 4));
        } else {
            // 原50周岁女职工：每2个月延迟1个月，最高延迟至55周岁（延迟60个月）
            delayedMonths = Math.min(60, Math.ceil((elapsedMonths + 1) / 2));
        }
    }

    let targetYear = origRetireYear;
    let targetMonth = origRetireMonth + delayedMonths;
    if (targetMonth > 12) {
        targetYear += Math.floor((targetMonth - 1) / 12);
        targetMonth = ((targetMonth - 1) % 12) + 1;
    }

    const targetRetireAge = Math.round((originalRetireAge + delayedMonths / 12) * 100) / 100;
    const targetRetireDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
    const targetRetireFullDate = `${targetRetireDate}-${String(birth.day).padStart(2, "0")}`;

    const birthTime = new Date(birth.year, birth.month - 1, birth.day).getTime();
    const nowTime = new Date(today.year, today.month - 1, today.day).getTime();
    const retireTime = new Date(targetYear, targetMonth - 1, birth.day).getTime();

    const currentAge = Math.round(((nowTime - birthTime) / (365.25 * 24 * 60 * 60 * 1000)) * 10) / 10;
    const daysLeft = Math.round((retireTime - nowTime) / (24 * 60 * 60 * 1000));
    const isRetired = nowTime >= retireTime;

    const startCareerTime = new Date(birth.year + 18, birth.month - 1, birth.day).getTime();
    const progress = retireTime > startCareerTime
        ? Math.min(100, Math.max(0, Math.round(((nowTime - startCareerTime) / (retireTime - startCareerTime)) * 100)))
        : (isRetired ? 100 : 0);

    return {
        originalRetireAge,
        delayedMonths,
        targetRetireAge,
        targetRetireDate,
        targetRetireFullDate,
        currentAge,
        daysLeft: Math.max(0, daysLeft),
        isRetired,
        careerProgressPercent: progress,
        ruleType: isPrePolicy ? "traditional_pre2025" : "statutory_2025",
    };
}
