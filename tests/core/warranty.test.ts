import { describe, expect, it } from "vitest";
import { evaluateWarranty, matchWarrantyContracts, type ContractCandidate } from "../../src/core/warranty";

describe("evaluateWarranty (MOD-06 保修期时效评估)", () => {
    it("空日期或缺失时返回 unknown", () => {
        expect(evaluateWarranty("").status).toBe("unknown");
        expect(evaluateWarranty(undefined).status).toBe("unknown");
        expect(evaluateWarranty("invalid-date").status).toBe("unknown");
    });

    it("距离当前超过30天返回 valid 在保", () => {
        const res = evaluateWarranty("2026-12-31", "2026-10-15");
        expect(res.status).toBe("valid");
        expect(res.daysLeft).toBe(77);
        expect(res.labelKey).toBe("warranty.statusValid");
    });

    it("距离当前30天以内返回 soon 临期", () => {
        const res = evaluateWarranty("2026-10-31", "2026-10-15");
        expect(res.status).toBe("soon");
        expect(res.daysLeft).toBe(16);
        expect(res.labelKey).toBe("warranty.statusSoon");
    });

    it("已经到期返回 expired 已过保", () => {
        const res = evaluateWarranty("2026-09-01", "2026-10-15");
        expect(res.status).toBe("expired");
        expect(res.daysExpired).toBe(44);
        expect(res.labelKey).toBe("warranty.statusExpired");
    });
});

describe("matchWarrantyContracts (MOD-06 房屋保修合同匹配与排序)", () => {
    const contracts: ContractCandidate[] = [
        { name: "房屋租金协议", category: "rent", expiry: "2027-01-01" },
        { name: "全屋装修工程保修合同", category: "renovation", expiry: "2028-06-30", party: "阔达装饰" },
        { name: "中央空调安装及维保协议", category: "purchase", expiry: "2026-11-01", party: "格力官方" },
        { name: "物业工程保修承诺书", category: "property_ct", expiry: "2025-05-01", party: "万科物业" },
    ];

    it("按名称包含与类别匹配合同", () => {
        const matches = matchWarrantyContracts("中央空调", contracts, "2026-10-15");
        expect(matches.length).toBeGreaterThanOrEqual(1);
        expect(matches[0].contract.name).toBe("中央空调安装及维保协议");
        expect(matches[0].matchReason).toBe("name");
        expect(matches[0].evaluation.status).toBe("soon");
    });

    it("双重匹配（名称+装修类别）排在最前", () => {
        const matches = matchWarrantyContracts("全屋装修", contracts, "2026-10-15");
        expect(matches[0].contract.name).toBe("全屋装修工程保修合同");
        expect(matches[0].matchReason).toBe("both");
    });
});
