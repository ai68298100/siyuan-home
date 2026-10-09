import { describe, expect, it } from "vitest";
import { selectCellValue, selectCellContent } from "../../src/core/avcell";

describe("avcell 内核兼容层（R8 select 写读双形态）", () => {
    it("写入 payload 同时携带 select 单值与 mSelect 数组（新旧内核双命中）", () => {
        const v = selectCellValue("id");
        expect(v.type).toBe("select");
        expect(v.select).toEqual({ content: "id" });
        expect(v.mSelect).toEqual([{ content: "id" }]);
    });

    it("读取：内核 3.8.x 存储形态（mSelect 数组）优先", () => {
        expect(selectCellContent({ type: "select", mSelect: [{ content: "id" }] })).toBe("id");
        expect(selectCellContent({ type: "select", mSelect: [{ content: "a" }, { content: "b" }] })).toBe("a");
    });

    it("读取：旧数据形态（select 单值）兼容", () => {
        expect(selectCellContent({ type: "select", select: { content: "old" } })).toBe("old");
    });

    it("读取：空值安全（空数组/空内容/null）", () => {
        expect(selectCellContent({ type: "select", mSelect: [] })).toBeUndefined();
        expect(selectCellContent({ type: "select", mSelect: [{ content: "" }] })).toBeUndefined();
        expect(selectCellContent(undefined)).toBeUndefined();
        expect(selectCellContent({})).toBeUndefined();
    });
});
