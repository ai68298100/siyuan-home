import { describe, expect, it } from "vitest";
import { calculateSolidsObservation, buildAllergyFromFeeding } from "../../src/core/solids";

describe("calculateSolidsObservation (MOD-07 婴儿辅食 3 天观察期)", () => {
    const today = "2026-10-15";

    it("引入当天为 Day 1", () => {
        const obs = calculateSolidsObservation("2026-10-15", today);
        expect(obs.status).toBe("day1");
        expect(obs.currentDay).toBe(1);
        expect(obs.remainingDays).toBe(2);
        expect(obs.isObserving).toBe(true);
        expect(obs.dayWindows).toHaveLength(3);
        expect(obs.dayWindows[0].date).toBe("2026-10-15");
        expect(obs.dayWindows[0].isToday).toBe(true);
        expect(obs.dayWindows[1].date).toBe("2026-10-16");
        expect(obs.dayWindows[2].date).toBe("2026-10-17");
    });

    it("引入次日为 Day 2", () => {
        const obs = calculateSolidsObservation("2026-10-14", today);
        expect(obs.status).toBe("day2");
        expect(obs.currentDay).toBe(2);
        expect(obs.remainingDays).toBe(1);
        expect(obs.isObserving).toBe(true);
        expect(obs.dayWindows[0].isPast).toBe(true);
        expect(obs.dayWindows[1].isToday).toBe(true);
    });

    it("引入第 3 天为 Day 3（最后一天观察）", () => {
        const obs = calculateSolidsObservation("2026-10-13", today);
        expect(obs.status).toBe("day3");
        expect(obs.currentDay).toBe(3);
        expect(obs.remainingDays).toBe(0);
        expect(obs.isObserving).toBe(true);
        expect(obs.dayWindows[2].isToday).toBe(true);
    });

    it("超过 3 天标记为已完成（耐受通过）", () => {
        const obs = calculateSolidsObservation("2026-10-10", today);
        expect(obs.status).toBe("completed");
        expect(obs.isObserving).toBe(false);
        expect(obs.remainingDays).toBe(0);
    });

    it("未来日期为未开始", () => {
        const obs = calculateSolidsObservation("2026-10-20", today);
        expect(obs.status).toBe("future");
        expect(obs.isObserving).toBe(false);
        expect(obs.remainingDays).toBe(3);
    });
});

describe("buildAllergyFromFeeding (MOD-07 辅食过敏转入健康台账)", () => {
    it("正确构造包含过敏史分类、食材诊断与关联成员的载荷", () => {
        const payload = buildAllergyFromFeeding({
            foodName: "蛋白粉",
            reactionDate: "2026-10-15",
            symptoms: "嘴角红斑、轻微腹泻",
            memberBlockId: "member-av-item-baby",
        });
        expect(payload.name).toBe("蛋白粉过敏");
        expect(payload.category).toBe("allergy");
        expect(payload.date).toBe("2026-10-15");
        expect(payload.diagnosis).toContain("蛋白粉");
        expect(payload.note).toContain("嘴角红斑");
        expect(payload.memberBlockId).toBe("member-av-item-baby");
    });
});
