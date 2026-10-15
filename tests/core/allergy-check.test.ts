import { describe, expect, it } from "vitest";
import { checkAllergyConflicts, extractAllergenKeyword, type FamilyAllergy } from "../../src/core/allergy-check";

describe("extractAllergenKeyword (MOD-12 过敏原特征提取)", () => {
    it("提取简单过敏名称核心词", () => {
        expect(extractAllergenKeyword("花生过敏")).toBe("花生");
        expect(extractAllergenKeyword("重度海鲜过敏")).toBe("海鲜");
        expect(extractAllergenKeyword("鸡蛋不耐受")).toBe("鸡蛋");
    });

    it("提取带括号诊断说明中的具体食材词", () => {
        expect(extractAllergenKeyword("辅食过敏", "辅食观察期排容不耐受（牛油果）")).toBe("牛油果");
        expect(extractAllergenKeyword("疑似过敏", "辅食观察期排容不耐受(芒果)")).toBe("芒果");
    });
});

describe("checkAllergyConflicts (MOD-12 食材过敏冲突筛查)", () => {
    const allergies: FamilyAllergy[] = [
        { name: "花生过敏", memberName: "大宝" },
        { name: "虾蟹海鲜过敏", diagnosis: "海鲜", memberName: "妈妈" },
        { name: "辅食过敏", diagnosis: "辅食观察期排容不耐受（牛油果）", memberName: "小宝" },
    ];

    it("食材清单中包含过敏原时精确预警", () => {
        const matches = checkAllergyConflicts("宫保鸡丁", "鸡胸肉、花生仁、葱段、辣椒", allergies);
        expect(matches).toHaveLength(1);
        expect(matches[0].allergen).toBe("花生");
        expect(matches[0].memberName).toBe("大宝");
        expect(matches[0].matchedIn).toBe("ingredients");
        expect(matches[0].warning).toContain("大宝");
        expect(matches[0].warning).toContain("花生");
    });

    it("菜品名称直接包含过敏原时预警", () => {
        const matches = checkAllergyConflicts("清蒸海鲜大咖", "生姜、料酒、生抽", allergies);
        expect(matches).toHaveLength(1);
        expect(matches[0].allergen).toBe("海鲜");
        expect(matches[0].memberName).toBe("妈妈");
        expect(matches[0].matchedIn).toBe("name");
    });

    it("多位成员多种过敏原同时命中", () => {
        const matches = checkAllergyConflicts("海鲜花生什锦沙拉", "牛油果、熟花生、鲜虾仁", allergies);
        expect(matches).toHaveLength(3);
        const members = matches.map((m) => m.memberName);
        expect(members).toContain("大宝");
        expect(members).toContain("妈妈");
        expect(members).toContain("小宝");
    });

    it("无冲突时返回空数组", () => {
        const matches = checkAllergyConflicts("西红柿炒鸡蛋", "西红柿、鸡蛋、盐", [
            { name: "花生过敏", memberName: "大宝" },
        ]);
        expect(matches).toHaveLength(0);
    });
});
