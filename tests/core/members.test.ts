/**
 * 成员 DAL 单测（D04/D05/D06）：建行回填、失败 syncError、精确写回与清空、
 * 设置页差异同步、回填唯一候选/同名歧义/失效关联。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setTransport } from "@/core/siyuan";
import {
    addMember, updateMember, reorderMembers, syncMembersToAv, backfillMemberLinks,
} from "@/core/members";
import { defaultSettings } from "@/core/settings";
import type { HomeSettings, FamilyMember } from "@/types";

/** av 行内存模型：itemID → cells（keyID → value） */
function fakeAv() {
    const rows = new Map<string, Record<string, any>>();
    let seq = 0;
    let failAdd = false;
    let failCellKey: string | null = null;
    setTransport(async (endpoint: string, payload: any) => {
        switch (endpoint) {
            case "/api/av/getAttributeViewPrimaryKeyValues":
                return { code: 0, msg: "", data: { rows: { values: [...rows.keys()].map((id) => ({ id })) } } };
            case "/api/av/addAttributeViewBlocks": {
                if (failAdd) return { code: 5, msg: "av busy" };
                const id = `row-${++seq}`;
                rows.set(id, {});
                // D02：响应直接携带新行 ID
                return { code: 0, msg: "", data: { operations: [{ rowID: id }] } };
            }
            case "/api/av/setAttributeViewBlockAttr": {
                // 217 波：单数文档化端点 { avID, keyID, itemID, value }（原 batch 的 values[0] 形状废弃）
                if (failCellKey && payload.keyID === failCellKey) return { code: 7, msg: "cell write failed" };
                rows.get(payload.itemID)![payload.keyID] = payload.value;
                return { code: 0, msg: "", data: null };
            }
            case "/api/av/renderAttributeView":
                return {
                    code: 0, msg: "",
                    data: {
                        view: {
                            columns: [],
                            rowCount: rows.size,
                            rows: [...rows.entries()].map(([id, cells]) => ({
                                id,
                                cells: Object.entries(cells).map(([keyID, value]) => ({ value: { keyID, ...value } })),
                            })),
                        },
                    },
                };
            default:
                throw new Error("unexpected endpoint " + endpoint);
        }
    });
    return {
        rows,
        setFailAdd: (v: boolean) => { failAdd = v; },
        setFailCell: (k: string | null) => { failCellKey = k; },
    };
}

const COLS = { name: "k-name", role: "k-role", birthday: "k-bday", lunar: "k-lunar" };
const REF = { avId: "av-members", columns: COLS };

const member = (over: Partial<FamilyMember> = {}): FamilyMember => ({
    id: over.id ?? `m-${Math.random().toString(36).slice(2, 8)}`,
    name: over.name ?? "张三",
    role: over.role ?? "self",
    birthday: over.birthday,
    lunarBirthday: over.lunarBirthday,
    createdAt: "2026-10-01T00:00:00Z",
    ...over,
});

const settings = (members: FamilyMember[]): HomeSettings => ({ ...defaultSettings(), members, dbRefs: { members: REF } });

function memoryPlugin() {
    const store: Record<string, string> = {};
    return {
        plugin: {
            loadData: async (n: string) => (store[n] ? JSON.parse(store[n]) : null),
            saveData: async (n: string, v: unknown) => { store[n] = JSON.stringify(v); },
        } as any,
        store,
    };
}

const text = (av: ReturnType<typeof fakeAv>, itemID: string, key: string) => av.rows.get(itemID)?.[COLS[key]]?.text?.content;
const dateVal = (av: ReturnType<typeof fakeAv>, itemID: string, key: string) => av.rows.get(itemID)?.[COLS[key]]?.date;

beforeEach(() => fakeAv());
afterEach(() => setTransport(null));

