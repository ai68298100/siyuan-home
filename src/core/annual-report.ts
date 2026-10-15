/**
 * 家庭年度数据报告生成器（MOD-20 / §13 家庭年报生成器）：
 * 纯函数、本地计算、零网络：
 * - 汇总全年度家庭事项履约量（提醒/待办完成总数）；
 * - 汇总人情往来年度收礼、随礼与人情净额；
 * - 汇总文化生活（观影、追剧与阅读完成数及平均评分）；
 * - 汇总家庭资产估值家底与在用资产保有量；
 * - 生成结构化格式年报与复制分享文本。
 */

export interface AnnualReportOptions {
    year?: number;
    membersCount?: number;
    monthlyCompletions?: Record<string, number>;
    handledRecords?: Array<{ at?: string; title?: string }>;
    favorsSummary?: {
        totalIn: number;
        totalOut: number;
        netAmount: number;
        countIn: number;
        countOut: number;
    };
    mediaSummary?: {
        doneThisYearCount: number;
        consumingCount: number;
        averageRating: number;
    };
    assetValuation?: {
        totalValuation: number;
        activeItemCount: number;
    };
}

export interface FamilyAnnualReport {
    year: number;
    membersCount: number;
    totalRemindersCompleted: number;
    favors: {
        totalIn: number;
        totalOut: number;
        netAmount: number;
        countIn: number;
        countOut: number;
    };
    media: {
        doneCount: number;
        consumingCount: number;
        averageRating: number;
    };
    assets: {
        totalValuation: number;
        itemCount: number;
    };
}

/**
 * 汇总生成家庭年度生活报告
 */
export function generateAnnualReport(options: AnnualReportOptions): FamilyAnnualReport {
    const year = options.year ?? new Date().getFullYear();
    const yearPrefix = `${year}-`;

    // 1. 事项完成统计
    let completedSum = 0;
    if (options.monthlyCompletions) {
        for (const [monthKey, count] of Object.entries(options.monthlyCompletions)) {
            if (monthKey.startsWith(yearPrefix) && typeof count === "number" && count > 0) {
                completedSum += count;
            }
        }
    }
    if (completedSum === 0 && options.handledRecords?.length) {
        completedSum = options.handledRecords.filter((h) => h.at && h.at.startsWith(yearPrefix)).length;
    }

    // 2. 人情往来
    const f = options.favorsSummary ?? { totalIn: 0, totalOut: 0, netAmount: 0, countIn: 0, countOut: 0 };

    // 3. 影音书库
    const m = options.mediaSummary ?? { doneThisYearCount: 0, consumingCount: 0, averageRating: 0 };

    // 4. 资产家底
    const a = options.assetValuation ?? { totalValuation: 0, activeItemCount: 0 };

    return {
        year,
        membersCount: options.membersCount ?? 1,
        totalRemindersCompleted: completedSum,
        favors: {
            totalIn: f.totalIn,
            totalOut: f.totalOut,
            netAmount: f.netAmount,
            countIn: f.countIn,
            countOut: f.countOut,
        },
        media: {
            doneCount: m.doneThisYearCount,
            consumingCount: m.consumingCount,
            averageRating: m.averageRating,
        },
        assets: {
            totalValuation: a.totalValuation,
            itemCount: a.activeItemCount,
        },
    };
}

/**
 * 格式化输出家庭年度报告文本（用于复制与分享）
 */
export function formatAnnualReportText(
    report: FamilyAnnualReport,
    formatAmountFn: (n: number) => string,
): string {
    const lines: string[] = [
        `🏠【小驴管家 · ${report.year} 年度家庭生活总结】`,
        `👨‍👩‍👧‍👦 家庭协同：共 ${report.membersCount} 位家庭成员共同打理家底档案`,
        `✅ 事项履约：全年共高效完成 ${report.totalRemindersCompleted} 件家庭待办与到期事项`,
    ];

    if (report.favors.countIn > 0 || report.favors.countOut > 0) {
        const netStr = report.favors.netAmount >= 0 ? `净收礼 ¥ ${formatAmountFn(report.favors.netAmount)}` : `净随礼 ¥ ${formatAmountFn(Math.abs(report.favors.netAmount))}`;
        lines.push(`🎁 人情往来：收礼 ¥ ${formatAmountFn(report.favors.totalIn)}（${report.favors.countIn}笔）· 随礼 ¥ ${formatAmountFn(report.favors.totalOut)}（${report.favors.countOut}笔）· ${netStr}`);
    }

    if (report.media.doneCount > 0 || report.media.consumingCount > 0) {
        const scoreStr = report.media.averageRating > 0 ? ` · 均分 ★ ${report.media.averageRating}` : "";
        lines.push(`🎬 文化生活：全年观影与阅读 ${report.media.doneCount} 部/本${scoreStr} · 正在追更/阅读 ${report.media.consumingCount} 部`);
    }

    if (report.assets.itemCount > 0) {
        lines.push(`💎 资产家底：保有在用实物与虚拟资产 ${report.assets.itemCount} 件 · 当前估值总额 ¥ ${formatAmountFn(report.assets.totalValuation)}`);
    }

    lines.push("");
    lines.push("愿新的一年，日子清朗，家和安康。");

    return lines.join("\n").trim();
}
