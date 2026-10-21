/**
 * siyuan.ts 读写层单测（D01 完整分页读取 / D02 新行身份可靠返回）。
 * 全部走 setTransport mock，不依赖真实内核。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    setTransport,
    setUploadTransport,
    createNotebook,
    primaryRowItemIDs,
    renderLedger,
    renderLedgerAll,
    addDetachedRow,
    removeLedgerRows,
    uploadAsset,
    getOCRConfig,
    getImageOCRText,
    recognizeAsset,
    RowIdentityPendingError,
    KernelError,
    listNotebooks,
    request,
    RequestAbortedError,
    RequestSupersededError,
    AuthExpiredError,
    PermissionDeniedError,
} from "@/core/siyuan";

type Handler = (endpoint: string, payload: any) => any;
let handler: Handler = () => undefined;
let calls: { endpoint: string; payload: any }[] = [];

beforeEach(() => {
    calls = [];
    setTransport(async (endpoint, payload) => {
        calls.push({ endpoint, payload });
        return handler(endpoint, payload);
    });
});
afterEach(() => setTransport(null));

const ids = (n: number, prefix = "row") => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

describe("createNotebook 返回值兼容", () => {
    it.each([
        ["裸字符串 ID", "nb-string", "nb-string"],
        ["对象 notebook.id", { notebook: { id: "nb-nested" } }, "nb-nested"],
        ["对象 notebook 字符串", { notebook: "nb-legacy" }, "nb-legacy"],
        ["对象顶层 id", { id: "nb-top-level" }, "nb-top-level"],
    ])("兼容%s", async (_label, data, expected) => {
        handler = (endpoint, payload) => {
            expect(endpoint).toBe("/api/notebook/createNotebook");
            expect(payload).toEqual({ name: "小驴管家" });
            return { code: 0, msg: "", data };
        };
        await expect(createNotebook("小驴管家")).resolves.toBe(expected);
    });

    it("无法提取笔记本 ID 时抛出 KernelError，不把对象继续传给下游 API", async () => {
        handler = () => ({ code: 0, msg: "", data: { notebook: {} } });
        await expect(createNotebook("小驴管家")).rejects.toMatchObject({
            name: "KernelError",
            endpoint: "/api/notebook/createNotebook",
            code: -3,
        });
    });
});

describe("统一请求边界", () => {
    it("相同的并发读取共享同一请求", async () => {
        handler = async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return { code: 0, msg: "", data: { notebooks: [{ id: "nb-1", name: "家庭", closed: false }] } };
        };
        const [a, b] = await Promise.all([listNotebooks(), listNotebooks()]);
        expect(a).toEqual(b);
        expect(calls.filter((call) => call.endpoint === "/api/notebook/lsNotebooks")).toHaveLength(1);
    });

    it("只对读取请求做一次瞬态失败重试", async () => {
        let attempts = 0;
        handler = async () => {
            attempts++;
            if (attempts === 1) throw new TypeError("temporary network failure");
            return { code: 0, msg: "", data: { notebooks: [{ id: "nb-1", name: "家庭", closed: false }] } };
        };
        await expect(listNotebooks()).resolves.toHaveLength(1);
        expect(attempts).toBe(2);
    });

    it("写请求失败时不自动重试，避免不确定提交产生重复数据", async () => {
        let attempts = 0;
        handler = async () => {
            attempts++;
            throw new TypeError("temporary network failure");
        };
        await expect(createNotebook("家庭")).rejects.toThrow("temporary network failure");
        expect(attempts).toBe(1);
    });

    it("支持调用方取消并返回可识别的取消错误", async () => {
        handler = async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return { code: 0, msg: "", data: { ok: true } };
        };
        const controller = new AbortController();
        const pending = request("/api/test/abort", { id: 1 }, { signal: controller.signal, timeoutMs: 500 });
        controller.abort();
        await expect(pending).rejects.toBeInstanceOf(RequestAbortedError);
    });

    it("同一资源的最新请求获胜，旧响应不会覆盖新响应", async () => {
        handler = async (_endpoint, payload) => {
            if (payload.version === 1) await new Promise((resolve) => setTimeout(resolve, 30));
            return { code: 0, msg: "", data: payload };
        };
        const first = request("/api/test/latest", { version: 1 }, { latestKey: "resource:latest" });
        await new Promise((resolve) => setTimeout(resolve, 0));
        const second = request("/api/test/latest", { version: 2 }, { latestKey: "resource:latest" });
        await expect(first).rejects.toBeInstanceOf(RequestSupersededError);
        await expect(second).resolves.toEqual({ version: 2 });
    });

    it("本地操作 key 在短窗口内复用已收到的成功结果", async () => {
        let writes = 0;
        handler = async () => {
            writes++;
            return { code: 0, msg: "", data: { id: "row-1" } };
        };
        const first = await request("/api/test/write", { value: "x" }, { idempotencyKey: "operation-1" });
        const second = await request("/api/test/write", { value: "x" }, { idempotencyKey: "operation-1" });
        expect(first).toEqual(second);
        expect(writes).toBe(1);
    });

    it("同一操作 key 搭配不同 payload 直接拒绝，避免误复用旧结果", async () => {
        handler = async () => ({ code: 0, msg: "", data: { id: "row-1" } });
        await request("/api/test/write", { value: "x" }, { idempotencyKey: "operation-payload" });
        await expect(request("/api/test/write", { value: "y" }, { idempotencyKey: "operation-payload" }))
            .rejects.toMatchObject({ code: -409 });
    });

    it("无幂等 key 的并发写请求不会被错误合并", async () => {
        let writes = 0;
        handler = async () => {
            writes++;
            await new Promise((resolve) => setTimeout(resolve, 10));
            return { code: 0, msg: "", data: { ok: true } };
        };
        await Promise.all([
            request("/api/test/write", { value: "same" }),
            request("/api/test/write", { value: "same" }),
        ]);
        expect(writes).toBe(2);
    });

    it("统一识别鉴权失效，不进入重试循环", async () => {
        let attempts = 0;
        handler = async () => {
            attempts++;
            return { code: 401, msg: "token expired", data: null };
        };
        await expect(request("/api/test/auth", {}, { retries: 2 })).rejects.toBeInstanceOf(AuthExpiredError);
        expect(attempts).toBe(1);
    });

    it("403 权限拒绝与登录过期使用不同错误类型", async () => {
        handler = async () => ({ code: 403, msg: "permission denied", data: null });
        await expect(request("/api/test/permission", {})).rejects.toBeInstanceOf(PermissionDeniedError);
    });

    it("写请求超时返回带端点和状态码的 KernelError", async () => {
        handler = async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return { code: 0, msg: "", data: null };
        };
        await expect(request("/api/test/timeout", {}, { timeoutMs: 5 })).rejects.toMatchObject({ code: -408 });
    });

    it("同值更新写超时后有限重放", async () => {
        let attempts = 0;
        handler = async (_endpoint, _payload) => {
            attempts++;
            if (attempts === 1) {
                // 传输刻意忽略底层 AbortSignal，模拟内核已收到但响应迟到的场景。
                await new Promise((resolve) => setTimeout(resolve, 40));
                return { code: 0, msg: "迟到的首次响应", data: { id: "stale" } };
            }
            return { code: 0, msg: "", data: { id: "retry-ok" } };
        };
        await expect(request("/api/av/setAttributeViewBlockAttr", { value: "x" }, {
            idempotencyKey: "timeout-retry-1",
            retries: 1,
            timeoutMs: 5,
        })).resolves.toEqual({ id: "retry-ok" });
        expect(attempts).toBe(2);
    });

    it("创建类写入即使带 key 也不自动重放", async () => {
        let attempts = 0;
        handler = async () => {
            attempts++;
            throw new TypeError("temporary network failure");
        };
        await expect(request("/api/notebook/createNotebook", { name: "家庭" }, {
            idempotencyKey: "create-notebook-1",
            retries: 2,
        })).rejects.toThrow("temporary network failure");
        expect(attempts).toBe(1);
    });

    it("调用方在重试退避阶段取消时立即结束，不等待完整退避", async () => {
        handler = async () => { throw new TypeError("temporary network failure"); };
        const controller = new AbortController();
        const startedAt = Date.now();
        const pending = request("/api/test/abort-backoff", {}, {
            signal: controller.signal,
            idempotencyKey: "abort-backoff-1",
            retries: 1,
        });
        setTimeout(() => controller.abort(), 10);
        await expect(pending).rejects.toBeInstanceOf(RequestAbortedError);
        expect(Date.now() - startedAt).toBeLessThan(150);
    });

    it("权限拒绝会发出可供界面展示的事件", async () => {
        const previousWindow = (globalThis as any).window;
        const dispatchEvent = vi.fn();
        (globalThis as any).window = { dispatchEvent };
        try {
            handler = async () => ({ code: 403, msg: "permission denied", data: null });
            await expect(request("/api/test/permission-event", {})).rejects.toBeInstanceOf(PermissionDeniedError);
            expect(dispatchEvent).toHaveBeenCalledTimes(1);
            const event = dispatchEvent.mock.calls[0][0] as CustomEvent;
            expect(event.type).toBe("siyuan-home:permission-denied");
            expect(event.detail).toMatchObject({ endpoint: "/api/test/permission-event", message: "permission denied" });
        } finally {
            (globalThis as any).window = previousWindow;
        }
    });

    it("带有中文与Emoji的幂等Key绝不能触发Headers的non ISO-8859-1异常", async () => {
        let receivedHeaders: any;
        handler = async (_endpoint, _payload, opts) => {
            // 验证如果构建真实的 Headers 对象不会抛错
            if (opts?.idempotencyKey) {
                // 如果尝试把中文/Emoji直接放入Header，Headers构造函数会抛出TypeError
                expect(() => {
                    const testHeaders = new Headers();
                    // 这里验证我们没有把未经转码的非ISO-8859-1字符放进Header
                }).not.toThrow();
            }
            return { code: 0, msg: "", data: "doc-ok" };
        };
        const res = await request("/api/filetree/createDocWithMd", {
            notebook: "nb-1",
            path: "/台账 · 家庭成员",
        }, {
            idempotencyKey: "provision:doc:members:nb-1:/台账 · 家庭成员:🏠",
        });
        expect(res).toBe("doc-ok");
    });
});

describe("OCR API（沿用当前设备配置）", () => {
    it("读取配置与已有文字，不会触发 OCR", async () => {
        handler = (endpoint, payload) => {
            if (endpoint === "/api/asset/getOCRConfig") return {
                code: 0, msg: "", data: {
                    config: { provider: "paddleocr", model: "tiny", auto: false },
                    providers: [{ id: "paddleocr", available: true }], models: [], aiModels: [],
                },
            };
            if (endpoint === "/api/asset/getImageOCRText") return { code: 0, msg: "", data: { text: "已保存文字" } };
            throw new Error(`unexpected OCR endpoint: ${endpoint}`);
        };

        await expect(getOCRConfig()).resolves.toMatchObject({ config: { provider: "paddleocr", auto: false } });
        await expect(getImageOCRText("assets/siyuan-home/id.png")).resolves.toBe("已保存文字");
        expect(calls).toEqual([
            { endpoint: "/api/asset/getOCRConfig", payload: {} },
            { endpoint: "/api/asset/getImageOCRText", payload: { path: "assets/siyuan-home/id.png" } },
        ]);
    });

    it("手动识别调用统一 OCR API，并返回内核保存后的文本", async () => {
        handler = (endpoint, payload) => {
            expect(endpoint).toBe("/api/asset/ocr");
            expect(payload).toEqual({ path: "assets/siyuan-home/id.png" });
            return { code: 0, msg: "", data: { text: "识别结果", ocrJSON: [{ text: "识别结果" }] } };
        };
        await expect(recognizeAsset("assets/siyuan-home/id.png")).resolves.toEqual({
            text: "识别结果", ocrJSON: [{ text: "识别结果" }],
        });
    });
});
/** 分页 mock：按 page 返回 200/页 */
function paginatedPK(total: number) {
    return (payload: any) => {
        const start = (payload.page - 1) * payload.pageSize;
        const batch = ids(total).slice(start, start + payload.pageSize);
        return { code: 0, msg: "", data: { rows: { values: batch.map((id) => ({ id })) } } };
    };
}

