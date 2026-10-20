import { describe, it, expect } from "vitest";
import {
    extractBloodType,
    buildFamilyEmergencyCard,
    formatEmergencyCardText,
    type HealthRowLike,
    type CertRowLike,
    type StockRowLike,
} from "@/core/emergency-card";

describe("core/emergency-card 家庭急救与应急联络卡（318波）", () => {
    describe("extractBloodType 血型嗅探", () => {
        it("识别常见血型", () => {
            expect(extractBloodType("体检结果显示 A型血 正常")).toBe("A型");
            expect(extractBloodType("B型")).toBe("B型");
            expect(extractBloodType("O型")).toBe("O型");
            expect(extractBloodType("AB型")).toBe("AB型");
            expect(extractBloodType("Rh+型")).toBe("RH+型");
        });

        it("无血型文本返回 undefined", () => {
            expect(extractBloodType("身体健康，无特殊体质")).toBeUndefined();
            expect(extractBloodType("")).toBeUndefined();
        });
    });

    describe("buildFamilyEmergencyCard 聚合", () => {
        const members = [
            { id: "m1", name: "爸爸", role: "self", notes: "平时易头晕，A型血", contactSnapshot: "13800000001" },
            { id: "m2", name: "孩子", role: "child", contactSnapshot: "班主任 13900000002" },
        ];

        const healthRows: HealthRowLike[] = [
            { memberId: "m2", category: "allergy", diagnosis: "青霉素过敏", name: "过敏" },
            { memberId: "m2", category: "allergy", diagnosis: "坚果过敏" },
            { memberId: "m1", category: "medication", diagnosis: "高血压慢性用药" },
        ];

        const certRows: CertRowLike[] = [
            { memberId: "m1", category: "yibao", number: "110101198001011234" },
        ];

        const stockRows: StockRowLike[] = [
            { name: "家用急救包", category: "emergency_st", location: "玄关入户柜第三层" },
        ];

        it("正确聚合过敏史、慢病、血型、医保与急救包位置", () => {
            const card = buildFamilyEmergencyCard({
                members,
                healthRows,
                certRows,
                stockRows,
                homeAddress: "北京市海淀区中关村南大街1号",
                generatedAt: "2026-10-20",
            });

            expect(card.generatedAt).toBe("2026-10-20");
            expect(card.emergencyKitLocation).toBe("玄关入户柜第三层");
            expect(card.evacuationAddress).toBe("北京市海淀区中关村南大街1号");
            expect(card.hasAllergies).toBe(true);
            expect(card.criticalAlertsCount).toBe(2);

            const m1 = card.members.find((m) => m.memberId === "m1")!;
            expect(m1.bloodType).toBe("A型");
            expect(m1.chronicConditions).toEqual(["高血压慢性用药"]);
            expect(m1.medicalInsuranceNo).toBe("110101198001011234");
            expect(m1.emergencyContact).toBe("13800000001");

            const m2 = card.members.find((m) => m.memberId === "m2")!;
            expect(m2.allergies).toEqual(["青霉素过敏", "坚果过敏"]);
            expect(m2.emergencyContact).toBe("班主任 13900000002");
        });

        it("空成员或空数据安全回退", () => {
            const card = buildFamilyEmergencyCard({ members: [] });
            expect(card.members).toHaveLength(0);
            expect(card.hasAllergies).toBe(false);
            expect(card.emergencyKitLocation).toBeUndefined();
        });
    });

    describe("formatEmergencyCardText 格式化", () => {
        const card = buildFamilyEmergencyCard({
            members: [
                { id: "m1", name: "爸爸", role: "self", notes: "A型血", contactSnapshot: "13800000001" },
            ],
            healthRows: [
                { memberId: "m1", category: "allergy", diagnosis: "青霉素过敏" },
            ],
            certRows: [
                { memberId: "m1", category: "yibao", number: "110101198001011234" },
            ],
            stockRows: [
                { category: "emergency_st", location: "客厅门后" },
            ],
            homeAddress: "花园小区1号楼",
            generatedAt: "2026-10-20",
        });

        it("生成完整格式的急救文本", () => {
            const text = formatEmergencyCardText(card);
            expect(text).toContain("家庭急救与应急联络卡");
            expect(text).toContain("家庭急救箱存放处：客厅门后");
            expect(text).toContain("应急家庭地址/避难点：花园小区1号楼");
            expect(text).toContain("【爸爸】（self） · 血型：A型");
            expect(text).toContain("⚠️ 过敏史：青霉素过敏");
            expect(text).toContain("医保卡号：110101198001011234");
            expect(text).toContain("紧急联系人：13800000001");
            expect(text).toContain("第一时间拨打 120 / 119");
        });

        it("支持敏感卡号脱敏展示", () => {
            const masked = formatEmergencyCardText(card, { maskSensitive: true });
            expect(masked).toContain("1101 **** **** 1234");
        });
    });
});
