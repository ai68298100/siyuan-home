/**
 * 美食菜谱食材与家庭成员忌口偏好及健康过敏史联动核对（§16/§17 291波）：
 * 解析菜谱食材清单，比对健康台账（health）中的过敏记录及成员（members）备注中的忌口偏好，
 * 给出高危过敏警示与忌口提醒，并支持将食材一键格式化为采购建议清单。
 */
import type { FamilyMember } from "@/types";
import type { AvRow } from "@/core/siyuan";
import { findMemberAllergies } from "@/core/feeding";

export interface DietaryConflict {
    memberName: string;
    memberId: string;
    type: "allergy" | "dislike";
    matchedItem: string;
    detail?: string;
}

export interface FoodDietaryCheckResult {
    isSafe: boolean;
    allergiesCount: number;
    dislikesCount: number;
    conflicts: DietaryConflict[];
    parsedIngredients: string[];
}

/**
 * 解析自由文本食材清单为标准化词条列表
 */
export function parseIngredients(raw: string): string[] {
    if (!raw || typeof raw !== "string") return [];
    return raw
        .split(/[\n\r,，、;；+ \t]+/g)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s !== "—" && !/^\d+[克gkg斤两勺个只盒包片ml毫升]?$/i.test(s));
}

/** 从成员备注中提取明确的忌口偏好词条（如“不吃香菜，不吃辣，忌海鲜”） */
export function extractMemberDislikes(notes: string | undefined): string[] {
    if (!notes || typeof notes !== "string") return [];
    const text = notes.trim().toLowerCase();
    const dislikes = new Set<string>();

    // 匹配 "不吃XXX"、"不喝XXX"、"忌XXX"、"忌口XXX"
    const regex = /(?:不吃|不喝|忌口|忌|免)([\u4e00-\u9fa5a-zA-Z0-9]+?)(?=[，,。；;\n\s]|$)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        const item = match[1].trim();
        if (item.length >= 1 && item.length <= 10) {
            dislikes.add(item);
        }
    }

    // 常见单字/词偏好
    const commonPatterns = ["香菜", "葱", "蒜", "姜", "辣椒", "辣", "花椒", "羊肉", "牛肉", "猪肉", "海鲜", "香菇"];
    for (const pat of commonPatterns) {
        if (text.includes(`不吃${pat}`) || text.includes(`无${pat}`) || text.includes(`免${pat}`)) {
            dislikes.add(pat);
        }
    }

    return Array.from(dislikes);
}

/**
 * 交叉比对菜品食材与家庭成员的健康过敏史及忌口偏好
 */
export function matchFoodDietaryConflicts(
    foodName: string,
    ingredientsRaw: string,
    members: FamilyMember[],
    healthRows?: AvRow[],
    healthCols?: Record<string, string>,
): FoodDietaryCheckResult {
    const parsedIngredients = parseIngredients(ingredientsRaw);
    const searchableTargets = [
        foodName.trim().toLowerCase(),
        ingredientsRaw.trim().toLowerCase(),
        ...parsedIngredients.map((s) => s.toLowerCase()),
    ];

    const conflicts: DietaryConflict[] = [];

    for (const member of members) {
        // 1. 比对健康台账（health）中的已知过敏史（高危）
        if (healthRows && healthCols && healthCols.category && healthCols.name) {
            const allergies = findMemberAllergies(member.avItemId, healthRows, healthCols);
            for (const allergy of allergies) {
                const aname = allergy.name.trim().toLowerCase();
                if (!aname) continue;

                const hit = searchableTargets.some((target) => target.includes(aname) || aname.includes(target));
                if (hit) {
                    conflicts.push({
                        memberName: member.name,
                        memberId: member.id,
                        type: "allergy",
                        matchedItem: allergy.name,
                        detail: allergy.reaction ? `过敏反应：${allergy.reaction}` : "健康档案记录过敏源",
                    });
                }
            }
        }

        // 2. 比对成员备注中的忌口偏好（中度提示）
        const dislikes = extractMemberDislikes(member.notes);
        for (const dislike of dislikes) {
            const hit = searchableTargets.some((target) => target.includes(dislike) || (dislike.length >= 2 && dislike.includes(target)));
            if (hit) {
                // 若已命中过敏则不再重复记录为忌口
                const alreadyAllergy = conflicts.some((c) => c.memberId === member.id && c.matchedItem.includes(dislike));
                if (!alreadyAllergy) {
                    conflicts.push({
                        memberName: member.name,
                        memberId: member.id,
                        type: "dislike",
                        matchedItem: dislike,
                        detail: "成员档案备注忌口",
                    });
                }
            }
        }
    }

    const allergiesCount = conflicts.filter((c) => c.type === "allergy").length;
    const dislikesCount = conflicts.filter((c) => c.type === "dislike").length;

    return {
        isSafe: conflicts.length === 0,
        allergiesCount,
        dislikesCount,
        conflicts,
        parsedIngredients,
    };
}

/**
 * 将菜谱食材清单格式化为采购建议文本
 */
export function formatShoppingIngredientsText(foodName: string, ingredients: string[]): string {
    const title = foodName ? `【${foodName} · 所需食材清单】` : `【菜谱食材采购清单】`;
    if (ingredients.length === 0) {
        return `${title}\n（暂无解析到的食材）`;
    }
    const lines = ingredients.map((item) => `· ${item} ×1`);
    return `${title}\n${lines.join("\n")}`;
}
