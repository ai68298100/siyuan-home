/**
 * 存放位置索引（313 波，G4）：
 * 聚合各模块的 location / copy_location 列，回答"东西到底放哪了"。
 * 典型问法："护照复印件在哪""降压药放哪了""房产证在哪个柜子"。
 * 纯函数，无网络，100% 可单元测试。
 */

export interface LocationRowInput {
    /** 台账行块 id */
    rowId: string;
    moduleId: string;
    /** 物品/记录名称 */
    name: string;
    /** 存放位置（location 或 copy_location 的值） */
    location: string;
    /** 位置来源列：location | copy_location */
    source?: "location" | "copy_location";
    memberName?: string;
    /** 额外线索（备注/编号等） */
    hint?: string;
}

export interface LocationEntry {
    rowId: string;
    moduleId: string;
    name: string;
    location: string;
    source: "location" | "copy_location";
    memberName?: string;
    hint?: string;
}

export interface LocationGroup {
    location: string;
    entries: LocationEntry[];
}

export interface LocationIndex {
    groups: LocationGroup[];
    total: number;
    /** 出现次数最多的位置 Top N */
    topLocations: Array<{ location: string; count: number }>;
    /** 没有填写位置的行数（用于提示补齐） */
    missing: number;
}

function norm(s: string | undefined): string {
    return (s ?? "").trim();
}

/**
 * 构建位置索引：按位置分组，组内按模块+名称排序，组按条目数降序
 */
export function buildLocationIndex(
    rows: LocationRowInput[],
    options: { topN?: number; limitPerGroup?: number } = {},
): LocationIndex {
    const { topN = 5, limitPerGroup = 50 } = options;
    const bucket = new Map<string, LocationEntry[]>();
    let total = 0;
    let missing = 0;

    for (const r of rows ?? []) {
        if (!r) continue;
        const location = norm(r.location);
        const name = norm(r.name);
        if (!name) continue;
        if (!location) {
            missing++;
            continue;
        }
        total++;
        const entry: LocationEntry = {
            rowId: r.rowId,
            moduleId: r.moduleId,
            name,
            location,
            source: r.source ?? "location",
        };
        if (r.memberName) entry.memberName = r.memberName;
        if (r.hint) entry.hint = r.hint;
        const list = bucket.get(location) ?? [];
        list.push(entry);
        bucket.set(location, list);
    }

    const groups: LocationGroup[] = [...bucket.entries()]
        .map(([location, entries]) => ({
            location,
            entries: entries
                .sort((a, b) => a.moduleId.localeCompare(b.moduleId) || a.name.localeCompare(b.name))
                .slice(0, limitPerGroup),
        }))
        .sort((a, b) => b.entries.length - a.entries.length || a.location.localeCompare(b.location));

    const counts = [...bucket.entries()].map(([location, entries]) => ({ location, count: entries.length }));
    const topLocations = counts.sort((a, b) => b.count - a.count || a.location.localeCompare(b.location)).slice(0, topN);

    return { groups, total, topLocations, missing };
}

/**
 * 关键词检索：按名称 / 位置 / 备注模糊匹配（大小写不敏感）
 */
export function searchLocations(
    rows: LocationRowInput[],
    keyword: string,
): LocationEntry[] {
    const needle = norm(keyword).toLowerCase();
    if (!needle) return [];
    const out: LocationEntry[] = [];
    for (const r of rows ?? []) {
        if (!r) continue;
        const name = norm(r.name);
        const location = norm(r.location);
        if (!name) continue;
        const hay = `${name} ${location} ${r.moduleId} ${r.memberName ?? ""} ${r.hint ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) continue;
        out.push({
            rowId: r.rowId,
            moduleId: r.moduleId,
            name,
            location: location || "（未填写）",
            source: r.source ?? "location",
            ...(r.memberName ? { memberName: r.memberName } : {}),
            ...(r.hint ? { hint: r.hint } : {}),
        });
    }
    return out.sort((a, b) => a.location.localeCompare(b.location) || a.name.localeCompare(b.name));
}

/** 格式化位置索引为可复制文本 */
export function formatLocationIndexText(
    index: LocationIndex,
    label: (moduleId: string) => string = (m) => m,
): string {
    if (index.total === 0) return "暂无已填写存放位置的记录。";
    const lines: string[] = [`📦 家庭物品存放位置索引（${index.total} 条记录）`, ""];
    for (const g of index.groups) {
        lines.push(`【${g.location}】${g.entries.length} 件`);
        for (const e of g.entries) {
            const owner = e.memberName ? ` · ${e.memberName}` : "";
            const hint = e.hint ? ` · ${e.hint}` : "";
            lines.push(`  • ${e.name}（${label(e.moduleId)}${owner}）${hint}`);
        }
        lines.push("");
    }
    if (index.missing > 0) lines.push(`另有 ${index.missing} 条记录尚未填写存放位置。`);
    return lines.join("\n").trimEnd();
}
