import { describe, it, expect } from "vitest";
import { monthGrid, daysInMonth } from "@/core/calendar";

describe("月历网格（原生日历视图）", () => {
    it("2026-10：31 天，周一起首（10-01 是周四 → 前导 3 格）", () => {
        const cells = monthGrid(2026, 9);
        expect(daysInMonth(2026, 9)).toBe(31);
        const lead = cells.findIndex((c) => c.inMonth);
        expect(lead).toBe(3); // 周四 → 周一/二/三 三个补位
        expect(cells.filter((c) => c.inMonth).length).toBe(31);
        expect(cells.length % 7).toBe(0);
    });

    it("键为本地 yyyy-MM-dd 且与 day 一致", () => {
        const cells = monthGrid(2026, 9).filter((c) => c.inMonth);
        expect(cells[0].key).toBe("2026-10-01");
        expect(cells[30].key).toBe("2026-10-31");
        expect(cells[14].day).toBe(15);
    });

    it("闰年二月 29 天", () => {
        expect(daysInMonth(2028, 1)).toBe(29);
        expect(daysInMonth(2026, 1)).toBe(28);
    });

    it("月初恰逢周一 → 无前导补位（2026-09-01 是周二 → 前导 1；用 2026-06-01 周一验证 0）", () => {
        expect(monthGrid(2026, 5)[0].inMonth).toBe(true); // 2026-06-01 周一
        expect(monthGrid(2026, 5)[0].key).toBe("2026-06-01");
    });
});
