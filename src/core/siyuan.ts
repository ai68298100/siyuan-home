/**
 * 内核 API 薄封装（ADR：所有 /api 调用集中于此，便于 mock 与 Spike 修正）。
 * 前端同源走 fetchSyncPost（siyuan 包），无需令牌。
 * 可测性（33.5/A2d）：传输函数与 av 工厂均可注入——单测用 setTransport/
 * setAttributeViewFactory 替换，生产代码零感知。
 * 端点名以 3.8.x 为准，标注 [Spike] 的调用点在实例可用时按实测修正。
 */

/** fetchSyncPost 的结构化返回（避免测试环境加载 siyuan 包） */
export interface IRawResponse {
    code: number;
    msg: string;
    data?: any;
}

export interface RequestOptions {
    /** 外部取消信号。旧版内核 transport 不接受 signal 时也会停止向调用方交付结果。 */
    signal?: AbortSignal;
    /** 请求截止时间，默认 15 秒。 */
    timeoutMs?: number;
    /** 最大重试次数；默认读端点 1 次、写端点 0 次。 */
    retries?: number;
    /** 本机操作关联/重复点击去重 key；不等同于内核服务端幂等保证。 */
    idempotencyKey?: string;
    /** 同一资源的新请求会使旧请求失效。 */
    latestKey?: string;
}

export interface TransportOptions {
    signal?: AbortSignal;
    idempotencyKey?: string;
}

type Transport = (endpoint: string, payload: object, options?: TransportOptions) => Promise<IRawResponse>;

let transport: Transport | null = null;
const inFlight = new Map<string, Promise<IRawResponse>>();
const REQUEST_TIMEOUT_MS = 15_000;
const READ_RETRY_ENDPOINTS = new Set([
    "/api/query/sql",
    "/api/notebook/lsNotebooks",
    "/api/filetree/getHPathByID",
    "/api/block/getBlockKramdown",
    "/api/av/renderAttributeView",
    "/api/av/getAttributeViewPrimaryKeyValues",
    "/api/asset/getOCRConfig",
    "/api/asset/getImageOCRText",
]);
const MAX_RETRIES = 2;
const IDEMPOTENCY_TTL_MS = 60_000;
const completedIdempotent = new Map<string, { expiresAt: number; fingerprint: string; response: IRawResponse }>();
const latestVersions = new Map<string, number>();

// SiYuan does not document X-Idempotency-Key as a server-side deduplication
// contract. Creation endpoints therefore never receive automatic replays;
// the key only protects duplicate calls while the original is in flight.
const NON_REPLAYABLE_WRITE_ENDPOINTS = new Set([
    "/api/notebook/createNotebook",
    "/api/filetree/createDocWithMd",
    "/api/block/insertBlock",
    "/api/av/addAttributeViewBlocks",
    "/api/av/addAttributeViewKey",
    "/api/asset/upload",
]);

/** 请求被调用方取消，UI 应保留现有数据并停止 loading。 */
export class RequestAbortedError extends Error {
    readonly endpoint: string;
    readonly mayHaveReachedServer: boolean;
    constructor(endpoint: string, message = "request aborted", mayHaveReachedServer = false) {
        super(`[${endpoint}] ${message}`);
        this.name = "RequestAbortedError";
        this.endpoint = endpoint;
        this.mayHaveReachedServer = mayHaveReachedServer;
    }
}

/** 同一资源发起新请求后，旧响应被丢弃，避免覆盖最新结果。 */
export class RequestSupersededError extends Error {
    readonly endpoint: string;
    readonly latestKey: string;
    constructor(endpoint: string, latestKey: string) {
        super(`[${endpoint}] superseded by a newer request`);
        this.name = "RequestSupersededError";
        this.endpoint = endpoint;
        this.latestKey = latestKey;
    }
}

export function isRequestAborted(e: unknown): e is RequestAbortedError | RequestSupersededError {
    return e instanceof RequestAbortedError || e instanceof RequestSupersededError;
}

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, stableValue(item)]));
    }
    return value;
}

function requestKey(endpoint: string, payload: object): string {
    return `${endpoint}:${JSON.stringify(stableValue(payload))}`;
}

/** 测试注入点：替换底层传输（默认为懒加载的 fetchSyncPost） */
export function setTransport(t: Transport | null): void {
    transport = t;
    // 测试注入、热重载或宿主切换时不能把上一套 transport 的响应交给新实例。
    inFlight.clear();
    completedIdempotent.clear();
    latestVersions.clear();
}