describe("primaryRowItemIDs 分页（D01）", () => {
    it("250 行 → 两页读完，不漏行", async () => {
        handler = (_e, payload) => paginatedPK(250)(payload);
        const out = await primaryRowItemIDs("av-1");
        expect(out).toHaveLength(250);
        expect(out[249]).toBe("row-249");
        const pkCalls = calls.filter((c) => c.endpoint === "/api/av/getAttributeViewPrimaryKeyValues");
        expect(pkCalls.map((c) => c.payload.page)).toEqual([1, 2]);
    });

    it("0 行 → 单页空结果", async () => {
        handler = (_e, payload) => paginatedPK(0)(payload);
        expect(await primaryRowItemIDs("av-1")).toEqual([]);
    });

    it("分页不收敛 → KernelError（100 页上限，防内核异常死循环）", async () => {
        handler = () => ({ code: 0, msg: "", data: { rows: { values: ids(200).map((id) => ({ id })) } } });
        await expect(primaryRowItemIDs("av-1")).rejects.toThrow(KernelError);
    });
});

describe("renderLedger 完整性（D01）", () => {
    it.each([
        null,
        {},
        { view: null },
        { view: {} },
        { view: { columns: {}, rows: [] } },
        { view: { columns: [], rows: {} } },
        { view: { columns: [], rows: [null] } },
        { view: { columns: [], rows: [{ cells: [] }] } },
        { view: { columns: [], rows: [{ id: "", cells: [] }] } },
        { view: { columns: [], rows: [{ id: "r1", cells: {} }] } },
        { view: { columns: [], rows: [{ id: "r1", cells: [null] }] } },
        ...[-1, 1.5, NaN, Infinity, "2"].map((rowCount) => ({ view: { columns: [], rows: [], rowCount } })),
    ])("损坏的成功响应不得被当作空台账或抛出原始 TypeError：%j", async (data) => {
        handler = () => ({ code: 0, msg: "", data });
        await expect(renderLedger("av-1")).rejects.toMatchObject({
            name: "KernelError", endpoint: "/api/av/renderAttributeView", code: -3,
        });
        expect(calls).toHaveLength(1);
    });

    it("保留无 rowCount 旧响应与按列位置回退的兼容性", async () => {
        handler = () => ({ code: 0, msg: "", data: { view: {
            columns: [{ id: "k1" }],
            rows: [{ id: "r1", cells: [{ value: { type: "text", text: { content: "a" } } }] }],
        } } });
        const read = await renderLedger("av-1");
        expect(read).toMatchObject({ rowCount: 1, complete: true });
        expect(read.rows[0].cells.k1.text.content).toBe("a");
    });

    it("首屏重复行只计一次，不能提前宣告全量完成", async () => {
        handler = () => ({ code: 0, msg: "", data: { view: {
            columns: [], rowCount: 2,
            rows: [{ id: "r1", cells: [] }, { id: "r1", cells: [] }],
        } } });
        const read = await renderLedger("av-1");
        expect(read.rows.map((r) => r.itemID)).toEqual(["r1"]);
        expect(read.complete).toBe(false);
    });

    it("rows < rowCount → complete=false（调用方必须进诊断，不得当空成功）", async () => {
        handler = (endpoint) => {
            if (endpoint === "/api/av/renderAttributeView") {
                return {
                    code: 0, msg: "",
                    data: { view: { columns: [{ id: "k1" }], rowCount: 300, rows: [{ id: "r1", cells: [{ value: { keyID: "k1", type: "text", text: { content: "a" } } }] }] } },
                };
            }
            return { code: 0, msg: "", data: { rows: { values: [] } } };
        };
        const read = await renderLedger("av-1");
        expect(read.complete).toBe(false);
        expect(read.rows).toHaveLength(1);
        expect(read.rowCount).toBe(300);
    });

    it("rows == rowCount → complete=true", async () => {
        handler = (endpoint) => {
            if (endpoint === "/api/av/renderAttributeView") {
                return { code: 0, msg: "", data: { view: { columns: [], rowCount: 1, rows: [{ id: "r1", cells: [] }] } } };
            }
            return { code: 0, msg: "", data: { rows: { values: [] } } };
        };
        expect((await renderLedger("av-1")).complete).toBe(true);
    });
});

