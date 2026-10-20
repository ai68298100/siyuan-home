import { describe, it, expect } from "vitest";
import {
    parseIngredientWithQty,
    splitIngredientLines,
    aggregateMealPlanIngredients,
    extractStockItemsFromRows,
    analyzeGroceryDeficit,
    calculateMealPlanDeficits,
    formatMealPlanShoppingText,
    mapDeficitsToShoppingRows,
    type MealPlanDayItem,
    type StockItemInfo,
} from "@/core/meal-plan";
import type { AvRow } from "@/core/siyuan";

describe("core/meal-plan 周餐单与食材缺口自动转采购（295波）", () => {
    describe("parseIngredientWithQty 食材词条与数量单位解析", () => {
        it("解析前置数量单位", () => {
            expect(parseIngredientWithQty("500g 牛肉")).toEqual({ name: "牛肉", qty: 500, unit: "g" });
            expect(parseIngredientWithQty("2个 西红柿")).toEqual({ name: "西红柿", qty: 2, unit: "个" });
            expect(parseIngredientWithQty("3 勺生抽")).toEqual({ name: "生抽", qty: 3, unit: "勺" });
        });

        it("解析后置数量单位", () => {
            expect(parseIngredientWithQty("西红柿 2个")).toEqual({ name: "西红柿", qty: 2, unit: "个" });
            expect(parseIngredientWithQty("鸡蛋*4只")).toEqual({ name: "鸡蛋", qty: 4, unit: "只" });
            expect(parseIngredientWithQty("食用油: 100ml")).toEqual({ name: "食用油", qty: 100, unit: "ml" });
            expect(parseIngredientWithQty("大蒜 5")).toEqual({ name: "大蒜", qty: 5, unit: "个" });
        });

        it("解析紧凑格式", () => {
            expect(parseIngredientWithQty("鸡蛋4个")).toEqual({ name: "鸡蛋", qty: 4, unit: "个" });
            expect(parseIngredientWithQty("大葱1根")).toEqual({ name: "大葱", qty: 1, unit: "根" });
        });

        it("解析纯文本食材，默认 1 份", () => {
            expect(parseIngredientWithQty("香菜")).toEqual({ name: "香菜", qty: 1, unit: "份" });
            expect(parseIngredientWithQty("- 盐少许")).toEqual({ name: "盐少许", qty: 1, unit: "份" });
            expect(parseIngredientWithQty("")).toEqual({ name: "", qty: 0, unit: "" });
        });
    });

    describe("splitIngredientLines 文本拆分", () => {
        it("正确拆分换行、逗号与分号", () => {
            const raw = "番茄 2个\n鸡蛋 3个, 葱花\n;生抽 1勺\n—\n  ";
            const lines = splitIngredientLines(raw);
            expect(lines).toEqual(["番茄 2个", "鸡蛋 3个", "葱花", "生抽 1勺"]);
        });

        it("空文本返回空数组", () => {
            expect(splitIngredientLines("")).toEqual([]);
        });
    });

    describe("aggregateMealPlanIngredients 周餐单食材汇总", () => {
        it("多菜品同种食材数量累加并记录来源菜谱", () => {
            const plans: MealPlanDayItem[] = [
                {
                    day: "mon",
                    recipeName: "番茄炒蛋",
                    ingredientsRaw: "番茄 2个\n鸡蛋 3个\n葱花",
                    servings: 1,
                },
                {
                    day: "wed",
                    recipeName: "紫菜蛋花汤",
                    ingredientsRaw: "鸡蛋 2个\n紫菜 1包\n葱花 1根",
                    servings: 2, // 翻倍
                },
            ];

            const aggregated = aggregateMealPlanIngredients(plans);
            const egg = aggregated.find((i) => i.name === "鸡蛋");
            expect(egg).toBeDefined();
            // 3*1 + 2*2 = 7
            expect(egg?.totalQty).toBe(7);
            expect(egg?.recipes).toEqual(["番茄炒蛋", "紫菜蛋花汤"]);

            const seaweed = aggregated.find((i) => i.name === "紫菜");
            expect(seaweed?.totalQty).toBe(2);
            expect(seaweed?.unit).toBe("包");
        });

        it("空餐单返回空列表", () => {
            expect(aggregateMealPlanIngredients([])).toEqual([]);
        });
    });

    describe("extractStockItemsFromRows 从囤货台账提取库存", () => {
        it("解析有效行与数量", () => {
            const mockRows: AvRow[] = [
                {
                    id: "r1",
                    cells: {
                        col_name: { text: { content: "鸡蛋" } },
                        col_qty: { number: { isNotEmpty: true, content: 10 } },
                    },
                },
                {
                    id: "r2",
                    cells: {
                        col_name: { text: { content: "生抽" } },
                        col_qty: { number: { isNotEmpty: true, content: 1 } },
                    },
                },
                {
                    id: "r3",
                    cells: {
                        // 缺少名称应跳过
                        col_qty: { number: { isNotEmpty: true, content: 5 } },
                    },
                },
            ];

            const stock = extractStockItemsFromRows(mockRows, {
                nameCol: "col_name",
                qtyCol: "col_qty",
            });

            expect(stock).toEqual([
                { name: "鸡蛋", qty: 10 },
                { name: "生抽", qty: 1 },
            ]);
        });
    });

    describe("analyzeGroceryDeficit 与 calculateMealPlanDeficits 缺口比对", () => {
        it("准确判定充足、部分缺口与完全缺失三种状态", () => {
            const plans: MealPlanDayItem[] = [
                {
                    day: "mon",
                    recipeName: "番茄牛腩",
                    ingredientsRaw: "牛腩 500g\n番茄 3个\n料酒 1瓶",
                },
            ];

            const stockItems: StockItemInfo[] = [
                { name: "番茄", qty: 5 }, // 充足 (5 >= 3)
                { name: "牛腩", qty: 200 }, // 部分缺口 (200 < 500)
                // 料酒不在库存中 -> 完全缺失
            ];

            const res = calculateMealPlanDeficits(plans, stockItems);

            expect(res.totalRecipesCount).toBe(1);
            expect(res.totalIngredientsCount).toBe(3);
            expect(res.sufficientCount).toBe(1);
            expect(res.deficitCount).toBe(1);
            expect(res.missingCount).toBe(1);

            const tomato = res.items.find((i) => i.name === "番茄");
            expect(tomato?.status).toBe("sufficient");
            expect(tomato?.deficitQty).toBe(0);

            const beef = res.items.find((i) => i.name === "牛腩");
            expect(beef?.status).toBe("deficit");
            expect(beef?.deficitQty).toBe(300);

            const wine = res.items.find((i) => i.name === "料酒");
            expect(wine?.status).toBe("missing");
            expect(wine?.deficitQty).toBe(1);

            expect(res.deficitsOnly.map((d) => d.name)).toEqual(["料酒", "牛腩"]);
        });
    });

    describe("formatMealPlanShoppingText 采购清单文本格式化", () => {
        it("包含缺口与菜谱映射的格式化输出", () => {
            const plans: MealPlanDayItem[] = [
                {
                    day: "tue",
                    recipeName: "可乐鸡翅",
                    ingredientsRaw: "鸡翅 10个\n可乐 1罐",
                },
            ];
            const stock: StockItemInfo[] = [
                { name: "可乐", qty: 2 },
            ];

            const result = calculateMealPlanDeficits(plans, stock);
            const text = formatMealPlanShoppingText(result, { includeSufficient: true });

            expect(text).toContain("【家庭周餐单食材采购清单】");
            expect(text).toContain("鸡翅");
            expect(text).toContain("需 10个");
            expect(text).toContain("← 用于：可乐鸡翅");
            expect(text).toContain("可乐（需 1罐 / 现有 2罐）");
        });

        it("无缺口时的全充足提示", () => {
            const plans: MealPlanDayItem[] = [
                {
                    day: "tue",
                    recipeName: "白灼菜心",
                    ingredientsRaw: "菜心 1把",
                },
            ];
            const stock: StockItemInfo[] = [
                { name: "菜心", qty: 2 },
            ];

            const result = calculateMealPlanDeficits(plans, stock);
            const text = formatMealPlanShoppingText(result);

            expect(text).toContain("太棒了！本周餐单所需全部食材家庭囤货均充足");
        });
    });

    describe("mapDeficitsToShoppingRows 购物清单行载荷构建", () => {
        it("将缺口条目转换为 shopping 台账数据", () => {
            const deficits = [
                {
                    name: "生姜",
                    requiredQty: 2,
                    unit: "块",
                    stockQty: 0,
                    deficitQty: 2,
                    status: "missing" as const,
                    recipes: ["红烧肉", "清蒸鱼"],
                },
            ];

            const rows = mapDeficitsToShoppingRows(deficits);
            expect(rows).toEqual([
                {
                    name: "生姜",
                    qty: 2,
                    category: "food_sh",
                    note: "周餐单所需（红烧肉、清蒸鱼）",
                },
            ]);
        });
    });
});
