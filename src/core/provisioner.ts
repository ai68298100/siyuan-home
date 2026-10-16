/**
 * 建库器（provisioner）：模块启用 → 幂等创建台账文档与数据库。
 * 落点：专用笔记本（默认 "🏠 小驴管家"，可配）。幂等：已启用再启用 = 跳过；
 * 版本升级补列不删不改。文档/av ID 记入 settings.dbRefs（01 ADR-3/5/7）。
 *
 * Spike 定案后走真实建库路径（siyuan.ts）：div 插入 → createIfNotExist → 加列。
 * members 库是 relation 列（member 列）的目标，先建 members 再建其他模块。
 *
 * D07/D08（2026-10-02）：
 * - 笔记本登记值兼容 ID 与历史名称；ID 查不到不把 ID 当名称建新笔记本；
 *   笔记本被关闭 → openNotebook 恢复而非新建。
 * - dbRef 文档检查区分瞬态错误（网络/响应异常 → 记录后原样返回，不重建）
 *   与内核明确报错（文档不存在 → 重建路径）。
 * - 复用原库时补列续跑（缺列只增不改），成功后清除旧 provisionError；
 *   补登记路径尝试按 root_id 找回 av 块，找回即复用原库。
 */
import type { HomeSettings, DbRef } from "@/types";
import type { ModuleSchema } from "./schema";
import {
    listNotebooks, createNotebook, openNotebook, createDocWithMd, getHPathByID, sql, newSiYuanId,
    createAttributeView, addAttributeViewColumn, renderLedger, KernelError, isWriteResultUnknown,
} from "./siyuan";

export interface DuplicateFinding {
    hpath: string;
    docIds: string[];
}

/** 33.2 重复检测：同一笔记本内同名台账文档（hpath 相同出现 >1 次） */
export async function findDuplicateLedgers(settings: HomeSettings): Promise<DuplicateFinding[]> {
    const notebookId = settings.dbRefs.members?.notebook ?? settings.dbRefs.certs?.notebook;
    if (!notebookId) return [];
    const rows = await sql<{ hpath: string; cnt: number }>(
        `SELECT hpath, COUNT(id) AS cnt FROM blocks
         WHERE type='d' AND box='${notebookId.replace(/'/g, "''")}' AND hpath LIKE '${DOC_TITLE_PREFIX}%'
         GROUP BY hpath HAVING cnt > 1`,
    );
    const out: DuplicateFinding[] = [];
    for (const r of rows) {
        const ids = await sql<{ id: string }>(
            `SELECT id FROM blocks WHERE type='d' AND box='${notebookId}' AND hpath='${r.hpath.replace(/'/g, "''")}'`,
        );
        out.push({ hpath: r.hpath, docIds: ids.map((x) => x.id) });
    }
    return out;
}

export const DEFAULT_NOTEBOOK_NAME = "🏠 小驴管家";
const DOC_TITLE_PREFIX = "台账 · ";

/** 思源 ID 形态（yyyyMMddHHmmss-xxxxxxx）：区分 dbRefs.notebook 里的 ID 与历史名称值（D07） */
const SIYUAN_ID_RE = /^\d{14}-[0-9a-z]{7}$/;

// The kernel can commit a notebook before its list endpoint/index observes it.
// Keep this recovery window short and bounded: a create with an unknown result
// must never be replayed, but it should get a chance to become visible before
// the caller is told that recovery failed.
const NOTEBOOK_RECOVERY_ATTEMPTS = 5;
const NOTEBOOK_RECOVERY_DELAY_MS = 250;

export function isSiYuanId(v: string | undefined): boolean {
    return !!v && SIYUAN_ID_RE.test(v);
}

async function createNotebookWithRecovery(name: string): Promise<string> {
    try {
        return await createNotebook(name, { idempotencyKey: `provision:notebook:create:${name}`, retries: 0 });
    } catch (error) {
        if (!isWriteResultUnknown(error)) throw error;
        // The create request may have committed before its response was lost.
        // Re-read by exact name before reporting an unresolved result; never
        // blindly submit a second create request. The list endpoint can lag the
        // create commit, so poll briefly before deciding the result is unknown.
        let matches: Awaited<ReturnType<typeof listNotebooks>> = [];
        for (let attempt = 0; attempt < NOTEBOOK_RECOVERY_ATTEMPTS; attempt++) {
            if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, NOTEBOOK_RECOVERY_DELAY_MS));
            matches = (await listNotebooks()).filter((notebook) => notebook.name === name);
            if (matches.length > 0) break;
        }
        if (matches.length === 1) return matches[0].id;
        throw new KernelError("/api/notebook/createNotebook", -408,
            matches.length > 1 ? `notebook creation is ambiguous for "${name}"` : `notebook creation result is unknown for "${name}"`);
    }
}

