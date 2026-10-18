import { describe, it, expect } from "vitest";
import { calculateAssetValuationStats, mapShoppingToAssetReal } from "@/core/valuation";
import type { AvRow } from "@/core/siyuan";
import type { RowLogs } from "@/core/rowlog";

describe("valuation.calculateAssetValuationStats（实物资产估值与净值分析）", () => {
    const cols = {
        name: "a-name",
        category: "a-cat",
        status: "a-stat",
        amount: "a-amt",
        location: "a-loc",
    };

    const makeRow = (
        id: string,
        name: string,
        amount: number,
        status = "inuse",
        category = "digital",
    ): AvRow => ({
        itemID: id,
        cells: {
            "a-name": { type: "text", text: { content: name } },
            "a-amt": { type: "number", number: { content: amount } },
            "a-stat": { type: "select", select: { content: status } },
            "a-cat": { type: "select", select: { content: category } },
        },
    });

    it("无估值流水时：最新估值默认等于购入成本，盈亏为 0", () => {
        const rows: AvRow[] = [
            makeRow("1", "笔记本电脑", 8000),
            makeRow("2", "显示器", 2000),
        ];

        const report = calculateAssetValuationStats(rows, cols);
        expect(report.totalItems).toBe(2);
        expect(report.activeItems).toBe(2);
        expect(report.totalInitialCost).toBe(10000);
        expect(report.totalCurrentValuation).toBe(10000);
        expect(report.netValuationChange).toBe(0);
        expect(report.overallChangeRate).toBe(0);
    });

    it("有估值流水时：采用最新估值计算资产升值/折旧，排除已处置项目", () => {
        const rows: AvRow[] = [
            makeRow("1", "数码相机", 10000, "inuse", "digital"),
            makeRow("2", "黄金首饰", 5000, "inuse", "jewelry"),
            makeRow("3", "已报废旧手机", 3000, "disposed", "digital"),
        ];

        const avId = "av-assets";
        const rowLogs: RowLogs = {
            [`${avId}|1`]: {
                valuations: [
                    { date: "2025-01-01", value: 8000, at: "2025-01-01T00:00:00Z" },
                    { date: "2026-06-01", value: 6000, at: "2026-06-01T00:00:00Z" }, // 最新估值：折旧至 6000 (-40%)
                ],
            },
            [`${avId}|2`]: {
                valuations: [
                    { date: "2026-01-01", value: 7000, at: "2026-01-01T00:00:00Z" }, // 升值至 7000 (+40%)
                ],
            },
        };

        const report = calculateAssetValuationStats(rows, cols, rowLogs, avId);
        expect(report.activeItems).toBe(2);
        expect(report.disposedItems).toBe(1);
        expect(report.totalInitialCost).toBe(15000); // 10000 + 5000 (不含已处置3000)
        expect(report.totalCurrentValuation).toBe(13000); // 6000 + 7000
        expect(report.netValuationChange).toBe(-2000);
        expect(report.overallChangeRate).toBe(-13.3);

        expect(report.topValuedItems[0].name).toBe("黄金首饰");
        expect(report.topValuedItems[0].currentValue).toBe(7000);
        expect(report.topValuedItems[1].name).toBe("数码相机");
        expect(report.topValuedItems[1].currentValue).toBe(6000);
    });
});

describe("valuation.mapShoppingToAssetReal（购物转实物资产建档映射）", () => {
    const shoppingCols = {
        name: "s-name",
        amount: "s-amt",
        date: "s-date",
        channel: "s-chan",
        category: "s-cat",
        member: "s-mem",
        note: "s-note",
    };

    const makeShoppingRow = (
        name: string,
        amount: number,
        category: string,
        date = "2026-10-19",
        memberId = "mem-1",
    ): AvRow => ({
        itemID: "shop-1",
        cells: {
            "s-name": { type: "text", text: { content: name } },
            "s-amt": { type: "number", number: { content: amount } },
            "s-cat": { type: "select", select: { content: category } },
            "s-date": { type: "date", date: { content: date } },
            "s-chan": { type: "text", text: { content: "京东自营" } },
            "s-mem": { type: "relation", relation: { blockIDs: [memberId] } },
            "s-note": { type: "text", text: { content: "带原装充电器" } },
        },
    });

    it("映射数码/服饰/日用品到对应实物资产推荐分类并提取字段", () => {
        const row = makeShoppingRow("iPhone 17 Pro", 8999, "digital");
        const draft = mapShoppingToAssetReal(row, shoppingCols);

        expect(draft.name).toBe("iPhone 17 Pro");
        expect(draft.amount).toBe(8999);
        expect(draft.suggestedCategory).toBe("digital");
        expect(draft.channel).toBe("京东自营");
        expect(draft.memberId).toBe("mem-1");
        expect(draft.note).toBe("带原装充电器");
    });

    it("daily 类商品智能映射为 appliance（家电/生活设备）", () => {
        const row = makeShoppingRow("戴森吸尘器", 2999, "daily");
        const draft = mapShoppingToAssetReal(row, shoppingCols);
        expect(draft.suggestedCategory).toBe("appliance");
    });
});
