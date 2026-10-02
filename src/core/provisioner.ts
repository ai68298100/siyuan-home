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
    createAttributeView, addAttributeViewColumn, KernelError,
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

export function isSiYuanId(v: string | undefined): boolean {
    return !!v && SIYUAN_ID_RE.test(v);
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
            if (hit.closed) await openNotebook(hit.id);
            return hit.id;
        }
    }
    // 首选落空：ID 被删 → 用默认名；名称（含 undefined）→ 原名/默认名
    const name = isSiYuanId(preferred) || !preferred ? DEFAULT_NOTEBOOK_NAME : preferred;
    const hit = byName(name);
    if (hit) {
        if (hit.closed) await openNotebook(hit.id);
        return hit.id;
    }
    return createNotebook(name);
}

/** 台账文档 hpath（笔记本内一级文档） */
export function ledgerHPath(titleI18n: string): string {
    return `/${DOC_TITLE_PREFIX}${titleI18n}`;
}

async function findLedgerDoc(notebookId: string, hpath: string): Promise<string | null> {
    const rows = await sql<{ id: string }>(
        `SELECT id FROM blocks WHERE type='d' AND box='${notebookId}' AND hpath='${hpath.replace(/'/g, "''")}' LIMIT 1`,
    );
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
    for (const col of schema.columns) {
        if (columns[col.key]) continue; // 已登记 → 不删不改（ensureColumns 约束，15/33.2）
        const keyID = newSiYuanId();
        try {
            await addAttributeViewColumn(avId, {
                keyID,
                name: opts.resolveName?.(col.key) ?? col.key,
                type: col.type,
                relationTargetAvID: col.type === "relation" ? memberAvId : undefined,
            });
            columns[col.key] = keyID;
        } catch (e) {
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
                    avId = await createAttributeView(found, newSiYuanId());
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
        const docId = await createDocWithMd(notebookId, hpath, `${titleI18n}\n\n{: placeholder-ledger }\n`);
        const avIdSeed = newSiYuanId();
        let avId: string | undefined;
        let provisional = false;
        let provisionError: string | undefined;
        try {
            avId = await createAttributeView(docId, avIdSeed);
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
