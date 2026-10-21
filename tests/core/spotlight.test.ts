import { describe, it, expect } from "vitest";
import { searchSpotlight, type SpotlightItem } from "@/core/spotlight";

describe("core/spotlight 全景生活检索", () => {
    const items: SpotlightItem[] = [
        { rowId: "1", moduleId: "certs", title: "居民身份证", location: "主卧抽屉", memberName: "驴爸爸", category: "id" },
        { rowId: "2", moduleId: "medicine", title: "布洛芬缓释胶囊", location: "客厅药箱", dueDate: "2027-05-01" },
        { rowId: "3", moduleId: "stock", title: "清风抽纸", location: "客厅储物柜" },
        { rowId: "4", moduleId: "contracts", title: "房屋租赁合同", amount: 3500, note: "每年10月续签" },
    ];

    it("空查询返回前 N 项", () => {
        expect(searchSpotlight(items, "")).toHaveLength(4);
    });

    it("按标题精准/包含搜索", () => {
        const res = searchSpotlight(items, "身份证");
        expect(res).toHaveLength(1);
        expect(res[0].moduleId).toBe("certs");
    });

    it("按存放位置搜索生活物品", () => {
        const res = searchSpotlight(items, "客厅");
        expect(res.map((r) => r.rowId)).toEqual(["2", "3"]);
    });

    it("按关联成员搜索", () => {
        const res = searchSpotlight(items, "爸爸");
        expect(res).toHaveLength(1);
        expect(res[0].rowId).toBe("1");
    });

    it("按备注关键词搜索", () => {
        const res = searchSpotlight(items, "续签");
        expect(res).toHaveLength(1);
        expect(res[0].moduleId).toBe("contracts");
    });

    it("无匹配返回空数组", () => {
        expect(searchSpotlight(items, "不存在的内容xyz")).toEqual([]);
    });
});
