/**
 * 内核 API 薄封装（ADR：所有 /api 调用集中于此，便于 mock 与 Spike 修正）。
 * 前端同源走 fetchSyncPost（siyuan 包），无需令牌。
 * 可测性（33.5/A2d）：传输函数与 av 工厂均可注入——单测用 setTransport/
 * setAttributeViewFactory 替换，生产代码零感知。
 * 端点名以 3.8.x 为准，标注 [Spike] 的调用点在实例可用时按实测修正。
 */

/** fetchSyncPost 的结构化返回（避免测试环境加载 siyuan 包） */
interface IRawResponse {
    code: number;
    msg: string;
    data?: any;
}

type Transport = (endpoint: string, payload: object) => Promise<IRawResponse>;

let transport: Transport | null = null;

/** 测试注入点：替换底层传输（默认为懒加载的 fetchSyncPost） */
export function setTransport(t: Transport | null): void {
    transport = t;
}

async function defaultTransport(endpoint: string, payload: object): Promise<IRawResponse> {
    // 懒加载：单测注入 transport 时不必加载 siyuan 包
    const { fetchSyncPost } = await import("siyuan");
    return fetchSyncPost(endpoint, payload) as unknown as Promise<IRawResponse>;
}

/** 内核调用错误：endpoint/code 可用于诊断区展示（33.5） */
export class KernelError extends Error {
    readonly endpoint: string;
    readonly code: number;
    readonly kernelMsg: string;

    constructor(endpoint: string, code: number, msg: string) {
        super(`[${endpoint}] ${msg}`);
        this.name = "KernelError";
        this.endpoint = endpoint;
        this.code = code;
        this.kernelMsg = msg;
    }
}

export function isKernelError(e: unknown): e is KernelError {
    return e instanceof KernelError;
}