async function defaultTransport(endpoint: string, payload: object, options?: TransportOptions): Promise<IRawResponse> {
    // 裸 require("siyuan")：vite external 保留为 CJS require 调用，运行时由思源插件加载器的
    // require 桩映射到 petal 包。动态 import("siyuan") 裸说明符在该环境无法解析
    // （"Failed to resolve module specifier"，225 波实测），与 chunks 事故同源。
    // 单测经 setTransport 注入 transport，不触达此路径。
    const { fetchSyncPost } = require("siyuan") as {
        fetchSyncPost: (url: string, data: object, headers?: Record<string, string>, process?: boolean, signal?: AbortSignal) => Promise<IRawResponse>;
    };
    // 思源内核接口为纯同源或本地 HTTP API，不需要 X-Idempotency-Key 自定义标头。
    // 幂等去重与防并发由插件内部的 inFlight 和 completedIdempotent 内存机制可靠保证。
    // 严禁将包含中文或 Emoji 的 idempotencyKey 作为 HTTP Header 传递，避免浏览器底层抛出
    // "Failed to construct 'Headers': String contains non ISO-8859-1 code point" 导致请求直接崩溃。
    return fetchSyncPost(endpoint, payload, undefined, undefined, options?.signal) as unknown as Promise<IRawResponse>;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, endpoint: string, signal?: AbortSignal, onTimeout?: () => void, mayHaveReachedServer?: () => boolean): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => {
                    reject(new KernelError(endpoint, -408, "request timeout"));
                    onTimeout?.();
                }, timeoutMs);
                if (signal) {
                    abortListener = () => reject(new RequestAbortedError(endpoint, "request aborted", mayHaveReachedServer?.() ?? false));
                    if (signal.aborted) abortListener();
                    else signal.addEventListener("abort", abortListener, { once: true });
                }
            }),
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
        if (signal && abortListener) signal.removeEventListener("abort", abortListener);
    }
}

/** Wait between retry attempts while still honoring caller cancellation. */
async function waitForRetryBackoff(ms: number, endpoint: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new RequestAbortedError(endpoint);
    await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let abortListener: (() => void) | undefined;
        const cleanup = () => {
            if (timer !== undefined) clearTimeout(timer);
            if (signal && abortListener) signal.removeEventListener("abort", abortListener);
        };
        const finish = () => { cleanup(); resolve(); };
        abortListener = () => { cleanup(); reject(new RequestAbortedError(endpoint)); };
        timer = setTimeout(finish, Math.max(0, ms));
        if (signal) signal.addEventListener("abort", abortListener, { once: true });
        if (signal?.aborted) abortListener();
    });
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

/** token/session 失效。由宿主负责跳转登录；插件通过事件统一通知所有面板。 */
export class AuthExpiredError extends KernelError {
    constructor(endpoint: string, code: number, msg: string) {
        super(endpoint, code, msg || "登录状态已失效");
        this.name = "AuthExpiredError";
    }
}

/** Authenticated request rejected by role/workspace permissions; this is not a login expiry. */
export class PermissionDeniedError extends KernelError {
    constructor(endpoint: string, code: number, msg: string) {
        super(endpoint, code, msg || "当前账号没有执行此操作的权限");
        this.name = "PermissionDeniedError";
    }
}

export function isAuthExpired(e: unknown): e is AuthExpiredError {
    return e instanceof AuthExpiredError;
}

export function isPermissionDenied(e: unknown): e is PermissionDeniedError {
    return e instanceof PermissionDeniedError;
}

/** A write may have reached the kernel even though its response was lost. */
export function isWriteResultUnknown(e: unknown): boolean {
    if (e instanceof RequestAbortedError) return e.mayHaveReachedServer;
    if (e instanceof KernelError) {
        // -408: 客户端等待超时，请求已发出可能已达内核
        if (e.code === -408) return true;
        // 仅在完全没有收到合法信封时视作未知网络中断，绝不将内核返回的明确业务拒绝(-1带msg)误判为未知
        if (e.code === -1 && e.kernelMsg === "malformed response envelope") return true;
        return false;
    }
    if (e instanceof TypeError) return true;
    return typeof DOMException !== "undefined" && e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError");
}

function looksLikeAuthFailure(res: IRawResponse): boolean {
    const msg = String(res.msg ?? "").toLowerCase();
    return res.code === 401
        || /unauthori[sz]ed|token.{0,24}(expired|invalid|失效|过期)|(?:expired|invalid).{0,24}token|session.{0,24}(expired|invalid)|not authenticated|login required|登录已失效|未登录|会话失效|鉴权失败/.test(msg);
}

function looksLikePermissionFailure(res: IRawResponse): boolean {
    const msg = String(res.msg ?? "").toLowerCase();
    return res.code === 403 || /forbidden|permission denied|insufficient privilege|无权限|没有权限|权限不足/.test(msg);
}

function dispatchAuthExpired(endpoint: string, msg: string): void {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
    try {
        const currentLocation = typeof location !== "undefined"
            ? `${location.pathname}${location.search}${location.hash}`
            : "/";
        window.dispatchEvent(new CustomEvent("siyuan-home:auth-expired", {
            detail: { endpoint, message: msg, returnTo: currentLocation },
        }));
    } catch {
        // 测试环境或受限宿主没有 CustomEvent 时，继续将错误交给调用方处理。
    }
}

function nextLatestVersion(latestKey?: string): number | undefined {
    if (!latestKey) return undefined;
    const current = (latestVersions.get(latestKey) ?? 0) + 1;
    latestVersions.set(latestKey, current);
    return current;
}

function ensureLatest(endpoint: string, latestKey: string | undefined, version: number | undefined): void {
    if (latestKey && version !== undefined && latestVersions.get(latestKey) !== version) {
        throw new RequestSupersededError(endpoint, latestKey);
    }
}

