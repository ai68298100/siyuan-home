/**
 * 国家免疫规划疫苗程序表（0-6 岁，2021 版新版程序）。
 * 用途：parenting 模块种子数据——向导/疫苗排期视图据此生成应种行，
 * 剂次日期由出生日期 + 标准月龄推算，实际接种日期由用户回填。
 * 来源：国家卫健委《国家免疫规划疫苗儿童免疫程序表》（数据为公开政策信息）。
 */

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

/** 由出生日期推算某剂的标准接种日（yyyy-MM-dd，本地时区） */
export function doseDate(birthISO: string, d: VaccineDose): string {
    const [y, m, day] = birthISO.split("-").map(Number);
    const totalMonths = (y ?? 2026) * 12 + (m ?? 1) - 1 + d.monthAge;
    const yy = Math.floor(totalMonths / 12);
    const mm = (totalMonths % 12) + 1;
    // 日溢出收敛到月末（如 1/31 + 1 月 → 2/28）
    const last = new Date(yy, mm, 0).getDate();
    return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(day ?? 1, last)).padStart(2, "0")}`;
}
