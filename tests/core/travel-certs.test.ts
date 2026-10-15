import { describe, expect, it } from "vitest";
import { evaluateTravelCert, evaluateTravelCertsCheck, type CandidateCert, type TravelPlanContext } from "../../src/core/travel-certs";

describe("evaluateTravelCert (MOD-18 护照6个月黄金规则与证件时效)", () => {
    const travelDate = "2026-10-15";

    it("护照余期不足 6 个月（183天）触发 fail 拒绝风险警示", () => {
        const cert: CandidateCert = {
            id: "c1",
            name: "李小明中国护照",
            category: "passport",
            expiry: "2027-01-15", // 约 92 天后，严重不足 183 天
        };
        const res = evaluateTravelCert(cert, travelDate);
        expect(res.status).toBe("fail");
        expect(res.message).toContain("不足国际公认 6 个月");
        expect(res.daysLeft).toBe(92);
    });

    it("护照余期充裕（超过 210 天）通过核验", () => {
        const cert: CandidateCert = {
            id: "c2",
            name: "李小明中国护照",
            category: "passport",
            expiry: "2028-10-15", // 2 年后
        };
        const res = evaluateTravelCert(cert, travelDate);
        expect(res.status).toBe("pass");
        expect(res.message).toContain("符合出入境国际通行规则");
    });

    it("证件已过期判定为 fail", () => {
        const cert: CandidateCert = {
            id: "c3",
            name: "居民身份证",
            category: "id_card",
            expiry: "2026-09-01",
        };
        const res = evaluateTravelCert(cert, travelDate);
        expect(res.status).toBe("fail");
        expect(res.message).toContain("已过期");
    });

    it("缺失到期日判定为 unverified 提示人工核对", () => {
        const cert: CandidateCert = {
            id: "c4",
            name: "港澳通行证",
            category: "hk_macau",
        };
        const res = evaluateTravelCert(cert, travelDate);
        expect(res.status).toBe("unverified");
    });
});

describe("evaluateTravelCertsCheck", () => {
    it("汇总自查结论：包含不足6个月护照时总体状态为 fail", () => {
        const trip: TravelPlanContext = {
            tripName: "东京国庆游",
            destination: "日本东京",
            startDate: "2026-10-15",
        };
        const certs: CandidateCert[] = [
            { id: "c1", name: "护照", category: "passport", expiry: "2026-12-01" }, // 余期不足
            { id: "c2", name: "身份证", category: "id_card", expiry: "2030-01-01" },
        ];
        const summary = evaluateTravelCertsCheck(trip, certs);
        expect(summary.overallStatus).toBe("fail");
        expect(summary.conclusionText).toContain("护照余期不足 6 个月");
        expect(summary.checks).toHaveLength(2);
    });
});
