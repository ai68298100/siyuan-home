import { describe, it, expect } from "vitest";
import {
    evaluateBudgetUsage,
    detectBudgetOverflow,
    formatBudgetLimitReport,
    type ExpenseRowInput,
} from "@/core/budget-limit";

const ENTRIES: ExpenseRowInput[] = [
    { date: "2026-10-02", amount: 1200, category: "food_sh" },
    { date: "2026-10-05", amount: 850, category: "food_sh" },
    { date: "2026-10-10", amount: 500, category: "daily" },
    { date: "2026-10-15", amount: 300, category: "entertainment" },
    { date: "2026-09-20", amount: 2000, category: "food_sh" }, // 往月，应被过滤
];

const LIMITS: Record<string, number> = {
    food_sh: 2000, // 已支出 2050 -> exceeded
    daily: 600,    // 已支出 500 -> 83.3% -> warning
    clothing: 800, // 已支出 0 -> safe
};

describe("core/budget-limit 家庭月度预算分类限额与超限告警（315波）", () => {
    describe("evaluateBudgetUsage", () => {
        it("正确聚合目标月份支出并计算限额比例", () => {
            const res = evaluateBudgetUsage(ENTRIES, LIMITS, "2026-10");
            expect(res.month).toBe("2026-10");
            expect(res.totalSpent).toBe(2850);
            expect(res.totalLimit).toBe(3400);

            const food = res.categories.find((c) => c.category === "food_sh")!;
            expect(food).toBeDefined();
            expect(food.spent).toBe(2050);
            expect(food.limit).toBe(2000);
            expect(food.ratio).toBe(1.02);
            expect(food.overflow).toBe(50);
            expect(food.status).toBe("exceeded");

            const daily = res.categories.find((c) => c.category === "daily")!;
            expect(daily.spent).toBe(500);
            expect(daily.limit).toBe(600);
            expect(daily.ratio).toBe(0.83);
            expect(daily.status).toBe("warning");
            expect(daily.remaining).toBe(100);

            const clothing = res.categories.find((c) => c.category === "clothing")!;
            expect(clothing.spent).toBe(0);
            expect(clothing.status).toBe("safe");

            // 无限额但有支出的项
            const ent = res.categories.find((c) => c.category === "entertainment")!;
            expect(ent.spent).toBe(300);
            expect(ent.limit).toBe(0);
            expect(ent.status).toBe("safe");
        });

        it("统计预警数与超支数", () => {
            const res = evaluateBudgetUsage(ENTRIES, LIMITS, "2026-10");
            expect(res.exceededCount).toBe(1);
            expect(res.warningCount).toBe(1);
        });

        it("空数据或无效数据稳健返回", () => {
            const res = evaluateBudgetUsage([], {}, "2026-10");
            expect(res.totalSpent).toBe(0);
            expect(res.totalLimit).toBe(0);
            expect(res.categories).toEqual([]);
            expect(res.overallStatus).toBe("safe");
        });
    });

    describe("detectBudgetOverflow", () => {
        it("快速提取超限与预警分类", () => {
            const issues = detectBudgetOverflow(ENTRIES, LIMITS, "2026-10");
            expect(issues.hasIssues).toBe(true);
            expect(issues.exceeded).toHaveLength(1);
            expect(issues.exceeded[0].category).toBe("food_sh");
            expect(issues.warnings).toHaveLength(1);
            expect(issues.warnings[0].category).toBe("daily");
        });

        it("无问题时返回 hasIssues = false", () => {
            const safeEntries: ExpenseRowInput[] = [{ date: "2026-10-01", amount: 100, category: "daily" }];
            const issues = detectBudgetOverflow(safeEntries, { daily: 1000 }, "2026-10");
            expect(issues.hasIssues).toBe(false);
            expect(issues.exceeded).toHaveLength(0);
            expect(issues.warnings).toHaveLength(0);
        });
    });

    describe("formatBudgetLimitReport", () => {
        it("格式化可读简报与分类状态", () => {
            const res = evaluateBudgetUsage(ENTRIES, LIMITS, "2026-10");
            const text = formatBudgetLimitReport(res, (c) => `[${c}]`);
            expect(text).toContain("家庭月度预算执行简报（2026-10）");
            expect(text).toContain("[food_sh]：2050 / 2000 元");
            expect(text).toContain("🚨 超支");
            expect(text).toContain("⚠️ 预警");
        });

        it("超支时给出告警行", () => {
            const overRes = evaluateBudgetUsage(
                [{ date: "2026-10-01", amount: 3000, category: "food" }],
                { food: 2000 },
                "2026-10",
            );
            const text = formatBudgetLimitReport(overRes);
            expect(text).toContain("🚨 整体已超支：超额 1000 元");
        });

        it("恰好达到 80% 预警与恰好达到 100% 超额边界", () => {
            const boundaryEntries = [
                { date: "2026-10-01", amount: 800, category: "warning_cat" },
                { date: "2026-10-02", amount: 1000, category: "exact_cat" },
            ];
            const res = evaluateBudgetUsage(boundaryEntries, { warning_cat: 1000, exact_cat: 1000 }, "2026-10");
            const w = res.categories.find((c) => c.category === "warning_cat")!;
            expect(w.status).toBe("warning");
            expect(w.ratio).toBe(0.8);

            const e = res.categories.find((c) => c.category === "exact_cat")!;
            expect(e.status).toBe("exceeded");
            expect(e.ratio).toBe(1);
        });

        it("无分类或无预算限额输出空态友好提示", () => {
            const emptyRes = evaluateBudgetUsage([], {}, "2026-10");
            const text = formatBudgetLimitReport(emptyRes);
            expect(text).toContain("本月暂无支出记录或未设置分类预算限额");
        });
    });
});
