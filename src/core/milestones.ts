/**
 * 家庭大事记与重要时间轴节点（320波）：
 * 聚合育儿里程碑、升学毕业、成家置业、重要证件换发与大件购置，
 * 提炼为家庭编年史时间线，赋能年度回顾与家庭数字记忆传承。
 * 纯函数，无网络，100% 可单元测试。
 */

export interface MilestoneSourceRow {
    moduleId: string;
    rowId: string;
    title: string;
    date: string;
    memberId?: string;
    memberName?: string;
    category?: string;
    note?: string;
}

export type MilestoneKind = "family" | "growth" | "education" | "asset" | "document";

export interface FamilyMilestoneItem {
    id: string;
    moduleId: string;
    rowId: string;
    title: string;
    date: string;
    year: number;
    kind: MilestoneKind;
    icon: string;
    memberId?: string;
    memberName?: string;
    highlight?: string;
}

const MODULE_KIND_MAP: Record<string, MilestoneKind> = {
    parenting: "growth",
    schooling: "education",
    certs: "document",
    contracts: "family",
    house: "family",
    "assets-real": "asset",
    vehicles: "asset",
    pets: "growth",
};

const KIND_ICON_MAP: Record<MilestoneKind, string> = {
    family: "🏠",
    growth: "🌱",
    education: "🎓",
    asset: "💎",
    document: "📜",
};

/**
 * 聚合家庭全模块大事记时间线
 */
export function aggregateFamilyMilestones(
    rows: MilestoneSourceRow[],
    options: { year?: number; sortOrder?: "asc" | "desc"; topN?: number } = {},
): FamilyMilestoneItem[] {
    const { year, sortOrder = "desc", topN } = options;

    const validRows = (rows ?? []).filter((r) => {
        if (!r || !r.title || !r.date) return false;
        const m = /^\d{4}-\d{2}-\d{2}/.exec(r.date.trim());
        if (!m) return false;
        if (year && Number(r.date.slice(0, 4)) !== year) return false;
        return true;
    });

    const items: FamilyMilestoneItem[] = validRows.map((r) => {
        const date = r.date.trim().slice(0, 10);
        const y = Number(date.slice(0, 4));
        const kind = MODULE_KIND_MAP[r.moduleId] ?? "family";
        const icon = KIND_ICON_MAP[kind];
        return {
            id: `${r.moduleId}::${r.rowId}`,
            moduleId: r.moduleId,
            rowId: r.rowId,
            title: r.title.trim(),
            date,
            year: y,
            kind,
            icon,
            memberId: r.memberId,
            memberName: r.memberName,
            highlight: r.note ? r.note.slice(0, 60) : undefined,
        };
    });

    items.sort((a, b) =>
        sortOrder === "desc"
            ? b.date.localeCompare(a.date) || a.title.localeCompare(b.title)
            : a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
    );

    return topN && topN > 0 ? items.slice(0, topN) : items;
}

/**
 * 格式化输出家庭大事记编年史文本
 */
export function formatMilestonesText(
    items: FamilyMilestoneItem[],
    options: { title?: string } = {},
): string {
    const { title = "家庭生活大事记与里程碑编年史" } = options;
    if (!items || items.length === 0) return "暂无大事记记录。";

    const lines: string[] = [
        `📖 ${title}（共 ${items.length} 个节点）`,
        "──────────────────────",
    ];

    let currentYear = 0;
    for (const it of items) {
        if (it.year !== currentYear) {
            currentYear = it.year;
            lines.push(`\n📅 【${currentYear} 年】`);
        }
        const member = it.memberName ? ` · ${it.memberName}` : "";
        const note = it.highlight ? ` —— ${it.highlight}` : "";
        lines.push(`  ${it.icon} ${it.date} ${it.title}${member}${note}`);
    }

    return lines.join("\n").trimEnd();
}
