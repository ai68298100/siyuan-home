/**
 * CSV 导出纯逻辑单测（第八十四轮）：RFC 4180 转义、BOM/CRLF、组装。
 */
import { describe, it, expect } from "vitest";
import { csvEscape, buildCsv } from "@/core/csv";

describe("csv.csvEscape", () => {
    it("普通值不加引号；含逗号/引号/换行任一则整体加引号", () => {
        expect(csvEscape("正常")).toBe("正常");
        expect(csvEscape("a,b")).toBe('"a,b"');
        expect(csvEscape('他说"你好"')).toBe('"他说""你好"""');
        expect(csvEscape("行1\n行2")).toBe('"行1\n行2"');
        expect(csvEscape("回车\r\n测试")).toBe('"回车\r\n测试"');
        expect(csvEscape("")).toBe("");
    });
});

describe("csv.buildCsv", () => {
    it("BOM 前缀 + CRLF 行结束 + 逐格转义", () => {
        const out = buildCsv(["名称", "备注"], [["药A", "含,逗号"], ["引号\"行", "普通"]]);
        expect(out.charCodeAt(0)).toBe(0xfeff);
        const body = out.slice(1);
        const lines = body.split("\r\n");
        expect(lines).toHaveLength(3);
        expect(lines[0]).toBe("名称,备注");
        expect(lines[1]).toBe("药A,\"含,逗号\"");
        expect(lines[2]).toBe('"引号""行",普通');
    });

    it("空表/空行不崩；单元格全空串", () => {
        expect(buildCsv([], [])).toBe("\uFEFF");
        expect(buildCsv(["a"], [[""], [""]])).toBe("\uFEFFa\r\n\r\n");
    });
});
