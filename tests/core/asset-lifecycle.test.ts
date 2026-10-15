import { describe, expect, it } from "vitest";
import { getAllowedStatusTransitions, isAllowedTransition } from "../../src/core/asset-lifecycle";

describe("getAllowedStatusTransitions (MOD-21 实物资产状态机契约)", () => {
    it("在用状态允许借出、送修、闲置或处置", () => {
        const trans = getAllowedStatusTransitions("inuse");
        const targets = trans.map((t) => t.target);
        expect(targets).toContain("lent");
        expect(targets).toContain("repairing");
        expect(targets).toContain("idle");
        expect(targets).toContain("disposed");
    });

    it("借出状态只允许归还在用或处置丢失", () => {
        const trans = getAllowedStatusTransitions("lent");
        const targets = trans.map((t) => t.target);
        expect(targets).toEqual(["inuse", "disposed"]);
        expect(isAllowedTransition("lent", "inuse")).toBe(true);
        expect(isAllowedTransition("lent", "repairing")).toBe(false);
    });

    it("送修状态允许修复在用或无法修复处置", () => {
        const trans = getAllowedStatusTransitions("repairing");
        const targets = trans.map((t) => t.target);
        expect(targets).toEqual(["inuse", "disposed"]);
    });

    it("已处置终态仅允许误操作恢复在用", () => {
        const trans = getAllowedStatusTransitions("disposed");
        expect(trans).toHaveLength(1);
        expect(trans[0].target).toBe("inuse");
    });
});
