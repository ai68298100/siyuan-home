import { describe, it, expect } from "vitest";
import {
    aggregateFamilyMilestones,
    formatMilestonesText,
    type MilestoneSourceRow,
} from "@/core/milestones";

const ROWS: MilestoneSourceRow[] = [
    { moduleId: "parenting", rowId: "p1", title: "宝宝第一次叫妈妈", date: "2024-05-12", memberName: "宝宝", note: "在阳台晒太阳时" },
    { moduleId: "schooling", rowId: "s1", title: "幼升小录取报到", date: "2026-06-20", memberName: "大宝" },
    { moduleId: "certs", rowId: "c1", title: "结婚十周年领证纪念", date: "2026-08-18", memberName: "爸爸" },
    { moduleId: "assets-real", rowId: "a1", title: "购置全家新电动车", date: "2025-11-10", note: "九号车" },
    { moduleId: "certs", rowId: "bad", title: "无日期测试", date: "invalid" },
];

describe("core/milestones 家庭大事记与重要时间轴（320波）", () => {
    describe("aggregateFamilyMilestones", () => {
        it("正确聚合有效日期行并按日期降序排列", () => {
            const list = aggregateFamilyMilestones(ROWS);
            expect(list).toHaveLength(4);
            expect(list[0].title).toBe("结婚十周年领证纪念");
            expect(list[0].year).toBe(2026);
            expect(list[0].icon).toBe("📜");
            expect(list[3].title).toBe("宝宝第一次叫妈妈");
            expect(list[3].year).toBe(2024);
            expect(list[3].icon).toBe("🌱");
        });

        it("支持按年份筛选", () => {
            const list2026 = aggregateFamilyMilestones(ROWS, { year: 2026 });
            expect(list2026).toHaveLength(2);
            expect(list2026.every((m) => m.year === 2026)).toBe(true);
        });

        it("支持升序与 topN 截断", () => {
            const asc = aggregateFamilyMilestones(ROWS, { sortOrder: "asc", topN: 2 });
            expect(asc).toHaveLength(2);
            expect(asc[0].title).toBe("宝宝第一次叫妈妈");
            expect(asc[1].title).toBe("购置全家新电动车");
        });

        it("空数据安全回退", () => {
            expect(aggregateFamilyMilestones([])).toEqual([]);
        });
    });

    describe("formatMilestonesText", () => {
        it("按年份分组输出编年史文本", () => {
            const items = aggregateFamilyMilestones(ROWS);
            const text = formatMilestonesText(items);
            expect(text).toContain("家庭生活大事记与里程碑编年史（共 4 个节点）");
            expect(text).toContain("【2026 年】");
            expect(text).toContain("结婚十周年领证纪念 · 爸爸");
            expect(text).toContain("【2024 年】");
            expect(text).toContain("宝宝第一次叫妈妈 · 宝宝 —— 在阳台晒太阳时");
        });

        it("空节点给出空态提示", () => {
            expect(formatMilestonesText([])).toBe("暂无大事记记录。");
        });
    });
});
