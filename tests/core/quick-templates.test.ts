import { describe, it, expect } from "vitest";
import { getQuickTemplates, QUICK_TEMPLATES } from "@/core/quick-templates";

describe("core/quick-templates 常用分类快捷建档模板", () => {
    it("获取证件高频模板", () => {
        const certTemplates = getQuickTemplates("certs");
        expect(certTemplates.length).toBeGreaterThanOrEqual(5);
        const idCard = certTemplates.find((t) => t.id === "id_card");
        expect(idCard).toBeDefined();
        expect(idCard?.values.category).toBe("id");
        expect(idCard?.values.name).toBe("居民身份证");
    });

    it("获取囤货高频模板", () => {
        const stockTemplates = getQuickTemplates("stock");
        expect(stockTemplates.length).toBeGreaterThanOrEqual(4);
        const paper = stockTemplates.find((t) => t.id === "paper_tissue");
        expect(paper?.values.category).toBe("paper");
        expect(paper?.values.low_stock_at).toBe(2);
    });

    it("获取药箱高频模板", () => {
        const medTemplates = getQuickTemplates("medicine");
        expect(medTemplates.length).toBeGreaterThanOrEqual(3);
        const fever = medTemplates.find((t) => t.id === "cold_fever");
        expect(fever?.values.category).toBe("otc");
        expect(fever?.values.location).toBe("客厅药箱");
    });

    it("未配置模板的模块返回空数组", () => {
        expect(getQuickTemplates("unsupported-module")).toEqual([]);
    });
});
