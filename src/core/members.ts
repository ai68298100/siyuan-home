/**
 * 成员数据访问层（A4/D04/D05/D06）：settings.members 为主数据引用，members 台账行为思源侧档案。
 * 所有 av 写入经本 DAL：设置页保存走 syncMembersToAv、成员页走 add/update/remove。
 * - 按 avItemId 精确写回（同名不误写他人）；无关联行时补建或回填；
 * - 支持清空生日等字段；AV 写失败记入 member.syncError（可见可重试，不阻断其他成员）；
 * - 成员删除仅移除引用（台账行保留，33 引用完整性：悬空引用显示"未指定成员"）。
 */
import type { Plugin } from "siyuan";
import type { FamilyMember, HomeSettings, DbRef } from "@/types";
import { addDetachedRow, setCell, renderLedgerAll } from "./siyuan";
import { saveSettings } from "./settings";

export function colMsToLocalDate(ms?: number): string | undefined {
    if (!ms) return undefined;
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function errText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

/** 行级写入：主键 name + role/birthday/lunar；生日可清空（D05：清空字段） */
async function writeMemberCells(ref: DbRef, itemID: string, m: FamilyMember): Promise<void> {
    const c = ref.columns ?? {};
    if (c.name) await setCell(ref.avId!, c.name, itemID, { type: "text", text: { content: m.name } });
    if (c.role) await setCell(ref.avId!, c.role, itemID, { type: "select", select: { content: m.role } });
    if (c.birthday) {
        await setCell(ref.avId!, c.birthday, itemID, m.birthday
            ? { type: "date", date: { content: new Date(`${m.birthday}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true } }
            : { type: "date", date: { isNotEmpty: false } });
    }
    if (c.lunar) await setCell(ref.avId!, c.lunar, itemID, { type: "checkbox", checkbox: { checked: !!m.lunarBirthday } });
}

/** 建行并回填 avItemId；失败记 syncError（身份未确认时防重试建行语义由调用方呈现，D02/D05） */
async function createMemberRow(ref: DbRef, m: FamilyMember): Promise<boolean> {
    try {
        const itemID = await addDetachedRow(ref.avId!, m.name);
        m.avItemId = itemID;
        await writeMemberCells(ref, itemID, m);
        m.syncError = undefined;
        return true;
    } catch (e) {
        m.syncError = errText(e);
        return false;
    }
}

export async function addMember(plugin: Plugin, settings: HomeSettings, member: FamilyMember): Promise<void> {
    settings.members = [...settings.members, member];
    await saveSettings(plugin, settings);
    const ref = settings.dbRefs.members;
    if (ref?.avId && ref.columns) {
        await createMemberRow(ref, member); // 失败不阻断：设置侧已生效，syncError 可见可重试
        await saveSettings(plugin, settings);
    }
}

/** 编辑成员（D05）：设置侧为准；有 avItemId → 精确写回（含改名）；无 → 补建关联行 */
export async function updateMember(plugin: Plugin, settings: HomeSettings, member: FamilyMember): Promise<void> {
    settings.members = settings.members.map((m) => (m.id === member.id ? member : m));
    await saveSettings(plugin, settings);
    const ref = settings.dbRefs.members;
    if (!ref?.avId || !ref.columns) return;
    const target = settings.members.find((m) => m.id === member.id)!;
    if (target.avItemId) {
        try {
            await writeMemberCells(ref, target.avItemId, target);
            target.syncError = undefined;
        } catch (e) {
            target.syncError = errText(e);
        }
    } else {
        await createMemberRow(ref, target);
    }
    await saveSettings(plugin, settings);
}

/** 成员显示排序（17 组/197 波：网格拖拽）：仅重排 settings.members（台账行序不动，行序无显示语义）。
 * orderedIds 未覆盖的成员（并发新增等）按原相对顺序附尾，不丢人。 */
export async function reorderMembers(plugin: Plugin, settings: HomeSettings, orderedIds: string[]): Promise<void> {
    const rank = new Map(orderedIds.map((id, i) => [id, i]));
    settings.members = [...settings.members].sort((a, b) =>
        (rank.get(a.id) ?? orderedIds.length) - (rank.get(b.id) ?? orderedIds.length));
    await saveSettings(plugin, settings);
}

/** 删除成员：仅移除设置侧引用（台账行保留） */
export async function removeMember(plugin: Plugin, settings: HomeSettings, id: string): Promise<void> {
    settings.members = settings.members.filter((m) => m.id !== id);
    await saveSettings(plugin, settings);
}

function memberChanged(a: FamilyMember, b: FamilyMember): boolean {
    return a.name !== b.name
        || a.role !== b.role
        || (a.birthday ?? "") !== (b.birthday ?? "")
        || !!a.lunarBirthday !== !!b.lunarBirthday;
}

export interface MemberSyncReport {
    created: number;
    updated: number;
    failed: string[];
}

/**
 * 设置页保存后的差异同步（D05 统一双写）：与保存前的成员快照比对，
 * 新增建行、变更写回、删除仅设置侧（行保留）。逐成员容错，失败进报告与 syncError。
 */
export async function syncMembersToAv(
    plugin: Plugin,
    settings: HomeSettings,
    prev: FamilyMember[],
): Promise<MemberSyncReport> {
    const ref = settings.dbRefs.members;
    const report: MemberSyncReport = { created: 0, updated: 0, failed: [] };
    if (!ref?.avId || !ref.columns) return report; // 未建库：仅设置侧生效（原语义）
    const prevById = new Map(prev.map((m) => [m.id, m]));
    let dirty = false;
    for (const m of settings.members) {
        const before = prevById.get(m.id);
        try {
            if (!before) {
                if (!m.avItemId && (await createMemberRow(ref, m))) report.created++;
                else if (!m.avItemId) report.failed.push(m.name);
            } else if (memberChanged(before, m)) {
                if (m.avItemId) {
                    await writeMemberCells(ref, m.avItemId, m);
                    m.syncError = undefined;
                    report.updated++;
                } else if (await createMemberRow(ref, m)) {
                    report.created++;
                } else {
                    report.failed.push(m.name);
                }
            }
        } catch (e) {
            m.syncError = errText(e);
            report.failed.push(m.name);
        }
        if ((m.syncError ?? undefined) !== (before?.syncError ?? undefined)) dirty = true;
    }
    if (report.created > 0 || report.updated > 0 || dirty) await saveSettings(plugin, settings);
    return report;
}

export interface AmbiguousCandidate {
    id: string;
    /** 候选行区分信息（角色·生日等，可空串）——同名候选之间用户靠它辨认（D06 收尾） */
    summary: string;
}

export interface BackfillResult {
    linked: string[];
    unmatched: string[];
    /** 同名多候选：不自动回填，附候选明细供人工选择对话框（D06） */
    ambiguous: { member: string; candidates: AmbiguousCandidate[] }[];
    /** 已有 avItemId 但台账行已不存在：清除关联并报告（D06） */
    stale: string[];
}

/**
 * 老成员关联回填（诊断区工具，D06）：按姓名主键匹配 members 库行。
 * - 唯一候选才自动回填；同名多候选进 ambiguous 不静默共用行；
 * - 已有 avItemId 也验证行存在，失效则清除关联（stale）；
 * - 重复运行不新增成员、不产生重复关联。
 */
export async function backfillMemberLinks(
    plugin: Plugin,
    settings: HomeSettings,
): Promise<BackfillResult> {
    const ref = settings.dbRefs.members;
    const empty: BackfillResult = { linked: [], unmatched: [], ambiguous: [], stale: [] };
    if (!ref?.avId || !ref.columns?.name) return empty;
    const { rows } = await renderLedgerAll(ref.avId);
    const nameKey = ref.columns.name;
    // D06 收尾：候选行区分摘要（角色/生日——ref.columns 里有才显示，缺失留空串）
    const roleKey = ref.columns.role;
    const birthdayKey = ref.columns.birthday;
    const summaryOf = (rowItemID: string): string => {
        const r = rows.find((x) => x.itemID === rowItemID);
        if (!r) return "";
        const parts: string[] = [];
        if (roleKey) {
            const v = r.cells[roleKey];
            const s = v?.select?.content ?? v?.text?.content ?? "";
            if (s) parts.push(s);
        }
        if (birthdayKey) {
            const v = r.cells[birthdayKey];
            const d = v?.date?.isNotEmpty ? colMsToLocalDate(v.date.content) : undefined;
            if (d) parts.push(d);
        }
        return parts.join(" · ");
    };
    const byName = new Map<string, string[]>();
    const rowIds = new Set(rows.map((r) => r.itemID));
    for (const r of rows) {
        const v = r.cells[nameKey];
        const name = (v?.text?.content ?? v?.block?.content ?? "").trim();
        if (!name) continue;
        byName.set(name, [...(byName.get(name) ?? []), r.itemID]);
    }
    const result: BackfillResult = empty;
    let dirty = false;
    for (const m of settings.members) {
        if (m.avItemId) {
            if (!rowIds.has(m.avItemId)) {
                m.avItemId = undefined;
                m.syncError = "ledger row missing";
                result.stale.push(m.name);
                dirty = true;
            }
            continue;
        }
        const cands = byName.get(m.name.trim()) ?? [];
        if (cands.length === 1) {
            m.avItemId = cands[0];
            m.syncError = undefined;
            result.linked.push(m.name);
            dirty = true;
        } else if (cands.length > 1) {
            result.ambiguous.push({
                member: m.name,
                candidates: cands.map((id) => ({ id, summary: summaryOf(id) })),
            });
        } else {
            result.unmatched.push(m.name);
        }
    }
    if (dirty) await saveSettings(plugin, settings);
    return result;
}
