/**
 * 建库器单测（D07 笔记本 ID/名称与错误分类、D08 原库复用与补列续跑）。
 * 带状态的 fake kernel（setTransport），覆盖笔记本匹配、瞬态/缺失分类、补列、补登记找回 av。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setTransport, KernelError } from "@/core/siyuan";
import {
    provisionModule, ensureNotebook, isDocMissingError, DEFAULT_NOTEBOOK_NAME,
    type ProvisionOptions,
} from "@/core/provisioner";
import type { HomeSettings, DbRef } from "@/types";
import type { ModuleSchema } from "@/core/schema";
import { defaultSettings } from "@/core/settings";

/** 思源 ID 形态的假 ID（14 位数字-7 位小写字母数字） */
const NB_ID = "20260101000000-abc1234";
const NB2_ID = "20260101000001-def2345";

interface FakeState {
    notebooks: { id: string; name: string; closed: boolean }[];
    docs: { id: string; box: string; hpath: string }[];
    avBlocks: { id: string; root_id: string }[];
    notebookCreated: string[];
    notebookOpened: string[];
    docCreated: string[];
    columnsAdded: { avID: string; keyName: string }[];
    hpathByID: (id: string) => string | Error;
}

function fakeKernel() {
    const s: FakeState = {
        notebooks: [],
        docs: [],
        avBlocks: [],
        notebookCreated: [],
        notebookOpened: [],
        docCreated: [],
        columnsAdded: [],
        hpathByID: () => "/台账 · 测试",
    };
    setTransport(async (endpoint, payload: any) => {
        switch (endpoint) {
            case "/api/notebook/lsNotebooks":
                return { code: 0, msg: "", data: { notebooks: s.notebooks } };
            case "/api/notebook/createNotebook": {
                s.notebookCreated.push(payload.name);
                const id = `2026010100000${s.notebookCreated.length}-new0001`;
                s.notebooks.push({ id, name: payload.name, closed: false });
                return { code: 0, msg: "", data: id };
            }
            case "/api/notebook/openNotebook": {
                s.notebookOpened.push(payload.notebook);
                const nb = s.notebooks.find((n) => n.id === payload.notebook);
                if (nb) nb.closed = false;
                return { code: 0, msg: "", data: null };
            }
            case "/api/filetree/getHPathByID": {
                const r = s.hpathByID(payload.id);
                if (r instanceof Error) throw r;
                return { code: 0, msg: "", data: r };
            }
            case "/api/filetree/createDocWithMd": {
                s.docCreated.push(payload.path);
                const id = `doc-${s.docCreated.length}`;
                s.docs.push({ id, box: payload.notebook, hpath: payload.path });
                return { code: 0, msg: "", data: id };
            }
            case "/api/query/sql": {
                const stmt: string = payload.stmt;
                const hpath = stmt.match(/hpath='([^']*)'/)?.[1];
                const box = stmt.match(/box='([^']*)'/)?.[1];
                const rootId = stmt.match(/root_id='([^']*)'/)?.[1];
                if (stmt.includes("type='av' AND root_id=")) {
                    return { code: 0, msg: "", data: s.avBlocks.filter((b) => b.root_id === rootId).map((b) => ({ id: b.id })) };
                }
                if (stmt.includes("type='av'")) {
                    return { code: 0, msg: "", data: s.avBlocks.map((b) => ({ id: b.id })) };
                }
                return {
                    code: 0, msg: "",
                    data: s.docs.filter((d) => (!box || d.box === box) && (!hpath || d.hpath === hpath)).map((d) => ({ id: d.id })),
                };
            }
            case "/api/block/insertBlock": {
                // createAttributeView 的 div 插入：登记一个 av 块（parentID=文档）
                const avId = `av-${s.avBlocks.length + 1}`;
                s.avBlocks.push({ id: avId, root_id: payload.parentID });
                return { code: 0, msg: "", data: [] };
            }
            case "/api/av/renderAttributeView":
                return { code: 0, msg: "", data: { view: { columns: [], rows: [], rowCount: 0 } } };
            case "/api/av/addAttributeViewKey":
                s.columnsAdded.push({ avID: payload.avID, keyName: payload.keyName });
                return { code: 0, msg: "", data: null };
            case "/api/av/getAttributeViewPrimaryKeyValues":
                return { code: 0, msg: "", data: { rows: { values: [] } } };
            default:
                throw new Error("unexpected endpoint " + endpoint);
        }
    });
    return s;
}

