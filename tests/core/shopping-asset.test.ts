import { describe, expect, it } from "vitest";
import { buildAssetFromShopping } from "../../src/core/shopping-asset";

describe("buildAssetFromShopping (MOD-09 购物记录一键转入实物资产档案)", () => {
    it("数码类别正确映射", () => {
        const payload = buildAssetFromShopping({
            name: "iPhone 16 Pro",
            category: "digital",
            amount: 7999,
            date: "2026-09-20",
            channel: "Apple 官网",
            memberBlockId: "member-av-dad",
            note: "深空黑色 256GB",
        });

        expect(payload.name).toBe("iPhone 16 Pro");
        expect(payload.category).toBe("digital");
        expect(payload.status).toBe("inuse");
        expect(payload.amount).toBe(7999);
        expect(payload.date).toBe("2026-09-20");
        expect(payload.channel).toBe("Apple 官网");
        expect(payload.memberBlockId).toBe("member-av-dad");
        expect(payload.note).toContain("深空黑色 256GB");
    });

    it("服饰与家电类别识别", () => {
        const apparel = buildAssetFromShopping({
            name: "始祖鸟冲锋衣",
            category: "apparel",
            amount: 3500,
        });
        expect(apparel.category).toBe("apparel");

        const appliance = buildAssetFromShopping({
            name: "戴森吸尘器 V12",
            category: "daily",
            amount: 3999,
        });
        expect(appliance.category).toBe("appliance");
    });

    it("关键词启发识别家具/玩具", () => {
        const furniture = buildAssetFromShopping({
            name: "升降电脑桌",
            amount: 1899,
        });
        expect(furniture.category).toBe("furniture");

        const toy = buildAssetFromShopping({
            name: "乐高积木拼装玩具",
            amount: 599,
        });
        expect(toy.category).toBe("toy");
    });

    it("未识别类别安全回退到 other_ar", () => {
        const fallback = buildAssetFromShopping({
            name: "定制手工皮具",
            amount: 600,
        });
        expect(fallback.category).toBe("other_ar");
    });
});
