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

export type ImmunizationDoseStatus = "received" | "overdue" | "upcoming";

export interface ScheduledDoseItem {
    vaccine: string;
    dose: number;
    monthAge: number;
    targetDate: string;
    note?: string;
    status: ImmunizationDoseStatus;
    receivedDate?: string;
    matchedRowId?: string;
}

export interface ChildImmunizationSchedule {
    childName: string;
    birthISO: string;
    totalDoses: number;
    receivedCount: number;
    overdueCount: number;
    upcomingCount: number;
    schedule: ScheduledDoseItem[];
}

export interface RecordedVaccineRow {
    id?: string;
    name?: string;
    vaccine_name?: string;
    dose_no?: number | string;
    date?: string;
    memberBlockId?: string;
}

/**
 * 推算并比对儿童免疫规划接种全貌（应种、已种、逾期）
 */
export function calculateImmunizationSchedule(
    birthISO: string,
    childName: string,
    recordedRows: RecordedVaccineRow[],
    todayKey?: string,
): ChildImmunizationSchedule | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthISO)) return null;
    const today = todayKey ?? localDateKey(new Date());

    let receivedCount = 0;
    let overdueCount = 0;
    let upcomingCount = 0;

    const schedule: ScheduledDoseItem[] = [];

    for (const d of IMMUNIZATION_SCHEDULE) {
        const targetDate = doseDate(birthISO, d);
        let matched: RecordedVaccineRow | undefined;

        for (const row of recordedRows) {
            const vName = (row.vaccine_name ?? "").trim() || (row.name ?? "").trim();
            const dNo = Number(row.dose_no);

            if (
                (vName === d.vaccine || vName.includes(d.vaccine) || d.vaccine.includes(vName)) &&
                (Number.isFinite(dNo) && dNo > 0 ? dNo === d.dose : (row.name ?? "").includes(`第${d.dose}剂`) || (row.name ?? "").includes(String(d.dose)))
            ) {
                if (row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
                    matched = row;
                    break;
                }
            }
        }

        let status: ImmunizationDoseStatus = "upcoming";
        let receivedDate: string | undefined;
        let matchedRowId: string | undefined;

        if (matched) {
            status = "received";
            receivedDate = matched.date;
            matchedRowId = matched.id;
            receivedCount++;
        } else if (targetDate < today) {
            status = "overdue";
            overdueCount++;
        } else {
            status = "upcoming";
            upcomingCount++;
        }

        schedule.push({
            vaccine: d.vaccine,
            dose: d.dose,
            monthAge: d.monthAge,
            targetDate,
            note: d.note,
            status,
            receivedDate,
            matchedRowId,
        });
    }

    return {
        childName,
        birthISO,
        totalDoses: IMMUNIZATION_SCHEDULE.length,
        receivedCount,
        overdueCount,
        upcomingCount,
        schedule,
    };
}