describe("addMember / updateMember（D05）", () => {
    it("添加成员 → 建行回填 avItemId + 写入 name/role/birthday/lunar", async () => {
        const av = fakeAv();
        const { plugin, store } = memoryPlugin();
        const st = settings([]);
        const m = member({ name: "李四", birthday: "1990-05-01", lunarBirthday: true });
        await addMember(plugin, st, m);
        expect(m.avItemId).toMatch(/^row-/);
        const saved: HomeSettings = JSON.parse(store["settings.json"]);
        expect(saved.members[0].avItemId).toBe(m.avItemId);
        expect(text(av, m.avItemId!, "name")).toBe("李四");
        expect(av.rows.get(m.avItemId!)![COLS.role]?.select?.content).toBe("self");
        expect(dateVal(av, m.avItemId!, "birthday")?.isNotEmpty).toBe(true);
        expect(av.rows.get(m.avItemId!)![COLS.lunar]?.checkbox?.checked).toBe(true);
    });

    it("建行失败（内核报错）→ syncError 记录，设置侧仍生效", async () => {
        const av = fakeAv();
        const { plugin } = memoryPlugin();
        const st = settings([]);
        av.setFailAdd(true);
        const m = member();
        await addMember(plugin, st, m);
        expect(m.avItemId).toBeUndefined();
        expect(m.syncError).toBeTruthy();
    });

    it("编辑成员（改名+清空生日）→ 按 avItemId 精确写回，含空生日 isNotEmpty:false", async () => {
        const av = fakeAv();
        const { plugin } = memoryPlugin();
        const st = settings([]);
        const m = member({ name: "王五", birthday: "1985-01-01" });
        await addMember(plugin, st, m);
        await updateMember(plugin, st, { ...m, name: "王五二", birthday: undefined });
        expect(text(av, m.avItemId!, "name")).toBe("王五二");
        expect(dateVal(av, m.avItemId!, "birthday")?.isNotEmpty).toBe(false); // 清空（D05）
    });

    it("无 avItemId 的成员编辑 → 补建关联行（D05 重试路径）", async () => {
        const av = fakeAv();
        const { plugin } = memoryPlugin();
        const st = settings([member({ name: "赵六" })]); // 未走 addMember，无 avItemId
        const target = st.members[0];
        await updateMember(plugin, st, { ...target, role: "elder" });
        // updateMember 用传入对象替换数组元素 → 从 settings 里取回更新后的成员断言
        const updated = st.members.find((m) => m.id === target.id)!;
        expect(updated.avItemId).toMatch(/^row-/);
        expect(av.rows.get(updated.avItemId!)![COLS.role]?.select?.content).toBe("elder");
    });
});

