/**
 * 实物资产估值汇总与购物转资产映射（§16/§17 289波）：
 * 统计实物资产（assets-real）的初始购入成本、最新估值快照、资产净值增减及品类分布；
 * 提供购物记录向实物资产建档的纯函数字段映射。
 */
import type { AvRow } from "@/core/siyuan";
import type { RowLogs, ValuationEntry } from "@/core/rowlog";
import { getValuations } from "@/core/rowlog";

export interface AssetItemValuation {
    id: string;
    name: string;
    category?: string;
    status: string;
    purchaseAmount: number;
    currentValue: number;
    valueDelta: number;
    valueChangeRate: number; // 百分比
    hasValuationLog: boolean;
    latestValuationDate?: string;
    location?: string;
}

export interface AssetCategoryValuation {
    category: string;
    count: number;
    totalPurchaseAmount: number;
    totalCurrentValue: number;
}

export interface AssetValuationReport {
    totalItems: number;
    activeItems: number;
    disposedItems: number;
    totalInitialCost: number;
    totalCurrentValuation: number;
    netValuationChange: number;
    overallChangeRate: number; // 百分比
    categoryBreakdown: AssetCategoryValuation[];
    topValuedItems: AssetItemValuation[];
}

export interface ShoppingToAssetDraft {
    name: string;
    amount?: number;
    date?: string;
    channel?: string;
    memberId?: string;
    suggestedCategory: string;
    note?: string;
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

function cellNumber(row: AvRow, keyID?: string): number | undefined {
    if (!keyID) return undefined;
    const cell = row.cells?.[keyID];
    if (!cell) return undefined;
    if (cell.type === "number" && typeof cell.number?.content === "number" && Number.isFinite(cell.number.content)) {
        return cell.number.content;
    }
    return undefined;
}

function cellMemberId(row: AvRow, keyID?: string): string | undefined {
    if (!keyID) return undefined;
    const cell = row.cells?.[keyID];
    const blockIDs = cell?.relation?.blockIDs;
    return blockIDs && blockIDs.length > 0 ? blockIDs[0] : undefined;
}

/**
 * 汇总计算实物资产库的购入成本与当前估值分析
 */
export function calculateAssetValuationStats(
    rows: AvRow[],
    cols: Record<string, string>,
    rowLogs?: RowLogs,
    avId?: string,
): AssetValuationReport {
    let activeItems = 0;
    let disposedItems = 0;
    let totalInitialCost = 0;
    let totalCurrentValuation = 0;

    const items: AssetItemValuation[] = [];
    const catMap = new Map<string, { count: number; totalPurchase: number; totalCurrent: number }>();

    for (const row of rows) {
        const name = cellString(row, cols.name) || "未命名资产";
        const status = cellString(row, cols.status) || "inuse";
        const category = cellString(row, cols.category) || "other_ar";
        const purchaseAmount = cellNumber(row, cols.amount) ?? 0;
        const location = cellString(row, cols.location);

        if (status === "disposed") {
            disposedItems++;
            continue; // 已处置资产不计入在役净值
        }

        activeItems++;

        // 获取最新估值记录；若无估值流水则以原购入价作为基准估值
        let currentValue = purchaseAmount;
        let hasValuationLog = false;
        let latestValuationDate: string | undefined;

        if (rowLogs && avId) {
            const vals: ValuationEntry[] = getValuations(rowLogs, avId, row.itemID);
            if (vals.length > 0) {
                // 取最新日期的估值
                const sorted = [...vals].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
                const latest = sorted[0];
                if (typeof latest.value === "number" && Number.isFinite(latest.value)) {
                    currentValue = latest.value;
                    hasValuationLog = true;
                    latestValuationDate = latest.date;
                }
            }
        }

        const valueDelta = currentValue - purchaseAmount;
        const valueChangeRate = purchaseAmount > 0
            ? Math.round((valueDelta / purchaseAmount) * 1000) / 10
            : 0;

        totalInitialCost += purchaseAmount;
        totalCurrentValuation += currentValue;

        items.push({
            id: row.itemID,
            name,
            category,
            status,
            purchaseAmount,
            currentValue,
            valueDelta,
            valueChangeRate,
            hasValuationLog,
            latestValuationDate,
            location,
        });

        // 类别统计
        let cStat = catMap.get(category);
        if (!cStat) {
            cStat = { count: 0, totalPurchase: 0, totalCurrent: 0 };
            catMap.set(category, cStat);
        }
        cStat.count++;
        cStat.totalPurchase += purchaseAmount;
        cStat.totalCurrent += currentValue;
    }

    // 按当前估值降序
    items.sort((a, b) => b.currentValue - a.currentValue);

    const netValuationChange = totalCurrentValuation - totalInitialCost;
    const overallChangeRate = totalInitialCost > 0
        ? Math.round((netValuationChange / totalInitialCost) * 1000) / 10
        : 0;

    const categoryBreakdown: AssetCategoryValuation[] = Array.from(catMap.entries())
        .map(([category, stat]) => ({
            category,
            count: stat.count,
            totalPurchaseAmount: Math.round(stat.totalPurchase * 100) / 100,
            totalCurrentValue: Math.round(stat.totalCurrent * 100) / 100,
        }))
        .sort((a, b) => b.totalCurrentValue - a.totalCurrentValue);

    return {
        totalItems: activeItems + disposedItems,
        activeItems,
        disposedItems,
        totalInitialCost: Math.round(totalInitialCost * 100) / 100,
        totalCurrentValuation: Math.round(totalCurrentValuation * 100) / 100,
        netValuationChange: Math.round(netValuationChange * 100) / 100,
        overallChangeRate,
        categoryBreakdown,
        topValuedItems: items.slice(0, 10),
    };
}

/**
 * 将购物（shopping）台账行映射为实物资产（assets-real）建档草稿
 */
export function mapShoppingToAssetReal(
    shoppingRow: AvRow,
    shoppingCols: Record<string, string>,
): ShoppingToAssetDraft {
    const name = cellString(shoppingRow, shoppingCols.name) || "";
    const amount = cellNumber(shoppingRow, shoppingCols.amount);
    const date = cellString(shoppingRow, shoppingCols.date);
    const channel = cellString(shoppingRow, shoppingCols.channel);
    const memberId = cellMemberId(shoppingRow, shoppingCols.member);
    const rawCat = cellString(shoppingRow, shoppingCols.category) || "";
    const note = cellString(shoppingRow, shoppingCols.note);

    let suggestedCategory = "other_ar";
    if (rawCat === "digital") {
        suggestedCategory = "digital";
    } else if (rawCat === "apparel") {
        suggestedCategory = "apparel";
    } else if (rawCat === "daily") {
        suggestedCategory = "appliance";
    }

    return {
        name,
        amount,
        date,
        channel,
        memberId,
        suggestedCategory,
        note,
    };
}
