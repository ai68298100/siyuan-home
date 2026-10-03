/**
 * 模板基建单测（第七十轮）：{{key}} 替换、缺失变量空串、非变量占位不误伤、模板注册表取用。
 * 第九十二轮：G3 文档标题消毒（路径分隔符/控制字符）。
 */
import { describe, it, expect } from "vitest";
import { renderTemplate, getTemplate, sanitizeDocTitle } from "@/core/templates";

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

describe("templates.sanitizeDocTitle（G3）", () => {
    it("路径分隔符与控制字符替换为空格，空白收敛", () => {
        expect(sanitizeDocTitle("a/b\\c")).toBe("a b c");
        expect(sanitizeDocTitle("名字\u0007·\u001f家长会")).toBe("名字 · 家长会");
        expect(sanitizeDocTitle("多  空白\t标题")).toBe("多 空白 标题");
    });

    it("正常标题不变；全消毒后为空 → 空串", () => {
        expect(sanitizeDocTitle("宝宝 · 家长会记录 · 2026-10-04")).toBe("宝宝 · 家长会记录 · 2026-10-04");
        expect(sanitizeDocTitle("///")).toBe("");
    });
});
