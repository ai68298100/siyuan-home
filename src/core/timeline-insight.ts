/**
 * 家庭时间轴活跃度洞察（§16/§17 307波）：
 * 基于活动流快照（ActivityRecord），按成员与模块统计活跃度、识别记录空窗期，
 * 帮助家庭回顾"这半年家里在忙什么"以及"哪块台账长期没更新"。
 * 纯函数，无网络，100% 可单元测试。
 */

export interface InsightRecord {
    id: string;
    moduleId: string;
    memberId?: string;
    /** ISO 日期（优先 recordedAt，其次 eventDate） */
    date?: string;
}

export interface ModuleActivityStat {
    moduleId: string;
    count: number;
    lastDate?: string;
}

export interface MemberActivityStat {
    memberId: string;
    count: number;
}

export interface ActivityGap {
    moduleId: string;
    /** 距今未更新的天数 */
    idleDays: number;
    lastDate?: string;
}

export interface TimelineInsight {
    /** 统计窗口起止（ISO） */
    windowStart: string;
    windowEnd: string;
    total: number;
    /** 各模块活跃度，按次数降序 */
    modules: ModuleActivityStat[];
    /** 各成员活跃度，按次数降序 */
    members: MemberActivityStat[];
    /** 长期无更新的模块（按 idleDays 降序） */
    gaps: ActivityGap[];
    /** 最活跃的一个月（YYYY-MM）及其次数 */
    busiestMonth: { month: string; count: number } | null;
    /** 按月分布（升序） */
    monthly: Array<{ month: string; count: number }>;
}

export interface InsightOptions {
    /** 观察窗口天数，默认 180 天 */
    windowDays?: number;
    /** 基准日期（ISO，默认取传入 referenceDate 或本地当天） */
    today?: string;
    /** 判定"空窗"的最小天数，默认 60 天 */
    gapDays?: number;
    /** 参与空窗检测的模块白名单（未传入时仅统计有记录的模块） */
    knownModules?: string[];
}

function todayIso(): string {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
}

function toDayMs(iso: string): number {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return Number.NaN;
    return Date.UTC(y, m - 1, d);
}

function diffDays(fromIso: string, toIso: string): number {
    const a = toDayMs(fromIso);
    const b = toDayMs(toIso);
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
    return Math.round((b - a) / 86400000);
}

function shiftDays(iso: string, days: number): string {
    const ms = toDayMs(iso);
    if (Number.isNaN(ms)) return iso;
    const d = new Date(ms + days * 86400000);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

function monthOf(iso: string): string {
    const m = /^(\d{4})-(\d{2})/.exec(iso);
    return m ? `${m[1]}-${m[2]}` : "";
}

/**
 * 构建时间轴活跃度洞察
 */
export function buildTimelineInsight(
    records: InsightRecord[],
    options: InsightOptions = {},
): TimelineInsight {
    const { windowDays = 180, gapDays = 60, knownModules = [] } = options;
    const today = options.today ?? todayIso();
    const windowStart = shiftDays(today, -Math.max(1, windowDays));

    const inWindow: InsightRecord[] = [];
    for (const r of records ?? []) {
        if (!r || !r.date) continue;
        const date = r.date.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        const offset = diffDays(windowStart, date);
        const toToday = diffDays(date, today);
        if (Number.isNaN(offset) || offset < 0 || toToday < 0) continue;
        inWindow.push({ ...r, date });
    }

    const moduleMap = new Map<string, ModuleActivityStat>();
    const memberMap = new Map<string, MemberActivityStat>();
    const monthMap = new Map<string, number>();

    for (const r of inWindow) {
        const mod = moduleMap.get(r.moduleId) ?? { moduleId: r.moduleId, count: 0 };
        mod.count++;
        if (!mod.lastDate || (r.date as string) > mod.lastDate) mod.lastDate = r.date as string;
        moduleMap.set(r.moduleId, mod);

        if (r.memberId) {
            const mem = memberMap.get(r.memberId) ?? { memberId: r.memberId, count: 0 };
            mem.count++;
            memberMap.set(r.memberId, mem);
        }

        const mk = monthOf(r.date as string);
        if (mk) monthMap.set(mk, (monthMap.get(mk) ?? 0) + 1);
    }

    const modules = Array.from(moduleMap.values()).sort(
        (a, b) => b.count - a.count || a.moduleId.localeCompare(b.moduleId),
    );
    const members = Array.from(memberMap.values()).sort(
        (a, b) => b.count - a.count || a.memberId.localeCompare(b.memberId),
    );

    const monthly = Array.from(monthMap.entries())
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month));

    const busiestMonth =
        monthly.length > 0
            ? monthly.reduce((best, cur) => (cur.count > best.count ? cur : best), monthly[0])
            : null;

    // 空窗检测：白名单模块中从未记录，或最后记录早于 gapDays
    const gapTargets = knownModules.length > 0 ? knownModules : modules.map((m) => m.moduleId);
    const gaps: ActivityGap[] = [];
    for (const id of gapTargets) {
        const stat = moduleMap.get(id);
        const idleDays = stat?.lastDate ? diffDays(stat.lastDate, today) : windowDays + gapDays;
        if (!stat || (Number.isFinite(idleDays) && idleDays >= gapDays)) {
            gaps.push({ moduleId: id, idleDays, lastDate: stat?.lastDate });
        }
    }
    gaps.sort((a, b) => b.idleDays - a.idleDays || a.moduleId.localeCompare(b.moduleId));

    return {
        windowStart,
        windowEnd: today,
        total: inWindow.length,
        modules,
        members,
        gaps,
        busiestMonth,
        monthly,
    };
}

/**
 * 格式化为可读洞察摘要文本
 */
export function formatTimelineInsight(
    insight: TimelineInsight,
    nameOf: (id: string) => string = (id) => id,
): string {
    const lines: string[] = [
        "🕰 家庭时间轴活跃度洞察",
        `窗口：${insight.windowStart} ~ ${insight.windowEnd} · 共 ${insight.total} 条记录`,
    ];

    if (insight.total === 0) {
        lines.push("", "窗口内暂无活动记录。");
        return lines.join("\n");
    }

    if (insight.busiestMonth) {
        lines.push(`最活跃月份：${insight.busiestMonth.month}（${insight.busiestMonth.count} 条）`);
    }

    lines.push("", "模块活跃度 Top5：");
    for (const m of insight.modules.slice(0, 5)) {
        lines.push(`  • ${nameOf(m.moduleId)}：${m.count} 条（最近 ${m.lastDate}）`);
    }

    if (insight.members.length > 0) {
        lines.push("", "成员贡献 Top5：");
        for (const m of insight.members.slice(0, 5)) {
            lines.push(`  • ${nameOf(m.memberId)}：${m.count} 条`);
        }
    }

    if (insight.gaps.length > 0) {
        lines.push("", "⚠️ 长期未更新的模块：");
        for (const g of insight.gaps) {
            lines.push(
                g.lastDate
                    ? `  • ${nameOf(g.moduleId)}：已 ${g.idleDays} 天无更新（最近 ${g.lastDate}）`
                    : `  • ${nameOf(g.moduleId)}：窗口内无任何记录`,
            );
        }
    } else {
        lines.push("", "🟢 各模块均有近期更新。");
    }

    return lines.join("\n");
}
