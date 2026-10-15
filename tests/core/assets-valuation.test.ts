import { describe, expect, it } from "vitest";
import { calculateAssetValuation, type AssetRowData, type ValuationLogEntry } from "../../src/core/assets-valuation";

describe("calculateAssetValuation (MOD-10 家庭资产估值汇总统计)", () => {
    const realAssets: AssetRowData[] = [
        { id: "r1", name: "MacBook Pro", category: "digital", status: "inuse", amount: 15000 },
        { id: "r2", name: "戴森吸尘器", category: "appliance", status: "inuse", amount: 3500 },
        { id: "r3", name: "旧微波炉", category: "appliance", status: "disposed", amount: 800 },
        { id: "r4", name: "定制书柜", category: "furniture", status: "inuse", amount: 6000 },
    ];

    const virtualAssets: AssetRowData[] = [
        { id: "v1", name: "个人域名", category: "domain", amount: 1200 },
    ];

    it("正确计算实物与虚拟资产总额并排除已处置资产", () => {
        const res = calculateAssetValuation(realAssets, virtualAssets);
        // r1(15000) + r2(3500) + r4(6000) = 24500
        expect(res.totalRealValuation).toBe(24500);
        // v1(1200) = 1200
        expect(res.totalVirtualValuation).toBe(1200);
        // 24500 + 1200 = 25700
        expect(res.totalValuation).toBe(25700);
        expect(res.activeItemCount).toBe(4);
        expect(res.disposedItemCount).toBe(1);
    });

    it("支持 rowlog 最新估值快照覆盖原购置金额", () => {
        const logs: Record<string, ValuationLogEntry[]> = {
            r1: [
                { amount: 14000, at: "2025-01-01" },
                { amount: 11000, at: "2026-01-01" }, // 最新折旧估值
            ],
        };
        const res = calculateAssetValuation(realAssets, virtualAssets, logs);
        // r1 使用 11000: 11000 + 3500 + 6000 = 20500
        expect(res.totalRealValuation).toBe(20500);
        expect(res.totalValuation).toBe(21700);
        expect(res.topAssets[0].amount).toBe(11000);
    });

    it("兼容 rowlog 的 value/date 估值快照形态", () => {
        const res = calculateAssetValuation(realAssets, [], {
            r2: [
                { value: 2100, date: "2026-09-01", at: "2026-09-01T08:00:00.000Z" },
                { value: 2800, date: "2026-06-01", at: "2026-06-01T08:00:00.000Z" },
            ],
        });
        expect(res.totalRealValuation).toBe(15000 + 2100 + 6000);
        expect(res.topAssets.find((item) => item.name === "戴森吸尘器")?.amount).toBe(2100);
    });

    it("分类占比与高价值资产排行", () => {
        const res = calculateAssetValuation(realAssets, virtualAssets);
        expect(res.topAssets).toHaveLength(4);
        expect(res.topAssets[0].name).toBe("MacBook Pro");
        expect(res.topAssets[1].name).toBe("定制书柜");
        expect(res.byCategory[0].category).toBe("digital");
        expect(res.byCategory[0].percentage).toBeGreaterThan(0);
    });

    it("空资产列表安全返回零值，不产生 NaN", () => {
        const res = calculateAssetValuation([], []);
        expect(res.totalValuation).toBe(0);
        expect(res.totalRealValuation).toBe(0);
        expect(res.activeItemCount).toBe(0);
        expect(res.byCategory).toHaveLength(0);
        expect(res.topAssets).toHaveLength(0);
    });
});