async function post<T = any>(endpoint: string, payload: object): Promise<T> {
    const res = await (transport ?? defaultTransport)(endpoint, payload);
    if (!res || typeof res.code !== "number") {
        throw new KernelError(endpoint, -1, "malformed response envelope");
    }
    if (res.code !== 0) {
        throw new KernelError(endpoint, res.code, res.msg ?? "unknown kernel error");
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

/** 重新打开已关闭的笔记本（D07：笔记本被用户关闭 → 恢复而非新建。[待实测] payload 以 3.8.x 实例为准） */
export function openNotebook(notebookId: string): Promise<void> {
    return post("/api/notebook/openNotebook", { notebook: notebookId }).then(() => undefined);
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
 * Spike 定案（2026-10-01，docs/testing/spike-R1R2.md 已回填结论）：
 * - av 块形态：<div data-type="NodeAttributeView" data-av-id="X" data-av-type="table"></div>
 * - 建库：插入 div（自造 avIdSeed）→ SQL 找块 → renderAttributeView{createIfNotExist:true}，avID = 块 ID
 * - 加列：addAttributeViewKey{avID, keyID(自造), keyIcon:"", keyName, keyType, previousKeyID:""}
 * - 加行：addAttributeViewBlocks{avID, srcs:[{content, isDetached:true}]}（绑定真实块 isDetached:false 静默失败——
 *   非绑定行路径待后续 transactions 端点探索，TODO 记录）
 * - 写值：batchSetAttributeViewBlockAttrs{avID, values:[{keyID, itemID, value}]}（rowID 已废弃，issue #15727）
 * - 读：renderAttributeView → data.view.{columns, rows, rowCount}；行主键：getAttributeViewPrimaryKeyValues
 * - detached 行不在 blocks 表：SQL 不可查、不可块定位 → 行定位降级为打开台账文档（B4e 定案）
 */

export function insertBlock(parentID: string, markdown: string): Promise<void> {
    // 返回结构 data[0].doOperations[] 无稳定新块 ID → 调用方用 SQL 定位
    return post("/api/block/insertBlock", { dataType: "markdown", parentID, data: markdown }).then(() => undefined);
}

/** 新思源 ID（yyyyMMddHHmmss-xxxxxxx 形态；内核对 keyID/avIdSeed 接受自造值）。crypto 随机，非加密用途但避可预测值 */
export function newSiYuanId(): string {
    const t = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const buf = new Uint8Array(4);
    crypto.getRandomValues(buf);
    const rand = Array.from(buf).map((b) => (b % 36).toString(36)).join("").padEnd(7, "0").slice(0, 7);
    return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}-${rand}`;
}

export interface AvColumnSpec {
    keyID?: string;
    name: string;
    /** 思源列类型：text/date/select/mSelect/number/asset/mAsset/relation/checkbox/url/email/phone/block… */
    type: string;
    /** relation 列目标库 avID（R2 定案：写入接受，读取 API 不回显——schema 层自行记忆） */
    relationTargetAvID?: string;
}

export async function addAttributeViewColumn(avID: string, col: AvColumnSpec): Promise<string> {
    const keyID = col.keyID ?? newSiYuanId();
    const payload: Record<string, unknown> = {
        avID, keyID, keyIcon: "", keyName: col.name, keyType: col.type, previousKeyID: "",
    };
    if (col.type === "relation" && col.relationTargetAvID) {
        payload.relation = { avID: col.relationTargetAvID, isTwoWay: false, backKeyID: "" };
    }
    await post("/api/av/addAttributeViewKey", payload);
    return keyID;
}

/** 在文档内插入 av 容器 div 并触发内核建库，返回真实 avID（= av 块 ID） */
export async function createAttributeView(docId: string, avIdSeed: string): Promise<string> {
    const div = `<div data-type="NodeAttributeView" data-av-id="${avIdSeed}" data-av-type="table"></div>`;
    await insertBlock(docId, div);
    await new Promise((r) => setTimeout(r, 400)); // 块索引异步重建
    const rows = await sql<{ id: string }>(
        `SELECT id FROM blocks WHERE type='av' AND markdown LIKE '%${avIdSeed}%' LIMIT 1`,
    );
    const blockId = rows[0]?.id;
    if (!blockId) throw new KernelError("av.createAttributeView", -3, "av block not found after insert");
    await post("/api/av/renderAttributeView", { id: blockId, createIfNotExist: true });
    return blockId;
}

/**
 * 主键行 ID 全量读取（D01）：逐页 200 行直到不足一页；
 * 扫描不得只读首页（>200 行的台账此前会静默漏提醒）。
 * 上限 100 页（2 万行）防内核异常导致的死循环。
 */
export async function primaryRowItemIDs(avID: string, pageSize = 200): Promise<string[]> {
    const ids: string[] = [];
    for (let page = 1; ; page++) {
        const d = await post<any>("/api/av/getAttributeViewPrimaryKeyValues", { id: avID, page, pageSize });
        const batch: string[] = (d?.rows?.values ?? []).map((v: any) => v.id);
        ids.push(...batch);
        if (batch.length < pageSize) return ids;
        if (page >= 100) throw new KernelError("av.getAttributeViewPrimaryKeyValues", -4, "pagination did not converge");
    }
}

/**
 * 新行身份未确认（D02）：行已提交到内核，但无法唯一确定 itemID。
 * 调用方必须提示"已提交待确认"并避免诱导重复创建，不得静默当作成功或失败重试。
 */
export class RowIdentityPendingError extends Error {
    readonly candidates: string[];
    constructor(candidates: string[]) {
        super(candidates.length > 1
            ? `row committed, ${candidates.length} identity candidates`
            : "row committed but identity not confirmed");
        this.name = "RowIdentityPendingError";
        this.candidates = candidates;
    }
}

/** 从 addAttributeViewBlocks 响应收集可能的行 ID（响应形态随版本变化，仅认已知键） */
function rowIDsFromAddResponse(d: any): string[] {
    const out: string[] = [];
    const push = (v: any) => { if (typeof v === "string" && v) out.push(v); };
    if (Array.isArray(d?.rowIDs)) d.rowIDs.forEach(push);
    if (Array.isArray(d?.operations)) d.operations.forEach((op: any) => push(op?.rowID));
    if (Array.isArray(d?.rows)) d.rows.forEach((r: any) => push(r?.id));
    return out;
}

/**
 * 加 detached 行，返回新行 itemID（D02）：
 * 真机发现（2026-10-03）：getAttributeViewPrimaryKeyValues 与 renderAttributeView 返回
 * **不同的行 ID 空间**。batchSetAttributeViewBlockAttrs 期望 renderAttributeView 的 row.id。
 * 因此此函数改为从 renderAttributeView 的 diff 获取 ID（而非 PK values diff）。
 *
 * 1) 响应直接携带且不在加行前集合中的 ID 唯一 → 确认；
 * 2) 否则加行前后 render row 集合 diff 唯一 → 确认；
 * 3) 多候选（如并发加行）→ RowIdentityPendingError，不猜。
 */
export async function addDetachedRow(avID: string, content: string): Promise<string> {
    const before = new Set(await renderRowIDs(avID));
    const d = await post<any>("/api/av/addAttributeViewBlocks", {
        avID, blockID: "", srcs: [{ blockID: "", content, isDetached: true }],
    });
    const fromResponse = rowIDsFromAddResponse(d).filter((id) => !before.has(id));
    await new Promise((r) => setTimeout(r, 300)); // 块索引异步重建
    const added = (await renderRowIDs(avID)).filter((id) => !before.has(id));
    const confirmed = fromResponse.length === 1 ? fromResponse[0] : added.length === 1 ? added[0] : undefined;
    if (confirmed) return confirmed;
    throw new RowIdentityPendingError(added.length ? Array.from(new Set(added)) : fromResponse);
}

/**
 * 从 renderAttributeView 获取行 ID 列表（D01/D02 真机修正）：
 * batchSetAttributeViewBlockAttrs 期望 renderAttributeView 返回的 row.id，
 * 而非 getAttributeViewPrimaryKeyValues 返回的 PK value ID（两者是不同 ID 空间）。
 */
async function renderRowIDs(avID: string): Promise<string[]> {
    const d = await post<any>("/api/av/renderAttributeView", { id: avID });
    return (d?.view?.rows ?? []).map((r: any) => r.id);
}

/** 删除 av 行（detached 行删除路径；2026-10-03 真机确认参数名为 srcIDs） */
export async function removeLedgerRows(avID: string, rowIDs: string[]): Promise<void> {
    await post("/api/av/removeAttributeViewBlocks", { avID, srcIDs: rowIDs });
}

// ── 附件（asset，A2c）────────────────────────────────────────

type UploadTransport = (formData: FormData) => Promise<IRawResponse>;

let uploadTransport: UploadTransport | null = null;

/** 测试注入点：替换底层上传传输（默认 fetch multipart；fetchSyncPost 不支持 FormData） */
export function setUploadTransport(t: UploadTransport | null): void {
    uploadTransport = t;
}

async function defaultUploadTransport(formData: FormData): Promise<IRawResponse> {
    const res = await fetch("/api/asset/upload", { method: "POST", body: formData });
    return (await res.json()) as IRawResponse;
}

/**
 * 上传文件到思源 assets（A2c），返回 { name, path } 供 asset/mAsset 列写入。
 * [待实测] 端点 /api/asset/upload 与响应 succMap 形态以 3.8.x 实例为准（实机回归第一项）。
 */
export async function uploadAsset(file: File, assetsPath = "/assets/siyuan-home/"): Promise<{ name: string; path: string }> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("assetsPath", assetsPath);
    const res = await (uploadTransport ?? defaultUploadTransport)(formData);
    if (!res || typeof res.code !== "number") throw new KernelError("asset.upload", -1, "malformed response envelope");
    if (res.code !== 0) throw new KernelError("asset.upload", res.code, res.msg ?? "upload failed");
    const succMap = res.data?.succMap ?? {};
    const entry = Object.entries(succMap as Record<string, string>)[0];
    if (!entry) throw new KernelError("asset.upload", -3, "no file in succMap");
    return { name: entry[0], path: entry[1] };
}

/** 单元格写值（value 按列类型：{type:"text",text:{content}} / {type:"date",date:{content,isNotEmpty}} / {type:"relation",relation:{blockIDs}} …） */
export async function setCell(avID: string, keyID: string, itemID: string, value: unknown): Promise<void> {
    await post("/api/av/batchSetAttributeViewBlockAttrs", { avID, values: [{ keyID, itemID, value }] });
}

export interface AvRow {
    itemID: string;
    cells: Record<string, any>; // 列 keyID → value
}

export interface LedgerRead {
    columns: any[];
    rows: AvRow[];
    rowCount: number;
    /** true = 一次 render 全量返回；false = 返回行数 < rowCount（D01：调用方必须进诊断/报错，不得当空成功） */
    complete: boolean;
}

/** 读取台账（表格视图）列与行。cells 以列 keyID 索引；value 无 keyID 时按位置回退（Spike 未确认该字段） */
export async function renderLedger(avID: string): Promise<LedgerRead> {
    const d = await post<any>("/api/av/renderAttributeView", { id: avID });
    const view = d?.view ?? {};
    const cols: any[] = view.columns ?? [];
    const rows: AvRow[] = (view.rows ?? []).map((r: any) => {
        const cells: Record<string, any> = {};
        (r.cells ?? []).forEach((c: any, i: number) => {
            const v = c.value ?? {};
            const key = v.keyID ?? cols[i]?.id;
            if (key) cells[key] = v;
        });
        return { itemID: r.id, cells };
    });
    const rowCount = view.rowCount ?? rows.length;
    return { columns: cols, rows, rowCount, complete: rows.length >= rowCount };
}
