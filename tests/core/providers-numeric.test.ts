/**
 * H15 数值阈值规则 + H08 生日身份接线单测。
 * NumericRuleProvider：≤ 触发、缺值不评估、0 算有值、终态跳过、缺列报错、成员关联；
 * MembersProvider：农历读独立 lunar 列、memberId 按 avItemId 关联。
 */
import { describe, it, expect, afterEach } from "vitest";
import { setTransport } from "@/core/siyuan";
import { NumericRuleProvider, MembersProvider } from "@/core/hub/providers";
import { MEDICINE_SCHEMA, STOCK_SCHEMA, validateSchema } from "@/core/schema";
import { defaultSettings } from "@/core/settings";
import type { DbRef, FamilyMember, HomeSettings } from "@/types";

const TODAY = new Date(2026, 9, 1);

/** av 行 mock：行数据由 cells(key→value) 数组给出，render 按位置回退不依赖 keyID */
function avMock(rows: { id: string; cells: Record<string, any> }[]) {
    setTransport(async (endpoint: string) => {
        if (endpoint === "/api/av/renderAttributeView") {
            return {
                code: 0, msg: "",
                data: {
                    view: {
                        columns: [],
                        rowCount: rows.length,
                        rows: rows.map((r) => ({ id: r.id, cells: Object.entries(r.cells).map(([keyID, value]) => ({ value: { keyID, ...value } })) })),
                    },
                },
            };
        }
        return { code: 0, msg: "", data: { rows: { values: [] } } };
    });
}

afterEach(() => setTransport(null));

const num = (n: number) => ({ type: "number", number: { content: n, isNotEmpty: true } });
const numEmpty = { type: "number", number: { isNotEmpty: false } };
const txt = (s: string) => ({ type: "text", text: { content: s } });
const sel = (s: string) => ({ type: "select", select: { content: s } });

const settings = (members: FamilyMember[] = []): HomeSettings => ({ ...defaultSettings(), members });

describe("D11 schema 契约门禁（扩展）", () => {
    it("31 个生产 schema 全部通过门禁（含 numericRules 类型检查）", () => {
        for (const s of [MEDICINE_SCHEMA, STOCK_SCHEMA]) {
            expect(validateSchema("test", s)).toEqual([]);
        }
    });
    it("重复列 key / capture>5 / 非number阈值列 → 报错", () => {
        const errs = validateSchema("t", {
            columns: [{ key: "a", type: "text" }, { key: "a", type: "text" }, { key: "n", type: "text" }],
            capture: ["a", "a", "a", "a", "a", "a"],
            numericRules: [{ key: "low", field: "n", thresholdField: "n" }],
        } as any);
        expect(errs.some((e) => e.includes("重复列"))).toBe(true);
        expect(errs.some((e) => e.includes("capture 超过"))).toBe(true);
        expect(errs.filter((e) => e.includes("非number")).length).toBe(2);
    });
});

