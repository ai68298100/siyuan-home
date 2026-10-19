/**
 * 宠物档案、生理年龄换算与驱虫疫苗健康护理（§16/§17 294波）：
 * 依据兽医权威标准（AAHA / AAFP）推算猫犬生理年龄与人类对等年龄、生命阶段（幼年/青年/成年/高龄），
 * 评估疫苗与驱虫到期状态，提供护理建议。
 */
import { localDateKey } from "@/core/hub/rule";

export type PetSpecies = "cat" | "dog" | "other_pet";
export type PetLifeStage = "junior" | "prime" | "mature" | "senior" | "geriatric";
export type CareUrgency = "ok" | "soon" | "overdue" | "not_set";

export interface PetAgeResult {
    chronologicalYears: number;
    chronologicalMonths: number;
    humanEquivalentAge: number;
    lifeStage: PetLifeStage;
    lifeStageLabel: string;
    description: string;
}

export interface CareItemStatus {
    key: "vaccine" | "deworm";
    dueDate?: string;
    daysDiff?: number;
    urgency: CareUrgency;
    label: string;
}

export interface PetCareSummary {
    ageInfo: PetAgeResult | null;
    vaccine: CareItemStatus;
    deworm: CareItemStatus;
    hasOverdue: boolean;
    hasSoon: boolean;
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
    const parts = ymd.split("-").map(Number);
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
    return { y: parts[0], m: parts[1], d: Number.isFinite(parts[2]) ? parts[2] : 1 };
}

/**
 * 换算猫犬生理年龄为人类对等年龄（AAHA/AAFP 权威模型）
 */
export function calculatePetAge(
    birthDate: string,
    species: string = "cat",
    today: string = localDateKey(new Date()),
): PetAgeResult | null {
    const b = parseYmd(birthDate);
    const t = parseYmd(today);
    if (!b || !t) return null;

    const birthTime = new Date(b.y, b.m - 1, b.d).getTime();
    const todayTime = new Date(t.y, t.m - 1, t.d).getTime();
    if (todayTime < birthTime) return null;

    let chronologicalYears = t.y - b.y;
    let chronologicalMonths = t.m - b.m;
    if (t.d < b.d) {
        chronologicalMonths--;
    }
    if (chronologicalMonths < 0) {
        chronologicalYears--;
        chronologicalMonths += 12;
    }

    let humanAge = 0;
    const isCat = species === "cat";

    if (chronologicalYears === 0) {
        // 第一年：0-12个月对应人类 1-15 岁
        humanAge = Math.max(1, Math.round((chronologicalMonths / 12) * 15));
    } else if (chronologicalYears === 1) {
        // 第二年：12-24个月对应人类 15-24 岁
        humanAge = Math.round(15 + (chronologicalMonths / 12) * 9);
    } else {
        // 2岁以上：之后每年约 +4 (猫) / 4.5 (犬) 岁
        const extraYears = (chronologicalYears - 2) + chronologicalMonths / 12;
        humanAge = Math.round(24 + extraYears * (isCat ? 4 : 4.5));
    }

    let lifeStage: PetLifeStage;
    let lifeStageLabel: string;
    let description: string;

    if (chronologicalYears < 1) {
        lifeStage = "junior";
        lifeStageLabel = isCat ? "幼猫期" : "幼犬期";
        description = "生长期，需注意母源抗体消退与基础免疫接种。";
    } else if (chronologicalYears <= 6) {
        lifeStage = "prime";
        lifeStageLabel = isCat ? "青年/成年猫" : "成年犬";
        description = "精力旺盛阶段，建议每年完成 1 次核心联苗与定期驱虫。";
    } else if (chronologicalYears <= 10) {
        lifeStage = "mature";
        lifeStageLabel = isCat ? "熟龄猫" : "成熟期";
        description = "进入中年阶段，建议每年进行一次常规体检与生化指标核查。";
    } else if (chronologicalYears <= 14) {
        lifeStage = "senior";
        lifeStageLabel = isCat ? "老年猫" : "高龄犬";
        description = "高龄阶段，需注意关节保健、肾脏指标与定期牙齿检查。";
    } else {
        lifeStage = "geriatric";
        lifeStageLabel = isCat ? "超高龄寿星猫" : "超高龄期";
        description = "长寿阶段，注意保暖、软食与安宁照护。";
    }

    return {
        chronologicalYears,
        chronologicalMonths,
        humanEquivalentAge: humanAge,
        lifeStage,
        lifeStageLabel,
        description,
    };
}

function evaluateCareItem(
    key: "vaccine" | "deworm",
    dueDate: string | undefined,
    today: string,
    leadDays: number,
): CareItemStatus {
    if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        return { key, urgency: "not_set", label: "未设置到期日" };
    }

    const d = parseYmd(dueDate)!;
    const t = parseYmd(today)!;
    const dueTime = new Date(d.y, d.m - 1, d.d).getTime();
    const todayTime = new Date(t.y, t.m - 1, t.d).getTime();
    const daysDiff = Math.round((dueTime - todayTime) / (24 * 60 * 60 * 1000));

    if (daysDiff < 0) {
        return { key, dueDate, daysDiff, urgency: "overdue", label: `已逾期 ${Math.abs(daysDiff)} 天` };
    }
    if (daysDiff <= leadDays) {
        return { key, dueDate, daysDiff, urgency: "soon", label: `${daysDiff} 天后到期` };
    }
    return { key, dueDate, daysDiff, urgency: "ok", label: `${daysDiff} 天后` };
}

/**
 * 汇总评估宠物的生理年龄与驱虫/疫苗护理状态
 */
export function evaluatePetSummary(
    birthDate?: string,
    species?: string,
    vaccineDue?: string,
    dewormDue?: string,
    today: string = localDateKey(new Date()),
): PetCareSummary {
    const ageInfo = birthDate ? calculatePetAge(birthDate, species, today) : null;
    const vaccine = evaluateCareItem("vaccine", vaccineDue, today, 14);
    const deworm = evaluateCareItem("deworm", dewormDue, today, 7);

    return {
        ageInfo,
        vaccine,
        deworm,
        hasOverdue: vaccine.urgency === "overdue" || deworm.urgency === "overdue",
        hasSoon: vaccine.urgency === "soon" || deworm.urgency === "soon",
    };
}
