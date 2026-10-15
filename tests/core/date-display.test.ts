import { describe, expect, it } from "vitest";
import { formatLocalDate, formatLocalDateTime, formatLocalTime, safeDate } from "@/core/date-display";

describe("display date boundaries", () => {
    it("rejects missing and invalid persisted dates", () => {
        expect(safeDate(undefined)).toBeUndefined();
        expect(safeDate("not-a-date")).toBeUndefined();
        expect(formatLocalTime("not-a-date")).toBeUndefined();
    });

    it("formats valid timestamps without throwing", () => {
        expect(formatLocalTime(0)).toBeTypeOf("string");
        expect(formatLocalDateTime("2026-10-14T08:00:00.000Z")).toBeTypeOf("string");
        expect(formatLocalDate(0)).toBeTypeOf("string");
    });
});