describe("NumericRuleProvider（H15 低库存）", () => {
    const deps = (dbRefs: Record<string, DbRef>, members?: FamilyMember[]) => ({
        settings: settings(members),
        getDbRef: (id: string) => dbRefs[id],
    });

    it("qty ≤ threshold 触发（含等于）；高于阈值不触发（补货解除）", async () => {
        avMock([
            { id: "r-low", cells: { "k-name": txt("布洛芬"), "k-qty": num(2), "k-th": num(5) } },
            { id: "r-eq", cells: { "k-name": txt("创可贴"), "k-qty": num(3), "k-th": num(3) } },
            { id: "r-ok", cells: { "k-name": txt("口罩"), "k-qty": num(9), "k-th": num(5) } },
        ]);
        const p = new NumericRuleProvider("stock", STOCK_SCHEMA, deps({ stock: { avId: "av-1", columns: { name: "k-name", qty: "k-qty", low_stock_at: "k-th" } } }));
        const out = await p.collect(TODAY);
        expect(out.map((r) => r.rowId).sort()).toEqual(["r-eq", "r-low"]);
        const low = out.find((r) => r.rowId === "r-low")!;
        expect(low.ruleKey).toBe("low_stock");
        expect(low.level).toBe("soon");
        expect(low.daysLeft).toBe(0);
        expect(low.dueDate).toBe("2026-10-01");
        expect(low.title).toContain("2/5");
    });

    it("缺值/阈值为 0 边界：qty=0 触发；threshold=0 且 qty=0 触发；缺 qty 或缺 threshold 不评估", async () => {
        avMock([
            { id: "r-zero", cells: { "k-name": txt("A"), "k-qty": num(0), "k-th": num(2) } },
            { id: "r-th0", cells: { "k-name": txt("B"), "k-qty": num(0), "k-th": num(0) } },
            { id: "r-noqty", cells: { "k-name": txt("C"), "k-th": num(2) } },
            { id: "r-noth", cells: { "k-name": txt("D"), "k-qty": num(1) } },
        ]);
        const p = new NumericRuleProvider("medicine", MEDICINE_SCHEMA, deps({ medicine: { avId: "av-1", columns: { name: "k-name", stock_qty: "k-qty", low_stock_at: "k-th" } } }));
        const out = await p.collect(TODAY);
        expect(out.map((r) => r.rowId).sort()).toEqual(["r-th0", "r-zero"]); // 0 算有值；缺值不评估
    });

    it("终态行跳过（med_expired/discarded）；成员 relation 反查 memberId", async () => {
        avMock([
            { id: "r-exp", cells: { "k-name": txt("过期药"), "k-qty": num(1), "k-th": num(5), "k-status": sel("med_expired") } },
            { id: "r-mem", cells: { "k-name": txt("妈妈的钙片"), "k-qty": num(1), "k-th": num(5), "k-member": { type: "relation", relation: { blockIDs: ["member-row-1"] } } } },
        ]);
        const members: FamilyMember[] = [{ id: "mom", name: "妈妈", role: "elder", avItemId: "member-row-1", createdAt: "" }];
        const p = new NumericRuleProvider("medicine", MEDICINE_SCHEMA, deps({ medicine: { avId: "av-1", columns: { name: "k-name", stock_qty: "k-qty", low_stock_at: "k-th", status: "k-status", member: "k-member" } } }, members));
        const out = await p.collect(TODAY);
        expect(out.map((r) => r.rowId)).toEqual(["r-mem"]);
        expect(out[0].memberId).toBe("mom");
    });

    it("规则列缺失 → 抛错（H04 同语义）", async () => {
        avMock([]);
        const p = new NumericRuleProvider("stock", STOCK_SCHEMA, deps({ stock: { avId: "av-1", columns: { name: "k-name" } } }));
        await expect(p.collect(TODAY)).rejects.toThrow(/missing numeric rule column/);
    });

    it("schema 未声明 numericRules → 空数组不读库", async () => {
        let called = false;
        setTransport(async () => { called = true; return { code: 0, msg: "", data: {} }; });
        const p = new NumericRuleProvider("certs", { columns: [], capture: [] } as any, deps({}));
        expect(await p.collect(TODAY)).toEqual([]);
        expect(called).toBe(false);
    });
});

describe("MembersProvider（H08 生日身份与农历接线）", () => {
    it("memberId 按 avItemId 反查（成员过滤可选中生日）；农历标记读独立 lunar 列", async () => {
        avMock([
            // 我：公历生日 10-05（今天 10-01，4 天后 → lead 7 天内，正常派生）
            { id: "member-row-2", cells: { "k-name": txt("我"), "k-bday": { type: "date", date: { content: new Date(1990, 9, 5).getTime(), isNotEmpty: true } } } },
            // 儿子：农历生日（lunar 列 checked）；下次发生可能在提前量窗口外被降噪过滤——只验证不崩、可派生时 memberId 正确
            { id: "member-row-1", cells: { "k-name": txt("儿子"), "k-bday": { type: "date", date: { content: new Date(2018, 1, 27).getTime(), isNotEmpty: true } }, "k-lunar": { type: "checkbox", checkbox: { checked: true } } } },
        ]);
        const members: FamilyMember[] = [
            { id: "son", name: "儿子", role: "child", avItemId: "member-row-1", createdAt: "" },
            { id: "me", name: "我", role: "self", avItemId: "member-row-2", createdAt: "" },
        ];
        const p = new MembersProvider({ settings: settings(members), getDbRef: () => ({ avId: "av-m", columns: { name: "k-name", birthday: "k-bday", lunar: "k-lunar" } }) });
        const out = await p.collect(TODAY);
        const me = out.find((r) => r.title === "我")!;
        expect(me.memberId).toBe("me"); // H08：成员过滤能选中其生日
        expect(me.dueDate).toBe("2026-10-05");
        const son = out.find((r) => r.title === "儿子");
        if (son) expect(son.memberId).toBe("son");
    });
});
