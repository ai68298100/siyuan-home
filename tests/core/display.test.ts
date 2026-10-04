/**
 * 提醒展示合并非测（第一百七十九波）：同键合并、首现序、无成员独立、单条不合并。
 */
import { describe, it, expect } from "vitest";
import { buildDisplay } from "@/core/hub/display";
import type { Reminder } from "@/types";

const rem = (id: string, memberId: string | undefined, dueDate: string, title = id): Reminder => ({
    id, moduleId: "certs", ruleKey: "expiry", rowId: `row-${id}`,
    title, dueDate, daysLeft: 1, level: "soon",
    memberId, createdAt: "",
} as Reminder);

describe("hub.display.buildDisplay", () => {
    it("同成员同日多条 → 合并卡（首现位、items 按输入序、后续行并入）", () => {
        const out = buildDisplay([
            rem("a", "m1", "2026-10-10", "甲"),
            rem("b", "m1", "2026-10-10", "乙"),
            rem("c", "m1", "2026-10-10", "丙"),
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].merged).toBe(true);
        if (out[0].merged) {
            expect(out[0].key).toBe("m1|2026-10-10");
            expect(out[0].items.map((r) => r.id)).toEqual(["a", "b", "c"]);
        }
    });

    it("无成员事项独立；单条成员事项不合并；顺序按输入首现", () => {
        const out = buildDisplay([
            rem("memo", undefined, "2026-10-10"),
            rem("solo", "m2", "2026-10-11"),
            rem("m1a", "m1", "2026-10-12"),
            rem("free", undefined, "2026-10-13"),
            rem("m1b", "m1", "2026-10-12"),
        ]);
        const kinds = out.map((e) => (e.merged ? `M:${e.items.map((x) => x.id).join("+")}` : `S:${e.row.id}`));
        expect(kinds).toEqual(["S:memo", "S:solo", "M:m1a+m1b", "S:free"]);
    });

    it("平铺形态（181 波）：key 单条=row.id、合并=merge 键；items/row 恒有值", () => {
        const out = buildDisplay([
            rem("memo", undefined, "2026-10-10"),
            rem("m1a", "m1", "2026-10-12"),
            rem("m1b", "m1", "2026-10-12"),
        ]);
        expect(out.map((e) => e.key)).toEqual(["memo", "m1|2026-10-12"]);
        for (const e of out) {
            expect(e.items.length).toBeGreaterThan(0);
            expect(e.items[0]).toBe(e.row);
            expect(typeof e.dueDate).toBe("string");
        }
        expect(out[0].merged).toBe(false);
        expect(out[1].merged).toBe(true);
    });

    it("同成员不同日期不合并", () => {
        const out = buildDisplay([rem("a", "m1", "2026-10-10"), rem("b", "m1", "2026-10-11")]);
        expect(out.every((e) => !e.merged)).toBe(true);
    });

    it("不同成员同日不合并", () => {
        const out = buildDisplay([rem("a", "m1", "2026-10-10"), rem("b", "m2", "2026-10-10")]);
        expect(out.every((e) => !e.merged)).toBe(true);
    });
});
