/**
 * 法定延迟退休年龄精算纯函数（MOD-03）
 * 依据全国人民代表大会常务委员会《关于实施渐进式延迟法定退休年龄的决定》（2025年1月1日起实施）
 */

export type RetirementWorkerType = "male" | "female_55" | "female_50";

export interface RetirementResult {
    /** 出生年月 YYYY-MM */
    birthYearMonth: string;
    /** 人员类别 */
    workerType: RetirementWorkerType;
    /** 原法定退休年龄（岁） */
    originalAge: number;
    /** 改革后法定退休年龄：整岁数 */
    targetAgeYears: number;
    /** 改革后法定退休年龄：余月数（0-11） */
    targetAgeMonths: number;
    /** 延迟月数 */
    delayMonths: number;
    /** 改革后退休年份 */
    retireYear: number;
    /** 改革后退休月份（1-12） */
    retireMonth: number;
    /** 改革后退休年月格式化（如 "2032年04月"） */
    retireDateStr: string;
    /** 截至计算基准日是否已达法定退休年龄 */
    isRetired: boolean;
    /** 距退休总月数（已退休为 0） */
    totalMonthsLeft: number;
    /** 距退休剩余整年数 */
    yearsLeft: number;
    /** 距退休剩余零月数（0-11） */
    monthsLeft: number;
}

/**
 * 计算法定退休年龄及退休时间
 * @param birthDateStr 出生日期字符串，支持 "YYYY-MM-DD" 或 "YYYY-MM"
 * @param workerType 人员类别：male(男职工60岁档) / female_55(女职工55岁档) / female_50(女职工50岁档)
 * @param asOfDate 计算基准日期，默认为当前日期
 */
export function calculateRetirement(
    birthDateStr: string | undefined,
    workerType: RetirementWorkerType = "male",
    asOfDate: Date = new Date(),
): RetirementResult | null {
    if (!birthDateStr || typeof birthDateStr !== "string") return null;
    const parts = birthDateStr.trim().split("-");
    if (parts.length < 2) return null;

    const birthYear = Number(parts[0]);
    const birthMonth = Number(parts[1]);
    if (!Number.isFinite(birthYear) || !Number.isFinite(birthMonth) || birthMonth < 1 || birthMonth > 12 || birthYear < 1920 || birthYear > 2100) {
        return null;
    }

    const originalAge = workerType === "male" ? 60 : workerType === "female_55" ? 55 : 50;
    const maxDelay = workerType === "female_50" ? 60 : 36; // 50岁档最长延5年(60月)至55岁；60岁和55岁档最长延3年(36月)至63岁/58岁
    const delayStep = workerType === "female_50" ? 2 : 4; // 50岁档每2个月延1个月；其余每4个月延1个月

    // 原法定退休年月（绝对月数，以公元元年0月起算：year * 12 + (month - 1)）
    const originalRetireTotalMonths = (birthYear + originalAge) * 12 + (birthMonth - 1);

    // 改革起始年月：2025年1月 (2025 * 12 + 0)
    const reformStartTotalMonths = 2025 * 12 + 0;

    let delayMonths = 0;
    if (originalRetireTotalMonths >= reformStartTotalMonths) {
        // 原退休时间在改革开始之后，计算距 2025年1月 的序号月数（2025年1月为第1个月）
        const diffMonths = originalRetireTotalMonths - reformStartTotalMonths + 1;
        delayMonths = Math.min(maxDelay, Math.ceil(diffMonths / delayStep));
    }

    // 最终退休总月数
    const finalRetireTotalMonths = originalRetireTotalMonths + delayMonths;
    const retireYear = Math.floor(finalRetireTotalMonths / 12);
    const retireMonth = (finalRetireTotalMonths % 12) + 1;

    // 最终退休年龄：总月数 = originalAge * 12 + delayMonths
    const totalAgeMonths = originalAge * 12 + delayMonths;
    const targetAgeYears = Math.floor(totalAgeMonths / 12);
    const targetAgeMonths = totalAgeMonths % 12;

    // 计算基准日期的绝对月数
    const asOfYear = asOfDate.getFullYear();
    const asOfMonth = asOfDate.getMonth() + 1;
    const asOfTotalMonths = asOfYear * 12 + (asOfMonth - 1);

    const isRetired = asOfTotalMonths >= finalRetireTotalMonths;
    const totalMonthsLeft = isRetired ? 0 : finalRetireTotalMonths - asOfTotalMonths;
    const yearsLeft = Math.floor(totalMonthsLeft / 12);
    const monthsLeft = totalMonthsLeft % 12;

    const retireMonthStr = String(retireMonth).padStart(2, "0");
    const birthMonthStr = String(birthMonth).padStart(2, "0");

    return {
        birthYearMonth: `${birthYear}-${birthMonthStr}`,
        workerType,
        originalAge,
        targetAgeYears,
        targetAgeMonths,
        delayMonths,
        retireYear,
        retireMonth,
        retireDateStr: `${retireYear}年${retireMonthStr}月`,
        isRetired,
        totalMonthsLeft,
        yearsLeft,
        monthsLeft,
    };
}
