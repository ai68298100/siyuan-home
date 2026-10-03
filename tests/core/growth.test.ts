/**
 * 生长曲线数据层单测（第七十四轮）：月龄计算、行收集（category/类型/成员聚合、排序、缺值跳过）。
 * 第七十七轮：WHO 参考带插值（锚点对照 WHO 公布值、月龄线性、越界与未知性别、带内单调性）。
 */
import { describe, it, expect } from "vitest";
import { ageMonthsAt, collectGrowthSeries, whoBand, type GrowthRowLike } from "@/core/growth";
import { WHO_REFS } from "@/core/data/who-refs";
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

describe("growth.whoBand（WHO 参考带）", () => {
    it("锚点对照 WHO 公布值（出生/12 月）", () => {
        expect(whoBand("male", "weight", 0)).toMatchObject({ p3: 2.5, p50: 3.3, p97: 4.3 });
        expect(whoBand("male", "height", 0)!.p50).toBe(49.9);
        expect(whoBand("female", "height", 12)!.p50).toBe(74);
        expect(whoBand("female", "weight", 0)!.p50).toBe(3.2);
        expect(whoBand("male", "weight", 12)).toMatchObject({ p3: 7.8, p50: 9.6, p97: 11.8 });
    });

    it("月龄线性插值：整月取表值，半月在相邻月间取中点", () => {
        const t = WHO_REFS.male.weight;
        expect(whoBand("male", "weight", 5.5)!.p50).toBe((t.p50[5] + t.p50[6]) / 2);
        expect(whoBand("male", "weight", 5)!.p50).toBe(t.p50[5]);
        expect(whoBand("male", "weight", 60)).not.toBeNull();
    });

    it("性别未知或超出 0–60 月 → null（不外推）", () => {
        expect(whoBand(undefined, "weight", 6)).toBeNull();
        expect(whoBand("male", "weight", -0.5)).toBeNull();
        expect(whoBand("male", "weight", 60.5)).toBeNull();
        expect(whoBand("male", "weight", NaN)).toBeNull();
    });

    it("全表不变式：p3 ≤ p15 ≤ p50 ≤ p85 ≤ p97（2 性别 × 2 指标 × 61 月）", () => {
        for (const sex of ["male", "female"] as const) {
            for (const metric of ["height", "weight"] as const) {
                const t = WHO_REFS[sex][metric];
                for (let m = 0; m <= 60; m++) {
                    expect(t.p3[m]).toBeLessThanOrEqual(t.p15[m]);
                    expect(t.p15[m]).toBeLessThanOrEqual(t.p50[m]);
                    expect(t.p50[m]).toBeLessThanOrEqual(t.p85[m]);
                    expect(t.p85[m]).toBeLessThanOrEqual(t.p97[m]);
                }
            }
        }
    });
});
