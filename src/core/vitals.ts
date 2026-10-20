/**
 * 家庭健康生理指标趋势（314 波，G5）：
 * 血压（收缩压/舒张压）、空腹/餐后血糖、心率等健康读数的时间序列汇总与异常分级。
 * 纯函数，无网络，100% 可单元测试。
 */

export type VitalType = "bp" | "bg" | "hr";

export interface VitalReading {
    date: string;
    type: VitalType;
    /** 血压：收缩压（高压）；血糖/心率：具体数值 */
    val1: number;
    /** 血压：舒张压（低压）；血糖：餐前/餐后标记（0=空腹/1=餐后2h）；心率不填 */
    val2?: number;
    at?: string;
    note?: string;
}

export interface VitalAssessment {
    level: "normal" | "elevated" | "high" | "low";
    label: string;
    isAbnormal: boolean;
}

export interface VitalSummary {
    type: VitalType;
    total: number;
    latest?: VitalReading;
    latestAssessment?: VitalAssessment;
    avg1: number;
    avg2?: number;
    min1: number;
    max1: number;
    abnormalCount: number;
}

/** 血压判定（依据中国高血压防治指南标准：收缩压 <120 且 舒张压 <80 正常；≥140 或 ≥90 高血压） */
export function assessBloodPressure(systolic: number, diastolic: number): VitalAssessment {
    if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
        return { level: "normal", label: "未知", isAbnormal: false };
    }
    if (systolic >= 140 || diastolic >= 90) {
        return { level: "high", label: "高血压（≥140/90）", isAbnormal: true };
    }
    if (systolic >= 120 || diastolic >= 80) {
        return { level: "elevated", label: "正常高值（120-139/80-89）", isAbnormal: false };
    }
    if (systolic < 90 || diastolic < 60) {
        return { level: "low", label: "偏低（<90/60）", isAbnormal: true };
    }
    return { level: "normal", label: "正常（<120/80）", isAbnormal: false };
}

/** 血糖判定（空腹 3.9-6.1 正常，≥7.0 偏高；餐后 3.9-7.8 正常，≥11.1 偏高） */
export function assessBloodGlucose(value: number, isPostMeal = false): VitalAssessment {
    if (!Number.isFinite(value)) return { level: "normal", label: "未知", isAbnormal: false };
    if (value < 3.9) return { level: "low", label: "偏低（<3.9）", isAbnormal: true };
    if (!isPostMeal) {
        if (value >= 7.0) return { level: "high", label: "空腹偏高（≥7.0）", isAbnormal: true };
        if (value > 6.1) return { level: "elevated", label: "空腹受损（6.1-6.9）", isAbnormal: false };
        return { level: "normal", label: "空腹正常（3.9-6.1）", isAbnormal: false };
    }
    if (value >= 11.1) return { level: "high", label: "餐后偏高（≥11.1）", isAbnormal: true };
    if (value > 7.8) return { level: "elevated", label: "糖耐量受损（7.8-11.0）", isAbnormal: false };
    return { level: "normal", label: "餐后正常（3.9-7.8）", isAbnormal: false };
}

/** 单次读数评定 */
export function assessReading(r: VitalReading): VitalAssessment {
    if (r.type === "bp") return assessBloodPressure(r.val1, r.val2 ?? 80);
    if (r.type === "bg") return assessBloodGlucose(r.val1, r.val2 === 1);
    // 心率（60-100 次/分正常）
    if (r.val1 < 60) return { level: "low", label: "心动过缓（<60）", isAbnormal: true };
    if (r.val1 > 100) return { level: "high", label: "心动过速（>100）", isAbnormal: true };
    return { level: "normal", label: "正常（60-100）", isAbnormal: false };
}

/** 汇总某类型的历史趋势（按日期升序） */
export function summarizeVitals(readings: VitalReading[], type: VitalType): VitalSummary {
    const list = (readings ?? [])
        .filter((r) => r && r.type === type && Number.isFinite(r.val1) && r.val1 > 0)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.at ?? "").localeCompare(b.at ?? ""));

    if (list.length === 0) {
        return { type, total: 0, avg1: 0, min1: 0, max1: 0, abnormalCount: 0 };
    }

    const val1s = list.map((r) => r.val1);
    const sum1 = val1s.reduce((s, v) => s + v, 0);
    const avg1 = Math.round((sum1 / list.length) * 10) / 10;
    const min1 = Math.min(...val1s);
    const max1 = Math.max(...val1s);

    let avg2: number | undefined;
    if (type === "bp") {
        const val2s = list.map((r) => r.val2 ?? 0).filter((v) => v > 0);
        if (val2s.length > 0) {
            avg2 = Math.round((val2s.reduce((s, v) => s + v, 0) / val2s.length) * 10) / 10;
        }
    }

    let abnormalCount = 0;
    for (const r of list) {
        if (assessReading(r).isAbnormal) abnormalCount++;
    }

    const latest = list[list.length - 1];
    return {
        type,
        total: list.length,
        latest,
        latestAssessment: latest ? assessReading(latest) : undefined,
        avg1,
        avg2,
        min1,
        max1,
        abnormalCount,
    };
}

/** 格式化指标简报为文本 */
export function formatVitalsReportText(summary: VitalSummary): string {
    const typeLabel = summary.type === "bp" ? "血压" : summary.type === "bg" ? "血糖" : "心率";
    const unit = summary.type === "bp" ? "mmHg" : summary.type === "bg" ? "mmol/L" : "bpm";

    if (summary.total === 0) return `暂无${typeLabel}记录。`;

    const lines: string[] = [
        `💓 家庭${typeLabel}监测趋势简报（${summary.total} 次读数）`,
    ];
    if (summary.latest) {
        const valStr = summary.avg2 !== undefined ? `${summary.latest.val1}/${summary.latest.val2}` : String(summary.latest.val1);
        lines.push(`最新读数：${summary.latest.date} · ${valStr} ${unit}（${summary.latestAssessment?.label ?? "—"}）`);
    }
    const avgStr = summary.avg2 !== undefined ? `${summary.avg1}/${summary.avg2}` : String(summary.avg1);
    lines.push(`平均水平：${avgStr} ${unit}`);
    lines.push(`读数区间：${summary.min1} ~ ${summary.max1} ${unit}`);
    if (summary.abnormalCount > 0) {
        lines.push(`⚠️ 异常读数：${summary.abnormalCount} 次，请持续关注`);
    } else {
        lines.push("🟢 所有读数均处于平稳范围");
    }
    return lines.join("\n");
}
