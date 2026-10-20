import { describe, it, expect } from "vitest";
import {
    buildTimelineInsight,
    formatTimelineInsight,
    type InsightRecord,
} from "@/core/timeline-insight";

const rec = (
    id: string,
    moduleId: string,
    date: string,
    memberId?: string,
): InsightRecord => ({ id, moduleId, date, memberId });

describe("core/timeline-insight 家庭时间轴活跃度洞察（307波）", () => {
    const sample: InsightRecord[] = [
        rec("1", "certs", "2026-10-01", "m1"),
        rec("2", "certs", "2026-10-05", "m1"),
        rec("3", "medical", "2026-09-10", "m2"),
        rec("4", "shopping", "2026-10-03", "m1"),
        rec("5", "contracts", "2026-03-01", "m2"), // 窗口外（2026-10-20 前 180 天 = 2026-04-23）
        rec("6", "medicine", "2026-02-15", "m1"), // 窗口外
    ];

    describe("buildTimelineInsight", () => {
        it("仅统计窗口内记录", () => {
            const r = buildTimelineInsight(sample, { today: "2026-10-20", windowDays: 180 });
            expect(r.windowStart).toBe("2026-04-23");
            expect(r.windowEnd).toBe("2026-10-20");
            expect(r.total).toBe(4);
        });

        it("模块与成员活跃度排序", () => {
            const r = buildTimelineInsight(sample, { today: "2026-10-20" });
            expect(r.modules[0]).toMatchObject({ moduleId: "certs", count: 2 });
            expect(r.modules.map((m) => m.moduleId)).toEqual(["certs", "medical", "shopping"]);
            expect(r.members[0]).toMatchObject({ memberId: "m1", count: 3 });
        });

        it("最活跃月份与月度分布", () => {
            const r = buildTimelineInsight(sample, { today: "2026-10-20" });
            expect(r.busiestMonth).toEqual({ month: "2026-10", count: 3 });
            expect(r.monthly).toEqual([
                { month: "2026-09", count: 1 },
                { month: "2026-10", count: 3 },
            ]);
        });

        it("按 gapDays 识别长期未更新模块（含白名单中从未记录的模块）", () => {
            const r = buildTimelineInsight(sample, {
                today: "2026-10-20",
                gapDays: 30,
                knownModules: ["certs", "medical", "allowance"],
            });
            const ids = r.gaps.map((g) => g.moduleId);
            expect(ids).toContain("medical"); // 2026-09-10 距今天数 = 40 天
            expect(ids).toContain("allowance"); // 从未记录
            expect(ids).not.toContain("certs"); // 19 天内
            const allowance = r.gaps.find((g) => g.moduleId === "allowance")!;
            expect(allowance.lastDate).toBeUndefined();
            expect(allowance.idleDays).toBeGreaterThanOrEqual(30);
        });

        it("空记录与非法日期稳健处理", () => {
            const r = buildTimelineInsight(
                [rec("x", "certs", "not-a-date"), rec("y", "certs", "2026-13-99")],
                { today: "2026-10-20" },
            );
            expect(r.total).toBe(0);
            expect(r.busiestMonth).toBeNull();
            expect(r.modules).toEqual([]);
        });

        it("忽略未来日期", () => {
            const r = buildTimelineInsight([rec("f", "certs", "2026-12-31")], { today: "2026-10-20" });
            expect(r.total).toBe(0);
        });
    });

    describe("formatTimelineInsight", () => {
        it("输出活跃度、成员贡献与缺口提示", () => {
            const insight = buildTimelineInsight(sample, {
                today: "2026-10-20",
                gapDays: 30,
                knownModules: ["certs", "medical", "allowance"],
            });
            const text = formatTimelineInsight(insight, (id) => `名-${id}`);
            expect(text).toContain("家庭时间轴活跃度洞察");
            expect(text).toContain("最活跃月份：2026-10（3 条）");
            expect(text).toContain("名-certs：2 条");
            expect(text).toContain("长期未更新的模块");
            expect(text).toContain("窗口内无任何记录");
        });

        it("空数据时友好提示", () => {
            const text = formatTimelineInsight(buildTimelineInsight([], { today: "2026-10-20" }));
            expect(text).toContain("窗口内暂无活动记录");
        });

        it("无缺口时给出正向反馈", () => {
            const insight = buildTimelineInsight([rec("1", "certs", "2026-10-18")], {
                today: "2026-10-20",
                gapDays: 30,
            });
            expect(formatTimelineInsight(insight)).toContain("各模块均有近期更新");
        });
    });
});
