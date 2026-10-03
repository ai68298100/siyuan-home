/**
 * 生长曲线数据层（第七十四轮）：从 parenting 台账行收集身高/体重时间线序列。
 * 纯逻辑可单测。第七十七轮：WHO 0–60 月参考带插值（数据来自官方 LMS 参数表，
 * 构建期由 scripts/fetch-who-data.mjs 生成 who-refs.ts，含署名与 CC BY-NC 3.0 约束）。
 */
import type { FamilyMember } from "@/types";
import { WHO_REFS } from "@/core/data/who-refs";

export type GrowthMetric = "height" | "weight";
export type WhoSex = keyof typeof WHO_REFS;

export interface GrowthPoint {
    /** ISO 日期（ yyyy-MM-dd） */
    date: string;
    value: number;
    /** 距成员生日的月龄（生日缺失 → null，图上退化为日期轴） */
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

/** 月龄：按日历差（不满整月截断）；生日缺失/晚于测量日 → null */
export function ageMonthsAt(birthday: string | undefined, date: string): number | null {
    if (!birthday || birthday.length < 10 || !date || date.length < 10) return null;
    const b = new Date(`${birthday.slice(0, 10)}T00:00:00`);
    const d = new Date(`${date.slice(0, 10)}T00:00:00`);
    if (isNaN(b.getTime()) || isNaN(d.getTime()) || d < b) return null;
    let months = (d.getFullYear() - b.getFullYear()) * 12 + (d.getMonth() - b.getMonth());
    if (d.getDate() < b.getDate()) months -= 1;
    return Math.max(0, months);
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
        const cat = catKey ? row.cells[catKey]?.select?.content : undefined;
        if (cat && cat !== "growth") continue;
        const num = row.cells[valKey]?.number;
        const value = num?.isNotEmpty && typeof num.content === "number" ? num.content : NaN;
        if (!Number.isFinite(value)) continue;
        const rawDate = row.cells[dateKey]?.date;
        const date = rawDate?.isNotEmpty && typeof rawDate.content === "number" ? localKey(new Date(rawDate.content)) : "";
        if (!date) continue;
        const rawType = typeKey ? row.cells[typeKey]?.select?.content : undefined;
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
        series.points.push({ date, value, ageMonths: ageMonthsAt(m?.birthday, date) });
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

/** WHO 参考带按月龄线性插值；性别未知或超出 0–60 月 → null（参考带不外推） */
export function whoBand(sex: WhoSex | undefined, metric: GrowthMetric, ageMonths: number): WhoBandPoint | null {
    const table = sex ? WHO_REFS[sex]?.[metric] : undefined;
    if (!table || !Number.isFinite(ageMonths) || ageMonths < 0 || ageMonths > 60) return null;
    const lo = Math.floor(ageMonths);
    const hi = Math.min(lo + 1, 60);
    const frac = ageMonths - lo;
    const at = (arr: number[]) => arr[lo] + (arr[hi] - arr[lo]) * frac;
    return { p3: at(table.p3), p15: at(table.p15), p50: at(table.p50), p85: at(table.p85), p97: at(table.p97) };
}
