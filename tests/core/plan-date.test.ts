import { describe, expect, it } from "vitest";
import { defaultRuntime, setPlanDate, applyRuntime } from "../../src/core/hub/runtime";
import type { Reminder } from "../../src/types";

describe("planDate (UIX-07 提醒事项智能双日期：计划日与截止日分离)", () => {
    it("setPlanDate 写入与清空计划日", () => {
        const rt = defaultRuntime();
        setPlanDate(rt, "rem-1", "2026-10-20");
        expect(rt.plannedDates?.["rem-1"]).toBe("2026-10-20");

        setPlanDate(rt, "rem-1", "");
        expect(rt.plannedDates?.["rem-1"]).toBeUndefined();

        setPlanDate(rt, "rem-2", "2026-10-25");
        setPlanDate(rt, "rem-2", "—");
        expect(rt.plannedDates?.["rem-2"]).toBeUndefined();
    });

    it("applyRuntime 正确将计划日附着于派生提醒与备忘", () => {
        const rt = defaultRuntime();
        setPlanDate(rt, "row-1::certs.expiry", "2026-10-18");
        setPlanDate(rt, "adhoc::memo-1", "2026-10-16");

        const derived: Reminder[] = [
            {
                id: "row-1::certs.expiry",
                moduleId: "certs",
                ruleKey: "expiry",
                rowId: "row-1",
                title: "身份证换证",
                dueDate: "2026-12-31", // 硬截止日
                daysLeft: 77,
                level: "lead",
            },
        ];

        rt.memos = [
            {
                id: "memo-1",
                title: "给汽车买玻璃水",
                dueDate: "2026-10-30",
                createdAt: "2026-10-15T00:00:00.000Z",
            },
        ];

        const visible = applyRuntime(derived, rt, new Date("2026-10-15T00:00:00.000Z"));

        const certRem = visible.find((r) => r.id === "row-1::certs.expiry");
        expect(certRem?.planDate).toBe("2026-10-18");
        expect(certRem?.dueDate).toBe("2026-12-31");

        const memoRem = visible.find((r) => r.id === "adhoc::memo-1");
        expect(memoRem?.planDate).toBe("2026-10-16");
        expect(memoRem?.dueDate).toBe("2026-10-30");
    });
});
