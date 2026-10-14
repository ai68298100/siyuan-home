/**
 * 成员数据访问层（A4/D04/D05/D06）：settings.members 为主数据引用，members 台账行为思源侧档案。
 * 所有 av 写入经本 DAL：设置页保存走 syncMembersToAv、成员页走 add/update/remove。
 * - 按 avItemId 精确写回（同名不误写他人）；无关联行时补建或回填；
 * - 支持清空生日等字段；AV 写失败记入 member.syncError（可见可重试，不阻断其他成员）；
 * - 成员删除仅移除引用（台账行保留，33 引用完整性：悬空引用显示"未指定成员"）。
 */
import type { Plugin } from "siyuan";
import type { FamilyMember, HomeSettings, DbRef, MemberRowCreatePending } from "@/types";
import { addDetachedRow, setCell, renderLedgerAll, RowIdentityPendingError } from "./siyuan";
import { saveSettings } from "./settings";
import { selectCellValue } from "./avcell";

export function colMsToLocalDate(ms?: number): string | undefined {
    if (!ms) return undefined;
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function errText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

/** Serialize member writes per plugin.  Settings and the members AV are a
 * small two-store transaction; concurrent dialogs must not interleave their
 * read/modify/write cycles and lose a sibling update. */
const memberWriteChains = new WeakMap<object, Promise<unknown>>();
function enqueueMemberWrite<T>(plugin: Plugin, run: () => Promise<T>): Promise<T> {
    const previous = memberWriteChains.get(plugin) ?? Promise.resolve();
    const next = previous.then(run);
    memberWriteChains.set(plugin, next.catch(() => undefined));
    return next;
}

/** 行级写入：主键 name + role/birthday/lunar；生日可清空（D05：清空字段） */
function memberOperationKey(prefix: string, m: FamilyMember): string {
    // Member id is stable across a retry; field fingerprint changes when a
    // later edit is intentionally submitted, so a replay cannot be confused
    // with a different payload under the same idempotency key.
    const fingerprint = [m.name.trim(), m.role, m.birthday ?? "", m.lunarBirthday ? "1" : "0"].join("|");
    return `${prefix}:${encodeURIComponent(m.id)}:${encodeURIComponent(fingerprint)}`;
}

async function writeMemberCells(ref: DbRef, itemID: string, m: FamilyMember, operationKey = memberOperationKey("member", m)): Promise<void> {
    const c = ref.columns ?? {};
    if (c.name) await setCell(ref.avId!, c.name, itemID, { type: "text", text: { content: m.name } }, { idempotencyKey: `${operationKey}:name`, retries: 1 });
    if (c.role) await setCell(ref.avId!, c.role, itemID, selectCellValue(m.role), { idempotencyKey: `${operationKey}:role`, retries: 1 });
    if (c.birthday) {
        await setCell(ref.avId!, c.birthday, itemID, m.birthday
            ? { type: "date", date: { content: new Date(`${m.birthday}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true } }
            : { type: "date", date: { isNotEmpty: false } }, { idempotencyKey: `${operationKey}:birthday`, retries: 1 });
    }
    if (c.lunar) await setCell(ref.avId!, c.lunar, itemID, { type: "checkbox", checkbox: { checked: !!m.lunarBirthday } }, { idempotencyKey: `${operationKey}:lunar`, retries: 1 });
}

function memberFingerprint(m: FamilyMember): MemberRowCreatePending["fingerprint"] {
    return { name: m.name.trim(), role: m.role, ...(m.birthday ? { birthday: m.birthday } : {}), lunarBirthday: !!m.lunarBirthday };
}

function cellText(row: { cells: Record<string, any> }, key?: string): string {
    if (!key) return "";
    const cell = row.cells[key];
    return String(cell?.text?.content ?? cell?.block?.content ?? "").trim();
}

function matchesFingerprint(row: { cells: Record<string, any> }, columns: Record<string, string> | undefined, fp: MemberRowCreatePending["fingerprint"]): boolean {
    if (!columns?.name || cellText(row, columns.name) !== fp.name) return false;
    if (columns.role) {
        const role = row.cells[columns.role]?.mSelect?.[0]?.content ?? row.cells[columns.role]?.select?.content ?? row.cells[columns.role]?.text?.content;
        if (role !== fp.role) return false;
    }
    if (columns.birthday) {
        const date = row.cells[columns.birthday]?.date;
        if (date?.isNotEmpty) {
            const value = colMsToLocalDate(date.content);
            if (value !== fp.birthday) return false;
        } else if (fp.birthday) return false;
    }
    if (columns.lunar) {
        const checked = row.cells[columns.lunar]?.checkbox?.checked;
        if (typeof checked === "boolean" && checked !== fp.lunarBirthday) return false;
    }
    return true;
}

interface PendingMemberRowResolution {
    candidates: string[];
    rowId?: string;
}

/** Read back the complete ledger and reconcile an uncertain create. Never guesses among
 * multiple rows and never turns an unresolved create into another create attempt. */
async function resolvePendingMemberRow(ref: DbRef, pending: MemberRowCreatePending): Promise<PendingMemberRowResolution> {
    if (pending.avId !== ref.avId) return { candidates: [] };
    const read = await renderLedgerAll(ref.avId!);
    if (!read.complete) throw new Error("成员台账未完整读取，无法核实行身份");
    const baseline = new Set(pending.baselineItemIds);
    const appeared = read.rows.filter((row) => !baseline.has(row.itemID));
    const matching = appeared.filter((row) => matchesFingerprint(row, ref.columns, pending.fingerprint));
    // A sole new row is uniquely attributable to this pending operation. With
    // concurrent additions, only a unique full member fingerprint is enough.
    if (matching.length === 1) return { candidates: [matching[0].itemID], rowId: matching[0].itemID };
    if (matching.length > 1) return { candidates: matching.map((row) => row.itemID) };
    if (appeared.length === 1 && pending.candidateItemIds.length === 0) {
        return { candidates: [appeared[0].itemID], rowId: appeared[0].itemID };
    }
    return { candidates: pending.candidateItemIds.filter((id) => appeared.some((row) => row.itemID === id)) };
}

async function reconcilePendingMemberRow(plugin: Plugin, settings: HomeSettings, ref: DbRef, m: FamilyMember): Promise<boolean> {
    const pending = m.avRowCreatePending;
    if (!pending) return false;
    const resolution = await resolvePendingMemberRow(ref, pending);
    pending.candidateItemIds = resolution.candidates;
    if (!resolution.rowId) {
        m.syncError = resolution.candidates.length
            ? `成员台账存在多个待确认候选行（${resolution.candidates.length}）`
            : "成员台账新建结果仍待核实；未再次创建行";
        await saveSettings(plugin, settings);
        return false;
    }
    m.avItemId = resolution.rowId;
    m.avRowCreatePending = undefined;
    m.syncError = undefined;
    // Persist the recovered identity before any follow-up cell write.
    await saveSettings(plugin, settings);
    try {
        await writeMemberCells(ref, resolution.rowId, m, memberOperationKey("member-create", m));
        m.syncError = undefined;
        await saveSettings(plugin, settings);
        return true;
    } catch (error) {
        m.syncError = errText(error);
        await saveSettings(plugin, settings);
        return false;
    }
}

/** 建行并回填 avItemId；失败记 syncError（身份未确认时防重试建行语义由调用方呈现，D02/D05） */
async function createMemberRow(plugin: Plugin, settings: HomeSettings, ref: DbRef, m: FamilyMember): Promise<boolean> {
    if (m.avRowCreatePending) return reconcilePendingMemberRow(plugin, settings, ref, m);
    let read;
    try {
        read = await renderLedgerAll(ref.avId!);
        if (!read.complete) throw new Error("成员台账未完整读取，无法安全新建成员行");
    } catch (e) {
        m.syncError = errText(e);
        return false;
    }
    const pending: MemberRowCreatePending = {
        avId: ref.avId!,
        baselineItemIds: read.rows.map((row) => row.itemID),
        candidateItemIds: [],
        fingerprint: memberFingerprint(m),
        startedAt: new Date().toISOString(),
    };
    m.avRowCreatePending = pending;
    m.syncError = "成员台账行正在创建；若请求结果未知，将先核实，不会重复创建";
    // This marker must reach durable settings before the non-replayable create.
    try { await saveSettings(plugin, settings); }
    catch (error) { m.avRowCreatePending = undefined; m.syncError = errText(error); return false; }
    try {
        const operationKey = memberOperationKey("member-create", m);
        const itemID = await addDetachedRow(ref.avId!, m.name, { idempotencyKey: `${operationKey}:row`, retries: 0 });
        m.avItemId = itemID;
        m.avRowCreatePending = undefined;
        m.syncError = undefined;
        await saveSettings(plugin, settings);
        await writeMemberCells(ref, itemID, m, operationKey);
        m.syncError = undefined;
        return true;
    } catch (e) {
        if (e instanceof RowIdentityPendingError) {
            pending.candidateItemIds = [...new Set(e.candidates)];
        } else {
            // A definite kernel rejection is safe to retry later; unknown
            // outcomes are wrapped above as RowIdentityPendingError.
            m.avRowCreatePending = undefined;
        }
        m.syncError = errText(e);
        try { await saveSettings(plugin, settings); } catch { /* keep the in-memory pending marker */ }
        return false;
    }
}

export async function addMember(plugin: Plugin, settings: HomeSettings, member: FamilyMember): Promise<void> {
    return enqueueMemberWrite(plugin, async () => {
        // A stable member id is the operation identity. Replaying a timed-out
        // submit cannot append another settings record and can resume any AV
        // sync that stopped after the row identity had already been saved.
        const previous = settings.members;
        if (!previous.some((m) => m.id === member.id)) settings.members = [...previous, member];
        try {
            await saveSettings(plugin, settings);
        } catch (error) {
            settings.members = previous;
            throw error;
        }
        const ref = settings.dbRefs.members;
        const currentMember = settings.members.find((m) => m.id === member.id) ?? member;
        if (ref?.avId && ref.columns) {
            if (!currentMember.avItemId) {
                await createMemberRow(plugin, settings, ref, currentMember); // 失败不阻断：设置侧已生效，syncError 可见可重试
            } else if (currentMember.syncError) {
                try {
                    await writeMemberCells(ref, currentMember.avItemId, currentMember, memberOperationKey("member-create", currentMember));
                    currentMember.syncError = undefined;
                } catch (error) {
                    currentMember.syncError = errText(error);
                }
            }
            await saveSettings(plugin, settings);
        }
    });
}

/** 编辑成员（D05）：设置侧为准；有 avItemId → 精确写回（含改名）；无 → 补建关联行 */
export async function updateMember(plugin: Plugin, settings: HomeSettings, member: FamilyMember): Promise<void> {
    return enqueueMemberWrite(plugin, async () => {
        const previous = settings.members;
        if (!previous.some((m) => m.id === member.id)) throw new Error("member not found");
        settings.members = previous.map((m) => (m.id === member.id ? member : m));
        try {
            await saveSettings(plugin, settings);
        } catch (error) {
            settings.members = previous;
            throw error;
        }
        const ref = settings.dbRefs.members;
        if (!ref?.avId || !ref.columns) return;
        const target = settings.members.find((m) => m.id === member.id)!;
        if (target.avItemId) {
            try {
                await writeMemberCells(ref, target.avItemId, target, memberOperationKey("member-update", target));
                target.syncError = undefined;
            } catch (e) {
                target.syncError = errText(e);
            }
        } else {
            await createMemberRow(plugin, settings, ref, target);
        }
        await saveSettings(plugin, settings);
    });
}

/** 成员显示排序（17 组/197 波：网格拖拽）：仅重排 settings.members（台账行序不动，行序无显示语义）。
 * orderedIds 未覆盖的成员（并发新增等）按原相对顺序附尾，不丢人。 */
export async function reorderMembers(plugin: Plugin, settings: HomeSettings, orderedIds: string[]): Promise<void> {
    return enqueueMemberWrite(plugin, async () => {
        const rank = new Map(orderedIds.map((id, i) => [id, i]));
        const previous = settings.members;
        settings.members = [...previous].sort((a, b) =>
            (rank.get(a.id) ?? orderedIds.length) - (rank.get(b.id) ?? orderedIds.length));
        try { await saveSettings(plugin, settings); }
        catch (error) { settings.members = previous; throw error; }
    });
}

/** 删除成员：仅移除设置侧引用（台账行保留） */
export async function removeMember(plugin: Plugin, settings: HomeSettings, id: string): Promise<void> {
    return enqueueMemberWrite(plugin, async () => {
        const previous = settings.members;
        settings.members = previous.filter((m) => m.id !== id);
        if (settings.members.length === previous.length) return;
        try { await saveSettings(plugin, settings); }
        catch (error) { settings.members = previous; throw error; }
    });
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
            if (m.avRowCreatePending) {
                if (await createMemberRow(plugin, settings, ref, m)) report.created++;
                else report.failed.push(m.name);
            } else if (!before) {
                if (!m.avItemId && (await createMemberRow(plugin, settings, ref, m))) report.created++;
                else if (!m.avItemId) report.failed.push(m.name);
            } else if (memberChanged(before, m)) {
                if (m.avItemId) {
                    await writeMemberCells(ref, m.avItemId, m, memberOperationKey("member-sync", m));
                    m.syncError = undefined;
                    report.updated++;
                } else if (await createMemberRow(plugin, settings, ref, m)) {
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
    ambiguous: { memberId: string; member: string; candidates: AmbiguousCandidate[] }[];
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
    const ledger = await renderLedgerAll(ref.avId);
    if (!ledger.complete) throw new Error("成员台账未完整读取，不能安全回填关联");
    const { rows } = ledger;
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
            const s = v?.mSelect?.[0]?.content ?? v?.select?.content ?? v?.text?.content ?? "";
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
        if (m.avRowCreatePending) {
            try {
                const resolution = await resolvePendingMemberRow(ref, m.avRowCreatePending);
                const nextCandidates = [...new Set(resolution.candidates)];
                if (JSON.stringify(nextCandidates) !== JSON.stringify(m.avRowCreatePending.candidateItemIds)) {
                    m.avRowCreatePending.candidateItemIds = nextCandidates;
                    dirty = true;
                }
                if (resolution.rowId) {
                    m.avItemId = resolution.rowId;
                    m.avRowCreatePending = undefined;
                    m.syncError = undefined;
                    result.linked.push(m.name);
                    dirty = true;
                } else if (nextCandidates.length > 1) {
                    m.syncError = `成员台账存在多个待确认候选行（${nextCandidates.length}）`;
                    result.ambiguous.push({
                        memberId: m.id,
                        member: m.name,
                        candidates: nextCandidates.map((id) => ({ id, summary: summaryOf(id) })),
                    });
                    dirty = true;
                } else {
                    m.syncError = "成员台账新建结果仍待核实；未再次创建行";
                    result.unmatched.push(m.name);
                    dirty = true;
                }
            } catch (error) {
                m.syncError = errText(error);
                result.unmatched.push(m.name);
                dirty = true;
            }
            continue;
        }
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
                memberId: m.id,
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
