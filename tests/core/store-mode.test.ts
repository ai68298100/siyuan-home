import { describe, it, expect } from "vitest";
import {
    groupShoppingByCategory,
    storeModeProgress,
    toggleStoreItem,
    formatStoreModeText,
    STORE_CATEGORY_ORDER,
} from "@/core/shopping";

const cell = (o: Record<string, unknown>) => o as never;

const ROWS = [
    { itemID: "r1", cells: { name: cell({ text: { content: "牛奶" } }), category: cell({ mSelect: [{ content: "food_sh" }] }), qty: cell({ number: { content: 2, isNotEmpty: true } }) } },
    { itemID: "r2", cells: { name: cell({ text: { content: "洗衣液" } }), category: cell({ mSelect: [{ content: "daily" }] }) } },
    { itemID: "r3", cells: { name: cell({ text: { content: "数据线" } }), category: cell({ mSelect: [{ content: "digital" }] }), note: cell({ text: { content: "Type-C" } }) } },
    { itemID: "r4", cells: { name: cell({ text: { content: "   " } }), category: cell({ mSelect: [{ content: "daily" }] }) } },
    { itemID: "r5", cells: { name: cell({ text: { content: "AirPods" } }), category: cell({ select: { content: "wish" } }) } },
    { itemID: "r6", cells: { name: cell({ text: { content: "椅子" } }), category: cell({ mSelect: [{ content: "unknown_cat" }] }) } },
];

const COLS = { nameKey: "name", categoryKey: "category", qtyKey: "qty", noteKey: "note" };

describe("core/shopping 扫货模式（312 波，G3）", () => {
    describe("groupShoppingByCategory", () => {
        it("按分类分组并按超市动线排序", () => {
            const groups = groupShoppingByCategory(ROWS, COLS);
            expect(groups.map((g) => g.category)).toEqual(["daily", "digital", "food_sh", "wish", "unknown_cat"]);
            expect(STORE_CATEGORY_ORDER).toContain("daily");
        });

        it("过滤空名称行，保留数量与备注", () => {
            const groups = groupShoppingByCategory(ROWS, COLS);
            const food = groups.find((g) => g.category === "food_sh")!;
            expect(food.items).toHaveLength(1);
            expect(food.items[0]).toMatchObject({ name: "牛奶", qty: 2 });
            const digital = groups.find((g) => g.category === "digital")!;
            expect(digital.items[0].note).toBe("Type-C");
        });

        it("旧数据 select 单值也能识别分类", () => {
            const groups = groupShoppingByCategory(ROWS, COLS);
            expect(groups.some((g) => g.category === "wish")).toBe(true);
        });

        it("空输入返回空数组", () => {
            expect(groupShoppingByCategory([], COLS)).toEqual([]);
        });
    });

    describe("storeModeProgress / toggleStoreItem", () => {
        it("统计总进度与分组进度", () => {
            const groups = groupShoppingByCategory(ROWS, COLS);
            const p = storeModeProgress(groups, new Set(["r1", "r2"]));
            expect(p.total).toBe(5);
            expect(p.checked).toBe(2);
            expect(p.byGroup.find((g) => g.category === "daily")).toEqual({ category: "daily", checked: 1, total: 1 });
        });

        it("切换勾选不改动入参", () => {
            const base = new Set<string>(["a"]);
            const added = toggleStoreItem(base, "b");
            expect([...added]).toEqual(["a", "b"]);
            expect([...base]).toEqual(["a"]);
            expect([...toggleStoreItem(added, "a")]).toEqual(["b"]);
        });
    });

    describe("formatStoreModeText", () => {
        it("按分组输出勾选清单", () => {
            const groups = groupShoppingByCategory(ROWS, COLS);
            const text = formatStoreModeText(groups, new Set(["r1"]));
            expect(text).toContain("【daily】");
            expect(text).toContain("☐ 洗衣液");
            expect(text).toContain("☑ 牛奶 ×2");
        });

        it("未分类走自定义标签", () => {
            const groups = groupShoppingByCategory([{ itemID: "x", cells: { name: cell({ text: { content: "笔" } }) } }], COLS);
            expect(formatStoreModeText(groups, new Set())).toContain("【未分类】");
        });
    });
});
