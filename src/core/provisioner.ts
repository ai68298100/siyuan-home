/**
 * 建库器（provisioner）：模块启用 → 幂等创建台账文档与数据库。
 * 落点：专用笔记本（默认 "🏠 小驴管家"，可配）。幂等：已启用再启用 = 跳过；
 * 版本升级补列不删不改。文档/av ID 记入 settings.dbRefs（01 ADR-3/5/7）。
 *
 * Spike 定案后走真实建库路径（siyuan.ts）：div 插入 → createIfNotExist → 加列。
 * members 库是 relation 列（member 列）的目标，先建 members 再建其他模块。
 */
import type { HomeSettings, DbRef } from "@/types";
import type { ModuleSchema } from "./schema";
import {
    listNotebooks, createNotebook, createDocWithMd, getHPathByID, sql, newSiYuanId,
    createAttributeView, addAttributeViewColumn,
} from "./siyuan";

export const DEFAULT_NOTEBOOK_NAME = "🏠 小驴管家";
const DOC_TITLE_PREFIX = "台账 · ";

async function ensureNotebook(preferred?: string): Promise<string> {
    const name = preferred ?? DEFAULT_NOTEBOOK_NAME;
    const notebooks = await listNotebooks();
    const found = notebooks.find((nb) => nb.name === name && !nb.closed);
    if (found) return found.id;
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

export interface ProvisionResult {
    dbRef: DbRef;
    created: boolean;
}

export interface ProvisionOptions {
    /** 列名解析（i18n）：列 key → 显示名（缺省用 key 本身） */
    resolveName?: (colKey: string) => string;
}

/**
 * 为模块创建台账文档 + 数据库 + 全部列。幂等：
 * ① dbRefs 有效且非 provisional → 直接返回；
 * ② 文档已存在但未登记（重装/手删设置）→ 补登记后补列；
 * ③ 全新 → 建文档 → 建库 → 建列。
 * av 创建失败时降级 provisional（C7：向导可完整走通，Spike 已定案该路径仅剩内核异常场景）。
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
        try {
            await getHPathByID(existing.docId);
            return { dbRef: existing, created: false };
        } catch {
            // 文档已被删除 → 重建
        }
    }
    const notebookId = await ensureNotebook(existing?.notebook);
    const hpath = ledgerHPath(titleI18n);
    const found = await findLedgerDoc(notebookId, hpath);
    if (found) {
        const dbRef: DbRef = { ...existing, docId: found, notebook: notebookId };
        settings.dbRefs[moduleId] = dbRef;
        return { dbRef, created: false };
    }
    const docId = await createDocWithMd(notebookId, hpath, `${titleI18n}\n\n{: placeholder-ledger }\n`);
    const avIdSeed = newSiYuanId();
    let avId: string | undefined;
    let provisional = false;
    try {
        avId = await createAttributeView(docId, avIdSeed);
    } catch (e) {
        provisional = true;
        console.warn(`[siyuan-home] module "${moduleId}" provisioned provisionally:`, e instanceof Error ? e.message : e);
    }
    // 建列（av 可用时）；relation 列的成员库目标从 dbRefs.members 取
    if (avId) {
        const memberAvId = moduleId === "members" ? undefined : settings.dbRefs.members?.avId;
        for (const col of schema.columns) {
            try {
                await addAttributeViewColumn(avId, {
                    keyID: newSiYuanId(),
                    name: opts.resolveName?.(col.key) ?? col.key,
                    type: col.type,
                    relationTargetAvID: col.type === "relation" ? memberAvId : undefined,
                });
            } catch (e) {
                // 补列失败不阻断建库（ensureColumns 幂等补，33.2）
                console.warn(`[siyuan-home] column "${col.key}" on "${moduleId}" deferred:`, e instanceof Error ? e.message : e);
            }
        }
    }
    const dbRef: DbRef = { docId, avId, notebook: notebookId, provisional };
    settings.dbRefs[moduleId] = dbRef;
    return { dbRef, created: true };
}
