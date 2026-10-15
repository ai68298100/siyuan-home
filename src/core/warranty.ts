/**
 * 房屋保修与维保合同联动核对逻辑（MOD-06 / §16 房屋保修联动 contracts）
 * 纯函数、本地计算：
 * - 评估保修期时效（在保/临期/已过保/未知）；
 * - 匹配关联的装修、维修、物业工程等合同；
 * - 提供保修范围、排除项、发票凭证与服务商确认的核对指引（在保日期不自动代表免费维修）。
 */

import { localDateKey } from "./hub/rule";

export type WarrantyStatus = "valid" | "soon" | "expired" | "unknown";

export interface WarrantyEvaluation {
    status: WarrantyStatus;
    daysLeft?: number;
    daysExpired?: number;
    labelKey: string;
}

export interface ContractCandidate {
    id?: string;
    name: string;
    category?: string;
    expiry?: string;
    party?: string;
    contact?: string;
    docId?: string;
}

export interface MatchedWarrantyContract {
    contract: ContractCandidate;
    evaluation: WarrantyEvaluation;
    matchReason: "category" | "name" | "both";
}

/**
 * 计算保修期状态
 */
export function evaluateWarranty(expiryDate?: string, todayKey?: string): WarrantyEvaluation {
    if (!expiryDate || expiryDate === "—" || expiryDate.trim() === "") {
        return { status: "unknown", labelKey: "warranty.statusUnknown" };
    }
    const todayStr = todayKey ?? localDateKey(new Date());
    const expDate = new Date(`${expiryDate}T00:00:00`);
    const curDate = new Date(`${todayStr}T00:00:00`);

    if (Number.isNaN(expDate.getTime()) || Number.isNaN(curDate.getTime())) {
        return { status: "unknown", labelKey: "warranty.statusUnknown" };
    }

    const diffMs = expDate.getTime() - curDate.getTime();
    const diffDays = Math.round(diffMs / 86400000);

    if (diffDays < 0) {
        return {
            status: "expired",
            daysExpired: Math.abs(diffDays),
            labelKey: "warranty.statusExpired",
        };
    }
    if (diffDays <= 30) {
        return {
            status: "soon",
            daysLeft: diffDays,
            labelKey: "warranty.statusSoon",
        };
    }
    return {
        status: "valid",
        daysLeft: diffDays,
        labelKey: "warranty.statusValid",
    };
}

/**
 * 为房屋事项匹配适用的维保/装修/工程合同
 */
export function matchWarrantyContracts(
    houseName: string,
    contracts: ContractCandidate[],
    todayKey?: string,
): MatchedWarrantyContract[] {
    const q = houseName.trim().toLowerCase();
    const results: MatchedWarrantyContract[] = [];

    for (const c of contracts) {
        const cName = c.name.toLowerCase();
        const isRenovationOrProperty = c.category === "renovation" || c.category === "property_ct";
        const nameMatched = q.length > 0 && (cName.includes(q) || q.includes(cName));

        if (isRenovationOrProperty || nameMatched) {
            const matchReason = (isRenovationOrProperty && nameMatched) ? "both" : nameMatched ? "name" : "category";
            const evaluation = evaluateWarranty(c.expiry, todayKey);
            results.push({
                contract: c,
                evaluation,
                matchReason,
            });
        }
    }

    // 排序：名称精确匹配优先，再按到期时间升序
    results.sort((a, b) => {
        if (a.matchReason === "both" && b.matchReason !== "both") return -1;
        if (b.matchReason === "both" && a.matchReason !== "both") return 1;
        if (a.matchReason === "name" && b.matchReason === "category") return -1;
        if (b.matchReason === "name" && a.matchReason === "category") return 1;
        const expA = a.contract.expiry ?? "9999-99-99";
        const expB = b.contract.expiry ?? "9999-99-99";
        return expA.localeCompare(expB);
    });

    return results;
}
