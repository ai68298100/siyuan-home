/**
 * 国家免疫规划疫苗程序表（0-6 岁，2021 版新版程序）。
 * 用途：parenting 模块种子数据——向导/疫苗排期视图据此生成应种行，
 * 剂次日期由出生日期 + 标准月龄推算，实际接种日期由用户回填。
 * 来源：国家卫健委《国家免疫规划疫苗儿童免疫程序表》（数据为公开政策信息）。
 */

import { localDateKey } from "./hub/rule";

export interface VaccineDose {
    /** 疫苗名 */
    vaccine: string;
    /** 剂次（1 起） */
    dose: number;
    /** 标准接种月龄 */
    monthAge: number;
    /** 备注（联合疫苗替代等） */
    note?: string;
}

export const IMMUNIZATION_SCHEDULE: VaccineDose[] = [
    { vaccine: "乙肝疫苗", dose: 1, monthAge: 0, note: "出生 24 小时内" },
    { vaccine: "卡介苗", dose: 1, monthAge: 0, note: "出生时" },
    { vaccine: "乙肝疫苗", dose: 2, monthAge: 1 },
    { vaccine: "脊灰灭活疫苗", dose: 1, monthAge: 2 },
    { vaccine: "脊灰灭活疫苗", dose: 2, monthAge: 3 },
    { vaccine: "百白破疫苗", dose: 1, monthAge: 3 },
    { vaccine: "脊灰减毒疫苗", dose: 3, monthAge: 4, note: "口服" },
    { vaccine: "百白破疫苗", dose: 2, monthAge: 4 },
    { vaccine: "百白破疫苗", dose: 3, monthAge: 5 },
    { vaccine: "乙肝疫苗", dose: 3, monthAge: 6 },
    { vaccine: "流脑多糖疫苗 A 群", dose: 1, monthAge: 6 },
    { vaccine: "流脑多糖疫苗 A 群", dose: 2, monthAge: 7, note: "与第 1 剂间隔 ≥3 个月" },
    { vaccine: "麻腮风疫苗", dose: 1, monthAge: 8 },
    { vaccine: "乙脑减毒活疫苗", dose: 1, monthAge: 8 },
    { vaccine: "流脑多糖疫苗 A+C 群", dose: 1, monthAge: 12 },
    { vaccine: "麻腮风疫苗", dose: 2, monthAge: 18 },
    { vaccine: "甲肝减毒活疫苗", dose: 1, monthAge: 18 },
    { vaccine: "百白破疫苗", dose: 4, monthAge: 18, note: "加强" },
    { vaccine: "乙脑减毒活疫苗", dose: 2, monthAge: 24 },
    { vaccine: "脊灰减毒疫苗", dose: 4, monthAge: 48, note: "4 岁加强" },
    { vaccine: "流脑多糖疫苗 A+C 群", dose: 2, monthAge: 72, note: "6 岁" },
    { vaccine: "白破疫苗", dose: 1, monthAge: 72, note: "6 岁加强" },
];

/** 由出生日期推算某剂的标准接种日（yyyy-MM-dd，本地时区）；出生日期非法 → 空串 */
export function doseDate(birthISO: string, d: VaccineDose): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthISO) || !Number.isFinite(d.monthAge)) return "";
    const [y, m, day] = birthISO.split("-").map(Number);
    const totalMonths = y * 12 + (m - 1) + d.monthAge;
    const yy = Math.floor(totalMonths / 12);
    const mm = (totalMonths % 12) + 1;
    // 日溢出收敛到月末（如 1/31 + 1 月 → 2/28）
    const last = new Date(yy, mm, 0).getDate();
    return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export type VaccineDoseStatus = "given" | "overdue" | "due_soon" | "upcoming";

export interface GivenDoseRecord {
    id?: string;
    vaccineName: string;
    doseNo?: number;
    date?: string;
    batch?: string;
    site?: string;
}

export interface ScheduledDoseItem {
    key: string;
    vaccine: string;
    dose: number;
    monthAge: number;
    targetDate: string;
    status: VaccineDoseStatus;
    givenDate?: string;
    rowId?: string;
    batch?: string;
    site?: string;
    note?: string;
    daysDiff: number;
}

export interface VaccineScheduleReport {
    childBirthday: string;
    totalDoses: number;
    givenCount: number;
    overdueCount: number;
    dueSoonCount: number;
    upcomingCount: number;
    completionRate: number; // 0-100
    items: ScheduledDoseItem[];
}

/**
 * 测算儿童疫苗排期与接种履历（§16/§17 290波）：
 * 依据儿童出生日期推算国家免疫规划标准剂次日期，
 * 对比台账已接种记录，计算已种/逾期/近期/待种状态及完成率。
 */
export function calculateVaccineSchedule(
    birthday: string,
    givenRecords: GivenDoseRecord[] = [],
    today: string = localDateKey(new Date()),
    schedule: VaccineDose[] = IMMUNIZATION_SCHEDULE,
): VaccineScheduleReport | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;

    const [ty, tm, td] = today.split("-").map(Number);
    const todayTime = new Date(ty, (tm ?? 1) - 1, td ?? 1).getTime();

    // 复制以匹配实种记录，避免单条记录多次消耗
    const remainingGiven = [...givenRecords];

    const items: ScheduledDoseItem[] = [];
    let givenCount = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;
    let upcomingCount = 0;

    for (const dose of schedule) {
        const target = doseDate(birthday, dose);
        const [dy, dm, dd] = target.split("-").map(Number);
        const targetTime = new Date(dy, (dm ?? 1) - 1, dd ?? 1).getTime();
        const daysDiff = Math.round((targetTime - todayTime) / (24 * 60 * 60 * 1000));

        // 优先严格匹配疫苗名称与剂次
        let matchedIndex = remainingGiven.findIndex((g) =>
            g.vaccineName.trim() === dose.vaccine.trim() && (g.doseNo === dose.dose || !g.doseNo)
        );
        if (matchedIndex < 0) {
            matchedIndex = remainingGiven.findIndex((g) => g.vaccineName.trim() === dose.vaccine.trim());
        }

        let status: VaccineDoseStatus;
        let givenDate: string | undefined;
        let rowId: string | undefined;
        let batch: string | undefined;
        let site: string | undefined;

        if (matchedIndex >= 0) {
            const matched = remainingGiven.splice(matchedIndex, 1)[0];
            status = "given";
            givenDate = matched.date;
            rowId = matched.id;
            batch = matched.batch;
            site = matched.site;
            givenCount++;
        } else if (daysDiff < 0) {
            status = "overdue";
            overdueCount++;
        } else if (daysDiff <= 30) {
            status = "due_soon";
            dueSoonCount++;
        } else {
            status = "upcoming";
            upcomingCount++;
        }

        items.push({
            key: `${dose.vaccine}-${dose.dose}-${dose.monthAge}`,
            vaccine: dose.vaccine,
            dose: dose.dose,
            monthAge: dose.monthAge,
            targetDate: target,
            status,
            givenDate,
            rowId,
            batch,
            site,
            note: dose.note,
            daysDiff,
        });
    }

    const totalDoses = schedule.length;
    const completionRate = totalDoses > 0 ? Math.round((givenCount / totalDoses) * 100) : 0;

    return {
        childBirthday: birthday,
        totalDoses,
        givenCount,
        overdueCount,
        dueSoonCount,
        upcomingCount,
        completionRate,
        items,
    };
}

