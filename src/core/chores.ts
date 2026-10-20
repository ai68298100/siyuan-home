/**
 * 家务轮换与完成留痕（§16/§17 310 波，调研缺口 G1）：
 * 一项家务可给多位成员轮流做，系统按完成历史判定"这一轮该谁"，
 * 并把每次完成（谁做的、哪天、备注）落成流水，平息"轮到谁"的争议。
 * 纯函数，无网络，100% 可单元测试。
 */

export interface ChoreRotationMember {
    /** 成员 id（settings.members[].id） */
    id: string;
    name: string;
}

export interface ChoreCompletion {
    /** 完成者成员 id；未指定时为 undefined */
    memberId?: string;
    /** 完成日期 YYYY-MM-DD */
    date: string;
    /** 录入时刻 ISO（排序兜底，同日多次按此定序） */
    at?: string;
    note?: string;
}

export interface ChoreAssignee {
    member: ChoreRotationMember | null;
    /** 本轮是第几次轮换（从 1 起；无历史时为 1） */
    round: number;
    /** 该成员上一次做这件事的日期 */
    lastDone?: string;
    /** 自该成员上次完成起已过天数；从未做过为 undefined */
    daysSince?: number;
    /** 是否本轮到期（所有人做过一遍，或从未有人做过） */
    isDueNow: boolean;
}

function dayMs(iso: string): number {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return Number.NaN;
    return Date.UTC(y, m - 1, d);
}

function diffDays(from: string, to: string): number | undefined {
    const a = dayMs(from);
    const b = dayMs(to);
    if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
    return Math.round((b - a) / 86400000);
}

/** 按完成时间升序（同日按 at 升序），过滤非法条目 */
export function normalizeCompletions(list: ChoreCompletion[] | undefined): ChoreCompletion[] {
    return (list ?? [])
        .filter((c): c is ChoreCompletion => !!c && typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date))
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date) || (a.at ?? "").localeCompare(b.at ?? ""));
}

/**
 * 判定本轮该谁做：轮转列表中，取"最久没做（或从未做过）"的那位。
 * 约定：从未做过的人优先级最高；同样没做过的按列表顺序（保证结果确定）。
 */
export function nextAssignee(
    members: ChoreRotationMember[],
    completions: ChoreCompletion[] | undefined,
    today: string,
): ChoreAssignee {
    const roster = (members ?? []).filter((m) => m && m.id);
    const history = normalizeCompletions(completions);
    if (roster.length === 0) {
        return { member: null, round: history.length + 1, isDueNow: history.length > 0 };
    }

    const lastByMember = new Map<string, string>();
    for (const c of history) {
        if (!c.memberId) continue;
        lastByMember.set(c.memberId, c.date);
    }

    let picked: ChoreRotationMember | null = null;
    let pickedLast: string | undefined;
    let pickedKey = -1; // 越小越优先：从未做过 = -1
    for (const m of roster) {
        const last = lastByMember.get(m.id);
        const key = last ? lastByMember.size : -1; // 未做过优先；做过的人比较日期
        if (!picked) {
            picked = m;
            pickedLast = last;
            pickedKey = key;
            continue;
        }
        const better =
            (last === undefined && pickedLast !== undefined) ||
            (last !== undefined && pickedLast !== undefined && last < pickedLast) ||
            (last === undefined && pickedLast === undefined && key < pickedKey);
        // 相等时不替换，保持名单顺序（结果确定）
        if (better) {
            picked = m;
            pickedLast = last;
            pickedKey = key;
        }
    }

    const daysSince = pickedLast ? diffDays(pickedLast, today) : undefined;
    // 一轮的判定：名单上每个人都至少完成过一次
    const coveredAll = roster.every((m) => lastByMember.has(m.id));

    return {
        member: picked,
        round: history.length + 1,
        lastDone: pickedLast,
        daysSince,
        isDueNow: coveredAll || history.length === 0 || pickedLast === undefined,
    };
}

/**
 * 记录一次完成（不修改入参，返回新数组）
 */
export function recordCompletion(
    completions: ChoreCompletion[] | undefined,
    entry: ChoreCompletion,
): ChoreCompletion[] {
    const base = normalizeCompletions(completions);
    const next: ChoreCompletion = {
        date: entry.date,
        memberId: entry.memberId,
        at: entry.at ?? new Date().toISOString(),
        ...(entry.note ? { note: entry.note } : {}),
    };
    return normalizeCompletions([...base, next]);
}

/**
 * 构建完成历史（倒序，最近在前），并统计每位成员的次数
 */
export function buildChoreHistory(
    completions: ChoreCompletion[] | undefined,
    members: ChoreRotationMember[],
): {
    entries: Array<ChoreCompletion & { memberName: string; dayIndex: number }>;
    perMember: Array<{ memberId: string; name: string; count: number; lastDate?: string }>;
    total: number;
} {
    const nameOf = new Map((members ?? []).map((m) => [m.id, m.name]));
    const ordered = normalizeCompletions(completions);
    const entries = ordered
        .map((c, i) => ({
            ...c,
            memberName: c.memberId ? nameOf.get(c.memberId) ?? c.memberId : "（未指定）",
            dayIndex: i + 1,
        }))
        .reverse();

    const counts = new Map<string, { count: number; lastDate?: string }>();
    for (const c of ordered) {
        if (!c.memberId) continue;
        const cur = counts.get(c.memberId) ?? { count: 0 };
        cur.count++;
        cur.lastDate = c.date;
        counts.set(c.memberId, cur);
    }

    const perMember = (members ?? [])
        .map((m) => ({
            memberId: m.id,
            name: m.name,
            count: counts.get(m.id)?.count ?? 0,
            lastDate: counts.get(m.id)?.lastDate,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return { entries, perMember, total: ordered.length };
}

/**
 * 格式化为可粘贴的完成流水文本
 */
export function formatChoreHistoryText(
    memberName: string,
    assignee: ChoreAssignee,
    history: ReturnType<typeof buildChoreHistory>,
): string {
    const lines = [`🧹 ${memberName} · 家务轮换记录`];
    if (assignee.member) {
        const when =
            assignee.lastDone === undefined
                ? "（从未做过）"
                : `（上次 ${assignee.lastDone}${assignee.daysSince !== undefined ? `，距今 ${assignee.daysSince} 天` : ""}）`;
        lines.push(`本轮该谁：${assignee.member.name}${when}`);
    } else {
        lines.push("本轮该谁：未配置轮换名单");
    }
    lines.push(`累计完成：${history.total} 次`);
    if (history.perMember.length) {
        lines.push("", "成员次数：");
        for (const m of history.perMember) {
            lines.push(`  • ${m.name}：${m.count} 次${m.lastDate ? `（最近 ${m.lastDate}）` : ""}`);
        }
    }
    if (history.entries.length) {
        lines.push("", "最近完成：");
        for (const e of history.entries.slice(0, 10)) {
            lines.push(`  • ${e.date} ${e.memberName}${e.note ? ` —— ${e.note}` : ""}`);
        }
    }
    return lines.join("\n");
}
