import { describe, it, expect } from "vitest";
import {
    evaluateFeedingObservation,
    findMemberAllergies,
    checkAllergyConflict,
} from "@/core/feeding";
import type { AvRow } from "@/core/siyuan";

describe("feeding.evaluateFeedingObservation（辅食 3 天观察期进度）", () => {
    it("引入当天：处于第 1/3 天观察期", () => {
        const obs = evaluateFeedingObservation("2026-10-19", "2026-10-19", 3);
        expect(obs).not.toBeNull();
        expect(obs?.status).toBe("observing");
        expect(obs?.daysElapsed).toBe(0);
        expect(obs?.observeUntil).toBe("2026-10-22");
        expect(obs?.dayProgressText).toBe("观察中（第 1/3 天）");
    });

    it("引入后第 2 天：处于第 2/3 天观察期", () => {
        const obs = evaluateFeedingObservation("2026-10-18", "2026-10-19", 3);
        expect(obs).not.toBeNull();
        expect(obs?.status).toBe("observing");
        expect(obs?.daysElapsed).toBe(1);
        expect(obs?.dayProgressText).toBe("观察中（第 2/3 天）");
    });

    it("引入满 3 天后：观察期已过", () => {
        const obs = evaluateFeedingObservation("2026-10-15", "2026-10-19", 3);
        expect(obs).not.toBeNull();
        expect(obs?.status).toBe("completed");
        expect(obs?.daysElapsed).toBe(4);
        expect(obs?.dayProgressText).toBe("观察期已过");
    });

    it("未来日期：未开始", () => {
        const obs = evaluateFeedingObservation("2026-10-25", "2026-10-19", 3);
        expect(obs).not.toBeNull();
        expect(obs?.status).toBe("future");
        expect(obs?.dayProgressText).toBe("未开始");
    });

    it("非法日期返回 null", () => {
        expect(evaluateFeedingObservation("not-a-date")).toBeNull();
    });
});

describe("feeding.findMemberAllergies & checkAllergyConflict（健康过敏史匹配）", () => {
    const healthCols = {
        name: "h-name",
        category: "h-cat",
        diagnosis: "h-diag",
        date: "h-date",
        member: "h-member",
    };

    const makeHealthRow = (
        id: string,
        name: string,
        category: string,
        opts?: { memberId?: string; diagnosis?: string; date?: string },
    ): AvRow => ({
        itemID: id,
        cells: {
            "h-name": { type: "text", text: { content: name } },
            "h-cat": { type: "select", select: { content: category } },
            "h-member": opts?.memberId ? { type: "relation", relation: { blockIDs: [opts.memberId] } } : {},
            "h-diag": opts?.diagnosis ? { type: "text", text: { content: opts.diagnosis } } : {},
            "h-date": opts?.date ? { type: "date", date: { content: opts.date } } : {},
        },
    });

    it("只筛选指定成员的 allergy 过敏史记录", () => {
        const rows: AvRow[] = [
            makeHealthRow("1", "鸡蛋黄", "allergy", { memberId: "m-baby", diagnosis: "轻度湿疹", date: "2026-05-01" }),
            makeHealthRow("2", "花生", "allergy", { memberId: "m-parent", diagnosis: "呼吸困难" }),
            makeHealthRow("3", "疫苗接种", "vaccine", { memberId: "m-baby" }),
        ];

        const babyAllergies = findMemberAllergies("m-baby", rows, healthCols);
        expect(babyAllergies).toHaveLength(1);
        expect(babyAllergies[0].name).toBe("鸡蛋黄");
        expect(babyAllergies[0].reaction).toBe("轻度湿疹");
    });

    it("食材名称冲突命中已知过敏源", () => {
        const allergies = [{ id: "1", name: "大豆", reaction: "红斑" }];
        expect(checkAllergyConflict("大豆泥辅食", allergies)?.id).toBe("1");
        expect(checkAllergyConflict("胡萝卜泥", allergies)).toBeUndefined();
    });
});
