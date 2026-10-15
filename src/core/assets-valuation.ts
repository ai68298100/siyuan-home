/**
 * 家庭资产估值汇总与统计（MOD-10 / §7 资产估值汇总统计卡）：
 * 纯函数、本地计算：
 * - 汇总实物资产与虚拟资产的现值/购置价值；
 * - 自动排除已处置/报废资产（status: disposed）；
 * - 支持结合行级估值快照（rowlog valuations）；
 * - 按分类统计资产占比与生成 Top 高价值资产排行。
 */

export interface AssetRowData {
    id?: string;
    name?: string;
    category?: string;
    status?: string;
    amount?: number;
    memberBlockId?: string;
}

export interface ValuationLogEntry {
    amount: number;
    at: string;
}

export interface CategoryValuation {
    category: string;
    amount: number;
    count: number;
    percentage: number; // 0 - 100
}

export interface TopAssetItem {
    id?: string;
    name: string;
    amount: number;
    category: string;
}

export interface AssetValuationSummary {
    totalValuation: number;
    totalRealValuation: number;
    totalVirtualValuation: number;
    activeItemCount: number;
    disposedItemCount: number;
    byCategory: CategoryValuation[];
    topAssets: TopAssetItem[];
}

/**
 * 计算实物与虚拟资产汇总估值
 */
export function calculateAssetValuation(
    realAssets: AssetRowData[],
    virtualAssets: AssetRowData[] = [],
    valuationLogs?: Record<string, ValuationLogEntry[]>,
): AssetValuationSummary {
    let totalRealValuation = 0;
    let totalVirtualValuation = 0;
    let activeItemCount = 0;
    let disposedItemCount = 0;

    const catMap = new Map<string, { amount: number; count: number }>();
    const topCandidates: TopAssetItem[] = [];

    // 处理实物资产
    for (const item of realAssets) {
        const isDisposed = item.status === "disposed";
        if (isDisposed) {
            disposedItemCount++;
            continue;
        }

        // 优先取 rowlog 最新手动估值，缺失回退到 item.amount
        let val = typeof item.amount === "number" && Number.isFinite(item.amount) && item.amount > 0 ? item.amount : 0;
        if (item.id && valuationLogs?.[item.id]?.length) {
            const logs = valuationLogs[item.id];
            const latest = logs[logs.length - 1];
            if (typeof latest.amount === "number" && Number.isFinite(latest.amount) && latest.amount > 0) {
                val = latest.amount;
            }
        }

        totalRealValuation += val;
        activeItemCount++;

        const cat = (item.category ?? "").trim() || "other_ar";
        const stat = catMap.get(cat) ?? { amount: 0, count: 0 };
        stat.amount += val;
        stat.count++;
        catMap.set(cat, stat);

        if (val > 0) {
            topCandidates.push({
                id: item.id,
                name: (item.name ?? "").trim() || "实物资产",
                amount: val,
                category: cat,
            });
        }
    }

    // 处理虚拟资产
    for (const item of virtualAssets) {
        const val = typeof item.amount === "number" && Number.isFinite(item.amount) && item.amount > 0 ? item.amount : 0;
        totalVirtualValuation += val;
        activeItemCount++;

        const cat = (item.category ?? "").trim() || "other_v";
        const stat = catMap.get(cat) ?? { amount: 0, count: 0 };
        stat.amount += val;
        stat.count++;
        catMap.set(cat, stat);

        if (val > 0) {
            topCandidates.push({
                id: item.id,
                name: (item.name ?? "").trim() || "虚拟资产",
                amount: val,
                category: cat,
            });
        }
    }

    const totalValuation = totalRealValuation + totalVirtualValuation;

    const byCategory: CategoryValuation[] = [...catMap.entries()].map(([category, stat]) => ({
        category,
        amount: stat.amount,
        count: stat.count,
        percentage: totalValuation > 0 ? Math.round((stat.amount / totalValuation) * 1000) / 10 : 0,
    })).sort((a, b) => b.amount - a.amount);

    const topAssets = topCandidates.sort((a, b) => b.amount - a.amount).slice(0, 5);

    return {
        totalValuation,
        totalRealValuation,
        totalVirtualValuation,
        activeItemCount,
        disposedItemCount,
        byCategory,
        topAssets,
    };
}