/**
 * 确保专用笔记本可用，返回笔记本 ID（D07）：
 * - 登记值为 ID → 按 ID 匹配；查不到（笔记本被删除）→ 落回默认名，绝不把 ID 当名称新建；
 * - 登记值为名称（历史值）→ 按名称匹配；
 * - 命中但已关闭 → openNotebook 恢复；未命中 → createNotebook。
 */
export async function ensureNotebook(preferred?: string): Promise<string> {
    const notebooks = await listNotebooks();
    const byId = (id: string) => notebooks.find((nb) => nb.id === id);
    const byName = (name: string) => notebooks.find((nb) => nb.name === name);
    if (preferred) {
        const hit = isSiYuanId(preferred) ? byId(preferred) : byName(preferred);
        if (hit) {
            if (hit.closed) await openNotebook(hit.id, { idempotencyKey: `provision:notebook:open:${hit.id}`, retries: 1 });
            return hit.id;
        }
    }
    // 首选落空：ID 被删 → 用默认名；名称（含 undefined）→ 原名/默认名
    const name = isSiYuanId(preferred) || !preferred ? DEFAULT_NOTEBOOK_NAME : preferred;
    const hit = byName(name);
    if (hit) {
        if (hit.closed) await openNotebook(hit.id, { idempotencyKey: `provision:notebook:open:${hit.id}`, retries: 1 });
        return hit.id;
    }
    return createNotebookWithRecovery(name);
}

/** 台账文档 hpath（笔记本内一级文档） */
export function ledgerHPath(titleI18n: string): string {
    return `/${DOC_TITLE_PREFIX}${titleI18n}`;
}

function stableAvSeed(moduleId: string, docId: string): string {
    let hash = 2166136261;
    for (const char of `${moduleId}:${docId}`) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    const timestamp = docId.match(/^(\d{14})-/)?.[1] ?? "20000101000000";
    return `${timestamp}-${(hash >>> 0).toString(36).padStart(7, "0")}`;
}

async function findLedgerDoc(notebookId: string, hpath: string): Promise<string | null> {
    const rows = await sql<{ id: string }>(
        `SELECT id FROM blocks WHERE type='d' AND box='${notebookId.replace(/'/g, "''")}' AND hpath='${hpath.replace(/'/g, "''")}' LIMIT 2`,
    );
    if (rows.length > 1) throw new KernelError("provision.findLedgerDoc", -409, `multiple ledger documents match "${hpath}"`);
    return rows[0]?.id ?? null;
}

/** 在文档内找既有 av 块（D08 补登记：文档在、登记丢 → 找回原库而非重建第二套） */
async function findAvBlockInDoc(docId: string): Promise<string | null> {
    const rows = await sql<{ id: string }>(
        `SELECT id FROM blocks WHERE type='av' AND root_id='${docId}' LIMIT 1`,
    );
    return rows[0]?.id ?? null;
}

/**
 * D07 错误分类（保守方向：宁可不重建，不误重建）：
 * - 网络层异常 / malformed envelope（TypeError、code=-1 且非"找不到"消息）→ 瞬态，不重建；
 * - 内核非 -1 错误码，或内核明确返回 "not found/不存在" → 文档缺失，走重建。
 */
export function isDocMissingError(e: unknown): boolean {
    if (!(e instanceof KernelError)) return false;
    if (e.code !== -1) return true;
    return /not found|不存在/i.test(e.kernelMsg);
}

function errText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

export interface ProvisionResult {
    dbRef: DbRef;
    created: boolean;
}

export interface ProvisioningReport {
    issues: { moduleId: string; message: string }[];
}

