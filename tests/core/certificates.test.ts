import { describe, expect, it } from "vitest";
import {
    CERTIFICATE_CATEGORY_OPTIONS,
    CERTIFICATE_PROFILES,
    CERTS_SCHEMA,
    getCertificateProfile,
    getCertificateReminderField,
    validateSchema,
} from "@/core/schema";

describe("证件分类与类型字段 profile", () => {
    it("覆盖常用证件分类，并保留历史 permit/license 值", () => {
        expect(CERTIFICATE_CATEGORY_OPTIONS).toEqual(expect.arrayContaining([
            "id", "passport", "permit", "license", "driver_license", "hkmo_permit", "tw_permit",
            "vocational_qualification", "professional_qualification",
            "graduation_cert", "degree_cert", "professional_title",
        ]));
        expect(CERTIFICATE_CATEGORY_OPTIONS).not.toContain("software_license");
    });

    it("每个分类都有独立字段，字段 key 全局唯一且包含扫描件字段", () => {
        const keys = Object.values(CERTIFICATE_PROFILES).flatMap((profile) => profile.fieldKeys);
        expect(new Set(keys).size).toBe(keys.length);
        for (const profile of Object.values(CERTIFICATE_PROFILES)) {
            expect(profile.fieldKeys.length).toBeGreaterThan(0);
            expect(profile.columns.some((column) => column.type === "mAsset")).toBe(true);
            expect(profile.fieldKeys.every((key) => key.startsWith("x_cert_"))).toBe(true);
        }
    });

    it("未知/历史分类安全回退 other，合法分类返回自身 profile", () => {
        expect(getCertificateProfile("passport").category).toBe("passport");
        expect(getCertificateProfile("legacy_future_value").category).toBe("other");
        expect(getCertificateProfile(undefined).category).toBe("other");
    });

    it("类型专属的签注/审验日期映射到共享 due 提醒列", () => {
        expect(getCertificateReminderField("hkmo_permit")).toBe("x_cert_hkmo_endorsement_expiry");
        expect(getCertificateReminderField("driver_license")).toBe("x_cert_driver_review_due");
        expect(getCertificateReminderField("graduation_cert")).toBeUndefined();
    });

    it("宽表 schema 无重复 key，且所有 profile 字段可幂等补列", () => {
        expect(validateSchema("certs", CERTS_SCHEMA)).toEqual([]);
        const keys = CERTS_SCHEMA.columns.map((column) => column.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).toEqual(expect.arrayContaining(getCertificateProfile("id").fieldKeys));
    });
});
