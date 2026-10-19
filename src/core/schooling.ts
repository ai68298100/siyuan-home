/**
 * 学段学制推算、当前年级与升学毕业倒计时测算（§16/§17 292波）：
 * 依据学生入学年份与学段（幼3/小6/初3/高3/本4/硕3），推算当前所处年级、
 * 距离升学/毕业节点（中考、高考、小升初等）剩余天数与学段完成进度条。
 */
import { localDateKey } from "@/core/hub/rule";

export const STAGE_DURATIONS: Record<string, number> = {
    kindergarten: 3,
    primary: 6,
    junior: 3,
    senior: 3,
    college: 4,
    grad_school: 3,
};

export const TRANSITION_EVENTS: Record<string, string> = {
    kindergarten: "幼升小节点",
    primary: "小升初节点",
    junior: "中考升学节点",
    senior: "高考升学节点",
    college: "大学毕业节点",
    grad_school: "硕士毕业节点",
};

export interface SchoolingStageInput {
    category: string;
    enrollYear?: number;
    customDurationYears?: number;
    status?: string;
    today?: string; // YYYY-MM-DD
}

export interface SchoolingStageResult {
    category: string;
    stageTotalYears: number;
    currentGradeNumber: number;
    currentGradeLabel: string;
    enrollDate: string;
    graduationDate: string;
    daysUntilGraduation: number;
    isGraduated: boolean;
    isNotEnrolledYet: boolean;
    stageProgressPercent: number; // 0-100
    transitionEventLabel: string;
}

const CHINESE_NUMS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function gradeLabelFor(category: string, gradeNo: number, totalYears: number): string {
    if (gradeNo > totalYears) return "已毕业";
    if (gradeNo <= 0) return "待入学";

    switch (category) {
        case "kindergarten":
            if (gradeNo === 1) return "幼儿园小班";
            if (gradeNo === 2) return "幼儿园中班";
            return "幼儿园大班";
        case "primary":
            return `小学${CHINESE_NUMS[gradeNo] || gradeNo}年级`;
        case "junior":
            return `初${CHINESE_NUMS[gradeNo] || gradeNo}（${gradeNo + 6}年级）`;
        case "senior":
            return `高${CHINESE_NUMS[gradeNo] || gradeNo}`;
        case "college":
            return `大${CHINESE_NUMS[gradeNo] || gradeNo}`;
        case "grad_school":
            return `研${CHINESE_NUMS[gradeNo] || gradeNo}`;
        default:
            return `第${gradeNo}学年`;
    }
}

/**
 * 推算学段年级与升学毕业倒计时
 */
export function calculateSchoolingStage(input: SchoolingStageInput): SchoolingStageResult | null {
    const { category, enrollYear } = input;
    if (!category) return null;

    const totalYears = input.customDurationYears && input.customDurationYears > 0
        ? input.customDurationYears
        : (STAGE_DURATIONS[category] ?? 3);

    // 如果未填写入学年份，仅返回学制默认参数
    if (!enrollYear || !Number.isFinite(enrollYear) || enrollYear < 1980 || enrollYear > 2100) {
        return null;
    }

    const todayStr = input.today || localDateKey(new Date());
    const [ty, tm, td] = todayStr.split("-").map(Number);
    const todayTime = new Date(ty, (tm ?? 1) - 1, td ?? 1).getTime();

    // 入学基准日：当年9月1日
    const enrollDate = `${enrollYear}-09-01`;
    const [ey, em, ed] = enrollDate.split("-").map(Number);
    const enrollTime = new Date(ey, (em ?? 1) - 1, ed).getTime();

    // 预计毕业基准日：毕业年6月30日
    const gradYear = enrollYear + totalYears;
    const graduationDate = `${gradYear}-06-30`;
    const [gy, gm, gd] = graduationDate.split("-").map(Number);
    const gradTime = new Date(gy, (gm ?? 1) - 1, gd).getTime();

    const isNotEnrolledYet = todayTime < enrollTime;
    const isGraduated = input.status === "graduated" || todayTime >= gradTime;

    // 当前学年与年级计算：
    // 每学年在 9月1日 切换到新年级，7-8月暑期算作当年级或准新年级
    let currentGradeNumber = 0;
    if (isNotEnrolledYet) {
        currentGradeNumber = 0;
    } else if (isGraduated) {
        currentGradeNumber = totalYears + 1;
    } else {
        const yearDiff = ty - enrollYear;
        // 如果当前日期在 9月1日 之后，年级为 yearDiff + 1；若在 9月1日 之前（春季学期/暑假初），年级为 yearDiff
        const isPastAutumn = tm > 9 || (tm === 9 && td >= 1);
        currentGradeNumber = isPastAutumn ? yearDiff + 1 : Math.max(1, yearDiff);
        currentGradeNumber = Math.min(totalYears, Math.max(1, currentGradeNumber));
    }

    const currentGradeLabel = isGraduated
        ? "已毕业"
        : isNotEnrolledYet
            ? "待入学"
            : gradeLabelFor(category, currentGradeNumber, totalYears);

    const daysUntilGraduation = Math.max(0, Math.round((gradTime - todayTime) / (24 * 60 * 60 * 1000)));

    const stageProgressPercent = isGraduated
        ? 100
        : isNotEnrolledYet
            ? 0
            : Math.min(100, Math.max(0, Math.round(((todayTime - enrollTime) / (gradTime - enrollTime)) * 100)));

    const transitionEventLabel = TRANSITION_EVENTS[category] || "升学毕业节点";

    return {
        category,
        stageTotalYears: totalYears,
        currentGradeNumber,
        currentGradeLabel,
        enrollDate,
        graduationDate,
        daysUntilGraduation,
        isGraduated,
        isNotEnrolledYet,
        stageProgressPercent,
        transitionEventLabel,
    };
}
