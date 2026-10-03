/**
 * 生长曲线数据层单测（第七十四轮）：月龄计算、行收集（category/类型/成员聚合、排序、缺值跳过）。
 */
import { describe, it, expect } from "vitest";
import { ageMonthsAt, collectGrowthSeries, type GrowthRowLike } from "@/core/growth";
import type { FamilyMember } from "@/types";

const member: FamilyMember = {
    id: "m1", name: "宝宝", role: "child", birthday: "2025-01-15", avItemId: "blk-1", createdAt: "2025-01-01T00:00:00Z",
};

const row = (cells: Record<string, any>): GrowthRowLike => ({ itemID: "r", cells });

describe("growth.ageMonthsAt", () => {
    it("日历月差；不满整月截断；早于生日 → null", () => {
        expect(ageMonthsAt("2025-01-15", "2025-07-15")).toBe(6);
        expect(ageMonthsAt("2025-01-15", "2025-07-14")).toBe(5);
        expect(ageMonthsAt("2025-01-15", "2024-06-01")).toBeNull();
        expect(ageMonthsAt(undefined, "2025-07-15")).toBeNull();
        expect(ageMonthsAt("bad", "2025-07-15")).toBeNull();
    });
});

describe("growth.collectGrowthSeries", () => {
    const cols = { name: "k-name", member: "k-member", date: "k-date", category: "k-cat", metric_type: "k-type", metric_value: "k-val" };
    const cell = (v: any) => v;
    const growthRow = (date: string, value: number, type = "height", cat = "growth") =>
        row({
            "k-name": { text: { content: "体检" } },
            "k-member": { relation: { blockIDs: ["blk-1"] } },
            "k-date": { date: { isNotEmpty: true, content: new Date(`${date}T00:00:00`).getTime() } },
            "k-cat": { select: { content: cat } },
            "k-type": { select: { content: type } },
            "k-val": { number: { isNotEmpty: true, content: value } },
        });

    it("按成员×指标聚合；日期升序；月龄由生日计算", () => {
        const series = collectGrowthSeries(
            [growthRow("2025-07-15", 70), growthRow("2025-04-15", 65), growthRow("2025-10-15", 11, "weight")],
            cols, [member],
        );
        expect(series).toHaveLength(2);
        const h = series.find((s) => s.metric === "height")!;
        expect(h.memberName).toBe("宝宝");
        expect(h.points.map((p) => p.value)).toEqual([65, 70]);
        expect(h.points[1].ageMonths).toBe(6);
        const w = series.find((s) => s.metric === "weight")!;
        expect(w.points[0].value).toBe(11);
    });

    it("非 growth 类别与缺值行跳过；metric_type 缺省按身高", () => {
        const series = collectGrowthSeries(
            [
                growthRow("2025-07-15", 70, "", "vaccine_p"),
                row({ "k-member": { relation: { blockIDs: ["blk-1"] } }, "k-date": { date: { isNotEmpty: true, content: new Date("2025-07-15T00:00:00").getTime() } }, "k-cat": { select: { content: "growth" } }, "k-type": {}, "k-val": { number: { isNotEmpty: false } } }),
                growthRow("2025-08-15", 71, ""),
            ],
            cols, [member],
        );
        expect(series).toHaveLength(1);
        expect(series[0].metric).toBe("height");
        expect(series[0].points).toHaveLength(1);
    });

    it("无关成员关系 → unassigned 组；无 date 列 → 空数组", () => {
        const orphan = collectGrowthSeries([growthRow("2025-07-15", 70)], cols, []);
        expect(orphan[0].memberId).toBe("unassigned");
        expect(collectGrowthSeries([growthRow("2025-07-15", 70)], { member: "k-member" }, [member])).toEqual([]);
    });
});