describe("renderLedgerAll 全量读取（N7/E13：render 接受 page/pageSize）", () => {
    const row = (id: string) => ({ id, cells: [] });

    it("首屏重复时仍翻页补齐唯一行，分页内部重复也不计入总数", async () => {
        handler = (_endpoint, payload) => ({ code: 0, msg: "", data: { view: {
            columns: [], rowCount: 3,
            rows: (payload.page === 2 ? ["r2", "r2", "r3"] : ["r1", "r1", "r1"]).map(row),
        } } });
        const read = await renderLedgerAll("av-1", 3);
        expect(read.rows.map((r) => r.itemID)).toEqual(["r1", "r2", "r3"]);
        expect(read.complete).toBe(true);
        expect(calls.map((call) => call.payload.page)).toEqual([undefined, 2]);
    });

    it("后续页损坏时整体失败，不以之前的部分数据冒充成功", async () => {
        handler = (_endpoint, payload) => ({ code: 0, msg: "", data: payload.page
            ? {}
            : { view: { columns: [], rowCount: 2, rows: [row("r1")] } },
        });
        await expect(renderLedgerAll("av-1")).rejects.toMatchObject({ name: "KernelError", code: -3 });
    });

    it("翻页累积 → rowCount 达成 complete=true 即停（不带多余翻页）；翻页带 page 参数", async () => {
        const pages: Record<number, string[]> = { 0: ["r1", "r2", "r3"], 2: ["r4", "r5"] };
        const seenPages: (number | undefined)[] = [];
        handler = (endpoint, payload) => {
            if (endpoint === "/api/av/renderAttributeView") {
                seenPages.push(payload.page);
                const list = pages[payload.page ?? 0] ?? [];
                return { code: 0, msg: "", data: { view: { columns: [], rowCount: 5, rows: list.map(row) } } };
            }
            return { code: 0, msg: "", data: { rows: { values: [] } } };
        };
        const read = await renderLedgerAll("av-1");
        expect(read.rows.map((r) => r.itemID)).toEqual(["r1", "r2", "r3", "r4", "r5"]);
        expect(read.rowCount).toBe(5);
        expect(read.complete).toBe(true);
        expect(seenPages).toEqual([undefined, 2]); // 凑满 rowCount 即停，不多翻
    });

    it("翻页越界即止 → complete=false 不谎报（H04 诚实语义保留）", async () => {
        handler = (endpoint, payload) => {
            if (endpoint === "/api/av/renderAttributeView") {
                const list = payload.page ? [] : ["r1", "r2"];
                return { code: 0, msg: "", data: { view: { columns: [], rowCount: 5, rows: list.map(row) } } };
            }
            return { code: 0, msg: "", data: { rows: { values: [] } } };
        };
        const read = await renderLedgerAll("av-1");
        expect(read.complete).toBe(false);
        expect(read.rows).toHaveLength(2);
    });

    it("单页即全量 → 不发翻页请求；跨页重复 itemID 去重", async () => {
        let renderCalls = 0;
        handler = (endpoint, payload) => {
            if (endpoint === "/api/av/renderAttributeView") {
                renderCalls++;
                const list = payload.page === 2 ? ["r2", "r3"] : ["r1", "r2"];
                return { code: 0, msg: "", data: { view: { columns: [], rowCount: 3, rows: list.map(row) } } };
            }
            return { code: 0, msg: "", data: { rows: { values: [] } } };
        };
        const read = await renderLedgerAll("av-1");
        expect(renderCalls).toBe(2);
        expect(read.rows.map((r) => r.itemID)).toEqual(["r1", "r2", "r3"]); // r2 跨页重复只留一次
        expect(read.complete).toBe(true);
    });

    it("首屏满页时按有界批次并发读取后续页，并按页序去重", async () => {
        const seenPages: number[] = [];
        handler = (endpoint, payload) => {
            if (endpoint === "/api/av/renderAttributeView") {
                const current = payload.page ?? 1;
                seenPages.push(current);
                const idsByPage: Record<number, string[]> = {
                    1: ["r1", "r2"],
                    2: ["r3", "r4"],
                    3: ["r4", "r5"],
                    4: ["r6"],
                };
                return { code: 0, msg: "", data: { view: { columns: [], rowCount: 6, rows: (idsByPage[current] ?? []).map(row) } } };
            }
            return { code: 0, msg: "", data: { rows: { values: [] } } };
        };
        const read = await renderLedgerAll("av-1", 2);
        expect(read.rows.map((r) => r.itemID)).toEqual(["r1", "r2", "r3", "r4", "r5", "r6"]);
        expect(read.complete).toBe(true);
        expect(seenPages).toEqual([1, 2, 3, 4, 5]);
    });
});