function cleanupCompletedIdempotent(now = Date.now()): void {
    for (const [key, entry] of completedIdempotent) {
        if (entry.expiresAt <= now) completedIdempotent.delete(key);
    }
}

function unwrapResponse<T>(endpoint: string, res: IRawResponse): T {
    if (!res || typeof res.code !== "number") throw new KernelError(endpoint, -1, "malformed response envelope");
    if (res.code !== 0) {
        const msg = res.msg ?? "unknown kernel error";
        if (looksLikeAuthFailure(res)) {
            dispatchAuthExpired(endpoint, msg);
            throw new AuthExpiredError(endpoint, res.code, msg);
        }
        if (looksLikePermissionFailure(res)) {
            if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
                try {
                    window.dispatchEvent(new CustomEvent("siyuan-home:permission-denied", {
                        detail: { endpoint, message: msg },
                    }));
                } catch { /* restricted host/test environment */ }
            }
            throw new PermissionDeniedError(endpoint, res.code, msg);
        }
        throw new KernelError(endpoint, res.code, msg);
    }
    return res.data as T;
}

/**
 * 统一请求服务：请求去重、截止时间、有限读取重试、本地操作短缓存、
 * 最新请求获胜和鉴权失效通知。创建类写入不自动重放，避免未知结果时重复创建。
 * `setTransport` 注入的旧版二参函数仍兼容，第三个参数仅供支持它的 transport 使用。
 */
export async function request<T = any>(endpoint: string, payload: object, options: RequestOptions = {}): Promise<T> {
    const idempotencyKey = options.idempotencyKey?.trim();
    const payloadFingerprint = JSON.stringify(stableValue(payload));
    const canRetry = READ_RETRY_ENDPOINTS.has(endpoint);
    // 幂等 key 是业务操作的一部分；同一 payload 但不同 key 仍允许并发写入。
    const key = `${requestKey(endpoint, payload)}:${idempotencyKey ?? ""}`;
    cleanupCompletedIdempotent();
    const latestVersion = nextLatestVersion(options.latestKey);
    if (idempotencyKey) {
        const cached = completedIdempotent.get(`${endpoint}:${idempotencyKey}`);
        if (cached && cached.expiresAt > Date.now()) {
            if (cached.fingerprint !== payloadFingerprint) {
                throw new KernelError(endpoint, -409, "idempotency key was already used with a different payload");
            }
            ensureLatest(endpoint, options.latestKey, latestVersion);
            return cached.response.data as T;
        }
    }
    // Read requests are safe to coalesce by payload. Writes are coalesced only
    // when the caller supplied the same idempotency key; two independent
    // no-key writes must always reach the kernel separately.
    // A request with its own AbortSignal is not shared: canceling one view must
    // not cancel another view that happened to request the same payload.
    const coalesce = !options.signal && (canRetry || !!idempotencyKey);
    const existing = coalesce ? inFlight.get(key) : undefined;
    if (existing) {
        const res = await existing;
        ensureLatest(endpoint, options.latestKey, latestVersion);
        return unwrapResponse<T>(endpoint, res);
    }
    // Only naturally replayable writes (for example setting the same cell
    // value) may retry. Creation endpoints stay at zero retries even when a
    // local operation key is present.
    const replayableWrite = !NON_REPLAYABLE_WRITE_ENDPOINTS.has(endpoint);
    const requestedRetries = options.retries ?? (canRetry || (idempotencyKey && replayableWrite) ? 1 : 0);
    const retries = Math.max(0, Math.min(MAX_RETRIES, (canRetry || (idempotencyKey && replayableWrite)) ? requestedRetries : 0));
    const timeoutMs = Math.max(1, options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    let callerAborted = options.signal?.aborted ?? false;
    const attemptControllers = new Set<AbortController>();
    const onAbort = () => {
        callerAborted = true;
        for (const controller of attemptControllers) controller.abort();
    };
    if (options.signal && !callerAborted) options.signal.addEventListener("abort", onAbort, { once: true });
    const run = (async () => {
        let lastError: unknown;
        let timedOut = false;
        for (let attempt = 0; attempt <= retries; attempt++) {
            if (callerAborted) throw new RequestAbortedError(endpoint);
            const controller = new AbortController();
            attemptControllers.add(controller);
            timedOut = false;
            let requestStarted = false;
            try {
                requestStarted = true;
                const response = (transport ?? defaultTransport)(endpoint, payload, {
                    signal: controller.signal,
                    idempotencyKey,
                });
                return await withTimeout(response, timeoutMs, endpoint, controller.signal, () => {
                    timedOut = true;
                    // Cancel the underlying transport as soon as the deadline
                    // expires. The caller must reconcile creation endpoints
                    // before offering another submit action.
                    controller.abort();
                }, () => requestStarted);
            } catch (error) {
                lastError = error;
                if (callerAborted || (controller.signal.aborted && !timedOut) || error instanceof RequestAbortedError || error instanceof AuthExpiredError || attempt >= retries) throw error;
                await waitForRetryBackoff(180 * (attempt + 1), endpoint, options.signal);
            } finally {
                attemptControllers.delete(controller);
            }
        }
        throw lastError;
    })();
    if (coalesce) inFlight.set(key, run);
    let res: IRawResponse;
    try {
        res = await run;
    } finally {
        if (coalesce && inFlight.get(key) === run) inFlight.delete(key);
        if (options.signal && onAbort) options.signal.removeEventListener("abort", onAbort);
    }
    if (callerAborted) throw new RequestAbortedError(endpoint);
    ensureLatest(endpoint, options.latestKey, latestVersion);
    const value = unwrapResponse<T>(endpoint, res);
    if (idempotencyKey) completedIdempotent.set(`${endpoint}:${idempotencyKey}`, {
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
        fingerprint: payloadFingerprint,
        response: res,
    });
    return value;
}

async function post<T = any>(endpoint: string, payload: object, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, payload, options);
}

