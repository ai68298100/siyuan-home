import { describe, it, expect } from "vitest";
import {
    isPickupDay,
    nextWastePickups,
    formatWasteScheduleText,
    DEFAULT_WASTE_RULES,
    type WasteRule,
} from "@/core/waste-schedule";

describe("core/waste-schedule 市政与垃圾分类回收日程（316波）", () => {
    describe("isPickupDay 规则匹配", () => {
        it("weekly 每周固定日匹配", () => {
            const rule: WasteRule = { type: "recyclable", label: "可回收", pattern: "weekly", daysOfWeek: [6] }; // 周六
            expect(isPickupDay(rule, "2026-10-24")).toBe(true);  // 2026-10-24 是周六
            expect(isPickupDay(rule, "2026-10-25")).toBe(false); // 2026-10-25 是周日
        });

        it("biweekly 隔周 14 天周期匹配", () => {
            const rule: WasteRule = { type: "bulky", label: "大件垃圾", pattern: "biweekly", anchorDate: "2026-10-06" };
            expect(isPickupDay(rule, "2026-10-06")).toBe(true);
            expect(isPickupDay(rule, "2026-10-20")).toBe(true); // +14 天
            expect(isPickupDay(rule, "2026-10-13")).toBe(false); // +7 天（非隔周）
        });

        it("monthly_day 每月固定某日匹配", () => {
            const rule: WasteRule = { type: "hazardous", label: "有害垃圾", pattern: "monthly_day", dayOfMonth: 15 };
            expect(isPickupDay(rule, "2026-10-15")).toBe(true);
            expect(isPickupDay(rule, "2026-10-16")).toBe(false);
        });

        it("last_weekday 当月最后一个周几匹配", () => {
            // 2026 年 10 月共 31 天。10-30 是最后一个周五，10-23 是倒数第二个周五
            const rule: WasteRule = { type: "hazardous", label: "有害垃圾", pattern: "last_weekday", lastWeekday: 5 };
            expect(isPickupDay(rule, "2026-10-30")).toBe(true);
            expect(isPickupDay(rule, "2026-10-23")).toBe(false);
            expect(isPickupDay(rule, "2026-10-31")).toBe(false);
        });

        it("非法日期与未配置参数稳健返回 false", () => {
            const rule: WasteRule = { type: "kitchen", label: "厨余", pattern: "weekly" };
            expect(isPickupDay(rule, "invalid-date")).toBe(false);
            expect(isPickupDay(rule, "2026-10-20")).toBe(false);
        });
    });

    describe("nextWastePickups", () => {
        it("推算未来窗口期内的清运事项并正确标记今天与明天", () => {
            // 设基准日为 2026-10-20（周二）
            const rules: WasteRule[] = [
                { type: "residual", label: "其他垃圾", pattern: "weekly", daysOfWeek: [2, 3] }, // 周二(今天), 周三(明天)
                { type: "recyclable", label: "可回收物", pattern: "weekly", daysOfWeek: [6] },  // 周六 (2026-10-24, 4天后)
            ];

            const pickups = nextWastePickups(rules, "2026-10-20", 7);
            expect(pickups.length).toBeGreaterThanOrEqual(3);

            const todayItem = pickups.find((p) => p.date === "2026-10-20");
            expect(todayItem).toBeDefined();
            expect(todayItem?.isToday).toBe(true);
            expect(todayItem?.daysLeft).toBe(0);

            const tomorrowItem = pickups.find((p) => p.date === "2026-10-21");
            expect(tomorrowItem?.isTomorrow).toBe(true);
            expect(tomorrowItem?.daysLeft).toBe(1);

            const satItem = pickups.find((p) => p.date === "2026-10-24");
            expect(satItem?.daysLeft).toBe(4);
            expect(satItem?.label).toBe("可回收物");
        });

        it("空规则返回空数组", () => {
            expect(nextWastePickups([], "2026-10-20")).toEqual([]);
        });

        it("默认规则模板正常产出", () => {
            const defaultPickups = nextWastePickups(DEFAULT_WASTE_RULES, "2026-10-20", 7);
            expect(defaultPickups.length).toBeGreaterThan(0);
        });
    });

    describe("formatWasteScheduleText", () => {
        it("按日期聚类输出格式化清运时间表", () => {
            const pickups = [
                { date: "2026-10-20", type: "residual" as const, label: "其他垃圾", daysLeft: 0, isToday: true, isTomorrow: false },
                { date: "2026-10-20", type: "kitchen" as const, label: "厨余垃圾", daysLeft: 0, isToday: true, isTomorrow: false },
                { date: "2026-10-21", type: "residual" as const, label: "其他垃圾", daysLeft: 1, isToday: false, isTomorrow: true },
            ];
            const text = formatWasteScheduleText(pickups, "2026-10-20");
            expect(text).toContain("家庭垃圾分类清运日程");
            expect(text).toContain("2026-10-20 【今天】：其他垃圾、厨余垃圾");
            expect(text).toContain("2026-10-21 【明天】：其他垃圾");
        });

        it("无排期时给出友好空态", () => {
            expect(formatWasteScheduleText([])).toBe("未来两周内无垃圾回收排期。");
        });
    });
});
