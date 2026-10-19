import { describe, it, expect } from "vitest";
import {
    defaultRuntime,
    setReminderPlanDate,
    clearReminderPlanDate,
    getReminderPlanStatus,
    cleanupRowRuntimeData,
} from "@/core/hub/runtime";

describe("planDate（§17/284波 提醒双日期：deadline 与 plan 分离）", () => {
    it("设置与清除计划处理日", () => {
        const rt = defaultRuntime();
        expect(rt.planDates).toEqual({});

        setReminderPlanDate(rt, "rem-1", "2026-10-24");
        expect(rt.planDates["rem-1"]).toBe("2026-10-24");

        const cleared = clearReminderPlanDate(rt, "rem-1");
        expect(cleared).toBe(true);
        expect(rt.planDates["rem-1"]).toBeUndefined();

        expect(clearReminderPlanDate(rt, "non-existent")).toBe(false);
    });

    it("推导计划状态：未设置计划日", () => {
        const status = getReminderPlanStatus("2026-10-19", "2026-10-25");
        expect(status.hasPlan).toBe(false);
        expect(status.isOverdueDeadline).toBe(false);
        expect(status.isPlannedNow).toBe(false);
    });

    it("推导计划状态：已计划但今天尚未到达计划日", () => {
        // 今天 10-19，计划 10-22 处理，截止 10-30
        const status = getReminderPlanStatus("2026-10-19", "2026-10-30", "2026-10-22");
        expect(status.hasPlan).toBe(true);
        expect(status.planDaysDiff).toBe(3);
        expect(status.isPlannedNow).toBe(false);
        expect(status.isOverdueDeadline).toBe(false);
    });

    it("推导计划状态：今天已到达计划日且未过截止日 → isPlannedNow 为 true", () => {
        // 今天 10-22，计划 10-22 处理，截止 10-30
        const status = getReminderPlanStatus("2026-10-22", "2026-10-30", "2026-10-22");
        expect(status.hasPlan).toBe(true);
        expect(status.planDaysDiff).toBe(0);
        expect(status.isPlannedNow).toBe(true);
        expect(status.isOverdueDeadline).toBe(false);
    });

    it("推导计划状态：超过截止日 deadline → isOverdueDeadline 严格警示，isPlannedNow 自动失效", () => {
        // 今天 11-01，计划 10-22，截止 10-30
        const status = getReminderPlanStatus("2026-11-01", "2026-10-30", "2026-10-22");
        expect(status.hasPlan).toBe(true);
        expect(status.isOverdueDeadline).toBe(true);
        expect(status.isPlannedNow).toBe(false);
    });

    it("台账行删除时自动联动清理 planDates 映射", () => {
        const rt = defaultRuntime();
        setReminderPlanDate(rt, "row-abc::certs.expiry", "2026-10-24");
        setReminderPlanDate(rt, "row-xyz::certs.expiry", "2026-10-25");

        const changed = cleanupRowRuntimeData(rt, "row-abc");
        expect(changed).toBe(true);
        expect(rt.planDates["row-abc::certs.expiry"]).toBeUndefined();
        expect(rt.planDates["row-xyz::certs.expiry"]).toBe("2026-10-25");
    });
});
