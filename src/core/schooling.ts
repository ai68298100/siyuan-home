/**
 * 升学节点推算与教育里程碑倒计时（MOD-13 / §8 升学倒计时看板）：
 * 纯函数、本地计算、零网络：
 * - 依据国家标准学制（幼升小、小升初、初升高/中考、高考、大学毕业）；
 * - 结合入学年份（enroll_year）、当前年级（grade）与指定考试日（exam_date）推算升学关键节点；
 * - 精确计算距离下一次升学/大考的倒计时（年、月、天）；
 * - 在升学台账顶部渲染专属看板，帮助家庭提前做好升学择校与备考规划。
 */

import { localDateKey } from "./hub/rule";

export interface SchoolingRowData {
    id?: string;
    name?: string;
    member?: string;
    school?: string;
    category?: string;
    grade?: string;
    status?: string;
    enroll_year?: number;
    exam_date?: string;
}

export interface EducationMilestone {
    studentName: string;
    schoolName: string;
    stage: string;
    milestoneName: string;
    targetDate: string;
    daysLeft: number;
    yearsLeft: number;
    monthsLeft: number;
    isPast: boolean;
}

export const STAGE_STANDARD_YEARS: Record<string, { duration: number; name: string; targetMonthDay: string }> = {
    kindergarten: { duration: 3, name: "幼升小", targetMonthDay: "06-30" },
    primary: { duration: 6, name: "小升初", targetMonthDay: "06-25" },
    junior: { duration: 3, name: "中考（初升高）", targetMonthDay: "06-20" },
    senior: { duration: 3, name: "高考（大学录取）", targetMonthDay: "06-07" },
    college: { duration: 4, name: "大学毕业 / 升学", targetMonthDay: "06-30" },
    grad_school: { duration: 3, name: "硕博毕业 / 就业", targetMonthDay: "06-30" },
};

/**
 * 推算单条就读记录的下一个升学里程碑与倒计时
 */
export function calculateNextEducationMilestone(
    row: SchoolingRowData,
    todayKey?: string,
): EducationMilestone | null {
    const todayStr = todayKey ?? localDateKey(new Date());
    const curDate = new Date(`${todayStr}T00:00:00`);
    if (Number.isNaN(curDate.getTime())) return null;

    const studentName = (row.name ?? "").trim() || "学生";
    const schoolName = (row.school ?? "").trim() || "学校";
    const cat = (row.category ?? "").trim().toLowerCase();

    // 1. 如果有明确填写的考试/升学日期（exam_date），以此为准
    if (row.exam_date && /^\d{4}-\d{2}-\d{2}$/.test(row.exam_date)) {
        const targetDate = new Date(`${row.exam_date}T00:00:00`);
        if (!Number.isNaN(targetDate.getTime())) {
            const diffDays = Math.round((targetDate.getTime() - curDate.getTime()) / 86400000);
            const stageConfig = STAGE_STANDARD_YEARS[cat];
            return {
                studentName,
                schoolName,
                stage: cat,
                milestoneName: stageConfig ? stageConfig.name : "升学节点",
                targetDate: row.exam_date,
                daysLeft: Math.max(0, diffDays),
                yearsLeft: Math.max(0, Math.floor(diffDays / 365)),
                monthsLeft: Math.max(0, Math.floor((diffDays % 365) / 30)),
                isPast: diffDays < 0,
            };
        }
    }

    // 2. 根据标准学制与入学年份推算
    const stageConfig = STAGE_STANDARD_YEARS[cat];
    if (stageConfig && typeof row.enroll_year === "number" && Number.isFinite(row.enroll_year) && row.enroll_year > 1990) {
        const gradYear = row.enroll_year + stageConfig.duration;
        const targetDateStr = `${gradYear}-${stageConfig.targetMonthDay}`;
        const targetDate = new Date(`${targetDateStr}T00:00:00`);
        const diffDays = Math.round((targetDate.getTime() - curDate.getTime()) / 86400000);

        return {
            studentName,
            schoolName,
            stage: cat,
            milestoneName: stageConfig.name,
            targetDate: targetDateStr,
            daysLeft: Math.max(0, diffDays),
            yearsLeft: Math.max(0, Math.floor(diffDays / 365)),
            monthsLeft: Math.max(0, Math.floor((diffDays % 365) / 30)),
            isPast: diffDays < 0,
        };
    }

    // 3. 根据年级关键词推算（如初三/高三/六年级）
    const gradeStr = (row.grade ?? "").trim();
    if (gradeStr.includes("大班") || gradeStr.includes("初三") || gradeStr.includes("高三") || gradeStr.includes("六年级") || gradeStr.includes("大四")) {
        const curYear = curDate.getFullYear();
        let targetMonthDay = "06-20";
        let milestoneName = "升学节点";

        if (gradeStr.includes("大班")) { targetMonthDay = "06-30"; milestoneName = "幼升小"; }
        else if (gradeStr.includes("六年级")) { targetMonthDay = "06-25"; milestoneName = "小升初"; }
        else if (gradeStr.includes("初三")) { targetMonthDay = "06-20"; milestoneName = "中考（初升高）"; }
        else if (gradeStr.includes("高三")) { targetMonthDay = "06-07"; milestoneName = "高考（大学录取）"; }
        else if (gradeStr.includes("大四")) { targetMonthDay = "06-30"; milestoneName = "大学毕业"; }

        let targetYear = curYear;
        const candidateDateStr = `${targetYear}-${targetMonthDay}`;
        if (candidateDateStr < todayStr) {
            targetYear += 1;
        }

        const targetDateStr = `${targetYear}-${targetMonthDay}`;
        const targetDate = new Date(`${targetDateStr}T00:00:00`);
        const diffDays = Math.round((targetDate.getTime() - curDate.getTime()) / 86400000);

        return {
            studentName,
            schoolName,
            stage: cat || "senior",
            milestoneName,
            targetDate: targetDateStr,
            daysLeft: Math.max(0, diffDays),
            yearsLeft: Math.max(0, Math.floor(diffDays / 365)),
            monthsLeft: Math.max(0, Math.floor((diffDays % 365) / 30)),
            isPast: diffDays < 0,
        };
    }

    return null;
}

/**
 * 汇总当前所有学生的下一个升学节点（按时间升序）
 */
export function calculateSchoolingMilestones(
    rows: SchoolingRowData[],
    todayKey?: string,
): EducationMilestone[] {
    const list: EducationMilestone[] = [];
    for (const r of rows) {
        if (r.status === "graduated") continue; // 忽略已毕业
        const m = calculateNextEducationMilestone(r, todayKey);
        if (m && !m.isPast) list.push(m);
    }
    return list.sort((a, b) => a.daysLeft - b.daysLeft);
}