const schema: ModuleSchema = {
    columns: [
        { key: "name", type: "text" },
        { key: "note", type: "text" },
    ],
    capture: ["name"],
} as unknown as ModuleSchema;

const opts: ProvisionOptions = { resolveName: (k) => `名-${k}` };

const NB = { id: NB_ID, name: DEFAULT_NOTEBOOK_NAME, closed: false };

beforeEach(() => fakeKernel());
afterEach(() => setTransport(null));

describe("ensureNotebook（D07）", () => {
    it("登记值为 ID 且存在 → 按 ID 复用，不新建", async () => {
        const s = fakeKernel();
        s.notebooks = [NB];
        expect(await ensureNotebook(NB_ID)).toBe(NB_ID);
        expect(s.notebookCreated).toHaveLength(0);
    });

    it("登记 ID 已被删除 → 落回默认名复用，绝不把 ID 当名称新建", async () => {
        const s = fakeKernel();
        s.notebooks = [{ id: NB2_ID, name: DEFAULT_NOTEBOOK_NAME, closed: false }];
        expect(await ensureNotebook(NB_ID)).toBe(NB2_ID);
        expect(s.notebookCreated).toHaveLength(0);
    });

    it("笔记本被关闭 → openNotebook 恢复而非新建", async () => {
        const s = fakeKernel();
        s.notebooks = [{ ...NB, closed: true }];
        expect(await ensureNotebook(NB_ID)).toBe(NB_ID);
        expect(s.notebookOpened).toEqual([NB_ID]);
        expect(s.notebookCreated).toHaveLength(0);
    });

    it("无登记且默认名不存在 → 新建", async () => {
        const s = fakeKernel();
        await ensureNotebook(undefined);
        expect(s.notebookCreated).toEqual([DEFAULT_NOTEBOOK_NAME]);
    });
});

describe("isDocMissingError（D07 分类）", () => {
    it("网络层异常 → 瞬态（false）", () => {
        expect(isDocMissingError(new TypeError("fetch failed"))).toBe(false);
    });
    it("malformed envelope（code=-1 非 not found）→ 瞬态（false）", () => {
        expect(isDocMissingError(new KernelError("ep", -1, "malformed response envelope"))).toBe(false);
    });
    it("内核 not found → 文档缺失（true）", () => {
        expect(isDocMissingError(new KernelError("ep", -1, "block not found"))).toBe(true);
        expect(isDocMissingError(new KernelError("ep", 3, "doc 不存在"))).toBe(true);
    });
});

