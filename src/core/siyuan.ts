/**
 * 内核 API 薄封装（ADR：所有 /api 调用集中于此，便于 mock 与 Spike 修正）。
 * 前端同源走 fetchSyncPost（siyuan 包），无需令牌。
 * 端点名以 3.8.x 为准，标注 [Spike] 的调用点在实例可用时按实测修正。
 */
import { fetchSyncPost } from "siyuan";
import type { ModuleSchema } from "./schema";

export interface KernelError extends Error {
    endpoint: string;
    code: number;
    msg: string;
}

async function post<T = any>(endpoint: string, payload: object): Promise<T> {
    const res = await fetchSyncPost(endpoint, payload);
    if (res.code !== 0) {
        const err = new Error(`[${endpoint}] ${res.msg}`) as KernelError;
        err.endpoint = endpoint;
        err.code = res.code;
        err.msg = res.msg;
        throw err;
    }
    return res.data as T;
}

// ── SQL（只读）──────────────────────────────────────────────

export function sql<T = Record<string, any>>(stmt: string): Promise<T[]> {
    return post<T[]>("/api/query/sql", { stmt });
}

// ── 笔记本与文档 ────────────────────────────────────────────

export interface NotebookInfo { id: string; name: string; closed: boolean }

export function listNotebooks(): Promise<NotebookInfo[]> {
    return post<{ notebooks?: NotebookInfo[] }>("/api/notebook/lsNotebooks", {})
        .then((d) => d?.notebooks ?? []);
}

export function createNotebook(name: string): Promise<string> {
    return post<string>("/api/notebook/createNotebook", { name });
}

/** path 为 hpath；返回 docID */
export function createDocWithMd(notebook: string, hpath: string, markdown: string): Promise<string> {
    return post<string>("/api/filetree/createDocWithMd", { notebook, path: hpath, markdown });
}

export function getHPathByID(id: string): Promise<string> {
    return post<string>("/api/filetree/getHPathByID", { id });
}

// ── 块与数据库（av）─────────────────────────────────────────

export function getBlockKramdown(id: string): Promise<{ id: string; kramdown: string }> {
    return post("/api/block/getBlockKramdown", { id });
}

export function setBlockAttrs(id: string, attrs: Record<string, string>): Promise<void> {
    return post("/api/attr/setBlockAttrs", { id, attrs });
}

/**
 * [Spike R-av-create] 建库原语：在文档中创建一张台账数据库。
 * 候选实现（实测后定案其一，其余删除）：
 *   a) createDocWithMd 的 markdown 内联 av 块 kramdown
 *   b) /api/block/insertBlock 插入 av 块
 *   c) 内核直连端点 /api/av/*（createAttributeView / addAttributeViewColumns…）
 * 当前返回占位实现，保证 provisioner 流程可测。
 */
export async function createAttributeView(_docId: string, _schema: ModuleSchema): Promise<string> {
    throw new Error("[Spike R-av-create] not implemented: pending kernel probe (see docs/testing/spike-R1R2.md)");
}
