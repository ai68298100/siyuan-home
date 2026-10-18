import { describe, it, expect } from "vitest";
import { normalizeCycleCost, calculateSubscriptionStats } from "@/core/subscriptions";
import type { AvRow } from "@/core/siyuan";

describe("subscriptions.normalizeCycleCost（周期金额年化与月化折算）", () => {
    it("月付：月化为原值，年化为 12 倍", () => {
        const cost = normalizeCycleCost(30, "month");
        expect(cost.monthly).toBe(30);
        expect(cost.annual).toBe(360);
    });

    it("年付：年化为原值，月化为 1/12", () => {
        const cost = normalizeCycleCost(120, "year");
        expect(cost.monthly).toBe(10);
        expect(cost.annual).toBe(120);
    });

    it("季付：年化为 4 倍，月化为 1/3", () => {
        const cost = normalizeCycleCost(60, "quarter");
        expect(cost.monthly).toBe(20);
        expect(cost.annual).toBe(240);
    });

    it("半年付：年化为 2 倍，月化为 1/6", () => {
        const cost = normalizeCycleCost(180, "half_year");
        expect(cost.monthly).toBe(30);
        expect(cost.annual).toBe(360);
    });

    it("周付与日付折算", () => {
        const weekCost = normalizeCycleCost(10, "week");
        expect(weekCost.annual).toBe(520);
        expect(weekCost.monthly).toBe(43.33);

        const dayCost = normalizeCycleCost(1, "day");
        expect(dayCost.annual).toBe(365);
        expect(dayCost.monthly).toBe(30.42);
    });

    it("非正数或无效数值返回 0", () => {
        expect(normalizeCycleCost(0, "month")).toEqual({ monthly: 0, annual: 0 });
        expect(normalizeCycleCost(-50, "year")).toEqual({ monthly: 0, annual: 0 });
    });
});

describe("subscriptions.calculateSubscriptionStats（会员订阅台账整体分析）", () => {
    const cols = {
        name: "m-name",
        amount: "m-amt",
        cycle: "m-cyc",
        status: "m-stat",
        auto_renew: "m-auto",
        category: "m-cat",
        next_pay: "m-pay",
    };

    const makeRow = (
        id: string,
        name: string,
        amount: number,
        cycle: string,
        autoRenew: boolean,
        status = "active",
        category = "subscription",
    ): AvRow => ({
        itemID: id,
        cells: {
            "m-name": { type: "text", text: { content: name } },
            "m-amt": { type: "number", number: { content: amount } },
            "m-cyc": { type: "select", select: { content: cycle } },
            "m-stat": { type: "select", select: { content: status } },
            "m-auto": { type: "checkbox", checkbox: { checked: autoRenew } },
            "m-cat": { type: "select", select: { content: category } },
        },
    });

    it("计算有效订阅月均与年化支出，排除已过期与已退款项目", () => {
        const rows: AvRow[] = [
            makeRow("1", "iCloud 200GB", 21, "month", true),
            makeRow("2", "宽带包年", 1200, "year", false),
            makeRow("3", "已到期健身卡", 2000, "year", false, "m_expired"),
            makeRow("4", "已退款网课", 500, "quarter", false, "refunded"),
        ];

        const report = calculateSubscriptionStats(rows, cols);
        expect(report.activeCount).toBe(2);
        // iCloud: 月 21, 年 252; 宽带: 月 100, 年 1200
        expect(report.totalMonthlyCost).toBe(121);
        expect(report.totalAnnualCost).toBe(1452);
        expect(report.autoRenewCount).toBe(1);
        expect(report.autoRenewRate).toBe(50); // 1 / 2 = 50%
    });

    it("按年化开销降序排列服务项", () => {
        const rows: AvRow[] = [
            makeRow("1", "音乐会员月付", 15, "month", true), // 年化 180
            makeRow("2", "视频会员年卡", 198, "year", true), // 年化 198
        ];

        const report = calculateSubscriptionStats(rows, cols);
        expect(report.items.map((it) => it.name)).toEqual(["视频会员年卡", "音乐会员月付"]);
    });
});
