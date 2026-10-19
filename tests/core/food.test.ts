import { describe, it, expect } from "vitest";
import {
    parseIngredients,
    extractMemberDislikes,
    matchFoodDietaryConflicts,
    formatShoppingIngredientsText,
} from "@/core/food";
import type { FamilyMember } from "@/types";
import type { AvRow } from "@/core/siyuan";

describe("food.parseIngredients（食材清单解析）", () => {
    it("支持换行、顿号、逗号、加号与空格分隔", () => {
        const raw = "番茄 2个、鸡蛋 3只\n香菜 1把，大葱\r\n花生碎+食盐少许";
        const res = parseIngredients(raw);
        expect(res).toContain("番茄");
        expect(res).toContain("鸡蛋");
        expect(res).toContain("香菜");
        expect(res).toContain("大葱");
        expect(res).toContain("花生碎");
    });

    it("空输入或空占位返回空数组", () => {
        expect(parseIngredients("")).toEqual([]);
        expect(parseIngredients("—")).toEqual([]);
    });
});

describe("food.extractMemberDislikes（成员忌口偏好提取）", () => {
    it("从自由文本备注中提取不吃/忌口偏好词", () => {
        const notes = "性格开朗，平时不吃香菜，不吃辣，免葱，忌海鲜";
        const dislikes = extractMemberDislikes(notes);
        expect(dislikes).toContain("香菜");
        expect(dislikes).toContain("辣");
        expect(dislikes).toContain("葱");
        expect(dislikes).toContain("海鲜");
    });

    it("无忌口备注返回空数组", () => {
        expect(extractMemberDislikes("健康状况良好")).toEqual([]);
        expect(extractMemberDislikes(undefined)).toEqual([]);
    });
});

describe("food.matchFoodDietaryConflicts（健康过敏与忌口交叉核对）", () => {
    const members: FamilyMember[] = [
        { id: "m-child", name: "宝宝", role: "child", avItemId: "av-child", createdAt: "" },
        { id: "m-mom", name: "妈妈", role: "partner", notes: "不吃香菜，不吃羊肉", createdAt: "" },
    ];

    const healthCols = {
        name: "h-name",
        category: "h-cat",
        diagnosis: "h-diag",
        member: "h-member",
    };

    const healthRows: AvRow[] = [
        {
            itemID: "h-1",
            cells: {
                "h-name": { type: "text", text: { content: "花生" } },
                "h-cat": { type: "select", select: { content: "allergy" } },
                "h-diag": { type: "text", text: { content: "严重皮疹与哮喘" } },
                "h-member": { type: "relation", relation: { blockIDs: ["av-child"] } },
            },
        },
    ];

    it("命中健康档案过敏源时标明高危 allergy 冲突与症状", () => {
        const res = matchFoodDietaryConflicts("花生炖猪蹄", "花生、猪蹄、生姜、料酒", members, healthRows, healthCols);
        expect(res.isSafe).toBe(false);
        expect(res.allergiesCount).toBe(1);
        expect(res.conflicts[0].type).toBe("allergy");
        expect(res.conflicts[0].memberName).toBe("宝宝");
        expect(res.conflicts[0].matchedItem).toBe("花生");
        expect(res.conflicts[0].detail).toContain("严重皮疹与哮喘");
    });

    it("命中成员备注忌口时标明 dislike 偏好冲突", () => {
        const res = matchFoodDietaryConflicts("牛肉拉面", "牛肉、面条、香菜、葱花", members, healthRows, healthCols);
        expect(res.isSafe).toBe(false);
        expect(res.dislikesCount).toBe(1);
        expect(res.conflicts[0].type).toBe("dislike");
        expect(res.conflicts[0].memberName).toBe("妈妈");
        expect(res.conflicts[0].matchedItem).toBe("香菜");
    });

    it("完全无冲突时判定为安全 isSafe: true", () => {
        const res = matchFoodDietaryConflicts("番茄炒蛋", "番茄、鸡蛋、食用油、盐", members, healthRows, healthCols);
        expect(res.isSafe).toBe(true);
        expect(res.conflicts).toHaveLength(0);
        expect(res.allergiesCount).toBe(0);
        expect(res.dislikesCount).toBe(0);
    });

    it("formatShoppingIngredientsText 生成采购清单文本", () => {
        const text = formatShoppingIngredientsText("西红柿牛腩", ["牛腩", "西红柿", "洋葱", "土豆"]);
        expect(text).toContain("【西红柿牛腩 · 所需食材清单】");
        expect(text).toContain("· 牛腩 ×1");
        expect(text).toContain("· 西红柿 ×1");
    });
});
