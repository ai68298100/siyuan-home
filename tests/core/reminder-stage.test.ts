import { describe, it, expect } from "vitest";
import {
    stagesOf,
    currentStage,
    isWithinStages,
    stageIndexOf,
    stageBadge,
    filterByStages,
    shouldNotifyAtStage,
    markStageNotified,
    pruneStagesAbove,
    stageBadgeLabel,
    stageDescription,
    attachStageMeta,
} from "@/core/reminder-stage";

const RULE_3 = { leadDays: 60, leadStages: [60, 30, 7] };

describe("core/reminder-stage 多段提醒割点（311 波，G2）", () => {
    describe("stagesOf", () => {
        it("去重、降序、过滤非法值", () => {
            expect(stagesOf({ leadDays: 30, leadStages: [30, 60, 7, 30, -1, 0, Number.NaN] })).toEqual([60, 30, 7]);
        });

        it("无割点时回退 leadDays 单一窗口（向后兼容）", () => {
            expect(stagesOf({ leadDays: 45 })).toEqual([45]);
            expect(stagesOf({ leadDays: 0 })).toEqual([30]);
            expect(stagesOf({ leadDays: Number.NaN } as never)).toEqual([30]);
        });
    });

    describe("currentStage", () => {
        it("返回已进入的最近割点", () => {
            expect(currentStage(75, [60, 30, 7])).toBeNull();
            expect(currentStage(60, [60, 30, 7])).toBe(60);
            expect(currentStage(45, [60, 30, 7])).toBe(60);
            expect(currentStage(30, [60, 30, 7])).toBe(30);
            expect(currentStage(5, [60, 30, 7])).toBe(7);
            expect(currentStage(0, [60, 30, 7])).toBe(7);
        });

        it("逾期落在最末（最紧急）割点", () => {
            expect(currentStage(-3, [60, 30, 7])).toBe(7);
        });

        it("非法输入与空割点返回 null", () => {
            expect(currentStage(Number.NaN, [60])).toBeNull();
            expect(currentStage(10, [])).toBeNull();
        });
    });

    describe("isWithinStages / stageIndexOf", () => {
        it("窗口判定含逾期", () => {
            expect(isWithinStages(61, [60, 30, 7])).toBe(false);
            expect(isWithinStages(60, [60, 30, 7])).toBe(true);
            expect(isWithinStages(-1, [60, 30, 7])).toBe(true);
        });

        it("序号从 1 起，逾期为总段数，未进入为 0", () => {
            expect(stageIndexOf(100, [60, 30, 7])).toBe(0);
            expect(stageIndexOf(50, [60, 30, 7])).toBe(1);
            expect(stageIndexOf(20, [60, 30, 7])).toBe(2);
            expect(stageIndexOf(3, [60, 30, 7])).toBe(3);
            expect(stageIndexOf(-1, [60, 30, 7])).toBe(3);
        });
    });

    describe("stageBadge", () => {
        it("标记最紧段并提供总段数", () => {
            const b = stageBadge(5, RULE_3);
            expect(b).toMatchObject({ stage: 7, index: 3, total: 3, isUrgentStage: true });
            const far = stageBadge(45, RULE_3);
            expect(far.isUrgentStage).toBe(false);
        });
    });

    describe("filterByStages", () => {
        it("只保留窗口内条目", () => {
            const items = [{ daysLeft: 90 }, { daysLeft: 60 }, { daysLeft: 20 }, { daysLeft: -2 }];
            expect(filterByStages(items, RULE_3).map((i) => i.daysLeft)).toEqual([60, 20, -2]);
        });
    });

    describe("分段通知去重", () => {
        it("同段只提醒一次，进入下一段再提醒", () => {
            let notified: number[] = [];
            expect(shouldNotifyAtStage(45, RULE_3, notified)).toBe(true);
            notified = markStageNotified(notified, RULE_3, 45);
            expect(notified).toEqual([60]);
            expect(shouldNotifyAtStage(44, RULE_3, notified)).toBe(false);
            expect(shouldNotifyAtStage(20, RULE_3, notified)).toBe(true);
            notified = markStageNotified(notified, RULE_3, 20);
            expect(notified).toEqual([60, 30]);
        });

        it("markStageNotified 不改动入参", () => {
            const base: number[] = [];
            markStageNotified(base, RULE_3, 10);
            expect(base).toEqual([]);
        });

        it("窗口外不提醒", () => {
            expect(shouldNotifyAtStage(100, RULE_3, [])).toBe(false);
        });

        it("pruneStagesAbove 清理过期割点", () => {
            expect(pruneStagesAbove([60, 30, 7], 30)).toEqual([30, 7]);
        });
    });

    describe("文案", () => {
        it("段位徽章走 i18n，缺键回退 T{i}/{n}", () => {
            expect(stageBadgeLabel(20, RULE_3, (k) => k)).toBe("T2/3");
            const label = stageBadgeLabel(20, RULE_3, (k) => (k === "hub.stageBadge" ? "第${i}段/共${n}段" : k));
            expect(label).toBe("第2段/共3段");
        });

        it("段位说明缺键回退割点列表", () => {
            expect(stageDescription(RULE_3, (k) => k)).toBe("60 / 30 / 7");
            expect(stageDescription(RULE_3, (k) => (k === "hub.stageDesc" ? "第 ${stages} 天各提醒一次" : k)))
                .toBe("第 60 / 30 / 7 天各提醒一次");
        });

        it("窗口外不产生徽章文案", () => {
            expect(stageBadgeLabel(200, RULE_3, (k) => k)).toBe("");
        });
    });

    describe("attachStageMeta", () => {
        it("附加段位元信息且不改动原对象", () => {
            const r = { id: "a", daysLeft: 10 } as never;
            const next = attachStageMeta(r, RULE_3);
            expect(next).toMatchObject({ stageTotal: 3, stageCurrent: 30, stageIndex: 2 });
            expect((r as { stageTotal?: number }).stageTotal).toBeUndefined();
        });
    });
});
