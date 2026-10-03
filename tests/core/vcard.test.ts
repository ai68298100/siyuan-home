/**
 * vCard 导出单测（第九十波，UG11 v1）：卡片结构、生日规则（缺省/农历不写 BDAY）、转义、空输入。
 */
import { describe, it, expect } from "vitest";
import { buildVCard } from "@/core/vcard";

const now = new Date("2026-10-04T12:00:00Z");

describe("vcard.buildVCard", () => {
    it("卡片结构：VERSION 4.0、UID 后缀、FN、REV 注入、CRLF", () => {
        const out = buildVCard([{ uid: "m1", name: "张三", category: "本人" }], now);
        const lines = out.split("\r\n");
        expect(lines[0]).toBe("BEGIN:VCARD");
        expect(lines).toContain("VERSION:4.0");
        expect(lines).toContain("UID:m1@lvhome.local");
        expect(lines).toContain("FN:张三");
        expect(lines).toContain("REV:20261004T120000Z");
        expect(lines).toContain("CATEGORIES:本人");
        expect(lines).toContain("END:VCARD");
        expect(out.endsWith("\r\n")).toBe(true);
    });

    it("生日规则：公历写 BDAY；缺省与农历都不写", () => {
        const out = buildVCard([
            { uid: "a", name: "公历", birthday: "1990-01-02" },
            { uid: "b", name: "无生日" },
            { uid: "c", name: "农历", birthday: "1990-01-02", lunarBirthday: true },
        ], now);
        expect(out.match(/BDAY:/g)).toHaveLength(1);
        expect(out).toContain("BDAY:1990-01-02");
        expect(out).toContain("FN:农历"); // 卡仍在，只是无 BDAY
    });

    it("备注转义；空 uid/无名跳过；全跳过返回空串", () => {
        const out = buildVCard([{ uid: "a", name: "a;b", note: "行1\n行2,逗号" }], now);
        expect(out).toContain("NOTE:行1\\n行2\\,逗号");
        expect(out).toContain("FN:a\\;b");
        expect(buildVCard([{ uid: "", name: "x" }, { uid: "b", name: "" }], now)).toBe("");
        expect(buildVCard([], now)).toBe("");
    });
});