export function getProvisioningReport(settings: Pick<HomeSettings, "enabledModules" | "dbRefs">): ProvisioningReport {
    const issues: ProvisioningReport["issues"] = [];
    for (const moduleId of settings.enabledModules) {
        const ref = settings.dbRefs[moduleId];
        const message = ref?.provisionError ?? (!ref?.avId ? "Attribute view unavailable" : "");
        if (message) issues.push({ moduleId, message });
    }
    return { issues };
}

export interface ProvisionOptions {
    /** 列名解析（i18n）：列 key → 显示名（缺省用 key 本身） */
    resolveName?: (colKey: string) => string;
}

/** 补列（D08 只增不改）：跳过已登记列；返回完整 keyID 映射与首个失败摘要（undefined = 全部就绪） */
async function ensureColumns(
    avId: string | undefined,
    schema: ModuleSchema,
    existing: Record<string, string> | undefined,
    moduleId: string,
    opts: ProvisionOptions,
    memberAvId?: string,
): Promise<{ columns: Record<string, string>; error?: string }> {
    const columns: Record<string, string> = { ...(existing ?? {}) };
    let error: string | undefined;
    if (!avId) return { columns, error: error ?? "av unavailable" };
    let knownColumns: any[];
    try {
        knownColumns = (await renderLedger(avId)).columns ?? [];
    } catch (e) {
        return { columns, error: `column preflight: ${errText(e)}` };
    }
    for (const col of schema.columns) {
        if (columns[col.key]) continue; // 已登记 → 不删不改（ensureColumns 约束，15/33.2）
        const keyID = newSiYuanId();
        const columnName = opts.resolveName?.(col.key) ?? col.key;
        // Settings can be lost while the AV still contains the column. Reuse
        // the one preflight snapshot so existing columns are restored without
        // issuing another read for every field.
        const currentMatches = knownColumns.filter((candidate: any) =>
            candidate?.id === keyID || candidate?.name === columnName || candidate?.keyName === columnName,
        );
        if (currentMatches.length === 1 && currentMatches[0]?.id) {
            columns[col.key] = String(currentMatches[0].id);
            continue;
        }
        if (currentMatches.length > 1) {
            error = `column "${col.key}" has multiple matching keys`;
            continue;
        }
        try {
            await addAttributeViewColumn(avId, {
                keyID,
                name: columnName,
                type: col.type,
                relationTargetAvID: col.type === "relation" ? memberAvId : undefined,
            }, { idempotencyKey: `provision:column:${moduleId}:${col.key}`, retries: 0 });
            columns[col.key] = keyID;
            knownColumns.push({ id: keyID, name: columnName });
        } catch (e) {
            // The add may have committed while its response was lost. A
            // fresh view can safely recover the key; otherwise leave the
            // mapping missing so the next run can reconcile before creating.
            let recovered: any;
            for (let attempt = 0; attempt < (isWriteResultUnknown(e) ? 4 : 1); attempt++) {
                if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 300));
                try {
                    const recoveredView = await renderLedger(avId);
                    const matches = (recoveredView.columns ?? []).filter((candidate: any) =>
                        candidate?.id === keyID || candidate?.name === columnName || candidate?.keyName === columnName,
                    );
                    if (matches.length === 1) {
                        recovered = matches[0];
                        knownColumns = recoveredView.columns ?? [];
                    }
                    if (matches.length > 1) error = `column "${col.key}" recovery is ambiguous`;
                    if (matches.length > 0) break;
                } catch { /* keep trying briefly only when the write result is unknown */ }
            }
            if (recovered?.id) {
                columns[col.key] = String(recovered.id);
                continue;
            }
            // 补列失败不阻断建库（可重跑续补，33.2）
            error = `column "${col.key}": ${errText(e)}`;
            console.warn(`[siyuan-home] column "${col.key}" on "${moduleId}" deferred:`, error);
        }
    }
    return { columns, error };
}

/**
 * 为模块创建台账文档 + 数据库 + 全部列。幂等：
 * ① dbRefs 有效且非 provisional → 校验文档在（瞬态错误不重建）→ 补列续跑 → 清除旧错误；
 * ② 文档已存在但未登记（重装/手删设置）→ 找回 av 块复用原库 + 补列；
 * ③ 全新 → 建文档 → 建库 → 建列。单模块失败记 provisionError，不中断其他模块。
 */