// ── SQL（只读）──────────────────────────────────────────────

export function sql<T = Record<string, any>>(stmt: string, options?: RequestOptions): Promise<T[]> {
    return post<T[]>("/api/query/sql", { stmt }, options);
}

// ── 笔记本与文档 ────────────────────────────────────────────

export interface NotebookInfo { id: string; name: string; closed: boolean }

export function listNotebooks(options?: RequestOptions): Promise<NotebookInfo[]> {
    return post<{ notebooks?: NotebookInfo[] }>("/api/notebook/lsNotebooks", {}, options)
        .then((d) => d?.notebooks ?? []);
}

/**
 * 归一化 createNotebook 的返回值。
 * 思源 3.8.5 返回裸 ID，3.8.6+ 部分版本返回 { notebook: { id } }；
 * 同时兼容过渡版本的 { notebook: id } 与 { id }，避免对象继续流入文档 API。
 */
function notebookIdFromCreateResponse(data: unknown): string {
    if (typeof data === "string" && data) return data;
    if (!data || typeof data !== "object") {
        throw new KernelError("/api/notebook/createNotebook", -3, "invalid notebook id in response");
    }
    const response = data as { notebook?: unknown; id?: unknown };
    if (typeof response.notebook === "string" && response.notebook) return response.notebook;
    if (response.notebook && typeof response.notebook === "object") {
        const nestedId = (response.notebook as { id?: unknown }).id;
        if (typeof nestedId === "string" && nestedId) return nestedId;
    }
    if (typeof response.id === "string" && response.id) return response.id;
    throw new KernelError("/api/notebook/createNotebook", -3, "invalid notebook id in response");
}

export async function createNotebook(name: string, options?: RequestOptions): Promise<string> {
    const data = await post<unknown>("/api/notebook/createNotebook", { name }, options);
    return notebookIdFromCreateResponse(data);
}

/** 重新打开已关闭的笔记本（D07：笔记本被用户关闭 → 恢复而非新建。[待实测] payload 以 3.8.x 实例为准） */
export function openNotebook(notebookId: string, options?: RequestOptions): Promise<void> {
    return post("/api/notebook/openNotebook", { notebook: notebookId }, options).then(() => undefined);
}

/**
 * 归一化 createDocWithMd 的返回值。
 * 兼容裸 ID 字符串、外层带引号的字符串、以及部分版本返回的包含 id/rootID 的对象结构。
 */
export function docIdFromCreateResponse(data: unknown): string {
    if (typeof data === "string" && data) return data.replace(/^"|"$/g, "").trim();
    if (data && typeof data === "object") {
        const obj = data as Record<string, unknown>;
        const id = obj.id ?? obj.rootID ?? obj.rootId ?? obj.docId ?? obj.docID ?? obj.data;
        if (typeof id === "string" && id) return id.replace(/^"|"$/g, "").trim();
    }
    return "";
}

/** path 为 hpath；返回 docID */
export async function createDocWithMd(notebook: string, hpath: string, markdown: string, options?: RequestOptions): Promise<string> {
    const data = await post<unknown>("/api/filetree/createDocWithMd", { notebook, path: hpath, markdown }, options);
    const docId = docIdFromCreateResponse(data);
    if (!docId) {
        throw new KernelError("/api/filetree/createDocWithMd", -3, "invalid doc id in response");
    }
    return docId;
}

export function getHPathByID(id: string, options?: RequestOptions): Promise<string> {
    return post<string>("/api/filetree/getHPathByID", { id }, options);
}

// ── 块与数据库（av）─────────────────────────────────────────

export function getBlockKramdown(id: string, options?: RequestOptions): Promise<{ id: string; kramdown: string }> {
    return post("/api/block/getBlockKramdown", { id }, options);
}

