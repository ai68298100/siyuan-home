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

    it("stock/emergency-kit.tpl 已注册（MOD-11 应急物资清单模板）", () => {
        const tpl = getTemplate("stock/emergency-kit.tpl");
        expect(tpl).toContain("家庭应急物资清单");
        expect(tpl).toContain("{{location}}");
        expect(tpl).toContain("半年定期巡检记录表");
    });

    it("travel/packing-list.tpl 已注册（MOD-19 出行行李清单模板库）", () => {
        const tpl = getTemplate("travel/packing-list.tpl");
        expect(tpl).toContain("行李打包清单");
        expect(tpl).toContain("城市休闲游");
        expect(tpl).toContain("海岛沙滩度假");
        expect(tpl).toContain("户外露营与徒步");
        expect(tpl).toContain("自驾长途出行");
        expect(tpl).toContain("研学与游学考察");
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