describe("syncMembersToAv（D05 设置页差异同步）", () => {
    it("新增建行 / 变更写回 / 未变跳过 / 删除无 av 动作", async () => {
        const av = fakeAv();
        const { plugin } = memoryPlugin();
        const st = settings([]);
        const kept = member({ name: "不变" });
        const changed = member({ name: "会改", birthday: "2000-01-01" });
        await addMember(plugin, st, kept);
        await addMember(plugin, st, changed);
        const prev = st.members.map((m) => ({ ...m }));

        const added = member({ name: "新加" });
        st.members = [
            { ...kept },
            { ...changed, name: "改了" }, // 变更
            added,                        // 新增
            // prev 中的第四人被删除 → 台账行保留
        ];
        const before = av.rows.size;
        const rep = await syncMembersToAv(plugin, st, prev);
        expect(rep.created).toBe(1);
        expect(rep.updated).toBe(1);
        expect(rep.failed).toHaveLength(0);
        expect(av.rows.size).toBe(before + 1); // 删除不删行
        expect(text(av, changed.avItemId!, "name")).toBe("改了");
    });

    it("未建库 → 全部仅设置侧生效，无报告动作", async () => {
        const { plugin } = memoryPlugin();
        const st = { ...defaultSettings(), members: [member()], dbRefs: {} };
        const rep = await syncMembersToAv(plugin, st, []);
        expect(rep.created).toBe(0);
        expect(st.members[0].avItemId).toBeUndefined();
    });

    it("多端同行幂等（§15/194 波）：同数据双调用 updateMember → 写值一致、不新增行", async () => {
        const av = fakeAv();
        const { plugin } = memoryPlugin();
        const st = settings([member({ name: "张三", id: "m1" })]);
        await addMember(plugin, st, st.members[0]);
        expect(av.rows.size).toBe(1);
        const m = st.members.find((x) => x.id === "m1")!;
        m.birthday = "2000-01-02";
        await updateMember(plugin, st, { ...m });
        const snap1 = JSON.stringify([...av.rows.entries()]);
        await updateMember(plugin, st, { ...m });
        const snap2 = JSON.stringify([...av.rows.entries()]);
        expect(snap2).toBe(snap1); // 值覆盖写幂等（多端 last-write-wins 下重复写不产生差异）
        expect(av.rows.size).toBe(1); // 不新增行
    });

    it("reorderMembers（17 组/197 波）：按传入 id 序重排；未覆盖成员附尾不丢人；不写台账", async () => {
        const av = fakeAv();
        const { plugin, store } = memoryPlugin();
        const st = settings([]);
        for (const m of [member({ name: "甲", id: "a" }), member({ name: "乙", id: "b" }), member({ name: "丙", id: "c" })]) {
            await addMember(plugin, st, m);
        }
        await reorderMembers(plugin, st, ["c", "a"]); // 乙未提及 → 附尾
        expect(st.members.map((m) => m.id)).toEqual(["c", "a", "b"]);
        const saved: HomeSettings = JSON.parse(store["settings.json"]);
        expect(saved.members.map((m: FamilyMember) => m.id)).toEqual(["c", "a", "b"]);
        expect(av.rows.size).toBe(3); // 台账行不动（行序无显示语义）
    });
});

describe("backfillMemberLinks（D06）", () => {
    it("唯一候选自动回填；同名多候选进 ambiguous 不回填；无匹配进 unmatched", async () => {
        const av = fakeAv();
        const { plugin } = memoryPlugin();
        const st = settings([
            member({ name: "唯一" }),
            member({ name: "同名" }),
            member({ name: "缺失" }),
        ]);
        // 台账行：唯一一行"唯一"，两行"同名"
        await addMember(plugin, st, member({ name: "唯一", id: "ledger-1" }));
        await addMember(plugin, st, member({ name: "同名", id: "ledger-2" }));
        await addMember(plugin, st, member({ name: "同名", id: "ledger-3" }));
        const res = await backfillMemberLinks(plugin, st);
        expect(res.linked).toEqual(["唯一"]);
        // D06 收尾：歧义项携带候选明细（id + 摘要）供人工选择对话框；row 顺序=插入序 row-2/row-3
        expect(res.ambiguous).toHaveLength(1);
        expect(res.ambiguous[0].member).toBe("同名");
        expect(res.ambiguous[0].candidates.map((c) => c.id)).toEqual(["row-2", "row-3"]);
        expect(res.unmatched).toEqual(["缺失"]);
        expect(st.members.find((m) => m.name === "唯一")!.avItemId).toMatch(/^row-/);
        expect(st.members.find((m) => m.name === "同名")!.avItemId).toBeUndefined(); // 不静默共用行
    });

    it("已有 avItemId 但行已删 → 清除关联进 stale；重复运行不新增成员", async () => {
        const av = fakeAv();
        const { plugin } = memoryPlugin();
        const st = settings([]);
        const m = member({ name: "会失效" });
        await addMember(plugin, st, m);
        expect(m.avItemId).toBeTruthy();
        av.rows.delete(m.avItemId!); // 模拟台账行被删
        const res1 = await backfillMemberLinks(plugin, st);
        expect(res1.stale).toEqual(["会失效"]);
        expect(m.avItemId).toBeUndefined();
        const res2 = await backfillMemberLinks(plugin, st); // 再跑一遍：不误回填（行已不在）
        expect(res2.linked).toHaveLength(0);
        expect(st.members).toHaveLength(1);
    });
});
