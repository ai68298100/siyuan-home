/**
 * 儿童激励积分与零花钱账本联动（§16/§17 317波，调研缺口 G8）：
 * 将家务完成记录（chexecs）中累积的劳动激励积分汇总，
 * 并支持按兑换比例（如 10 积分 = 1 元）一键结算生成 allowance 零花钱账本的收入记录（category=reward, direction=in）。
 * 纯函数，无网络，100% 可单元测试。
 */

export interface RewardRecordItem {
    choreName: string;
    memberId?: string;
    date: string;
    points: number;
    settled?: boolean;
    note?: string;
    at?: string;
}

export interface MemberRewardSummary {
    memberId: string;
    totalEarned: number;
    totalSettled: number;
    unsettledPoints: number;
    settleableAmount: number;
    choreCount: number;
    unsettledChores: string[];
}

export interface RewardsReport {
    totalPointsAll: number;
    unsettledPointsAll: number;
    settleableAmountAll: number;
    members: MemberRewardSummary[];
    pointsPerYuan: number;
}

export interface AllowanceCreationPayload {
    name: string;
    memberId?: string;
    category: string;
    direction: "in";
    amount: number;
    date: string;
    note?: string;
    source: string;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * 汇总各成员的家务积分与可结算零花钱
 */
export function calculateMemberRewardPoints(
    records: RewardRecordItem[],
    memberIds: string[] = [],
    options: { pointsPerYuan?: number } = {},
): RewardsReport {
    const { pointsPerYuan = 10 } = options;
    const rate = Math.max(0.1, pointsPerYuan);

    const validRecords = (records ?? []).filter(
        (r) => r && Number.isFinite(r.points) && r.points > 0,
    );

    const allMemberIds = new Set<string>([
        ...memberIds,
        ...validRecords.map((r) => r.memberId).filter((id): id is string => Boolean(id)),
    ]);

    const memberSummaries: MemberRewardSummary[] = [];
    let totalPointsAll = 0;
    let unsettledPointsAll = 0;

    for (const memId of allMemberIds) {
        const memberRecs = validRecords.filter((r) => r.memberId === memId);
        let totalEarned = 0;
        let totalSettled = 0;
        let unsettledPoints = 0;
        const unsettledChoresSet = new Set<string>();

        for (const r of memberRecs) {
            totalEarned += r.points;
            if (r.settled) {
                totalSettled += r.points;
            } else {
                unsettledPoints += r.points;
                if (r.choreName) unsettledChoresSet.add(r.choreName);
            }
        }

        totalPointsAll += totalEarned;
        unsettledPointsAll += unsettledPoints;

        memberSummaries.push({
            memberId: memId,
            totalEarned,
            totalSettled,
            unsettledPoints,
            settleableAmount: round2(unsettledPoints / rate),
            choreCount: memberRecs.length,
            unsettledChores: Array.from(unsettledChoresSet),
        });
    }

    memberSummaries.sort(
        (a, b) => b.unsettledPoints - a.unsettledPoints || b.totalEarned - a.totalEarned,
    );

    return {
        totalPointsAll,
        unsettledPointsAll,
        settleableAmountAll: round2(unsettledPointsAll / rate),
        members: memberSummaries,
        pointsPerYuan: rate,
    };
}

/**
 * 将成员待结算积分转换为 allowance 账本的创建载荷
 */
export function mapPointsToAllowanceRow(
    summary: MemberRewardSummary,
    memberName: string,
    options: { date?: string; pointsPerYuan?: number } = {},
): AllowanceCreationPayload | null {
    if (!summary || summary.unsettledPoints <= 0) return null;
    const { date = new Date().toISOString().slice(0, 10), pointsPerYuan = 10 } = options;
    const amount = round2(summary.unsettledPoints / Math.max(0.1, pointsPerYuan));

    const choreDetail = summary.unsettledChores.length > 0
        ? `（包括：${summary.unsettledChores.join("、")}）`
        : "";

    return {
        name: `${memberName}家务积分兑换零花钱`,
        memberId: summary.memberId,
        category: "reward",
        direction: "in",
        amount,
        date,
        note: `结算 ${summary.unsettledPoints} 积分${choreDetail}`,
        source: "家务激励",
    };
}

/**
 * 格式化输出家庭积分账本简报
 */
export function formatRewardsSummaryText(
    report: RewardsReport,
    nameOf: (id: string) => string = (id) => id,
): string {
    const lines: string[] = [
        "🌟 家庭劳动积分与零花钱结算账本",
        `兑换汇率：${report.pointsPerYuan} 积分 = 1 元`,
        `全家累积：${report.totalPointsAll} 积分 · 待结算：${report.unsettledPointsAll} 积分（约 ¥${report.settleableAmountAll}）`,
        "──────────────────────",
    ];

    if (report.members.length === 0 || report.totalPointsAll === 0) {
        lines.push("暂无家务积分记录。每次完成家务时登记积分，即可在此兑换零花钱。");
        return lines.join("\n");
    }

    for (const m of report.members) {
        const memName = nameOf(m.memberId);
        const statusTag = m.unsettledPoints > 0
            ? `可结算 ${m.unsettledPoints} 分（¥${m.settleableAmount}）`
            : "已全额结算";
        lines.push(`• ${memName}：共获 ${m.totalEarned} 积分 · ${statusTag}`);
        if (m.unsettledChores.length > 0) {
            lines.push(`  待结家务：${m.unsettledChores.join("、")}`);
        }
    }

    return lines.join("\n");
}
