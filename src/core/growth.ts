/**
 * 生长曲线数据层（第七十四轮）：从 parenting 台账行收集身高/体重时间线序列。
 * 纯逻辑可单测。第七十七轮：WHO 0–60 月参考带插值（数据来自官方 LMS 参数表，
 * 构建期由 scripts/fetch-who-data.mjs 生成 who-refs.ts，含署名与 CC BY-NC 3.0 约束）。
 * 第七十八轮：精确小数月龄 + 新生儿期（0–13 周）周粒度参考带。
 */
import type { FamilyMember } from "@/types";
import { selectCellContent } from "@/core/avcell";
import { WHO_REFS, type WhoBandTable } from "@/core/data/who-refs";

export type GrowthMetric = "height" | "weight";
export type WhoSex = keyof typeof WHO_REFS;

export interface GrowthPoint {
    /** ISO 日期（ yyyy-MM-dd） */
    date: string;
    value: number;
    /** 距成员生日的月龄（WHO 月定义 30.4375 天，小数精确；生日缺失 → null，图上退化为日期轴） */
    ageMonths: number | null;
}

export interface GrowthSeries {
    memberId: string;
    memberName: string;
    metric: GrowthMetric;
    /** 按日期升序 */
    points: GrowthPoint[];
}

interface GrowthRowLike {
    itemID: string;
    cells: Record<string, any>;
}

/** 整数月龄 = floor(精确月龄)（WHO 30.4375 天月）；生日缺失/早于测量日 → null。
 * 第七十八轮起图表数据走 exactAgeMonthsAt（小数精确）；本函数保留给需要整数月的场景。 */
export function ageMonthsAt(birthday: string | undefined, date: string): number | null {
    const exact = exactAgeMonthsAt(birthday, date);
    return exact === null ? null : Math.floor(exact);
}

export const DAYS_PER_MONTH = 30.4375; // WHO 月定义（平均年 365.2425 天 / 12）

/** 精确月龄（小数）：整日差 / 30.4375；生日缺失/早于测量日 → null。
 * 小数月龄让新生儿期测量点在周粒度参考带上不再坍缩到月 0。 */
export function exactAgeMonthsAt(birthday: string | undefined, date: string): number | null {
    if (!birthday || birthday.length < 10 || !date || date.length < 10) return null;
    const b = new Date(`${birthday.slice(0, 10)}T00:00:00`);
    const d = new Date(`${date.slice(0, 10)}T00:00:00`);
    if (isNaN(b.getTime()) || isNaN(d.getTime()) || d < b) return null;
    const days = Math.floor((d.getTime() - b.getTime()) / 86400000);
    return Math.max(0, days / DAYS_PER_MONTH);
}

/**
 * 从 parenting 行收集生长序列：category=growth 且有 metric_value 的行，
 * 按 metric_type 分组、按成员聚合。date 列为测量日。
 */
export function collectGrowthSeries(
    rows: GrowthRowLike[],
    columns: Record<string, string | undefined>,
    members: FamilyMember[],
): GrowthSeries[] {
    const dateKey = columns.date;
    const catKey = columns.category;
    const typeKey = columns.metric_type;
    const valKey = columns.metric_value;
    if (!dateKey || !valKey) return [];
    const byId = new Map(members.map((m) => [m.id, m]));
    // relation blockID → memberId（成员列存的是成员台账行的块 ID）
    const relToMember = new Map(members.filter((m) => m.avItemId).map((m) => [m.avItemId!, m.id]));

    const acc = new Map<string, GrowthSeries>();
    for (const row of rows) {
        const cat = catKey ? selectCellContent(row.cells[catKey]) : undefined;
        if (cat && cat !== "growth") continue;
        const num = row.cells[valKey]?.number;
        const value = num?.isNotEmpty && typeof num.content === "number" ? num.content : NaN;
        if (!Number.isFinite(value)) continue;
        const rawDate = row.cells[dateKey]?.date;
        const date = rawDate?.isNotEmpty && typeof rawDate.content === "number" ? localKey(new Date(rawDate.content)) : "";
        if (!date) continue;
        const rawType = typeKey ? selectCellContent(row.cells[typeKey]) : undefined;
        const metric: GrowthMetric = rawType === "weight" ? "weight" : "height"; // 缺省按身高（schema default 一致）
        const relId = row.cells[columns.member ?? ""]?.relation?.blockIDs?.[0] as string | undefined;
        const member = relId ? relToMember.get(relId) : undefined;
        const m = member ? byId.get(member) : undefined;
        const memberId = m?.id ?? "unassigned";
        const memberName = m?.name ?? "?";
        const key = `${memberId}|${metric}`;
        let series = acc.get(key);
        if (!series) {
            series = { memberId, memberName, metric, points: [] };
            acc.set(key, series);
        }
        series.points.push({ date, value, ageMonths: exactAgeMonthsAt(m?.birthday, date) });
    }
    const out = [...acc.values()];
    for (const s of out) s.points.sort((a, b) => a.date.localeCompare(b.date));
    return out;
}