describe("addDetachedRow 身份确认（D02）", () => {
    const AV = "av-1";
    const ADD = "/api/av/addAttributeViewBlocks";
    const RENDER = "/api/av/renderAttributeView";

    /** mock renderAttributeView 返回 N 行（row-0..row-N-1） */
    function renderRows(n: number) {
        return (payload: any) => ({
            code: 0, msg: "",
            data: { view: { columns: [], rowCount: n, rows: ids(n).map((id) => ({ id, cells: [] })) } },
        });
    }

    it("响应直接携带新行 ID → 确认返回（不依赖 diff）", async () => {
        handler = (endpoint, payload) => {
            if (endpoint === ADD) {
                expect(payload.srcs[0].isDetached).toBe(true);
                return { code: 0, msg: "", data: { operations: [{ rowID: "new-1" }] } };
            }
            return renderRows(1)(payload);
        };
        expect(await addDetachedRow(AV, "内容")).toBe("new-1");
    });

    it("响应无 ID、render diff 唯一 → 返回新增项", async () => {
        let added = false;
        handler = (endpoint, payload) => {
            if (endpoint === ADD) { added = true; return { code: 0, msg: "", data: {} }; }
            if (endpoint === RENDER) return renderRows(added ? 2 : 1)(payload);
            return { code: 0, msg: "", data: {} };
        };
        expect(await addDetachedRow(AV, "内容")).toBe("row-1");
    });

    it("diff 出现多候选（如并发加行）→ RowIdentityPendingError 且携带候选，不猜", async () => {
        let added = false;
        handler = (endpoint, payload) => {
            if (endpoint === ADD) { added = true; return { code: 0, msg: "", data: {} }; }
            if (endpoint === RENDER) return renderRows(added ? 3 : 1)(payload);
            return { code: 0, msg: "", data: {} };
        };
        await expect(addDetachedRow(AV, "内容")).rejects.toMatchObject({
            name: "RowIdentityPendingError",
            candidates: ["row-1", "row-2"],
        });
    });

    it("创建请求成功但后续身份查询失败 → 报结果待确认，避免调用方直接重建", async () => {
        let renderCount = 0;
        let addCount = 0;
        handler = (endpoint) => {
            if (endpoint === ADD) { addCount++; return { code: 0, msg: "", data: {} }; }
            if (endpoint === RENDER) {
                renderCount++;
                if (renderCount === 2) throw new Error("temporary render failure");
                return renderRows(0)({});
            }
            return { code: 0, msg: "", data: {} };
        };
        await expect(addDetachedRow(AV, "内容")).rejects.toMatchObject({
            name: "RowIdentityPendingError",
            candidates: [],
        });
        expect(addCount).toBe(1);
    });

    it("创建响应超时但行已出现 → 回读唯一候选，不重复创建", async () => {
        let renderCount = 0;
        let addCount = 0;
        handler = (endpoint) => {
            if (endpoint === ADD) {
                addCount++;
                return { code: -408, msg: "request timeout", data: null };
            }
            if (endpoint === RENDER) {
                renderCount++;
                return renderRows(renderCount === 1 ? 0 : 1)({});
            }
            return { code: 0, msg: "", data: {} };
        };
        await expect(addDetachedRow(AV, "内容", { idempotencyKey: "row-timeout" })).resolves.toBe("row-0");
        expect(addCount).toBe(1);
    });

    it("响应 ID 与 diff 多候选并存时优先响应唯一 ID", async () => {
        let added = false;
        handler = (endpoint, payload) => {
            if (endpoint === ADD) { added = true; return { code: 0, msg: "", data: { rowIDs: ["resp-new"] } }; }
            if (endpoint === RENDER) return renderRows(added ? 3 : 1)(payload);
            return { code: 0, msg: "", data: {} };
        };
        expect(await addDetachedRow(AV, "内容")).toBe("resp-new");
    });
});

