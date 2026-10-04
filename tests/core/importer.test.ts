/**
 * CSV 导入单测（16 组/191 波）：RFC 4180 解析（引号/换行/BOM）与映射规划（类型改写/错误剔除/名称跳过/表头猜测）。
 */
import { describe, it, expect } from "vitest";
import { parseCsv, buildCsv } from "@/core/csv";
import { planImport, guessMapping } from "@/core/importer";

describe("parseCsv", () => {
    it("往返：buildCsv 的输出可无损解析回行列", () => {
        const csv = buildCsv(["名称", "备注"], [["身份证,新版", "含\"引号\""], ["护照", "两行\n备注"]]);
        const rows = parseCsv(csv);
        expect(rows).toEqual([["名称", "备注"], ["身份证,新版", '含"引号"'], ["护照", "两行\n备注"]]);
    });

    it("BOM 剥离、LF 行结束、空行跳过、尾行无换行", () => {
        expect(parseCsv("\uFEFFa,b\n\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
        expect(parseCsv("a,b\r\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
        expect(parseCsv("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
    });
});

const COLS = [
    { key: "name", type: "text" },
    { key: "qty", type: "number" },
    { key: "buy_date", type: "date" },
];

describe("planImport", () => {
    it("类型改写与错误剔除：数字/日期合法入格，非法记 warning 不废弃整行", () => {
        const plan = planImport(
            [["h"], ["相机", "2", "2026-03-01"], ["镜头", "abc", "2026/3/2"], ["三脚架", "1", "坏日期"]],
            { 0: "name", 1: "qty", 2: "buy_date" },
            COLS,
            "name",
        );
        expect(plan.rows).toHaveLength(3);
        expect(plan.rows[0].cells).toContainEqual({ key: "qty", type: "number", value: "2" });
        expect(plan.rows[1].warnings[0]).toContain("不是数字");
        expect(plan.rows[1].cells.find((c) => c.key === "buy_date")?.value).toBe("2026-3-2"); // 斜杠转连字符
        expect(plan.rows[2].cells.find((c) => c.key === "buy_date")).toBeUndefined();
        expect(plan.rows[2].cells.find((c) => c.key === "qty")?.value).toBe("1"); // 合法单元格保留
        expect(plan.skipped).toBe(0);
    });

    it("名称为空整行跳过；name 列不重复入 cells；checkbox 中文/符号识别", () => {
        const plan = planImport(
            [["h"], ["", "1"], ["保险", "是", "1"]],
            { 0: "name", 1: "qty", 2: "insured" },
            [...COLS, { key: "insured", type: "checkbox" }],
            "name",
        );
        expect(plan.skipped).toBe(1);
        expect(plan.rows).toHaveLength(1);
        expect(plan.rows[0].cells.find((c) => c.key === "insured")?.value).toBe(true);
        expect(plan.rows[0].cells.find((c) => c.key === "name")).toBeUndefined();
    });
});

describe("guessMapping", () => {
    const LABELS: Record<string, string> = { name: "名称", qty: "数量", buy_date: "购买日期" };
    it("表头 = 列 key 或 i18n 标签（不区分大小写）→ 命中；其余 undefined", () => {
        const map = guessMapping(["名称", "QTY", "购买日期", "未知列"], COLS, (k) => LABELS[k] ?? k);
        expect(map).toEqual({ 0: "name", 1: "qty", 2: "buy_date", 3: undefined });
    });
});
