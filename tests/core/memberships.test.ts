import { describe, it, expect } from "vitest";
import { calculateMembershipSpending, CYCLE_TO_MONTHLY_FACTORS } from "@/core/memberships";

describe("calculateMembershipSpending (MOD-02)", () => {
    const cols = {
        name: "c-name",
        amount: "c-amount",
        cycle: "c-cycle",
        status: "c-status",
        auto_renew: "c-auto",
    };

    it("空数据或无列配置时安全返回零值", () => {
        expect(calculateMembershipSpending([])).toEqual({
            monthlyTotal: 0,
            annualTotal: 0,
            activeCount: 0,
            autoRenewCount: 0,
            topItems: [],
        });
        expect(calculateMembershipSpending([{ itemID: "r1", cells: {} }], undefined)).toEqual({
            monthlyTotal: 0,
            annualTotal: 0,
            activeCount: 0,
            autoRenewCount: 0,
            topItems: [],
        });
    });

    it("正确换算月费、年费、季费的月均与年化总支出", () => {
        const rows = [
            {
                itemID: "r1",
                cells: {
                    [cols.name]: { text: { content: "iCloud 200GB" } },
                    [cols.amount]: { number: { content: 21 } },
                    [cols.cycle]: { select: { content: "month" } },
                    [cols.status]: { select: { content: "active" } },
                    [cols.auto_renew]: { checkbox: { checked: true } },
                },
            },
            {
                itemID: "r2",
                cells: {
                    [cols.name]: { text: { content: "B站大会员" } },
                    [cols.amount]: { number: { content: 148 } },
                    [cols.cycle]: { select: { content: "year" } },
                    [cols.status]: { select: { content: "active" } },
                    [cols.auto_renew]: { checkbox: { checked: false } },
                },
            },
            {
                itemID: "r3",
                cells: {
                    [cols.name]: { text: { content: "宽带季付" } },
                    [cols.amount]: { number: { content: 300 } },
                    [cols.cycle]: { select: { content: "quarter" } },
                    [cols.status]: { select: { content: "active" } },
                    [cols.auto_renew]: { checkbox: { checked: true } },
                },
            },
        ];

        const summary = calculateMembershipSpending(rows, cols);
        // iCloud: 21 元/月
        // B站: 148 / 12 = 12.333... 元/月
        // 宽带: 300 / 3 = 100 元/月
        // 月计: 21 + 12.333... + 100 = 133.33 元/月
        // 年计: 133.33 * 12 = 1600 元/年 (21*12 + 148 + 300*4 = 252 + 148 + 1200 = 1600)
        expect(summary.activeCount).toBe(3);
        expect(summary.autoRenewCount).toBe(2);
        expect(summary.monthlyTotal).toBeCloseTo(133.33, 1);
        expect(summary.annualTotal).toBeCloseTo(1600, 0);

        // Top 排行：宽带 (100) > iCloud (21) > B站 (12.33)
        expect(summary.topItems).toHaveLength(3);
        expect(summary.topItems[0].name).toBe("宽带季付");
        expect(summary.topItems[0].monthlyCost).toBe(100);
        expect(summary.topItems[1].name).toBe("iCloud 200GB");
        expect(summary.topItems[2].name).toBe("B站大会员");
    });

    it("正确过滤已过期和已退款的非活跃项目", () => {
        const rows = [
            {
                itemID: "r1",
                cells: {
                    [cols.name]: { text: { content: "有效服务" } },
                    [cols.amount]: { number: { content: 50 } },
                    [cols.cycle]: { select: { content: "month" } },
                    [cols.status]: { select: { content: "active" } },
                },
            },
            {
                itemID: "r2",
                cells: {
                    [cols.name]: { text: { content: "已过期" } },
                    [cols.amount]: { number: { content: 50 } },
                    [cols.cycle]: { select: { content: "month" } },
                    [cols.status]: { select: { content: "m_expired" } },
                },
            },
            {
                itemID: "r3",
                cells: {
                    [cols.name]: { text: { content: "已退款" } },
                    [cols.amount]: { number: { content: 100 } },
                    [cols.cycle]: { select: { content: "month" } },
                    [cols.status]: { select: { content: "refunded" } },
                },
            },
        ];

        const summary = calculateMembershipSpending(rows, cols);
        expect(summary.activeCount).toBe(1);
        expect(summary.monthlyTotal).toBe(50);
        expect(summary.topItems).toHaveLength(1);
        expect(summary.topItems[0].name).toBe("有效服务");
    });
});
