import { describe, it, expect } from "vitest";
import {
    assessBloodPressure,
    assessBloodGlucose,
    assessReading,
    summarizeVitals,
    formatVitalsReportText,
    type VitalReading,
} from "@/core/vitals";

describe("core/vitals 生理指标趋势与异常评定（314 波，G5）", () => {
    describe("assessBloodPressure", () => {
        it("正常血压", () => {
            expect(assessBloodPressure(115, 75)).toMatchObject({ level: "normal", isAbnormal: false });
        });
        it("正常高值", () => {
            expect(assessBloodPressure(130, 85)).toMatchObject({ level: "elevated", isAbnormal: false });
        });
        it("高血压", () => {
            expect(assessBloodPressure(145, 92)).toMatchObject({ level: "high", isAbnormal: true });
            expect(assessBloodPressure(150, 80)).toMatchObject({ level: "high", isAbnormal: true });
        });
        it("偏低", () => {
            expect(assessBloodPressure(85, 55)).toMatchObject({ level: "low", isAbnormal: true });
        });
    });

    describe("assessBloodGlucose", () => {
        it("空腹血糖（正常/受损/偏高）", () => {
            expect(assessBloodGlucose(5.2)).toMatchObject({ level: "normal", isAbnormal: false });
            expect(assessBloodGlucose(6.5)).toMatchObject({ level: "elevated", isAbnormal: false });
            expect(assessBloodGlucose(7.5)).toMatchObject({ level: "high", isAbnormal: true });
        });
        it("餐后血糖", () => {
            expect(assessBloodGlucose(6.8, true)).toMatchObject({ level: "normal", isAbnormal: false });
            expect(assessBloodGlucose(8.5, true)).toMatchObject({ level: "elevated", isAbnormal: false });
            expect(assessBloodGlucose(12.0, true)).toMatchObject({ level: "high", isAbnormal: true });
        });
    });

    describe("summarizeVitals", () => {
        const bpReadings: VitalReading[] = [
            { date: "2026-10-01", type: "bp", val1: 120, val2: 80 },
            { date: "2026-10-05", type: "bp", val1: 145, val2: 95 },
            { date: "2026-10-10", type: "bp", val1: 118, val2: 78 },
        ];

        it("汇总血压均值、极值与异常计数", () => {
            const s = summarizeVitals(bpReadings, "bp");
            expect(s.total).toBe(3);
            expect(s.avg1).toBe(127.7);
            expect(s.avg2).toBe(84.3);
            expect(s.min1).toBe(118);
            expect(s.max1).toBe(145);
            expect(s.abnormalCount).toBe(1);
            expect(s.latest?.date).toBe("2026-10-10");
        });

        it("空数据稳健返回零值", () => {
            const s = summarizeVitals([], "bp");
            expect(s.total).toBe(0);
            expect(s.avg1).toBe(0);
        });
    });

    describe("formatVitalsReportText", () => {
        it("格式化可读简报", () => {
            const readings: VitalReading[] = [
                { date: "2026-10-05", type: "bp", val1: 145, val2: 95 },
            ];
            const text = formatVitalsReportText(summarizeVitals(readings, "bp"));
            expect(text).toContain("家庭血压监测趋势简报");
            expect(text).toContain("145/95 mmHg");
            expect(text).toContain("异常读数：1 次");
        });

        it("空记录给出空态", () => {
            expect(formatVitalsReportText(summarizeVitals([], "bg"))).toBe("暂无血糖记录。");
        });
    });
});
