import { describe, it, expect } from "vitest";
import {
    buildFuelingLog,
    buildVitalLog,
    buildChoreLog,
} from "@/core/quick-actions";

describe("core/quick-actions 快速生活流水纯函数", () => {
    it("构建加油流水对象", () => {
        const log = buildFuelingLog({
            date: "2026-10-21",
            amount: 320,
            mileage: 45000,
            liters: 42.5,
            fuelType: "gasoline",
            note: "中石化95#",
        });
        expect(log.date).toBe("2026-10-21");
        expect(log.cost).toBe(320);
        expect(log.odometer).toBe(45000);
        expect(log.liters).toBe(42.5);
        expect(log.category).toBe("gasoline");
        expect(log.note).toBe("中石化95#");
        expect(log.at).toBeDefined();
    });

    it("构建血压读数流水对象", () => {
        const log = buildVitalLog({
            date: "2026-10-21",
            time: "08:30",
            metricType: "bp",
            systolic: 124,
            diastolic: 82,
            pulse: 72,
        });
        expect(log.date).toBe("2026-10-21");
        expect(log.time).toBe("08:30");
        expect(log.systolic).toBe(124);
        expect(log.diastolic).toBe(82);
        expect(log.pulse).toBe(72);
        expect(log.glucose).toBeUndefined();
    });

    it("构建血糖读数流水对象", () => {
        const log = buildVitalLog({
            date: "2026-10-21",
            metricType: "glucose",
            glucose: 5.6,
            glucoseTiming: "fasting",
        });
        expect(log.glucose).toBe(5.6);
        expect(log.glucoseTiming).toBe("fasting");
        expect(log.systolic).toBeUndefined();
    });

    it("构建家务打卡记录对象", () => {
        const log = buildChoreLog({
            date: "2026-10-21",
            memberId: "m1",
            memberName: "驴宝宝",
            choreTitle: "全屋扫地拖地",
            points: 5,
            note: "打扫得很干净",
        });
        expect(log.date).toBe("2026-10-21");
        expect(log.memberId).toBe("m1");
        expect(log.memberName).toBe("驴宝宝");
        expect(log.choreTitle).toBe("全屋扫地拖地");
        expect(log.points).toBe(5);
        expect(log.note).toBe("打扫得很干净");
    });
});
