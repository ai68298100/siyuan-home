/**
 * 模板基建单测（第七十轮）：{{key}} 替换、缺失变量空串、非变量占位不误伤、模板注册表取用。
 */
import { describe, it, expect } from "vitest";
import { renderTemplate, getTemplate } from "@/core/templates";

describe("templates.renderTemplate", () => {
    it("{{key}} 替换为变量值", () => {
        expect(renderTemplate("# {{name}}\n日期 {{date}}", { name: "张三", date: "2026-10-04" }))
            .toBe("# 张三\n日期 2026-10-04");
    });

    it("缺失变量 → 空串（不留占位符残渣）", () => {
        expect(renderTemplate("A{{school}}B", { name: "x" })).toBe("AB");
    });

    it("非变量花括号不误伤；同名重复变量全替换", () => {
        expect(renderTemplate("{notvar} {{a}} {{a}}", { a: "1" })).toBe("{notvar} 1 1");
        expect(renderTemplate("{{a_b}} {{a-b}} {{a1}}", { a_b: "x", a1: "z" })).toBe("x {{a-b}} z");
    });
});

describe("templates.getTemplate", () => {
    it("schooling/parent-meeting.tpl 已注册", () => {
        const tpl = getTemplate("schooling/parent-meeting.tpl");
        expect(tpl).toContain("# 家长会记录 · {{name}}");
        expect(tpl).toContain("{{teacher}}");
    });

    it("未注册文件 → undefined", () => {
        expect(getTemplate("ghost/none.tpl")).toBeUndefined();
    });
});
