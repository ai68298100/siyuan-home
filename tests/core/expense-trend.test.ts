import { describe, it, expect } from "vitest";
import {
    toMonthKey,
    calculateExpenseTrend,
    formatExpenseTrendReport,
    type ExpenseEntry,
} from "@/core/expense-trend";

describe("core/expense-trend 家庭支出趋势与异常波动监测（305波）", () => {
    describe("toMonthKey", () => {
        it("支持 YYYY-MM 与 YYYY-MM-DD 两种格式", () => {
            expect(toMonthKey("2026-10-20")).toBe("2026-10");
            expect(toMonthKey("2026-3")).toBe("2026-03");
            expect(toMonthKey("2026-03-01")).toBe("2026-03");
        });

        it("非法输入返回空串", () => {
            expect(toMonthKey("")).toBe("");
            expect(toMonthKey("not-a-date")).toBe("");
        });
    });

    describe("calculateExpenseTrend", () => {
        const entries: ExpenseEntry[] = [
            { date: "2026-01-05", amount: 1000 },
            { date: "2026-01-20", amount: 500 },
            { date: "2026-02-10", amount: 1500 },
            { date: "2026-03-15", amount: 1600 },
            { date: "2026-04-01", amount: 1200 },
        ];

        it("正确按月汇总并统计笔数", () => {
            const r = calculateExpenseTrend(entries);
            expect(r.months).toHaveLength(4);
            expect(r.months[0]).toEqual({ month: "2026-01", total: 1500, count: 2 });
            expect(r.totalAll).toBe(5800);
            expect(r.average).toBe(1450);
        });

        it("计算最近月环比", () => {
            const r = calculateExpenseTrend(entries);
            // 2026-04 1200 vs 2026-03 1600 => -25%
            expect(r.latestMoM).toBe(-25);
        });

        it("中位数与全年预测", () => {
            const r = calculateExpenseTrend(entries);
            // 月份总额排序：1200/1500/1500(? ) —— 实为 1500/1500/1600/1200
            expect(r.median).toBe(1500);
            // 近三个月 1500/1600/1200 均值 1433.33 × 12
            expect(r.yearlyForecast).toBe(17200);
        });

        it("识别突增月份（超过中位数 50%）", () => {
            const spikey: ExpenseEntry[] = [
                { date: "2026-01", amount: 1000 },
                { date: "2026-02", amount: 1000 },
                { date: "2026-03", amount: 1000 },
                { date: "2026-04", amount: 3000 },
            ];
            const r = calculateExpenseTrend(spikey);
            expect(r.spikes).toHaveLength(1);
            expect(r.spikes[0].month).toBe("2026-04");
            expect(r.spikes[0].overflowPct).toBe(200);
        });

        it("不足 3 个月不做突增判定", () => {
            const r = calculateExpenseTrend([
                { date: "2026-01", amount: 100 },
                { date: "2026-02", amount: 900 },
            ]);
            expect(r.spikes).toHaveLength(0);
        });

        it("过滤无效金额与非法日期，空数组稳健返回", () => {
            const r = calculateExpenseTrend([
                { date: "2026-01", amount: -5 },
                { date: "bad", amount: 100 },
                { date: "2026-02", amount: Number.NaN },
            ]);
            expect(r.months).toHaveLength(0);
            expect(r.totalAll).toBe(0);
            expect(r.latestMoM).toBeNull();

            const empty = calculateExpenseTrend([]);
            expect(empty.months).toEqual([]);
            expect(empty.median).toBe(0);
        });

        it("monthsWindow 限制返回月份数", () => {
            const many: ExpenseEntry[] = Array.from({ length: 20 }, (_, i) => ({
                date: `2026-${String((i % 12) + 1).padStart(2, "0")}`,
                amount: 100 + i,
            }));
            const r = calculateExpenseTrend(many, { monthsWindow: 3 });
            expect(r.months).toHaveLength(3);
        });
    });

    describe("formatExpenseTrendReport", () => {
        it("输出可读摘要与明细", () => {
            const r = calculateExpenseTrend([
                { date: "2026-01", amount: 1000 },
                { date: "2026-02", amount: 1200 },
            ]);
            const text = formatExpenseTrendReport(r);
            expect(text).toContain("家庭支出趋势分析");
            expect(text).toContain("2026-01");
            expect(text).toContain("累计支出：2200元");
            expect(text).toContain("未发现显著异常突增");
        });

        it("空数据给出空态提示", () => {
            expect(formatExpenseTrendReport(calculateExpenseTrend([]))).toBe("暂无可用支出记录。");
        });
    });
});
