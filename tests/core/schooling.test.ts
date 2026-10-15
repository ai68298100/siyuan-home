import { describe, expect, it } from "vitest";
import { calculateNextEducationMilestone, calculateSchoolingMilestones, type SchoolingRowData } from "../../src/core/schooling";

describe("calculateNextEducationMilestone (MOD-13 升学节点推算)", () => {
    const today = "2026-10-15";

    it("明确指定考试日（exam_date）优先作为升学节点", () => {
        const row: SchoolingRowData = {
            name: "小明",
            school: "第一实验高中",
            category: "senior",
            exam_date: "2027-06-07",
        };
        const m = calculateNextEducationMilestone(row, today);
        expect(m).not.toBeNull();
        expect(m?.targetDate).toBe("2027-06-07");
        expect(m?.milestoneName).toBe("高考（大学录取）");
        expect(m?.daysLeft).toBeGreaterThan(200);
        expect(m?.isPast).toBe(false);
    });

    it("初中学段按 3 年学制与入学年份推算中考", () => {
        const row: SchoolingRowData = {
            name: "小华",
            school: "实验初中",
            category: "junior",
            enroll_year: 2024,
        };
        // 2024 + 3 = 2027
        const m = calculateNextEducationMilestone(row, today);
        expect(m).not.toBeNull();
        expect(m?.targetDate).toBe("2027-06-20");
        expect(m?.milestoneName).toBe("中考（初升高）");
    });

    it("小学学段按 6 年学制与入学年份推算小升初", () => {
        const row: SchoolingRowData = {
            name: "小宝",
            school: "阳光小学",
            category: "primary",
            enroll_year: 2022,
        };
        // 2022 + 6 = 2028
        const m = calculateNextEducationMilestone(row, today);
        expect(m).not.toBeNull();
        expect(m?.targetDate).toBe("2028-06-25");
        expect(m?.milestoneName).toBe("小升初");
    });

    it("根据高三年级关键词推算最近高考节点", () => {
        const row: SchoolingRowData = {
            name: "大明",
            grade: "高三理科(2)班",
        };
        const m = calculateNextEducationMilestone(row, today);
        expect(m).not.toBeNull();
        expect(m?.targetDate).toBe("2027-06-07");
        expect(m?.milestoneName).toBe("高考（大学录取）");
    });
});

describe("calculateSchoolingMilestones", () => {
    it("汇总多名学生升学节点并按临近程度排序，排除已毕业学生", () => {
        const rows: SchoolingRowData[] = [
            { name: "小明", category: "senior", enroll_year: 2025 }, // 2028 高考
            { name: "小华", category: "junior", enroll_year: 2024 }, // 2027 中考
            { name: "已毕业表哥", category: "college", status: "graduated" },
        ];
        const list = calculateSchoolingMilestones(rows, "2026-10-15");
        expect(list).toHaveLength(2);
        // 2027 中考比 2028 高考更临近
        expect(list[0].studentName).toBe("小华");
        expect(list[0].milestoneName).toBe("中考（初升高）");
        expect(list[1].studentName).toBe("小明");
    });
});
