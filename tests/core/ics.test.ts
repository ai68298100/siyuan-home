/**
 * ICS 导出单测（第八十九波，UG11 v1）：转义、八字节折叠、事件结构、非法日期跳过、CRLF。
 */
import { describe, it, expect } from "vitest";
import { icsEscape, foldLine, buildIcs } from "@/core/ics";

describe("ics.icsEscape", () => {
    it("反斜杠/分号/逗号/换行", () => {
        expect(icsEscape("a\\b")).toBe("a\\\\b");
        expect(icsEscape("证件;过期")).toBe("证件\\;过期");
        expect(icsEscape("a,b")).toBe("a\\,b");
        expect(icsEscape("行1\n行2")).toBe("行1\\n行2");
    });
});

describe("ics.foldLine", () => {
    it("ASCII 长行按 75 折叠，续行以空格开头", () => {
        const folded = foldLine("x".repeat(200));
        const lines = folded.split("\r\n");
        expect(lines[0].length).toBeLessThanOrEqual(75);
        for (const l of lines.slice(1)) {
            expect(l.startsWith(" ")).toBe(true);
            expect(l.length).toBeLessThanOrEqual(75);
        }
        expect(folded.replace(/\r\n /g, "")).toBe("x".repeat(200));
    });

    it("CJK 多字节按字节数折叠（不切断字符）", () => {
        const s = "证".repeat(100); // 每字 3 字节
        const folded = foldLine(s);
        for (const l of folded.split("\r\n")) {
            expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
        }
        expect(folded.replace(/\r\n /g, "")).toBe(s);
    });
});

describe("ics.buildIcs", () => {
    const now = new Date("2026-10-04T12:00:00Z");
    it("结构：VCALENDAR 头尾、DTSTART/DTEND 次日开区间、DTSTAMP 注入、CRLF", () => {
        const out = buildIcs("家庭提醒", [
            { uid: "r1::certs.expire@lvhome.local", date: "2026-12-31", summary: "护照;到期", description: "证件" },
        ], now);
        const lines = out.split("\r\n");
        expect(lines[0]).toBe("BEGIN:VCALENDAR");
        expect(lines).toContain("VERSION:2.0");
        expect(lines).toContain("X-WR-CALNAME:家庭提醒");
        expect(lines).toContain("UID:r1::certs.expire@lvhome.local");
        expect(lines).toContain("DTSTAMP:20261004T120000Z");
        expect(lines).toContain("DTSTART;VALUE=DATE:20261231");
        expect(lines).toContain("DTEND;VALUE=DATE:20270101"); // 全天开区间
        expect(lines).toContain("SUMMARY:护照\\;到期");
        expect(lines).toContain("DESCRIPTION:证件");
        expect(lines[lines.length - 2]).toBe("END:VCALENDAR");
        expect(out.endsWith("\r\n")).toBe(true);
    });

    it("非法日期与空 UID 跳过；跨月进位正确", () => {
        const out = buildIcs("c", [
            { uid: "a@x", date: "2026-11-30", summary: "跨月" },
            { uid: "", date: "2026-11-30", summary: "坏UID" },
            { uid: "b@x", date: "not-a-date", summary: "坏日期" },
        ], now);
        expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(1);
        expect(out).toContain("DTSTART;VALUE=DATE:20261130");
        expect(out).toContain("DTEND;VALUE=DATE:20261201");
    });
});