export function setBlockAttrs(id: string, attrs: Record<string, string>, options?: RequestOptions): Promise<void> {
    return post("/api/attr/setBlockAttrs", { id, attrs }, options);
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

/** 插入 markdown 块，返回新块 ID（E9/182 波：insertBlock 响应 doOperations[].data 带 data-node-id，可同步提取；取不到回空串由调用方兜底） */
export async function insertBlock(parentID: string, markdown: string, options?: RequestOptions): Promise<string> {
    const d = await post<any>("/api/block/insertBlock", { dataType: "markdown", parentID, data: markdown }, { ...options, retries: 0 });
    const ops: any[] = Array.isArray(d) ? (d[0]?.doOperations ?? []) : (d?.doOperations ?? d?.data?.doOperations ?? []);
    for (const op of ops) {
        const m = String(op?.data ?? "").match(/data-node-id="(\d{14}-[a-z0-9]+)"/);
        if (m) return m[1];
    }
    const inserted = String(d?.id ?? d?.blockID ?? d?.data?.id ?? "");
    return inserted;
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

export async function addAttributeViewColumn(avID: string, col: AvColumnSpec, options?: RequestOptions): Promise<string> {
    const keyID = col.keyID ?? newSiYuanId();
    const payload: Record<string, unknown> = {
        avID, keyID, keyIcon: "", keyName: col.name, keyType: col.type, previousKeyID: "",
    };
    if (col.type === "relation" && col.relationTargetAvID) {
        payload.relation = { avID: col.relationTargetAvID, isTwoWay: false, backKeyID: "" };
    }
    await post("/api/av/addAttributeViewKey", payload, options);
    return keyID;
}

/** 在文档内插入 av 容器 div 并触发内核建库，返回真实 avID（= av 块 ID）。
 * 优先同步取 insertBlock 响应里的新块 ID（E9）；SQL 索引异步重建仅作回退（轮询 ~3s——
 * 182 波活体套件首跑实证：忙实例上 400ms 固定等待会落空）。 */
export async function createAttributeView(docId: string, avIdSeed: string, options?: RequestOptions): Promise<string> {
    const div = `<div data-type="NodeAttributeView" data-av-id="${avIdSeed}" data-av-type="table"></div>`;
    const readOptions: RequestOptions = { timeoutMs: options?.timeoutMs, signal: options?.signal, retries: 1 };
    const findBySeed = async () => {
        try {
            const rows = await sql<{ id: string; markdown?: string }>(
                `SELECT id, markdown FROM blocks WHERE type='av' AND root_id='${docId.replace(/'/g, "''")}' LIMIT 5`,
                readOptions,
            );
            if (rows.length === 0) return "";
            const matched = rows.find((r) => r.markdown && r.markdown.includes(avIdSeed));
            return (matched ?? rows[0]).id;
        } catch {
            return "";
        }
    };
    // A prior attempt may have inserted the block but lost its response.
    let blockId = await findBySeed();
    if (!blockId) {
        try {
            blockId = await insertBlock(docId, div, options);
            if (!blockId) blockId = await findBySeed();
        } catch (error) {
            if (!isWriteResultUnknown(error)) throw error;
        }
    }
    for (let i = 0; !blockId && i < 6; i++) {
        await new Promise((r) => setTimeout(r, 500));
        blockId = await findBySeed();
    }
    if (!blockId) throw new KernelError("av.createAttributeView", -3, "av block not found after insert");
    await post("/api/av/renderAttributeView", { id: blockId, createIfNotExist: true }, options);
    return blockId;
}

/**
 * 主键行 ID 全量读取（D01）：逐页 200 行直到不足一页；
 * 扫描不得只读首页（>200 行的台账此前会静默漏提醒）。
 * 上限 100 页（2 万行）防内核异常导致的死循环。
 */
export async function primaryRowItemIDs(avID: string, pageSize = 200, options?: RequestOptions): Promise<string[]> {
    const ids: string[] = [];
    for (let page = 1; ; page++) {
        const d = await post<any>("/api/av/getAttributeViewPrimaryKeyValues", { id: avID, page, pageSize }, options);
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
export async function addDetachedRow(avID: string, content: string, options?: RequestOptions): Promise<string> {
    const before = new Set(await renderRowIDs(avID, options));
    let d: any;
    try {
        d = await post<any>("/api/av/addAttributeViewBlocks", {
            avID, blockID: "", srcs: [{ blockID: "", content, isDetached: true }],
        }, { ...options, retries: 0 });
    } catch (error) {
        if (!isWriteResultUnknown(error)) throw error;
        // The add may have committed before the response was lost. Reconcile
        // against a fresh render without reusing the caller's aborted signal.
        const recoveryOptions: RequestOptions = {
            timeoutMs: options?.timeoutMs,
            retries: 0,
        };
        await new Promise((resolve) => setTimeout(resolve, 300));
        try {
            const recovered = (await renderRowIDs(avID, recoveryOptions)).filter((id) => !before.has(id));
            if (recovered.length === 1) return recovered[0];
            throw new RowIdentityPendingError(Array.from(new Set(recovered)));
        } catch (recoveryError) {
            if (recoveryError instanceof RowIdentityPendingError) throw recoveryError;
            throw new RowIdentityPendingError([]);
        }
    }
    const fromResponse = rowIDsFromAddResponse(d).filter((id) => !before.has(id));
    if (fromResponse.length === 1) return fromResponse[0];
    await new Promise((r) => setTimeout(r, 300)); // 块索引异步重建
    let added: string[];
    try {
        added = (await renderRowIDs(avID, options)).filter((id) => !before.has(id));
    } catch {
        throw new RowIdentityPendingError(fromResponse);
    }
    const confirmed = fromResponse.length === 1 ? fromResponse[0] : added.length === 1 ? added[0] : undefined;
    if (confirmed) return confirmed;
    throw new RowIdentityPendingError(added.length ? Array.from(new Set(added)) : fromResponse);
}

/**
 * 从 renderAttributeView 获取行 ID 列表（D01/D02 真机修正）：
 * batchSetAttributeViewBlockAttrs 期望 renderAttributeView 返回的 row.id，
 * 而非 getAttributeViewPrimaryKeyValues 返回的 PK value ID（两者是不同 ID 空间）。
 */
async function renderRowIDs(avID: string, options?: RequestOptions): Promise<string[]> {
    const d = await post<any>("/api/av/renderAttributeView", { id: avID }, options);
    return (d?.view?.rows ?? []).map((r: any) => r.id);
}

/** 删除 av 行（detached 行删除路径；2026-10-03 真机确认参数名为 srcIDs） */
export async function removeLedgerRows(avID: string, rowIDs: string[], options?: RequestOptions): Promise<void> {
    await post("/api/av/removeAttributeViewBlocks", { avID, srcIDs: rowIDs }, options);
}

// ── 附件（asset，A2c）────────────────────────────────────────

type UploadTransport = (formData: FormData, options?: TransportOptions) => Promise<IRawResponse>;

let uploadTransport: UploadTransport | null = null;
const uploadInFlight = new Map<string, { fingerprint: string; promise: Promise<IRawResponse> }>();
const uploadCompleted = new Map<string, { expiresAt: number; fingerprint: string; response: IRawResponse }>();

/** 测试注入点：替换底层上传传输（默认 fetch multipart；fetchSyncPost 不支持 FormData） */
export function setUploadTransport(t: UploadTransport | null): void {
    uploadTransport = t;
    uploadInFlight.clear();
    uploadCompleted.clear();
}

async function defaultUploadTransport(formData: FormData, options?: TransportOptions): Promise<IRawResponse> {
    // 严禁传递包含非 ASCII 字符的自定义 Header，避免浏览器 Headers 构造抛出 non ISO-8859-1 异常
    const res = await fetch("/api/asset/upload", { method: "POST", body: formData, signal: options?.signal });
    if (res.status === 401 || res.status === 403) return { code: res.status, msg: "token expired" };
    return (await res.json()) as IRawResponse;
}

/**
 * 上传文件到思源 assets（A2c），返回 { name, path } 供 asset/mAsset 列写入。
 * [待实测] 端点 /api/asset/upload 与响应 succMap 形态以 3.8.x 实例为准（实机回归第一项）。
 */
export async function uploadAsset(file: File, assetsPath = "/assets/siyuan-home/", options?: RequestOptions): Promise<{ name: string; path: string }> {
    const formData = new FormData();
    // E6/192 波：内核要求的字段名是 file[]（endpoints 脚本实证；此前 "file" 在真机 succMap 为空——活体套件抓到的第二个潜在 bug）
    formData.append("file[]", file);
    formData.append("assetsPath", assetsPath);
    const idempotencyKey = options?.idempotencyKey?.trim();
    const uploadKey = idempotencyKey ? `asset.upload:${idempotencyKey}` : undefined;
    const uploadFingerprint = `${assetsPath}\u0000${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${file.type}`;
    if (uploadKey) {
        const done = uploadCompleted.get(uploadKey);
        if (done && done.expiresAt > Date.now()) {
            if (done.fingerprint !== uploadFingerprint) throw new KernelError("asset.upload", -409, "idempotency key was already used with a different file");
            const succMap = done.response.data?.succMap ?? {};
            const entry = Object.entries(succMap as Record<string, string>)[0];
            if (entry) return { name: entry[0], path: entry[1] };
        }
        const active = uploadInFlight.get(uploadKey);
        if (active) {
            if (active.fingerprint !== uploadFingerprint) throw new KernelError("asset.upload", -409, "idempotency key was already used with a different file");
            const response = await active.promise;
            const succMap = response.data?.succMap ?? {};
            const entry = Object.entries(succMap as Record<string, string>)[0];
            if (entry) return { name: entry[0], path: entry[1] };
        }
    }
    let callerAborted = options?.signal?.aborted ?? false;
    const attemptControllers = new Set<AbortController>();
    const onAbort = () => {
        callerAborted = true;
        for (const controller of attemptControllers) controller.abort();
    };
    if (options?.signal && !callerAborted) options.signal.addEventListener("abort", onAbort, { once: true });
    let res: IRawResponse;
    const run = async (): Promise<IRawResponse> => {
        // Upload responses do not carry a server-supported idempotency
        // contract. Keep local in-flight/completed deduplication, but never
        // replay a timed-out upload that may already have created an asset.
        const retries = 0;
        let lastError: unknown;
        for (let attempt = 0; attempt <= retries; attempt++) {
            if (callerAborted) throw new RequestAbortedError("asset.upload");
            const controller = new AbortController();
            attemptControllers.add(controller);
            let timedOut = false;
            try {
                const upload = (uploadTransport ?? defaultUploadTransport)(formData, {
                    signal: controller.signal,
                    idempotencyKey,
                });
                return await withTimeout(upload, Math.max(1, options?.timeoutMs ?? REQUEST_TIMEOUT_MS), "asset.upload", controller.signal, () => {
                    timedOut = true;
                    controller.abort();
                });
            } catch (error) {
                lastError = error;
                if (callerAborted || (controller.signal.aborted && !timedOut) || error instanceof RequestAbortedError || attempt >= retries) throw error;
                await waitForRetryBackoff(180 * (attempt + 1), "asset.upload", options?.signal);
            } finally {
                attemptControllers.delete(controller);
            }
        }
        throw lastError;
    };
    let currentUploadPromise: Promise<IRawResponse> | undefined;
    try {
        if (uploadKey) {
            const active = run();
            currentUploadPromise = active;
            uploadInFlight.set(uploadKey, { fingerprint: uploadFingerprint, promise: active });
            res = await active;
            if (res.code === 0) uploadCompleted.set(uploadKey, { expiresAt: Date.now() + IDEMPOTENCY_TTL_MS, fingerprint: uploadFingerprint, response: res });
        } else {
            res = await run();
        }
    } catch (error) {
        if (callerAborted || error instanceof RequestAbortedError) throw error;
        if (isWriteResultUnknown(error)) {
            throw new KernelError("asset.upload", -408, "upload result is unknown; check the asset list before retrying");
        }
        throw error;
    } finally {
        if (uploadKey) {
            const active = uploadInFlight.get(uploadKey);
            // Only remove our own in-flight entry; a newer caller may already
            // have replaced it after a timeout or cancellation.
            if (active?.promise === currentUploadPromise) uploadInFlight.delete(uploadKey);
        }
        if (options?.signal) options.signal.removeEventListener("abort", onAbort);
    }
    if (callerAborted) throw new RequestAbortedError("asset.upload");
    if (!res || typeof res.code !== "number") throw new KernelError("asset.upload", -1, "malformed response envelope");
    if (res.code !== 0) {
        if (looksLikeAuthFailure(res)) {
            dispatchAuthExpired("asset.upload", res.msg ?? "登录状态已失效");
            throw new AuthExpiredError("asset.upload", res.code, res.msg ?? "登录状态已失效");
        }
        throw new KernelError("asset.upload", res.code, res.msg ?? "upload failed");
    }
    const succMap = res.data?.succMap ?? {};
    const entry = Object.entries(succMap as Record<string, string>)[0];
    if (!entry) throw new KernelError("asset.upload", -3, "no file in succMap");
    return { name: entry[0], path: entry[1] };
}

// ── OCR（手动识别使用思源当前设备的 OCR 配置；不改变自动识别开关）──

export interface OCRConfigData {
    config: {
        provider: string;
        model: string;
        auto: boolean;
        aiModelId?: string;
    };
    providers: { id: string; available: boolean }[];
    models: { id: string; name: string; builtIn: boolean }[];
    aiModels: { id: string; name: string; provider: string }[];
}

/** 获取当前设备 OCR 设置；旧内核不支持时由调用方提供升级/设置指引。 */
export function getOCRConfig(options?: RequestOptions): Promise<OCRConfigData> {
    return post<OCRConfigData>("/api/asset/getOCRConfig", {}, options);
}

/** 读取资源已保存的 OCR 文本，不触发识别。 */
export async function getImageOCRText(path: string, options?: RequestOptions): Promise<string> {
    const data = await post<{ text?: string }>("/api/asset/getImageOCRText", { path }, options);
    return typeof data?.text === "string" ? data.text : "";
}

/** 按当前思源 OCR 提供商识别图片；内核会保存结果并更新 OCR 索引。 */
export async function recognizeAsset(path: string, options?: RequestOptions): Promise<{ text: string; ocrJSON: Record<string, string>[] }> {
    const data = await post<{ text?: string; ocrJSON?: Record<string, string>[] }>("/api/asset/ocr", { path }, options);
    return {
        text: typeof data?.text === "string" ? data.text : "",
        ocrJSON: Array.isArray(data?.ocrJSON) ? data.ocrJSON : [],
    };
}

/** 单元格写值（value 按列类型：{type:"text",text:{content}} / {type:"date",date:{content,isNotEmpty}} / {type:"relation",relation:{blockIDs}} …）。
 * 217 波：迁移到文档化公开端点 setAttributeViewBlockAttr（itemID=render row.id，D02 一致）——
 * 此前用的 batchSetAttributeViewBlockAttrs 是未入文档的内部路由（无兼容性保证，上游 API.md 141 行明示）。 */
export async function setCell(avID: string, keyID: string, itemID: string, value: unknown, options?: RequestOptions): Promise<void> {
    // Cell edits are last-write-wins.  A slow response from an earlier blur
    // must never be allowed to report success after a newer value was sent.
    const requestOptions: RequestOptions = {
        ...options,
        latestKey: options?.latestKey ?? `cell:${avID}:${keyID}:${itemID}`,
    };
    await post("/api/av/setAttributeViewBlockAttr", { avID, keyID, itemID, value }, requestOptions);
}

export interface AvRow {
    itemID: string;
    cells: Record<string, any>; // 列 keyID → value
}

export interface LedgerRead {
    columns: any[];
    rows: AvRow[];
    rowCount: number;
    /** true = 唯一行数已达到 rowCount；false = 读取不完整（D01：调用方必须进诊断/报错，不得当空成功） */
    complete: boolean;
}

/** 读取台账（表格视图）列与行。cells 以列 keyID 索引；value 无 keyID 时按位置回退（Spike 未确认该字段）。
 * pageSize/page 可选（E13/183 波：内核 render 接受分页参数——50/页默认，page 翻页，pageSize 为单页上限）。 */
export async function renderLedger(avID: string, pageSize?: number, page?: number, options?: RequestOptions): Promise<LedgerRead> {
    const payload: Record<string, unknown> = { id: avID };
    if (pageSize) payload.pageSize = pageSize;
    if (page) payload.page = page;
    // Each page is its own resource. Qualifying latestKey by page prevents a
    // legitimate page 2 request from superseding page 1 during one full scan,
    // while still ensuring a newer refresh wins for the same page.
    const pageOptions = options?.latestKey
        ? { ...options, latestKey: `${options.latestKey}:page:${page ?? 1}` }
        : options;
    const d = await post<any>("/api/av/renderAttributeView", payload, pageOptions);
    const view = d?.view;
    const malformed = (field: string): never => {
        throw new KernelError("/api/av/renderAttributeView", -3, `malformed ledger response: ${field}`);
    };
    // A successful envelope is not proof of a successful read. In particular,
    // a missing view must not erase scan state by masquerading as an empty AV.
    if (!view || !Array.isArray(view.columns) || !Array.isArray(view.rows)) malformed("view.columns/view.rows");
    const cols: any[] = view.columns;
    const rowCount = view.rowCount ?? view.rows.length;
    if (!Number.isSafeInteger(rowCount) || rowCount < 0) malformed("view.rowCount");
    const rows: AvRow[] = [];
    const seen = new Set<string>();
    for (const r of view.rows) {
        if (!r || typeof r.id !== "string" || !r.id.trim()) malformed("row.id");
        const rawCells = r.cells ?? [];
        if (!Array.isArray(rawCells)) malformed("row.cells");
        const cells: Record<string, any> = {};
        rawCells.forEach((c: any, i: number) => {
            if (!c || typeof c !== "object") malformed("row.cells[]");
            const v = c.value ?? {};
            const key = v.keyID ?? cols[i]?.id;
            if (key) cells[key] = v;
        });
        // Count unique identities on the first page as well as later pages;
        // duplicated rows otherwise make a partial read appear complete.
        if (!seen.has(r.id)) {
            seen.add(r.id);
            rows.push({ itemID: r.id, cells });
        }
    }
    return { columns: cols, rows, rowCount, complete: rows.length >= rowCount };
}

/** 全量读取台账（N7/E13）：200/页逐页累积直到 rowCount（去重防翻页重叠），扫描派生/健康检查/CSV 导出用。
 * UI 列表维持单页 renderLedger（PF11 长列表预算）；上限 100 页（2 万行）防内核异常死循环。 */
export async function renderLedgerAll(avID: string, pageSize = 200, options?: RequestOptions): Promise<LedgerRead> {
    const first = await renderLedger(avID, pageSize, undefined, options);
    const rows = [...first.rows];
    const seen = new Set(rows.map((r) => r.itemID));
    let page = 2;
    // Small ledgers keep the original one-page-at-a-time behavior so an early
    // short/empty page still stops immediately. Once the first page is full,
    // bounded batches reduce round trips for large ledgers without changing
    // page order or dedupe semantics.
    const canBatch = pageSize > 0 && first.rows.length >= pageSize && first.rowCount > pageSize;
    if (canBatch) {
        while (rows.length < first.rowCount && page <= 100) {
            const pageNumbers = Array.from({ length: Math.min(4, 101 - page) }, (_, i) => page + i);
            const batch = await Promise.all(pageNumbers.map((pageNumber) => renderLedger(avID, pageSize, pageNumber, options)));
            let stop = false;
            for (const next of batch) {
                if (next.rows.length === 0) { stop = true; break; }
                for (const r of next.rows) {
                    if (!seen.has(r.itemID)) { seen.add(r.itemID); rows.push(r); }
                }
                if (rows.length >= first.rowCount) { stop = true; break; }
            }
            page += pageNumbers.length;
            if (stop) break;
        }
        return { columns: first.columns, rows, rowCount: first.rowCount, complete: rows.length >= first.rowCount };
    }
    while (rows.length < first.rowCount && page <= 100) {
        const next = await renderLedger(avID, pageSize, page, options);
        if (next.rows.length === 0) break; // 翻页越界：内核已无更多行
        for (const r of next.rows) {
            if (!seen.has(r.itemID)) { seen.add(r.itemID); rows.push(r); }
        }
        page++;
    }
    return { columns: first.columns, rows, rowCount: first.rowCount, complete: rows.length >= first.rowCount };
}