function localKey(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
}

export interface WhoBandPoint { p3: number; p15: number; p50: number; p85: number; p97: number }

/** 按月龄选表：≤13 周优先周表（位置换算 周 = 月龄 × 30.4375 / 7）；返回数据源、插值位置与上界 */
function selectWhoTable(table: WhoBandTable, ageMonths: number) {
    const weeklyMaxMonths = (13 * 7) / DAYS_PER_MONTH;
    const useWeekly = table.weekly?.lms !== undefined && ageMonths <= weeklyMaxMonths;
    const src = useWeekly ? table.weekly! : table;
    const pos = useWeekly ? (ageMonths * DAYS_PER_MONTH) / 7 : ageMonths;
    return { src, pos, max: useWeekly ? 13 : 60 };
}

function whoTable(sex: WhoSex | undefined, metric: GrowthMetric): WhoBandTable | null {
    return (sex ? WHO_REFS[sex]?.[metric] : undefined) ?? null;
}

function lerpAt(arr: number[], pos: number, max: number): number {
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, max);
    return arr[lo] + (arr[hi] - arr[lo]) * (pos - lo);
}

/** WHO 参考带线性插值；性别未知或超出 0–60 月 → null（参考带不外推）。
 * 新生儿期（≤13 周）优先取周粒度带，位置换算：周 = 月龄 × 30.4375 / 7。 */
export function whoBand(sex: WhoSex | undefined, metric: GrowthMetric, ageMonths: number): WhoBandPoint | null {
    const table = whoTable(sex, metric);
    if (!table || !Number.isFinite(ageMonths) || ageMonths < 0 || ageMonths > 60) return null;
    const { src, pos, max } = selectWhoTable(table, ageMonths);
    return { p3: lerpAt(src.p3, pos, max), p15: lerpAt(src.p15, pos, max), p50: lerpAt(src.p50, pos, max), p85: lerpAt(src.p85, pos, max), p97: lerpAt(src.p97, pos, max) };
}

/** 标准正态 CDF（Abramowitz–Stegun erf 近似，误差 <1e-7） */
function normCdf(z: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp((-z * z) / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z >= 0 ? 1 - p : p;
}

/** 值在 WHO 参考中的百分位（截到 0.1–99.9）；无参考/非正值/月龄超范围 → null。
 * LMS 反解：z = ((v/M)^L − 1)/(L·S)，L=0 时 ln(v/M)/S；新生儿期走周表 LMS。 */
export function whoPercentile(sex: WhoSex | undefined, metric: GrowthMetric, ageMonths: number, value: number): number | null {
    const table = whoTable(sex, metric);
    if (!table?.lms || !Number.isFinite(ageMonths) || ageMonths < 0 || ageMonths > 60) return null;
    if (!Number.isFinite(value) || value <= 0) return null;
    const { src, pos, max } = selectWhoTable(table, ageMonths);
    const lms = src.lms;
    if (!lms) return null;
    const M = lerpAt(lms.m, pos, max);
    if (!(M > 0)) return null;
    const L = lerpAt(lms.l, pos, max);
    const S = lerpAt(lms.s, pos, max);
    const z = L === 0 ? Math.log(value / M) / S : (Math.pow(value / M, L) - 1) / (L * S);
    return Math.min(99.9, Math.max(0.1, 100 * normCdf(z)));
}