export async function provisionModule(
    settings: HomeSettings,
    moduleId: string,
    schema: ModuleSchema,
    titleI18n: string,
    opts: ProvisionOptions = {},
): Promise<ProvisionResult> {
    const existing = settings.dbRefs[moduleId];
    if (existing?.docId && !existing.provisional) {
        let docMissing = false;
        try {
            await getHPathByID(existing.docId);
        } catch (e) {
            if (!isDocMissingError(e)) {
                // D07：网络/瞬态错误 → 记录后原样返回，不重建（防误删/重复建库）
                existing.provisionError = `doc check: ${errText(e)}`;
                return { dbRef: existing, created: false };
            }
            docMissing = true; // 内核明确报错 → 文档已被删除，落到下方重建流程
        }
        if (!docMissing) {
            // D08：复用原库 + 补列续跑（成功后清除旧 provisionError）
            const memberAvId = moduleId === "members" ? undefined : settings.dbRefs.members?.avId;
            const { columns, error } = await ensureColumns(existing.avId, schema, existing.columns, moduleId, opts, memberAvId);
            const dbRef: DbRef = { ...existing, columns, provisionError: error };
            settings.dbRefs[moduleId] = dbRef;
            return { dbRef, created: false };
        }
    }
    try {
        const notebookId = await ensureNotebook(existing?.notebook);
        const hpath = ledgerHPath(titleI18n);
        const found = await findLedgerDoc(notebookId, hpath);
        if (found) {
            // 补登记：优先找回文档内既有 av 块（D08），找不回才建新库
            let avId = await findAvBlockInDoc(found);
            if (!avId) {
                try {
                    avId = await createAttributeView(found, stableAvSeed(moduleId, found), { idempotencyKey: `provision:av:${moduleId}:${found}` });
                } catch {
                    avId = null; // av 创建失败 → provisional 落库，诊断可见
                }
            }
            const memberAvId = moduleId === "members" ? undefined : settings.dbRefs.members?.avId;
            const { columns, error } = await ensureColumns(avId, schema, existing?.columns, moduleId, opts, memberAvId);
            const dbRef: DbRef = { ...existing, docId: found, avId: avId ?? undefined, notebook: notebookId, provisional: !avId, columns, provisionError: error };
            settings.dbRefs[moduleId] = dbRef;
            return { dbRef, created: false };
        }
        let docId: string;
        try {
            docId = await createDocWithMd(notebookId, hpath, `${titleI18n}\n\n{: placeholder-ledger }\n`, {
                idempotencyKey: `provision:doc:${moduleId}:${notebookId}:${hpath}`,
                retries: 0,
            });
        } catch (error) {
            if (!isWriteResultUnknown(error)) throw error;
            let recovered: string | null = null;
            for (let attempt = 0; attempt < 5 && !recovered; attempt++) {
                if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250));
                recovered = await findLedgerDoc(notebookId, hpath);
            }
            if (!recovered) throw new KernelError("/api/filetree/createDocWithMd", -408, `document creation result is unknown for "${hpath}"`);
            docId = recovered;
        }
        const avIdSeed = stableAvSeed(moduleId, docId);
        let avId: string | undefined;
        let provisional = false;
        let provisionError: string | undefined;
        try {
            avId = await createAttributeView(docId, avIdSeed, { idempotencyKey: `provision:av:${moduleId}:${docId}` });
        } catch (e) {
            provisional = true;
            provisionError = errText(e);
            console.warn(`[siyuan-home] module "${moduleId}" provisioned provisionally:`, provisionError);
        }
        const memberAvId = moduleId === "members" ? undefined : settings.dbRefs.members?.avId;
        const { columns, error } = await ensureColumns(avId, schema, undefined, moduleId, opts, memberAvId);
        const dbRef: DbRef = { docId, avId, notebook: notebookId, provisional, columns, provisionError: provisionError ?? error };
        settings.dbRefs[moduleId] = dbRef;
        return { dbRef, created: true };
    } catch (e) {
        // D07：笔记本/文档创建失败（含瞬态）→ 记录，不向上抛（不中断其他模块建库）
        const msg = errText(e);
        console.warn(`[siyuan-home] provision "${moduleId}" failed:`, msg);
        const dbRef: DbRef = { ...existing, provisionError: msg };
        settings.dbRefs[moduleId] = dbRef;
        return { dbRef, created: false };
    }
}
