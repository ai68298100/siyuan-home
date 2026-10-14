import { describe, it, expect } from "vitest";
import { calculateMedicineSummary, formatMedicineRestockText } from "@/core/medicine";

describe("calculateMedicineSummary (MOD-01)", () => {
    const cols = {
        name: "c-name",
        expiry: "c-exp",
        stock_qty: "c-qty",
        low_stock_at: "c-low",
        location: "c-loc",
        status: "c-status",
    };
    const today = "2026-10-15";

    it("空数据或无列配置时安全返回零值", () => {
        expect(calculateMedicineSummary([], cols, today)).toEqual({
            totalCount: 0,
            expiredCount: 0,
            expiringSoonCount: 0,
            lowStockCount: 0,
            itemsNeedingAttention: [],
        });
        expect(calculateMedicineSummary([{ itemID: "r1", cells: {} }], undefined, today)).toEqual({
            totalCount: 0,
            expiredCount: 0,
            expiringSoonCount: 0,
            lowStockCount: 0,
            itemsNeedingAttention: [],
        });
    });

    it("准确识别已过期、30天内临期与低库存药品", () => {
        const rows = [
            {
                itemID: "r1",
                cells: {
                    [cols.name]: { text: { content: "布洛芬缓释胶囊" } },
                    [cols.expiry]: { date: { content: new Date("2026-10-01T00:00:00").getTime(), isNotEmpty: true } }, // 已过期
                    [cols.stock_qty]: { number: { content: 2 } },
                    [cols.low_stock_at]: { number: { content: 1 } },
                },
            },
            {
                itemID: "r2",
                cells: {
                    [cols.name]: { text: { content: "碘伏棉棒" } },
                    [cols.expiry]: { date: { content: new Date("2026-11-01T00:00:00").getTime(), isNotEmpty: true } }, // 17天后临期
                    [cols.stock_qty]: { number: { content: 5 } },
                    [cols.low_stock_at]: { number: { content: 2 } },
                },
            },
            {
                itemID: "r3",
                cells: {
                    [cols.name]: { text: { content: "创口贴" } },
                    [cols.expiry]: { date: { content: new Date("2027-10-01T00:00:00").getTime(), isNotEmpty: true } }, // 远期
                    [cols.stock_qty]: { number: { content: 1 } }, // 低于警戒线 2
                    [cols.low_stock_at]: { number: { content: 2 } },
                },
            },
            {
                itemID: "r4",
                cells: {
                    [cols.name]: { text: { content: "奥美拉唑" } },
                    [cols.expiry]: { date: { content: new Date("2027-10-01T00:00:00").getTime(), isNotEmpty: true } },
                    [cols.stock_qty]: { number: { content: 4 } },
                    [cols.low_stock_at]: { number: { content: 1 } },
                },
            },
        ];

        const summary = calculateMedicineSummary(rows, cols, today);
        expect(summary.totalCount).toBe(4);
        expect(summary.expiredCount).toBe(1);
        expect(summary.expiringSoonCount).toBe(1);
        expect(summary.lowStockCount).toBe(1);
        expect(summary.itemsNeedingAttention).toHaveLength(3);

        const names = summary.itemsNeedingAttention.map((it) => it.name);
        expect(names).toContain("布洛芬缓释胶囊");
        expect(names).toContain("创口贴");
        expect(names).toContain("碘伏棉棒");
    });

    it("正确过滤已丢弃状态（discarded）的历史药品", () => {
        const rows = [
            {
                itemID: "r1",
                cells: {
                    [cols.name]: { text: { content: "旧药已丢弃" } },
                    [cols.expiry]: { date: { content: new Date("2025-01-01T00:00:00").getTime(), isNotEmpty: true } },
                    [cols.status]: { select: { content: "discarded" } },
                },
            },
        ];

        const summary = calculateMedicineSummary(rows, cols, today);
        expect(summary.expiredCount).toBe(0);
        expect(summary.itemsNeedingAttention).toHaveLength(0);
    });

    it("格式化补货清单文本输出", () => {
        const summary = {
            totalCount: 2,
            expiredCount: 1,
            expiringSoonCount: 0,
            lowStockCount: 1,
            itemsNeedingAttention: [
                { id: "1", name: "阿莫西林", issue: "expired" as const, expiry: "2026-09-01", suggestQty: 1 },
                { id: "2", name: "创口贴", issue: "low_stock" as const, stockQty: 1, threshold: 3, suggestQty: 3 },
            ],
        };
        const t = (k: string) => k;
        const text = formatMedicineRestockText(summary, t);
        expect(text).toContain("阿莫西林");
        expect(text).toContain("创口贴");
        expect(text).toContain("建议补齐 3");
    });
});
