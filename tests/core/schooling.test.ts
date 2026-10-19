import { describe, it, expect } from "vitest";
import { calculateSchoolingStage } from "@/core/schooling";

describe("schooling.calculateSchoolingStage（学段年级与升学毕业倒计时测算）", () => {
    it("2023年入读小学（6年学制）：2026年秋季推算为小学四年级，毕业节点2029年", () => {
        const res = calculateSchoolingStage({
            category: "primary",
            enrollYear: 2023,
            today: "2026-10-19",
        });

        expect(res).not.toBeNull();
        expect(res?.stageTotalYears).toBe(6);
        expect(res?.currentGradeNumber).toBe(4);
        expect(res?.currentGradeLabel).toBe("小学四年级");
        expect(res?.enrollDate).toBe("2023-09-01");
        expect(res?.graduationDate).toBe("2029-06-30");
        expect(res?.transitionEventLabel).toBe("小升初节点");
        expect(res?.isGraduated).toBe(false);
        expect(res?.isNotEnrolledYet).toBe(false);
        expect(res?.daysUntilGraduation).toBeGreaterThan(0);
        expect(res?.stageProgressPercent).toBeGreaterThan(50);
    });

    it("春季学期正确推算当前学年年级（如2024年5月处于一年级下学期）", () => {
        const res = calculateSchoolingStage({
            category: "primary",
            enrollYear: 2023,
            today: "2024-05-15",
        });

        expect(res?.currentGradeNumber).toBe(1);
        expect(res?.currentGradeLabel).toBe("小学一年级");
    });

    it("初中（3年学制）：2024年入学，2026年秋季推算为初三中考冲刺", () => {
        const res = calculateSchoolingStage({
            category: "junior",
            enrollYear: 2024,
            today: "2026-10-19",
        });

        expect(res?.stageTotalYears).toBe(3);
        expect(res?.currentGradeNumber).toBe(3);
        expect(res?.currentGradeLabel).toBe("初三（9年级）");
        expect(res?.graduationDate).toBe("2027-06-30");
        expect(res?.transitionEventLabel).toBe("中考升学节点");
        expect(res?.daysUntilGraduation).toBeLessThan(300);
    });

    it("已过毕业年份自动判定为已毕业，进度 100%", () => {
        const res = calculateSchoolingStage({
            category: "senior",
            enrollYear: 2020, // 2020~2023 高中
            today: "2026-10-19",
        });

        expect(res?.isGraduated).toBe(true);
        expect(res?.currentGradeLabel).toBe("已毕业");
        expect(res?.stageProgressPercent).toBe(100);
        expect(res?.daysUntilGraduation).toBe(0);
    });

    it("未来年份判定为待入学，进度 0%", () => {
        const res = calculateSchoolingStage({
            category: "college",
            enrollYear: 2028,
            today: "2026-10-19",
        });

        expect(res?.isNotEnrolledYet).toBe(true);
        expect(res?.currentGradeLabel).toBe("待入学");
        expect(res?.stageProgressPercent).toBe(0);
    });

    it("无效入学年份或无分类返回 null", () => {
        expect(calculateSchoolingStage({ category: "", enrollYear: 2023 })).toBeNull();
        expect(calculateSchoolingStage({ category: "primary", enrollYear: undefined })).toBeNull();
        expect(calculateSchoolingStage({ category: "primary", enrollYear: 1950 })).toBeNull();
    });
});
