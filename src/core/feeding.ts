/**
 * 婴幼儿辅食引入排敏观察期与健康过敏史联动（§16/282波）：
 * 辅食添加新食材遵循 3 天观察期规则，追踪排敏进度，核对健康库已知过敏源，
 * 并支持一键归档过敏反应至健康台账。
 */
import type { AvRow } from "@/core/siyuan";
import { localDateKey } from "@/core/hub/rule";

export interface FeedingObservation {
    introducedDate: string;
    observeUntil: string;
    observeDays: number;
    daysElapsed: number;
    status: "observing" | "completed" | "future";
    dayProgressText: string;
}

export interface KnownAllergy {
    id: string;
    name: string;
    reaction?: string;
    date?: string;
}

function parseYmd(ymd: string): Date {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function formatYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/**
 * 计算辅食 3 天观察期排期与进度
 */
export function evaluateFeedingObservation(
    introducedDate: string,
    today: string = localDateKey(new Date()),
    observeDays = 3,
): FeedingObservation | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(introducedDate)) return null;

    const introD = parseYmd(introducedDate);
    const todayD = parseYmd(today);

    const untilD = new Date(introD.getTime() + observeDays * 24 * 60 * 60 * 1000);
    const observeUntil = formatYmd(untilD);

    const diffDays = Math.round((todayD.getTime() - introD.getTime()) / (24 * 60 * 60 * 1000));

    if (diffDays < 0) {
        return {
            introducedDate,
            observeUntil,
            observeDays,
            daysElapsed: 0,
            status: "future",
            dayProgressText: "未开始",
        };
    }

    if (diffDays >= observeDays) {
        return {
            introducedDate,
            observeUntil,
            observeDays,
            daysElapsed: diffDays,
            status: "completed",
            dayProgressText: "观察期已过",
        };
    }

    const currentDay = diffDays + 1;
    return {
        introducedDate,
        observeUntil,
        observeDays,
        daysElapsed: diffDays,
        status: "observing",
        dayProgressText: `观察中（第 ${currentDay}/${observeDays} 天）`,
    };
}

/**
 * 从健康台账（health）中查找指定成员的过敏记录
 */
export function findMemberAllergies(
    memberAvItemId: string | undefined,
    healthRows: AvRow[],
    healthCols: Record<string, string>,
): KnownAllergy[] {
    const results: KnownAllergy[] = [];
    if (!healthCols.category || !healthCols.name) return results;

    for (const row of healthRows) {
        const catCell = row.cells?.[healthCols.category];
        const cat = catCell?.type === "select" ? catCell.select?.content : undefined;
        if (cat !== "allergy") continue;

        if (healthCols.member) {
            const memberBlockIds = row.cells?.[healthCols.member]?.relation?.blockIDs;
            if (memberBlockIds && memberBlockIds.length > 0) {
                if (!memberAvItemId || !memberBlockIds.includes(memberAvItemId)) {
                    continue;
                }
            }
        }

        const nameCell = row.cells?.[healthCols.name];
        const name = (nameCell?.type === "text" ? nameCell.text?.content : nameCell?.block?.content) || "";
        const diagCell = healthCols.diagnosis ? row.cells?.[healthCols.diagnosis] : undefined;
        const reaction = (diagCell?.type === "text" ? diagCell.text?.content : undefined)
            || (healthCols.note && row.cells?.[healthCols.note]?.type === "text" ? row.cells[healthCols.note].text?.content : undefined);
        const dateCell = healthCols.date ? row.cells?.[healthCols.date] : undefined;
        const date = dateCell?.type === "date" ? dateCell.date?.content : undefined;

        if (name) {
            results.push({
                id: row.itemID,
                name: String(name).trim(),
                reaction: reaction ? String(reaction).trim() : undefined,
                date: date ? String(date).trim() : undefined,
            });
        }
    }

    return results;
}

/**
 * 检查新食材是否与已知过敏源冲突
 */
export function checkAllergyConflict(foodName: string, knownAllergies: KnownAllergy[]): KnownAllergy | undefined {
    const clean = foodName.trim().toLowerCase();
    if (!clean) return undefined;
    return knownAllergies.find((a) => {
        const aname = a.name.trim().toLowerCase();
        return clean.includes(aname) || aname.includes(clean);
    });
}
