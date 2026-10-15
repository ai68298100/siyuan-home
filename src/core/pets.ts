/**
 * 宠物档案与疫苗/驱虫健康周期管理（MOD-15 / §10 宠物疫苗驱虫周期）：
 * 纯函数、本地计算、零网络：
 * - 汇总家庭宠物的狂犬/联苗（vaccine）与体内外驱虫（deworm）健康时效；
 * - 评估即将到期（soon）、已逾期（overdue）与正常状态；
 * - 提取最近急需打针或驱虫的宠物提醒列表，保障爱宠健康。
 */

import { localDateKey } from "./hub/rule";

export type PetCareStatus = "overdue" | "soon" | "ok" | "none";

export interface PetRowData {
    id?: string;
    name?: string;
    species?: "cat" | "dog" | "other_pet" | string;
    breed?: string;
    vaccine_due?: string;
    deworm_due?: string;
    cycle?: string;
    note?: string;
}

export interface PetCareItem {
    id?: string;
    name: string;
    species: string;
    breed: string;
    vaccineDue?: string;
    vaccineDaysLeft?: number;
    vaccineStatus: PetCareStatus;
    dewormDue?: string;
    dewormDaysLeft?: number;
    dewormStatus: PetCareStatus;
    needsCare: boolean;
}

export interface PetCareSummary {
    totalPets: number;
    upcomingVaccineCount: number;
    upcomingDewormCount: number;
    overdueCount: number;
    healthyCount: number;
    pets: PetCareItem[];
}

function evaluateDateStatus(dueStr?: string, todayStr?: string, leadDays = 14): { status: PetCareStatus; daysLeft?: number } {
    if (!dueStr || dueStr === "—" || !/^\d{4}-\d{2}-\d{2}$/.test(dueStr)) {
        return { status: "none" };
    }
    const today = todayStr ?? localDateKey(new Date());
    const dueDate = new Date(`${dueStr}T00:00:00`);
    const curDate = new Date(`${today}T00:00:00`);
    if (Number.isNaN(dueDate.getTime()) || Number.isNaN(curDate.getTime())) {
        return { status: "none" };
    }
    const diffDays = Math.round((dueDate.getTime() - curDate.getTime()) / 86400000);
    if (diffDays < 0) return { status: "overdue", daysLeft: diffDays };
    if (diffDays <= leadDays) return { status: "soon", daysLeft: diffDays };
    return { status: "ok", daysLeft: diffDays };
}

/**
 * 评估所有宠物的疫苗与驱虫健康状况
 */
export function calculatePetCareSummary(
    rows: PetRowData[],
    todayKey?: string,
): PetCareSummary {
    const today = todayKey ?? localDateKey(new Date());

    let upcomingVaccineCount = 0;
    let upcomingDewormCount = 0;
    let overdueCount = 0;
    let healthyCount = 0;

    const pets: PetCareItem[] = [];

    for (const r of rows) {
        const name = (r.name ?? "").trim();
        if (!name || name === "—") continue;

        const vEval = evaluateDateStatus(r.vaccine_due, today, 30);
        const dEval = evaluateDateStatus(r.deworm_due, today, 14);

        if (vEval.status === "soon") upcomingVaccineCount++;
        if (dEval.status === "soon") upcomingDewormCount++;
        if (vEval.status === "overdue" || dEval.status === "overdue") overdueCount++;

        const needsCare = vEval.status === "overdue" || vEval.status === "soon" || dEval.status === "overdue" || dEval.status === "soon";
        if (!needsCare && (vEval.status === "ok" || dEval.status === "ok")) {
            healthyCount++;
        }

        pets.push({
            id: r.id,
            name,
            species: (r.species ?? "").trim() || "other_pet",
            breed: (r.breed ?? "").trim(),
            vaccineDue: r.vaccine_due && r.vaccine_due !== "—" ? r.vaccine_due : undefined,
            vaccineDaysLeft: vEval.daysLeft,
            vaccineStatus: vEval.status,
            dewormDue: r.deworm_due && r.deworm_due !== "—" ? r.deworm_due : undefined,
            dewormDaysLeft: dEval.daysLeft,
            dewormStatus: dEval.status,
            needsCare,
        });
    }

    return {
        totalPets: pets.length,
        upcomingVaccineCount,
        upcomingDewormCount,
        overdueCount,
        healthyCount,
        pets,
    };
}
