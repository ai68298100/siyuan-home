/**
 * 房屋台账与合同保修只读联动核对（§16/281波）：
 * 当查看房屋（house）台账记录时，只读检索合同（contracts）中相关的装修保修、
 * 租赁、物业服务等协议，核对当前保修/合同有效期、联系人与到期状态。
 */
import type { AvRow } from "@/core/siyuan";
import { localDateKey } from "@/core/hub/rule";

export interface MatchedHouseContract {
    id: string;
    title: string;
    category: string;
    party?: string;
    contact?: string;
    expiry?: string;
    daysLeft?: number;
    warrantyStatus: "valid" | "expiring" | "expired" | "unknown";
}

const HOUSE_CONTRACT_CATEGORIES = new Set([
    "rent",
    "renovation",
    "purchase",
    "property_ct",
]);

function cleanName(raw: string): string {
    return raw
        .replace(/(?:保修|维保|物业|服务|租赁|租房|买卖|购房|工程|室内|装修|住宅)+(?:合同|协议|单|书)?$/g, "")
        .replace(/(?:合同|协议|单|书)$/g, "")
        .trim()
        .toLowerCase();
}

/** 剥离楼栋房号后缀提取基础小区/建筑物名，如 "阳光花园3栋502" -> "阳光花园" */
function baseCommunityName(raw: string): string {
    return raw
        .replace(/(?:\d+[-_号楼栋单元室层户]|附?\d{3,4})+.*$/g, "")
        .trim()
        .toLowerCase();
}

function parseDaysLeft(expiry: string, today: string): number {
    const [ey, em, ed] = expiry.split("-").map(Number);
    const [ty, tm, td] = today.split("-").map(Number);
    const expDate = new Date(ey, (em ?? 1) - 1, ed ?? 1);
    const todayDate = new Date(ty, (tm ?? 1) - 1, td ?? 1);
    return Math.round((expDate.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000));
}

function cellString(row: AvRow, keyID?: string): string | undefined {
    if (!keyID) return undefined;
    const cell = row.cells?.[keyID];
    if (!cell) return undefined;
    if (cell.type === "text" && cell.text?.content) return String(cell.text.content).trim();
    if (cell.type === "block" && cell.block?.content) return String(cell.block.content).trim();
    if (cell.type === "date" && cell.date?.content) return String(cell.date.content).trim();
    if (cell.type === "select" && cell.select?.content) return String(cell.select.content).trim();
    return undefined;
}

function cellMemberId(row: AvRow, keyID?: string): string | undefined {
    if (!keyID) return undefined;
    const cell = row.cells?.[keyID];
    const blockIDs = cell?.relation?.blockIDs;
    return blockIDs && blockIDs.length > 0 ? blockIDs[0] : undefined;
}

/**
 * 检索并匹配与指定房屋台账相关的合同记录
 */
export function matchHouseContracts(
    houseRow: AvRow,
    houseCols: Record<string, string>,
    contractRows: AvRow[],
    contractCols: Record<string, string>,
    today: string = localDateKey(new Date()),
): MatchedHouseContract[] {
    const houseName = cellString(houseRow, houseCols.name) || "";
    const houseMember = cellMemberId(houseRow, houseCols.member);
    const cleanedHouseName = cleanName(houseName);

    const matches: MatchedHouseContract[] = [];

    for (const crow of contractRows) {
        const cname = cellString(crow, contractCols.name) || "";
        const ccat = cellString(crow, contractCols.category) || "";
        const cparty = cellString(crow, contractCols.party);
        const ccontact = cellString(crow, contractCols.contact);
        const cexpiry = cellString(crow, contractCols.expiry);
        const cnote = cellString(crow, contractCols.note) || "";
        const cmember = cellMemberId(crow, contractCols.member);

        const cleanedCName = cleanName(cname);

        let isMatch = false;

        // 规则 1：名称匹配（房屋名称与合同名称相互包含或清理后一致）
        if (cleanedHouseName && cleanedCName) {
            if (cleanedCName.includes(cleanedHouseName) || cleanedHouseName.includes(cleanedCName)) {
                isMatch = true;
            }
        }

        // 规则 1b：基础小区/建筑物名称匹配（如 "阳光花园3栋502" 匹配 "阳光花园物业服务合同"）
        if (!isMatch) {
            const baseCommunity = baseCommunityName(cleanedHouseName);
            if (baseCommunity.length >= 2 && cleanedCName.includes(baseCommunity)) {
                isMatch = true;
            }
        }

        // 规则 2：备注中明确提及房屋名称
        if (!isMatch && houseName && cnote.includes(houseName)) {
            isMatch = true;
        }

        // 规则 3：同责任成员，且合同类别属于房产协议范畴
        if (!isMatch && houseMember && cmember === houseMember && HOUSE_CONTRACT_CATEGORIES.has(ccat)) {
            isMatch = true;
        }

        if (isMatch) {
            let warrantyStatus: MatchedHouseContract["warrantyStatus"] = "unknown";
            let daysLeft: number | undefined;

            if (cexpiry && /^\d{4}-\d{2}-\d{2}$/.test(cexpiry)) {
                daysLeft = parseDaysLeft(cexpiry, today);
                if (daysLeft < 0) warrantyStatus = "expired";
                else if (daysLeft <= 30) warrantyStatus = "expiring";
                else warrantyStatus = "valid";
            }

            matches.push({
                id: crow.itemID,
                title: cname || "未命名合同",
                category: ccat,
                party: cparty,
                contact: ccontact,
                expiry: cexpiry,
                daysLeft,
                warrantyStatus,
            });
        }
    }

    // 排序：临期优先 > 在保优先 > 已过保 > 未知到期
    const statusPriority: Record<MatchedHouseContract["warrantyStatus"], number> = {
        expiring: 1,
        valid: 2,
        expired: 3,
        unknown: 4,
    };

    return matches.sort((a, b) => {
        const pDiff = statusPriority[a.warrantyStatus] - statusPriority[b.warrantyStatus];
        if (pDiff !== 0) return pDiff;
        if (a.daysLeft !== undefined && b.daysLeft !== undefined) {
            return a.daysLeft - b.daysLeft;
        }
        return a.title.localeCompare(b.title);
    });
}
