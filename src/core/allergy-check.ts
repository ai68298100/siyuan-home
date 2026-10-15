/**
 * 饮食食材与家庭健康过敏史联动筛查逻辑（MOD-12 / §16 & §10 过敏史联动 food）：
 * 纯函数、本地计算、零网络：
 * - 解析健康台账过敏史记录，提取过敏原特征词（如"花生"、"海鲜"、"牛奶"等）；
 * - 对菜谱/餐食的食材清单及餐品名称进行冲突比对；
 * - 命中时生成包含家庭成员姓名、冲突食材与就餐警示的风险报告，防范家庭误食风险。
 */

export interface FamilyAllergy {
    id?: string;
    name: string; // 记录名，如"花生过敏"
    diagnosis?: string;
    note?: string;
    memberId?: string;
    memberName?: string;
}

export interface AllergyConflictMatch {
    allergen: string;
    memberName: string;
    matchedIn: "name" | "ingredients";
    matchedText: string;
    warning: string;
}

const CLEANUP_REGEX = /(?:重度|轻度|严重|疑似)?(?:食物|辅食)?(?:不耐受|过敏史?|排容不耐受|观察期排容不耐受)?/g;

/**
 * 从健康台账过敏记录中提取过敏原核心词
 */
export function extractAllergenKeyword(name: string, diagnosis?: string): string {
    let raw = (diagnosis && diagnosis.trim()) ? diagnosis : name;
    // 处理带括号的如 "辅食观察期排容不耐受（牛油果）"
    const bracketMatch = raw.match(/[（(]([^()（）]+)[)）]/);
    if (bracketMatch?.[1]) {
        raw = bracketMatch[1];
    }
    const cleaned = raw.replace(CLEANUP_REGEX, "").replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "").trim();
    return cleaned || name.replace(/过敏/g, "").trim();
}

/**
 * 筛查菜品/食材中是否存在家庭成员过敏原冲突
 */
export function checkAllergyConflicts(
    dishName: string,
    ingredientsText: string,
    allergies: FamilyAllergy[],
): AllergyConflictMatch[] {
    const dName = (dishName ?? "").toLowerCase().trim();
    const ingText = (ingredientsText ?? "").toLowerCase().trim();
    const matches: AllergyConflictMatch[] = [];
    const seen = new Set<string>();

    for (const allergy of allergies) {
        const keyword = extractAllergenKeyword(allergy.name, allergy.diagnosis).toLowerCase();
        if (!keyword || keyword.length < 1) continue;

        const member = allergy.memberName || "家庭成员";
        const key = `${member}::${keyword}`;
        if (seen.has(key)) continue;

        let matchedIn: "name" | "ingredients" | null = null;
        let matchedText = "";

        if (ingText.includes(keyword)) {
            matchedIn = "ingredients";
            matchedText = keyword;
        } else if (dName.includes(keyword)) {
            matchedIn = "name";
            matchedText = keyword;
        }

        if (matchedIn) {
            seen.add(key);
            matches.push({
                allergen: keyword,
                memberName: member,
                matchedIn,
                matchedText,
                warning: `检测到【${member}】对【${keyword}】过敏，请注意避免食用！`,
            });
        }
    }

    return matches;
}