describe("provisionModule（D07/D08）", () => {
    const settings = (dbRefs: Record<string, DbRef> = {}): HomeSettings => ({ ...defaultSettings(), dbRefs });

    it("① 有效 dbRef + 瞬态错误 → 原样返回不重建，provisionError 记录", async () => {
        const s = fakeKernel();
        // TypeError 模拟网络失败（defaultTransport 抛出的即非 KernelError → 瞬态）
        setTransport(async (endpoint) => {
            if (endpoint === "/api/filetree/getHPathByID") throw new TypeError("fetch failed");
            throw new Error("unexpected " + endpoint);
        });
        const st = settings({ certs: { docId: "doc-1", avId: "av-1", columns: { name: "k1" }, notebook: NB_ID } });
        const res = await provisionModule(st, "certs", schema, "证件", opts);
        expect(res.created).toBe(false);
        expect(res.dbRef.provisionError).toContain("doc check");
        expect(s.docCreated).toHaveLength(0); // 未重建
    });

    it("① 内核 not found → 走重建：新文档 + 新列", async () => {
        const s = fakeKernel();
        s.notebooks = [NB];
        s.hpathByID = (id) => { if (id === "doc-gone") throw new KernelError("ep", -1, "block not found"); return "/x"; };
        const st = settings({ certs: { docId: "doc-gone", avId: "av-gone", columns: { name: "k1" }, notebook: NB_ID } });
        const res = await provisionModule(st, "certs", schema, "证件", opts);
        expect(s.docCreated).toHaveLength(1); // 重建了文档
        expect(res.created).toBe(true);
        expect(res.dbRef.docId).not.toBe("doc-gone");
        expect(s.columnsAdded.map((c) => c.keyName).sort()).toEqual(["名-name", "名-note"]);
        expect(res.dbRef.columns.name).toBeTruthy();
        expect(res.dbRef.provisional).toBe(false);
    });

    it("① 复用原库补列续跑：只补缺失列，成功后清除旧 provisionError", async () => {
        const s = fakeKernel();
        s.notebooks = [NB];
        const st = settings({ certs: { docId: "doc-1", avId: "av-1", columns: { name: "k1" }, provisionError: "column \"note\": old failure" } });
        const res = await provisionModule(st, "certs", schema, "证件", opts);
        expect(res.created).toBe(false);
        expect(s.columnsAdded).toHaveLength(1); // 只补 note
        expect(s.columnsAdded[0].keyName).toBe("名-note");
        expect(res.dbRef.columns.note).toBeTruthy();
        expect(res.dbRef.columns.name).toBe("k1"); // 已登记列不动
        expect(res.dbRef.provisionError).toBeUndefined(); // 旧错误清除
    });

    it("② 文档在、登记丢（补登记）→ 找回文档内 av 块复用原库 + 补列", async () => {
        const s = fakeKernel();
        s.notebooks = [NB];
        s.docs = [{ id: "doc-exist", box: NB_ID, hpath: "/台账 · 证件" }];
        s.avBlocks = [{ id: "av-exist", root_id: "doc-exist" }];
        const st = settings({});
        const res = await provisionModule(st, "certs", schema, "证件", opts);
        expect(res.created).toBe(false);
        expect(res.dbRef.docId).toBe("doc-exist");
        expect(res.dbRef.avId).toBe("av-exist"); // 复用原库，不是新建
        expect(s.docCreated).toHaveLength(0);
        expect(s.columnsAdded).toHaveLength(2);
    });

    it("② 文档在、登记丢、文档内无 av → 建新 av 并登记", async () => {
        const s = fakeKernel();
        s.notebooks = [NB];
        s.docs = [{ id: "doc-exist", box: NB_ID, hpath: "/台账 · 证件" }];
        const st = settings({});
        const res = await provisionModule(st, "certs", schema, "证件", opts);
        expect(res.dbRef.docId).toBe("doc-exist");
        expect(res.dbRef.avId).toBe("av-1"); // insertBlock 后找到新 av 块
        expect(res.dbRef.provisional).toBe(false);
    });

    it("③ 全新 → 建文档建库建列；③ 笔记本创建失败 → provisionError 不上抛", async () => {
        const s = fakeKernel();
        s.notebooks = [NB];
        const st = settings({});
        const res = await provisionModule(st, "certs", schema, "证件", opts);
        expect(res.created).toBe(true);
        expect(s.docCreated).toHaveLength(1);
        expect(res.dbRef.avId).toBe("av-1");

        setTransport(async () => { throw new TypeError("kernel unreachable"); });
        const res2 = await provisionModule(st, "medicine", schema, "药箱", opts);
        expect(res2.created).toBe(false);
        expect(res2.dbRef.provisionError).toBeTruthy(); // 记录而非抛出
    });
});
