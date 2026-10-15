import { describe, expect, it } from "vitest";
import { escapeHtml, escapeAttr, sanitizeUserText } from "../../src/core/escape";

describe("escapeHtml (SEC-01 XSS 防护与 HTML 转义)", () => {
    it("转义 HTML 关键特殊字符", () => {
        expect(escapeHtml("<script>alert('xss')</script>")).toBe("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
        expect(escapeHtml(`"hello" & 'world' \`test\``)).toBe("&quot;hello&quot; &amp; &#39;world&#39; &#96;test&#96;");
    });

    it("普通纯文本保持原样", () => {
        expect(escapeHtml("张伟的护照 (2026)")).toBe("张伟的护照 (2026)");
        expect(escapeHtml("12345")).toBe("12345");
    });

    it("空值或非字符串类型安全处理", () => {
        expect(escapeHtml("")).toBe("");
        expect(escapeHtml(null)).toBe("");
        expect(escapeHtml(undefined)).toBe("");
        expect(escapeHtml(123)).toBe("123");
        expect(escapeHtml(true)).toBe("true");
    });
});

describe("escapeAttr", () => {
    it("转义属性中的字符并替换换行与制表符", () => {
        expect(escapeAttr(`title\nwith\t"quotes"`)).toBe("title with &quot;quotes&quot;");
    });
});

describe("sanitizeUserText", () => {
    it("过滤不可打印控制字符并转义 HTML", () => {
        const malicious = "李小明\u0000\u0007<b>VIP</b>\u001f";
        expect(sanitizeUserText(malicious)).toBe("李小明&lt;b&gt;VIP&lt;/b&gt;");
    });
});
