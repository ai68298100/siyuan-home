/**
 * siyuan.ts 读写层单测（D01 完整分页读取 / D02 新行身份可靠返回）。
 * 全部走 setTransport mock，不依赖真实内核。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

    it("非零 code → KernelError；空 succMap → KernelError", async () => {
        setUploadTransport(async () => ({ code: 5, msg: "size limit" }));
        await expect(uploadAsset(new File(["x"], "a.png"))).rejects.toThrow(KernelError);
        setUploadTransport(async () => ({ code: 0, msg: "", data: { succMap: {} } }));
        await expect(uploadAsset(new File(["x"], "a.png"))).rejects.toThrow(/succMap/);
    });
});
