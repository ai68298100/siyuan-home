/**
 * 家庭提醒周期摘要（周报/月报）生成（§16/§17 306波）：
 * 依据当前提醒快照与运行态统计，聚合各模块紧急程度分布，
 * 生成可直接粘贴到思源文档或发送给家人的 Markdown 摘要文本。
 * 纯函数，无网络，100% 可单元测试。
 */

export interface DigestReminder {
    id: string;
    moduleId: string;
    title: string;
    dueDate: string;
    daysLeft: number;
    level: string;
}

export interface DigestModuleStat {
    moduleId: string;
    overdue: number;
    soon: number;
    lead: number;
    total: number;
}

export interface DigestOptions {
    /** 覆盖生成的基准日期（ISO YYYY-MM-DD），默认取当天 */
    today?: string;
    /** 摘要周期标题，如「本周」；默认「本周」 */
    periodLabel?: string;
    /** 每类最多列出的条目数（默认 5） */
    topN?: number;
}

export interface ReminderDigest {
    generatedAt: string;
    periodLabel: string;
    rangeStart: string;
    rangeEnd: string;
    counts: { overdue: number; soon: number; lead: number; total: number };
    modules: DigestModuleStat[];
    topUrgent: DigestReminder[];
    /** 与上周对比的紧急事项变化（数量差）；无历史时 null */
    overdueDelta: number | null;
}

const LEVEL_ORDER: Record<string, number> = { overdue: 0, soon: 1, lead: 2 };

function parseIsoLocal(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

function addDays(iso: string, days: number): string {
    const d = parseIsoLocal(iso);
    if (Number.isNaN(d.getTime())) return iso;
    d.setDate(d.getDate() + days);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * 生成提醒周期摘要数据
 */
export function buildReminderDigest(
    reminders: DigestReminder[],
    options: DigestOptions & { previousOverdue?: number | null } = {},
): ReminderDigest {
    const {
        today = new Date().toISOString().slice(0, 10),
        periodLabel = "本周",
        topN = 5,
        previousOverdue = null,
    } = options;

    const list = (reminders ?? []).filter((r) => r && r.id);
    const counts = { overdue: 0, soon: 0, lead: 0, total: list.length };
    const moduleMap = new Map<string, DigestModuleStat>();

    for (const r of list) {
        if (r.level === "overdue") counts.overdue++;
        else if (r.level === "soon") counts.soon++;
        else counts.lead++;

        let stat = moduleMap.get(r.moduleId);
        if (!stat) {
            stat = { moduleId: r.moduleId, overdue: 0, soon: 0, lead: 0, total: 0 };
            moduleMap.set(r.moduleId, stat);
        }
        if (r.level === "overdue") stat.overdue++;
        else if (r.level === "soon") stat.soon++;
        else stat.lead++;
        stat.total++;
    }

    const modules = Array.from(moduleMap.values()).sort(
        (a, b) =>
            b.overdue - a.overdue || b.soon - a.soon || b.total - a.total ||
            a.moduleId.localeCompare(b.moduleId),
    );

    const topUrgent = [...list]
        .sort(
            (a, b) =>
                (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) ||
                a.daysLeft - b.daysLeft ||
                a.title.localeCompare(b.title),
        )
        .slice(0, Math.max(1, topN));

    return {
        generatedAt: today,
        periodLabel,
        rangeStart: today,
        rangeEnd: addDays(today, 7),
        counts,
        modules,
        topUrgent,
        overdueDelta:
            previousOverdue === null || previousOverdue === undefined
                ? null
                : counts.overdue - previousOverdue,
    };
}

/**
 * 格式化摘要为 Markdown 文本（可直接粘贴到思源文档）
 */
export function formatDigestMarkdown(
    digest: ReminderDigest,
    moduleName: (id: string) => string = (id) => id,
): string {
    const { counts } = digest;
    const deltaText =
        digest.overdueDelta === null
            ? "（无历史对比）"
            : digest.overdueDelta === 0
                ? "（与上期持平）"
                : digest.overdueDelta > 0
                    ? `（较上期增加 ${digest.overdueDelta} 项）`
                    : `（较上期减少 ${Math.abs(digest.overdueDelta)} 项）`;

    const lines: string[] = [
        `# 🗓 家庭提醒${digest.periodLabel}摘要`,
        "",
        `> 生成于 ${digest.generatedAt} · 共 ${counts.total} 项待办`,
        "",
        `## 总览`,
        `- 🔴 已逾期：**${counts.overdue}** 项${deltaText}`,
        `- 🟠 7 天内：**${counts.soon}** 项`,
        `- 🟡 提醒窗口内：**${counts.lead}** 项`,
        "",
    ];

    if (digest.topUrgent.length > 0) {
        lines.push("## 最紧急事项");
        const badge = (level: string) => (level === "overdue" ? "🔴" : level === "soon" ? "🟠" : "🟡");
        for (const r of digest.topUrgent) {
            const when =
                r.daysLeft < 0
                    ? `逾期 ${Math.abs(r.daysLeft)} 天`
                    : r.daysLeft === 0
                        ? "今天到期"
                        : `${r.daysLeft} 天后`;
            lines.push(`- ${badge(r.level)} **${r.title}** · ${moduleName(r.moduleId)} · ${when}（${r.dueDate}）`);
        }
        lines.push("");
    } else {
        lines.push("🟢 当前没有需要处理的提醒，全家轻松！", "");
    }

    if (digest.modules.length > 0) {
        lines.push("## 模块分布");
        for (const m of digest.modules) {
            const parts: string[] = [];
            if (m.overdue > 0) parts.push(`逾期 ${m.overdue}`);
            if (m.soon > 0) parts.push(`7天内 ${m.soon}`);
            if (m.lead > 0) parts.push(`窗口内 ${m.lead}`);
            lines.push(`- ${moduleName(m.moduleId)}：${parts.join(" · ") || "—"}（共 ${m.total} 项）`);
        }
        lines.push("");
    }

    lines.push("---", "*由小驴管家自动生成 · 数据全部保存在本地思源工作空间*");
    return lines.join("\n");
}
