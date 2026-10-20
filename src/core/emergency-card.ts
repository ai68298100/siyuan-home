/**
 * 家庭急救与应急联络卡（§16/§17 318波，调研高阶特性）：
 * 从成员档案、健康过敏史、医保证件与应急储备中聚合提炼出家庭急救与防灾卡片，
 * 在突发就医、紧急避险或独居看护场景下，3 秒内呈现关键生命支持数据与联络通道。
 * 纯函数，无网络，100% 可单元测试。
 */

export interface MemberEmergencyProfile {
    memberId: string;
    name: string;
    role: string;
    bloodType?: string;
    allergies: string[];
    chronicConditions: string[];
    medicalInsuranceNo?: string;
    emergencyContact?: string;
    notes?: string;
}

export interface FamilyEmergencyCardData {
    generatedAt: string;
    members: MemberEmergencyProfile[];
    emergencyKitLocation?: string;
    evacuationAddress?: string;
    hasAllergies: boolean;
    criticalAlertsCount: number;
}

export interface HealthRowLike {
    name?: string;
    memberId?: string;
    category?: string;
    diagnosis?: string;
    hospital?: string;
    note?: string;
}

export interface CertRowLike {
    name?: string;
    memberId?: string;
    category?: string;
    number?: string;
    note?: string;
}

export interface StockRowLike {
    name?: string;
    category?: string;
    location?: string;
}

const BLOOD_TYPE_REGEX = /(Rh[+-阴阳]|AB|A|B|O)型?/i;

/** 从自由文本中嗅探血型 */
export function extractBloodType(text?: string): string | undefined {
    if (!text) return undefined;
    const m = text.match(BLOOD_TYPE_REGEX);
    return m ? m[0].toUpperCase().replace("型", "") + "型" : undefined;
}

/**
 * 聚合全家急救档案卡
 */
export function buildFamilyEmergencyCard(params: {
    members: Array<{ id: string; name: string; role?: string; notes?: string; contactSnapshot?: string }>;
    healthRows?: HealthRowLike[];
    certRows?: CertRowLike[];
    stockRows?: StockRowLike[];
    homeAddress?: string;
    generatedAt?: string;
}): FamilyEmergencyCardData {
    const {
        members = [],
        healthRows = [],
        certRows = [],
        stockRows = [],
        homeAddress,
        generatedAt = new Date().toISOString().slice(0, 10),
    } = params;

    let hasAllergies = false;
    let criticalAlertsCount = 0;

    // 1. 寻找应急物资储备位置
    const kit = (stockRows ?? []).find(
        (r) => r.category === "emergency_st" || (r.name ?? "").includes("应急包") || (r.name ?? "").includes("急救箱"),
    );
    const emergencyKitLocation = kit?.location || undefined;

    // 2. 遍历成员组装个人急救档案
    const memberProfiles: MemberEmergencyProfile[] = [];

    for (const m of members) {
        if (!m || !m.id) continue;
        const memberHealth = (healthRows ?? []).filter((h) => h.memberId === m.id);
        const memberCerts = (certRows ?? []).filter((c) => c.memberId === m.id);

        // 收集过敏源
        const allergies: string[] = [];
        for (const h of memberHealth) {
            if (h.category === "allergy" || (h.diagnosis ?? "").includes("过敏")) {
                const item = h.diagnosis || h.name || h.note;
                if (item && !allergies.includes(item)) allergies.push(item);
            }
        }
        if (allergies.length > 0) {
            hasAllergies = true;
            criticalAlertsCount += allergies.length;
        }

        // 收集慢病与长期用药诊断
        const chronicConditions: string[] = [];
        for (const h of memberHealth) {
            if (h.category === "medication" || h.category === "visit") {
                const diag = (h.diagnosis ?? "").trim();
                if (diag && !chronicConditions.includes(diag) && !allergies.includes(diag)) {
                    chronicConditions.push(diag);
                }
            }
        }

        // 收集医保/社保卡号
        const yibaoCert = memberCerts.find(
            (c) => c.category === "yibao" || (c.name ?? "").includes("医保") || (c.name ?? "").includes("社保"),
        );
        const medicalInsuranceNo = yibaoCert?.number || undefined;

        // 提取血型（从健康备注或成员备注）
        const bloodCandidate = memberHealth.map((h) => `${h.diagnosis ?? ""} ${h.note ?? ""}`).join(" ") + " " + (m.notes ?? "");
        const bloodType = extractBloodType(bloodCandidate);

        memberProfiles.push({
            memberId: m.id,
            name: m.name || "未命名成员",
            role: m.role || "other",
            bloodType,
            allergies,
            chronicConditions,
            medicalInsuranceNo,
            emergencyContact: m.contactSnapshot || undefined,
            notes: m.notes || undefined,
        });
    }

    return {
        generatedAt,
        members: memberProfiles,
        emergencyKitLocation,
        evacuationAddress: homeAddress,
        hasAllergies,
        criticalAlertsCount,
    };
}

/**
 * 格式化输出急救卡纯文本（可一键复制到微信或系统便签）
 */
export function formatEmergencyCardText(
    card: FamilyEmergencyCardData,
    options: { maskSensitive?: boolean } = {},
): string {
    const { maskSensitive = false } = options;
    const lines: string[] = [
        "🚨 家庭急救与应急联络卡",
        `更新日期：${card.generatedAt}`,
        "──────────────────────",
    ];

    if (card.emergencyKitLocation) {
        lines.push(`📦 家庭急救箱存放处：${card.emergencyKitLocation}`);
    }
    if (card.evacuationAddress) {
        lines.push(`🏠 应急家庭地址/避难点：${card.evacuationAddress}`);
    }
    if (card.emergencyKitLocation || card.evacuationAddress) {
        lines.push("──────────────────────");
    }

    for (const m of card.members) {
        const blood = m.bloodType ? ` · 血型：${m.bloodType}` : "";
        lines.push(`【${m.name}】（${m.role}）${blood}`);

        if (m.allergies.length > 0) {
            lines.push(`  ⚠️ 过敏史：${m.allergies.join("、")}`);
        }
        if (m.chronicConditions.length > 0) {
            lines.push(`  🩺 慢病/日常用药：${m.chronicConditions.join("、")}`);
        }
        if (m.medicalInsuranceNo) {
            let no = m.medicalInsuranceNo;
            if (maskSensitive && no.length > 8) {
                no = no.slice(0, 4) + " **** **** " + no.slice(-4);
            }
            lines.push(`  💳 医保卡号：${no}`);
        }
        if (m.emergencyContact) {
            lines.push(`  📞 紧急联系人：${m.emergencyContact}`);
        }
        lines.push("");
    }

    lines.push("📌 急救提示：发生紧急事故时，请第一时间拨打 120 / 119 并告知医护人员以上过敏史。");
    return lines.join("\n").trimEnd();
}