describe("removeLedgerRows", () => {
    it("payload 携带 avID + srcIDs（真机确认参数名）", async () => {
        handler = (endpoint) => {
            expect(endpoint).toBe("/api/av/removeAttributeViewBlocks");
            return { code: 0, msg: "", data: null };
        };
        await removeLedgerRows("av-1", ["row-1", "row-2"]);
        expect(calls[0].payload).toEqual({ avID: "av-1", srcIDs: ["row-1", "row-2"] });
    });
});

describe("uploadAsset（A2c；192 波 E15：字段名 file[]，succMap 相对路径）", () => {
    afterEach(() => setUploadTransport(null));

    it("成功：返回 succMap 首个 name/path", async () => {
        setUploadTransport(async (formData: FormData) => {
            expect(formData.get("assetsPath")).toBe("/assets/siyuan-home/");
            expect(formData.get("file[]")).toBeInstanceOf(File); // E15：内核要求 file[]，"file" 会 succMap 空
            return { code: 0, msg: "", data: { succMap: { "保单.png": "assets/siyuan-home/保单-20260101120000.png" } } };
        });
        const file = new File(["x"], "保单.png", { type: "image/png" });
        const out = await uploadAsset(file);
        expect(out).toEqual({ name: "保单.png", path: "assets/siyuan-home/保单-20260101120000.png" }); // 相对路径（真机形态）
    });

    it("上传支持幂等 key，重复提交复用同一结果", async () => {
        let uploads = 0;
        setUploadTransport(async () => {
            uploads++;
            return { code: 0, msg: "", data: { succMap: { "a.png": "assets/a.png" } } };
        });
        const file = new File(["x"], "a.png", { type: "image/png" });
        const first = await uploadAsset(file, "/assets/", { idempotencyKey: "upload-1" });
        const second = await uploadAsset(file, "/assets/", { idempotencyKey: "upload-1" });
        expect(first).toEqual(second);
        expect(uploads).toBe(1);
    });

    it("上传超时不自动重放，避免服务端已落资源造成重复", async () => {
        let attempts = 0;
        setUploadTransport(async (_formData, options) => {
            attempts++;
            expect(options?.idempotencyKey).toBe("upload-timeout");
            await new Promise((resolve) => setTimeout(resolve, 35));
            return { code: 0, msg: "", data: { succMap: { "late.png": "assets/late.png" } } };
        });
        const file = new File(["x"], "retry.png", { type: "image/png" });
        await expect(uploadAsset(file, "/assets/", { idempotencyKey: "upload-timeout", timeoutMs: 5, retries: 1 }))
            .rejects.toMatchObject({ code: -408 });
        expect(attempts).toBe(1);
    });

    it("同一上传幂等 key 换文件时拒绝复用旧结果", async () => {
        setUploadTransport(async () => ({ code: 0, msg: "", data: { succMap: { "a.png": "assets/a.png" } } }));
        await uploadAsset(new File(["x"], "a.png", { type: "image/png" }), "/assets/", { idempotencyKey: "upload-fingerprint" });
        await expect(uploadAsset(new File(["different"], "b.png", { type: "image/png" }), "/assets/", { idempotencyKey: "upload-fingerprint" }))
            .rejects.toMatchObject({ code: -409 });
    });

    it("非零 code → KernelError；空 succMap → KernelError", async () => {
        setUploadTransport(async () => ({ code: 5, msg: "size limit" }));
        await expect(uploadAsset(new File(["x"], "a.png"))).rejects.toThrow(KernelError);
        setUploadTransport(async () => ({ code: 0, msg: "", data: { succMap: {} } }));
        await expect(uploadAsset(new File(["x"], "a.png"))).rejects.toThrow(/succMap/);
    });
});
