import { describe, it, expect } from "vitest";
import { getWeeklyPulse, getFamilyAchievements } from "@/core/pulse-and-achievements";
import type { Reminder, HomeSettings } from "@/types";

describe("core/pulse-and-achievements 生活律动与家庭成就", () => {
    it("正确生成本周 7 天日程脉冲，精准标记今天与星期", () => {
        const testDate = new Date("2026-10-21T12:00:00Z"); // 2026-10-21 是周三
        const pulse = getWeeklyPulse(testDate, [
            { id: "r1", dueDate: "2026-10-21", daysLeft: 0 } as Reminder,
            { id: "r2", dueDate: "2026-10-23", daysLeft: 2 } as Reminder,
        ]);
        expect(pulse).toHaveLength(7);
        expect(pulse[0].weekday).toBe("周一");
        expect(pulse[2].weekday).toBe("周三");
        expect(pulse[2].isToday).toBe(true);
        expect(pulse[2].dueCount).toBe(1);
        expect(pulse[4].dueCount).toBe(1);
        expect(pulse[6].weekday).toBe("周日");
    });

    it("正确根据设置与提醒派生家庭成就勋章", () => {
        const settings = {
            members: [{ id: "m1", name: "爸爸" }],
            enabledModules: ["members", "certs", "health", "medicine", "stock", "house", "vehicles", "shopping"],
            dbRefs: {
                certs: { docId: "doc-certs" },
                medicine: { docId: "doc-med" },
                health: { docId: "doc-health" },
            },
        } as unknown as HomeSettings;

        const reminders: Reminder[] = [
            { id: "r1", moduleId: "certs", daysLeft: 10 } as Reminder,
        ];

        const achievements = getFamilyAchievements(settings, reminders);
        expect(achievements.find((a) => a.id === "all_clear")?.achieved).toBe(true);
        expect(achievements.find((a) => a.id === "certs_safe")?.achieved).toBe(true);
        expect(achievements.find((a) => a.id === "emergency_ready")?.achieved).toBe(true);
        expect(achievements.find((a) => a.id === "full_archive")?.achieved).toBe(true);
    });
});
