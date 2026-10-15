/**
 * 提醒中枢单测：runtime 合并语义 / scanner 容错与过滤 / certs provider 读路径（mock transport）。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { applyRuntime, defaultRuntime, type HubRuntime } from "@/core/hub/runtime";
import { runScan } from "@/core/hub/scanner";
import { CertsProvider, SchemaLedgerProvider, VehiclesProvider } from "@/core/hub/providers";
import { setTransport } from "@/core/siyuan";
import { FAVORS_SCHEMA, VEHICLES_SCHEMA } from "@/core/schema";
import type { RowLogs } from "@/core/rowlog";
import type { DataProvider } from "@/core/hub/providers";
import type { HomeSettings, Reminder } from "@/types";

const TODAY = new Date(2026, 9, 1);

const rem = (id: string, daysLeft: number, level: Reminder["level"] = "lead", moduleId = "certs"): Reminder => ({
    id, moduleId, ruleKey: "expiry", rowId: id.split("::")[0], title: id,
    dueDate: "2026-10-10", daysLeft, level,
});

const settings = (enabledModules?: string[]): HomeSettings => ({
    enabledModules: enabledModules ?? ["certs", "members"],
    members: [],
    leadOverrides: {},
    notifyHour: 8,
    silentFrom: 22,
    silentTo: 8,
    dbRefs: {},
});

describe("runtime.applyRuntime", () => {
    it("mute 剔除；snooze 未来隐藏、当天显示为 soon", () => {
        const rt: HubRuntime = {
            ...defaultRuntime(),
            muted: { "a::certs.expiry": true },
            snoozed: { "b::certs.expiry": "2026-10-05" },
        };
        const out = applyRuntime([rem("a::certs.expiry", 3), rem("b::certs.expiry", 4, "soon")], rt, TODAY);
        expect(out.find((r) => r.id.startsWith("a::"))).toBeUndefined();
        const b = out.find((r) => r.id.startsWith("b::"));
        expect(b).toBeUndefined(); // snooze 到 10-05，今天 10-01 未到期 → 隐藏
        const out2 = applyRuntime([rem("b::certs.expiry", 0)], rt, new Date(2026, 9, 5));
        expect(out2[0]?.daysLeft).toBe(0);
        expect(out2[0]?.level).toBe("soon");
    });
    it("adhoc 备忘注入并按天数排序（D1）", () => {
        const rt: HubRuntime = {
            ...defaultRuntime(),
            memos: [{ id: "m1", title: "周三给老师打电话", dueDate: "2026-10-03", createdAt: "2026-10-01T00:00:00Z" }],
        };
        const out = applyRuntime([rem("x::certs.expiry", 9)], rt, TODAY);
        expect(out[0].moduleId).toBe("adhoc");
        expect(out[0].title).toBe("周三给老师打电话");
        expect(out[0].daysLeft).toBe(2);
        expect(out.map((r) => r.daysLeft)).toEqual([...out.map((r) => r.daysLeft)].sort((a, b) => a - b));
    });
});

describe("scanner.runScan", () => {
    const okProvider = (moduleId: string, list: Reminder[]): DataProvider => ({
        moduleId, collect: async () => list,
    });
    const failProvider = (moduleId: string): DataProvider => ({
        moduleId, collect: async () => { throw new Error("kernel down"); },
    });

    it("合并多 provider + 计数", async () => {
        const res = await runScan(
            [okProvider("certs", [rem("r1::certs.expiry", -1, "overdue"), rem("r2::certs.expiry", 3, "soon")]),
             okProvider("members", [rem("r3::members.birthday", 20, "lead")])],
            settings(), defaultRuntime(), TODAY,
        );
        expect(res.reminders).toHaveLength(3);
        expect(res.counts).toEqual({ overdue: 1, soon: 1, lead: 1 });
        expect(res.stale).toBe(false);
    });
    it("单模块失败 → stale + errors，其余照常", async () => {
        const res = await runScan(
            [failProvider("certs"), okProvider("members", [rem("r3::members.birthday", 20, "lead")])],
            settings(), defaultRuntime(), TODAY,
        );
        expect(res.stale).toBe(true);
        expect(res.errors[0].moduleId).toBe("certs");
        expect(res.reminders).toHaveLength(1);
    });
    it("模块开关二次收敛：禁用模块的提醒剔除，adhoc 保留", async () => {
        const res = await runScan(
            [okProvider("certs", [rem("r1::certs.expiry", 3)]),
             okProvider("adhoc", [{ ...rem("m1::adhoc.memo", 1, "soon"), moduleId: "adhoc" }])],
            settings(["members"]), defaultRuntime(), TODAY,
        );
        expect(res.reminders.map((r) => r.moduleId)).toEqual(["adhoc"]);
    });
});

describe("CertsProvider（mock transport，读路径）", () => {
    afterEach(() => setTransport(null));

    const AV = "av-certs-1";
    const COLS = { name: "k-name", status: "k-status", expiry: "k-exp", due: "k-due" };
    // render 响应：cells 不带 keyID → 走位置回退（Spike 未确认字段，回退路径必须有测试）
    const renderPayload = {
        code: 0, msg: "",
        data: {
            view: {
                columns: Object.values(COLS).map((id, i) => ({ id, type: "text", name: `c${i}` })),
                rowCount: 2,
                rows: [
                    { // 有效证件：9 天后到期
                        id: "row-1",
                        cells: [
                            { value: { type: "text", text: { content: "我的护照" } } },
                            { value: { type: "select", select: { content: "valid" } } },
                            { value: { type: "date", date: { content: new Date(2026, 9, 10).getTime(), isNotEmpty: true } } },
                            { value: {} },
                        ],
                    },
                    { // 已过期状态行：不提醒（33.3 过滤）
                        id: "row-2",
                        cells: [
                            { value: { type: "text", text: { content: "旧身份证" } } },
                            { value: { type: "select", select: { content: "expired" } } },
                            { value: { type: "date", date: { content: new Date(2026, 8, 1).getTime(), isNotEmpty: true } } },
                            { value: {} },
                        ],
                    },
                ],
            },
        },
    };

    beforeEach(() => {
        setTransport(async (endpoint: string) => {
            if (endpoint === "/api/av/renderAttributeView") return renderPayload;
            if (endpoint === "/api/av/getAttributeViewPrimaryKeyValues") return { code: 0, msg: "", data: { rows: { values: [] } } };
            throw new Error("unexpected endpoint " + endpoint);
        });
    });

    it("读取行 → 派生 expiry 提醒；expired 行被过滤", async () => {
        const p = new CertsProvider({
            settings: settings(),
            getDbRef: () => ({ avId: AV, columns: COLS }),
        });
        const out = await p.collect(TODAY);
        expect(out).toHaveLength(1);
        const r = out[0];
        expect(r.title).toBe("我的护照");
        expect(r.daysLeft).toBe(9);
        expect(r.level).toBe("lead");
        expect(r.moduleId).toBe("certs");
    });
    it("无 dbRef → 空数组（模块未建库时不报错）", async () => {
        const p = new CertsProvider({ settings: settings(), getDbRef: () => undefined });
        expect(await p.collect(TODAY)).toEqual([]);
    });

    it("读取已补齐的类型专属日期 → 派生对应提醒规则", async () => {
        const cols = {
            name: "k-name", status: "k-status", expiry: "k-exp", due: "k-due",
            x_cert_hkmo_endorsement_expiry: "k-hkmo",
        };
        setTransport(async (endpoint: string) => {
            if (endpoint === "/api/av/renderAttributeView") return {
                code: 0, msg: "", data: { view: {
                    columns: Object.values(cols).map((id) => ({ id, type: "text", name: id })),
                    rowCount: 1,
                    rows: [{ id: "row-hkmo", cells: Object.entries(cols).map(([keyID, id]) => ({
                        value: keyID === "name"
                            ? { keyID: id, type: "text", text: { content: "港澳通行证" } }
                            : keyID === "status"
                                ? { keyID: id, type: "select", select: { content: "valid" } }
                                : keyID === "x_cert_hkmo_endorsement_expiry"
                                    ? { keyID: id, type: "date", date: { content: new Date(2026, 9, 20).getTime(), isNotEmpty: true } }
                                    : { keyID: id },
                    })) }],
                } },
            };
            if (endpoint === "/api/av/getAttributeViewPrimaryKeyValues") return { code: 0, msg: "", data: { rows: { values: [] } } };
            throw new Error("unexpected endpoint " + endpoint);
        });
        const p = new CertsProvider({ settings: settings(), getDbRef: () => ({ avId: AV, columns: cols }) });
        const out = await p.collect(TODAY);
        expect(out).toEqual(expect.arrayContaining([
            expect.objectContaining({ rowId: "row-hkmo", ruleKey: "hkmo_endorsement", daysLeft: 19 }),
        ]));
    });
});

describe("SchemaLedgerProvider favors 回礼（16 组/190 波：after kind + onlyIf）", () => {
    afterEach(() => setTransport(null));

    const AV = "av-favors-1";
    const COLS = { name: "k-name", direction: "k-dir", date: "k-date" };
    const dayMs = (dayOfMonth: number) => new Date(2026, 8, dayOfMonth).getTime(); // 2026-09 月

    function favorsPayload() {
        return {
            code: 0, msg: "",
            data: {
                view: {
                    columns: Object.values(COLS).map((id) => ({ id, type: "text", name: id })),
                    rowCount: 2,
                    rows: [
                        { // 收礼：9 月 1 日（TODAY 前 30 天）→ 回礼提醒 10 月 1 日到期
                            id: "row-in",
                            cells: [
                                { value: { keyID: "k-name", type: "text", text: { content: "张三婚礼礼金" } } },
                                { value: { keyID: "k-dir", type: "select", select: { content: "in" } } },
                                { value: { keyID: "k-date", type: "date", date: { content: dayMs(1), isNotEmpty: true, isNotTime: true } } },
                            ],
                        },
                        { // 送礼：不派生（onlyIf direction=in）
                            id: "row-out",
                            cells: [
                                { value: { keyID: "k-name", type: "text", text: { content: "李四乔迁" } } },
                                { value: { keyID: "k-dir", type: "select", select: { content: "out" } } },
                                { value: { keyID: "k-date", type: "date", date: { content: dayMs(1), isNotEmpty: true, isNotTime: true } } },
                            ],
                        },
                    ],
                },
            },
        };
    }

    it("after kind：事件+30 天派生；onlyIf direction=in 过滤送礼行", async () => {
        setTransport(async (endpoint) => {
            if (endpoint === "/api/av/renderAttributeView") return favorsPayload();
            throw new Error("unexpected endpoint " + endpoint);
        });
        const p = new SchemaLedgerProvider("favors", FAVORS_SCHEMA, {
            settings: settings(["favors"]),
            getDbRef: () => ({ avId: AV, columns: COLS, docId: "d1" }),
        });
        const out = await p.collect(TODAY);
        expect(out).toHaveLength(1);
        expect(out[0].ruleKey).toBe("reciprocate");
        expect(out[0].title).toBe("张三婚礼礼金");
        expect(out[0].dueDate).toBe("2026-10-01"); // 09-01 + 30 天 = TODAY
        expect(out[0].daysLeft).toBe(0);
        expect(out[0].level).toBe("soon");
    });
});

describe("VehiclesProvider 车辆主表 + 维护流水提醒", () => {
    afterEach(() => setTransport(null));

    const AV = "av-vehicles-1";
    const COLS = {
        name: "k-name", member: "k-member", mileage: "k-mileage",
        expiry: "k-expiry", inspection_due: "k-inspection", insurance_due: "k-insurance",
        vehicle_tax_due: "k-tax", battery_due: "k-battery",
    };
    const value = (keyID: string, v: any) => ({ value: { keyID, ...v } });

    it("复用一次主表读取并派生 nextDate 与已达到里程的逾期提醒", async () => {
        let renders = 0;
        setTransport(async (endpoint: string) => {
            if (endpoint === "/api/av/renderAttributeView") {
                renders++;
                return {
                    code: 0, msg: "", data: { view: {
                        columns: Object.values(COLS).map((id) => ({ id, type: "text", name: id })),
                        rowCount: 1,
                        rows: [{ id: "vehicle-row", cells: [
                            value(COLS.name, { type: "text", text: { content: "小蓝" } }),
                            value(COLS.member, { type: "relation", relation: { blockIDs: ["member-av-row"] } }),
                            value(COLS.mileage, { type: "number", number: { content: 10000, isNotEmpty: true } }),
                            value(COLS.expiry, {}), value(COLS.inspection_due, {}), value(COLS.insurance_due, {}),
                            value(COLS.vehicle_tax_due, {}), value(COLS.battery_due, {}),
                        ] }],
                    } },
                };
            }
            throw new Error("unexpected endpoint " + endpoint);
        });
        const logs: RowLogs = {
            [`${AV}|vehicle-row`]: {
                maintenance: [{
                    category: "routine", date: "2026-09-01", odometer: 9000,
                    nextDate: "2026-10-20", nextOdometer: 10000, at: "2026-09-01T00:00:00Z",
                }],
            },
        };
        const p = new VehiclesProvider(VEHICLES_SCHEMA, {
            settings: { ...settings(["vehicles"]), members: [{ id: "member-1", name: "张三", role: "self", avItemId: "member-av-row", createdAt: "2026-01-01" }] },
            getDbRef: () => ({ avId: AV, columns: COLS }),
            loadRowLogs: async () => logs,
        });
        const out = await p.collect(TODAY);
        expect(renders).toBe(1);
        expect(out).toEqual(expect.arrayContaining([
            expect.objectContaining({ ruleKey: "maintenance_date", dueDate: "2026-10-20", daysLeft: 19, memberId: "member-1" }),
            expect.objectContaining({ ruleKey: "maintenance_odometer", level: "overdue", daysLeft: -1, memberId: "member-1" }),
        ]));
    });

    it("未达到 nextOdometer 且日期超出提前量时不生成维护提醒", async () => {
        setTransport(async (endpoint: string) => {
            if (endpoint === "/api/av/renderAttributeView") return {
                code: 0, msg: "", data: { view: {
                    columns: Object.values(COLS).map((id) => ({ id, type: "text", name: id })), rowCount: 1,
                    rows: [{ id: "vehicle-row", cells: Object.values(COLS).map((id) =>
                        id === COLS.name ? value(id, { type: "text", text: { content: "小蓝" } })
                            : id === COLS.mileage ? value(id, { type: "number", number: { content: 9000, isNotEmpty: true } })
                                : value(id, {})) }],
                } },
            };
            throw new Error("unexpected endpoint " + endpoint);
        });
        const p = new VehiclesProvider(VEHICLES_SCHEMA, {
            settings: settings(["vehicles"]), getDbRef: () => ({ avId: AV, columns: COLS }),
            loadRowLogs: async () => ({ [`${AV}|vehicle-row`]: { maintenance: [{ category: "repair", date: "2026-09-01", odometer: 8000, nextDate: "2027-01-01", nextOdometer: 10000 }] } }),
        });
        const out = await p.collect(TODAY);
        expect(out.filter((r) => r.ruleKey.startsWith("maintenance_"))).toEqual([]);
    });
});
