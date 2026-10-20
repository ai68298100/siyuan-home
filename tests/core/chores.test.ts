import { describe, it, expect } from "vitest";
import {
    nextAssignee,
    recordCompletion,
    buildChoreHistory,
    formatChoreHistoryText,
    normalizeCompletions,
    type ChoreRotationMember,
} from "@/core/chores";

const ROSTER: ChoreRotationMember[] = [
    { id: "m1", name: "爸爸" },
    { id: "m2", name: "妈妈" },
    { id: "m3", name: "孩子" },
];

describe("core/chores 家务轮换与完成留痕（310 波）", () => {
    describe("normalizeCompletions", () => {
        it("按日期升序、同日按 at 升序，过滤非法日期", () => {
            const out = normalizeCompletions([
                { date: "2026-10-05", memberId: "m2", at: "2026-10-05T10:00:00Z" },
                { date: "bad-date", memberId: "m1" },
                { date: "2026-10-05", memberId: "m1", at: "2026-10-05T09:00:00Z" },
                { date: "2026-10-01", memberId: "m3" },
            ]);
            expect(out.map((c) => c.memberId)).toEqual(["m3", "m1", "m2"]);
        });

        it("空输入返回空数组", () => {
            expect(normalizeCompletions(undefined)).toEqual([]);
        });
    });

    describe("nextAssignee", () => {
        it("无历史时按名单首位，且标记为到期", () => {
            const a = nextAssignee(ROSTER, [], "2026-10-20");
            expect(a.member?.id).toBe("m1");
            expect(a.round).toBe(1);
            expect(a.lastDone).toBeUndefined();
            expect(a.isDueNow).toBe(true);
        });

        it("优先选从未做过的人", () => {
            const a = nextAssignee(ROSTER, [
                { date: "2026-10-10", memberId: "m1" },
                { date: "2026-10-12", memberId: "m2" },
            ], "2026-10-20");
            expect(a.member?.id).toBe("m3");
        });

        it("全员都做过时选最久未做的人，并计算相隔天数", () => {
            const a = nextAssignee(ROSTER, [
                { date: "2026-09-01", memberId: "m1" },
                { date: "2026-10-01", memberId: "m2" },
                { date: "2026-10-15", memberId: "m3" },
            ], "2026-10-20");
            expect(a.member?.id).toBe("m1");
            expect(a.lastDone).toBe("2026-09-01");
            expect(a.daysSince).toBe(49);
            expect(a.isDueNow).toBe(true);
        });

        it("空名单稳健返回", () => {
            const a = nextAssignee([], [], "2026-10-20");
            expect(a.member).toBeNull();
            expect(a.round).toBe(1);
        });

        it("未指定成员的完成记录不影响轮换判定", () => {
            const a = nextAssignee(ROSTER, [{ date: "2026-10-01" }], "2026-10-20");
            expect(a.member?.id).toBe("m1");
            expect(a.round).toBe(2);
        });
    });

    describe("recordCompletion", () => {
        it("追加一条并保持排序，不改动入参", () => {
            const base = [{ date: "2026-10-10", memberId: "m1", at: "2026-10-10T08:00:00Z" }];
            const next = recordCompletion(base, { date: "2026-10-08", memberId: "m2" });
            expect(base).toHaveLength(1);
            expect(next).toHaveLength(2);
            expect(next[0].date).toBe("2026-10-08");
            expect(next[0].at).toBeTruthy();
        });

        it("备注可选，不写入空字符串", () => {
            const next = recordCompletion([], { date: "2026-10-20", memberId: "m1", note: "" });
            expect(next[0].note).toBeUndefined();
        });
    });

    describe("buildChoreHistory", () => {
        it("倒序输出并统计成员次数", () => {
            const h = buildChoreHistory([
                { date: "2026-10-01", memberId: "m1" },
                { date: "2026-10-05", memberId: "m1" },
                { date: "2026-10-10", memberId: "m2" },
            ], ROSTER);
            expect(h.total).toBe(3);
            expect(h.entries[0].date).toBe("2026-10-10");
            expect(h.entries[0].memberName).toBe("妈妈");
            expect(h.perMember[0]).toMatchObject({ memberId: "m1", name: "爸爸", count: 2 });
            // never-done 成员出现在名单里但 count 为 0
            expect(h.perMember.find((m) => m.memberId === "m3")?.count).toBe(0);
        });

        it("空历史返回零值", () => {
            const h = buildChoreHistory(undefined, ROSTER);
            expect(h.total).toBe(0);
            expect(h.entries).toEqual([]);
        });
    });

    describe("formatChoreHistoryText", () => {
        it("包含本轮该谁、累计次数与最近完成", () => {
            const completions = [
                { date: "2026-10-01", memberId: "m1" },
                { date: "2026-10-10", memberId: "m2" },
            ];
            const assignee = nextAssignee(ROSTER, completions, "2026-10-20");
            const text = formatChoreHistoryText("倒垃圾", assignee, buildChoreHistory(completions, ROSTER));
            expect(text).toContain("倒垃圾 · 家务轮换记录");
            expect(text).toContain("本轮该谁：孩子（从未做过）");
            expect(text).toContain("累计完成：2 次");
            expect(text).toContain("爸爸：1 次");
        });

        it("无名单时给出明确提示", () => {
            const text = formatChoreHistoryText("扫地", nextAssignee([], [], "2026-10-20"), buildChoreHistory([], []));
            expect(text).toContain("未配置轮换名单");
        });
    });
});
