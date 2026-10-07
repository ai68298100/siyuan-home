/**
 * 提醒中枢 v0.2 正确性单测：
 * - H01 运行态写串行化（并发动作不互相覆盖）
 * - H03 备忘保留（未处理永不按到期删；done 保留 30 天可恢复）
 * - H05 完成按规则类型分派（anniversary/recurring/oneoff/adhoc）
 * - H06 延后过期分级为 overdue
 * - H07 已处理视图与恢复
 * - H04 扫描失败保留模块快照；禁用模块不发起请求
 */
import { describe, it, expect, afterEach } from "vitest";
import {
    applyRuntime, defaultRuntime, listHandled, purgeHandled, recordModuleHistory, type HubRuntime,
} from "@/core/hub/runtime";
import { runScan, deriveVisible } from "@/core/hub/scanner";
import { snooze, mute, complete, restore, withRuntime, renew, updateMemo } from "@/core/hub/actions";
import { CertsProvider, leadFor } from "@/core/hub/providers";
import { inSilentHours, dailyDigest, weeklyPreview, markWeeklyNotified, isoWeekKey } from "@/core/hub/notify";
import { setTransport } from "@/core/siyuan";
import type { DataProvider } from "@/core/hub/providers";
import type { HomeSettings, Reminder, ReminderRuleSpec } from "@/types";

const TODAY = new Date(2026, 9, 1);

const rem = (id: string, dueDate: string, level: Reminder["level"] = "lead", kind?: Reminder["kind"], moduleId = "certs"): Reminder => ({
    id, moduleId, ruleKey: id.split("::")[1] ?? "expiry", rowId: id.split("::")[0], title: `T-${id}`,
    dueDate, daysLeft: 5, level, kind,
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

/** 内存版 plugin（loadData/saveData 深拷贝落盘） */
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

describe("H01 运行态写串行化", () => {
    it("并发 snooze + mute 全部落盘（串行队列，后写不覆盖先写）", async () => {
        const { plugin, store } = memoryPlugin();
        await Promise.all([
            snooze(plugin, "a::certs.expiry", 3, TODAY),
            mute(plugin, "b::certs.expiry"),
        ]);
        const saved = JSON.parse(store["hub-runtime.json"]);
        expect(saved.snoozed["a::certs.expiry"]).toBe("2026-10-04");
        expect(saved.muted["b::certs.expiry"]).toBe(true);
    });

    it("队列内单个失败不断链：后续动作仍执行", async () => {
        const { plugin, store } = memoryPlugin();
        await withRuntime(plugin, () => { throw new Error("boom"); }).catch(() => undefined);
        await snooze(plugin, "a::certs.expiry", 1, TODAY);
        expect(JSON.parse(store["hub-runtime.json"]).snoozed["a::certs.expiry"]).toBe("2026-10-02");
    });
});

describe("H03 备忘保留", () => {
    const memo = (id: string, dueDate: string, doneAt?: string) => ({ id, title: `M-${id}`, dueDate, createdAt: "2026-09-01T00:00:00Z", doneAt });

    it("31 天前到期但未完成 → 仍在活跃列表（永不按到期自动删）", () => {
        const rt = { ...defaultRuntime(), memos: [memo("m1", "2026-08-01")] };
        const out = applyRuntime([], rt, TODAY);
        expect(out.map((r) => r.title)).toContain("M-m1");
    });

    it("已办备忘离开活跃列表、进已处理视图；restore 后回到活跃", () => {
        const rt: HubRuntime = { ...defaultRuntime(), memos: [memo("m1", "2026-09-20", "2026-09-20T10:00:00Z")] };
        expect(applyRuntime([], rt, TODAY)).toHaveLength(0);
        expect(listHandled(rt, []).map((h) => h.id)).toEqual(["adhoc::m1"]);
        delete rt.memos[0].doneAt;
        expect(applyRuntime([], rt, TODAY)).toHaveLength(1);
    });

    it("recordModuleHistory：同日覆盖计数、跨模块分桶、滚动窗口裁剪", () => {
        const rt: HubRuntime = { ...defaultRuntime(), moduleHistory: { "2026-09-01": { certs: 9 } } };
        const today = new Date(2026, 9, 15);
        recordModuleHistory(rt, [rem("a::certs.expiry", "2026-10-20"), rem("b::certs.expiry", "2026-10-21"), rem("c::medicine.expiry", "2026-10-22", "lead", undefined, "medicine")], today);
        expect(rt.moduleHistory!["2026-10-15"]).toEqual({ certs: 2, medicine: 1 });
        // 14 天窗口外的旧键（2026-09-01 距 10-15 为 44 天）被裁剪
        expect(rt.moduleHistory!["2026-09-01"]).toBeUndefined();
    });

    it("recordModuleHistory：同日二次记录覆盖不累加（每日一个快照）", () => {
        const rt: HubRuntime = defaultRuntime();
        const today = new Date(2026, 9, 15);
        recordModuleHistory(rt, [rem("a::certs.expiry", "2026-10-20")], today);
        recordModuleHistory(rt, [rem("a::certs.expiry", "2026-10-20"), rem("b::certs.expiry", "2026-10-21")], today);
        expect(rt.moduleHistory!["2026-10-15"]).toEqual({ certs: 2 });
    });
    it("purgeHandled：done 超 30 天清除；未办同日到期保留", () => {
        const rt: HubRuntime = {
            ...defaultRuntime(),
            memos: [memo("old-done", "2026-08-01", "2026-08-01T00:00:00Z"), memo("old-open", "2026-08-01")],
        };
        purgeHandled(rt, TODAY);
        expect(rt.memos.map((m) => m.id)).toEqual(["old-open"]);
    });

    it("purgeHandled：清理已失效的 recurring 已办期，保留当日已办期", () => {
        const rt: HubRuntime = { ...defaultRuntime(), handledUntil: { "r::m.next_pay": "2026-09-20", "r2::m.next_pay": "2026-10-01" } };
        purgeHandled(rt, TODAY);
        expect(rt.handledUntil).toEqual({ "r2::m.next_pay": "2026-10-01" });
    });
});

describe("H05 完成按规则类型分派", () => {
    it("anniversary：当年已办当年隐藏，次年重现", async () => {
        const { plugin, store } = memoryPlugin();
        const r = rem("row1::members.birthday", "2026-10-03", "soon", "anniversary", "members");
        await complete(plugin, r, 2026);
        const rt: HubRuntime = JSON.parse(store["hub-runtime.json"]);
        expect(rt.handledYear[r.id]).toBe(2026);
        expect(applyRuntime([r], rt, TODAY)).toHaveLength(0);
        // 次年：dueDate 滚到 2027 → 重现
        expect(applyRuntime([{ ...r, dueDate: "2027-10-03" }], rt, new Date(2027, 0, 5))).toHaveLength(1);
    });

    it("recurring：本期已办隐藏，下一期（due 更晚）自动重现", async () => {
        const { plugin, store } = memoryPlugin();
        const r = rem("row1::memberships.next_pay", "2026-10-10", "lead", "recurring", "memberships");
        await complete(plugin, r);
        const rt: HubRuntime = JSON.parse(store["hub-runtime.json"]);
        expect(rt.handledUntil[r.id]).toBe("2026-10-10");
        expect(applyRuntime([r], rt, TODAY)).toHaveLength(0); // 同一期不再出现
        expect(applyRuntime([{ ...r, dueDate: "2026-11-10" }], rt, TODAY)).toHaveLength(1); // 下一期重现
    });

    it("oneoff：记已办条目（含标题），不再显示为永久 mute", async () => {
        const { plugin, store } = memoryPlugin();
        const r = rem("row1::certs.expiry", "2026-10-02", "overdue");
        await complete(plugin, r);
        const rt: HubRuntime = JSON.parse(store["hub-runtime.json"]);
        expect(rt.muted[r.id]).toBeUndefined(); // 完成不等于永久忽略
        expect(rt.handled[r.id].title).toBe(r.title);
        expect(applyRuntime([r], rt, TODAY)).toHaveLength(0);
    });

    it("adhoc 备忘完成 → doneAt 标记（可恢复，不物理删除）", async () => {
        const { plugin, store } = memoryPlugin();
        await withRuntime(plugin, (rt) => { rt.memos.push({ id: "m9", title: "周三电话", dueDate: "2026-10-03", createdAt: "2026-10-01T00:00:00Z" }); });
        // 运行态生成的备忘提醒 id 形如 adhoc::m9
        await complete(plugin, rem("adhoc::m9", "2026-10-03", "soon", "oneoff", "adhoc"));
        const rt: HubRuntime = JSON.parse(store["hub-runtime.json"]);
        expect(rt.memos).toHaveLength(1);
        expect(rt.memos[0].doneAt).toBeTruthy();
        expect(applyRuntime([], rt, TODAY)).toHaveLength(0);
    });

    it("restore：清掉全部隐藏标记，oneoff/备忘/忽略均回到活跃", async () => {
        const { plugin, store } = memoryPlugin();
        const r = rem("row1::certs.expiry", "2026-10-02", "overdue");
        await complete(plugin, r);
        await mute(plugin, "row2::certs.expiry");
        await restore(plugin, r.id);
        await restore(plugin, "row2::certs.expiry");
        const rt: HubRuntime = JSON.parse(store["hub-runtime.json"]);
        expect(applyRuntime([r, rem("row2::certs.expiry", "2026-10-05", "soon")], rt, TODAY)).toHaveLength(2);
    });
});

describe("H06 延后过期分级", () => {
    it("延后日已过 3 天 → 显示为 overdue（不再沿用原 soon/lead）", () => {
        const rt: HubRuntime = { ...defaultRuntime(), snoozed: { "a::certs.expiry": "2026-09-28" } };
        const out = applyRuntime([rem("a::certs.expiry", "2026-10-10", "lead")], rt, TODAY);
        expect(out[0].dueDate).toBe("2026-09-28");
        expect(out[0].level).toBe("overdue");
        expect(out[0].daysLeft).toBe(-3);
    });

    it("延后日当天 → soon", () => {
        const rt: HubRuntime = { ...defaultRuntime(), snoozed: { "a::certs.expiry": "2026-10-01" } };
        expect(applyRuntime([rem("a::certs.expiry", "2026-10-10", "lead")], rt, TODAY)[0].level).toBe("soon");
    });
});

describe("H07 已处理视图数据", () => {
    it("合并 done/muted/year/period/memo 五类条目", async () => {
        const { plugin } = memoryPlugin();
        await complete(plugin, rem("r1::certs.expiry", "2026-10-02", "overdue", "oneoff"));
        await mute(plugin, "r2::certs.expiry");
        await complete(plugin, rem("r3::members.birthday", "2026-10-03", "soon", "anniversary", "members"), 2026);
        await complete(plugin, rem("r4::memberships.next_pay", "2026-10-10", "lead", "recurring", "memberships"));
        const { loadRuntime } = await import("@/core/hub/runtime");
        const rt = await loadRuntime(plugin);
        const derived = [rem("r2::certs.expiry", "2026-10-05", "soon")];
        const kinds = listHandled(rt, derived).map((h) => h.kind).sort();
        expect(kinds).toEqual(["done", "muted", "period", "year"]);
    });
});

describe("H04 扫描失败保留模块快照", () => {
    const ok = (moduleId: string, list: Reminder[]): DataProvider => ({ moduleId, collect: async () => list });
    const fail = (moduleId: string): DataProvider => ({ moduleId, collect: async () => { throw new Error("kernel down"); } });

    it("certs 失败 → 沿用上次成功快照，members 正常更新", async () => {
        const rt: HubRuntime = {
            ...defaultRuntime(),
            cache: { reminders: [], counts: { overdue: 0, soon: 0, lead: 0 }, errors: [], derived: [], byModule: { certs: { reminders: [rem("old::certs.expiry", "2026-10-02", "overdue")], at: "2026-09-30T00:00:00Z" } } },
        };
        const res = await runScan([fail("certs"), ok("members", [rem("n1::members.birthday", "2026-10-20", "lead", "anniversary", "members")])], settings(), rt, TODAY);
        expect(res.stale).toBe(true);
        expect(res.errors[0].moduleId).toBe("certs");
        const byId = new Set(res.derived.map((r) => r.id));
        expect(byId.has("old::certs.expiry")).toBe(true); // 旧数据保留，不显示成"全部处理完"
        expect(byId.has("n1::members.birthday")).toBe(true);
        expect(res.byModule.certs.at).toBe("2026-09-30T00:00:00Z"); // 数据时间不冒充新扫描
    });

    it("失败且无历史快照 → 该模块无数据但报错", async () => {
        const res = await runScan([fail("certs")], settings(), defaultRuntime(), TODAY);
        expect(res.derived).toHaveLength(0);
        expect(res.errors).toHaveLength(1);
    });

    it("禁用模块不发起请求、无快照（PF04 方向）", async () => {
        let requested = false;
        const spy: DataProvider = { moduleId: "certs", collect: async () => { requested = true; return []; } };
        const res = await runScan([spy], settings(["members"]), defaultRuntime(), TODAY);
        expect(requested).toBe(false);
        expect(res.byModule.certs).toBeUndefined();
    });

    it("PF06 增量扫描：only 范围外沿用旧快照与旧数据时间，范围内实扫", async () => {
        let certsCalls = 0;
        let membersCalls = 0;
        const certsP: DataProvider = { moduleId: "certs", collect: async () => { certsCalls++; return [rem(`c${certsCalls}::certs.expiry`, "2026-10-02", "overdue")]; } };
        const membersP: DataProvider = { moduleId: "members", collect: async () => { membersCalls++; return [rem(`m${membersCalls}::members.birthday`, "2026-10-20", "lead", "anniversary", "members")]; } };
        // 第一次全量（生产中 index.ts 会把 byModule 写回 rt.cache）
        const rt = defaultRuntime();
        const full = await runScan([certsP, membersP], settings(), rt, TODAY);
        expect(full.derived).toHaveLength(2);
        rt.cache = { reminders: full.reminders, counts: full.counts, errors: full.errors, derived: full.derived, byModule: full.byModule };
        // 增量：只扫 certs
        const partial = await runScan([certsP, membersP], settings(), rt, new Date(2026, 9, 2), new Set(["certs"]));
        expect(certsCalls).toBe(2);
        expect(membersCalls).toBe(1); // members 未实扫
        const certsAt = partial.byModule.certs.at;
        const membersAt = partial.byModule.members.at;
        expect(certsAt > full.byModule.certs.at).toBe(true); // certs 数据时间更新
        expect(membersAt).toBe(full.byModule.members.at); // members 沿用旧时间（不冒充新扫描）
        expect(partial.derived.some((r) => r.id.startsWith("m1::"))).toBe(true); // members 旧提醒保留
    });

    it("PF06：增量扫描结果可正常合并计数（通知评估由 refreshHub 的 onlySet 分支跳过）", async () => {
        const p: DataProvider = { moduleId: "certs", collect: async () => [rem("a::certs.expiry", "2026-10-02", "overdue")] };
        const res = await runScan([p], settings(), defaultRuntime(), TODAY, new Set(["certs"]));
        expect(res.stale).toBe(false);
        expect(res.counts.overdue).toBe(1);
    });

    it("deriveVisible：禁用模块过滤 + 忽略过滤 + 计数重算（H02 数据源）", async () => {
        const rt: HubRuntime = { ...defaultRuntime(), muted: { "a::certs.expiry": true } };
        const derived = [
            rem("a::certs.expiry", "2026-10-02", "overdue"),
            rem("b::members.birthday", "2026-10-20", "lead", "anniversary", "members"),
            rem("c::favors.event", "2026-10-03", "soon", "oneoff", "favors"), // favors 未启用
        ];
        const { reminders, counts } = deriveVisible(derived, settings(["certs", "members"]), rt, TODAY);
        expect(reminders.map((r) => r.id)).toEqual(["b::members.birthday"]); // 忽略的 a、未启用的 f 均剔除
        expect(counts).toEqual({ overdue: 0, soon: 0, lead: 1 });
    });
});

describe("H10 续期目标列分派", () => {
    afterEach(() => setTransport(null));

    it("next_pay 规则写 next_pay 列（缴费不改保障到期日）+ 续期流水留痕", async () => {
        const written: any[] = [];
        setTransport(async (endpoint: string, payload: any) => {
            expect(endpoint).toBe("/api/av/setAttributeViewBlockAttr");
            written.push(payload);
            return { code: 0, msg: "", data: null };
        });
        const { plugin, store } = memoryPlugin();
        const r = rem("row9::insurance.next_pay", "2026-10-05", "lead", "recurring", "insurance");
        const dbRef = { avId: "av-ins", columns: { next_pay: "k-nextpay", expiry: "k-expiry" } };
        await renew(plugin, r, "2026-11-05", dbRef, "next_pay");
        expect(written[0].keyID).toBe("k-nextpay"); // 217 波：单数端点 { avID, keyID, itemID, value }
        const rt: HubRuntime = JSON.parse(store["hub-runtime.json"]);
        expect(rt.renewHistory.row9).toEqual([{ from: "2026-10-05", to: "2026-11-05", at: expect.any(String) }]);
    });

    it("默认 fieldKey=expiry；台账未建库 → 报错且运行态不变", async () => {
        const { plugin, store } = memoryPlugin();
        const r = rem("row8::certs.expiry", "2026-10-05", "lead");
        await expect(renew(plugin, r, "2027-10-05", {})).rejects.toThrow("ledger not provisioned");
        expect(store["hub-runtime.json"]).toBeUndefined(); // 写回失败不落运行态（H10：失败保留现场）
    });

    it("日期格式非法或日历上不存在 → 不调用内核，也不落运行态", async () => {
        let calls = 0;
        setTransport(async () => { calls++; throw new Error("should not call kernel"); });
        const { plugin, store } = memoryPlugin();
        const r = rem("row7::certs.expiry", "2026-10-05", "lead");
        await expect(renew(plugin, r, "2026-02-31", { avId: "av-certs", columns: { expiry: "k-expiry" } })).rejects.toThrow("invalid due date");
        await expect(renew(plugin, r, "2026/11/05", { avId: "av-certs", columns: { expiry: "k-expiry" } })).rejects.toThrow("invalid due date");
        expect(calls).toBe(0);
        expect(store["hub-runtime.json"]).toBeUndefined();
    });

    it("内核写回失败 → 运行态不落盘，保留可重试现场", async () => {
        setTransport(async () => { throw new Error("kernel unavailable"); });
        const { plugin, store } = memoryPlugin();
        const r = rem("row6::certs.expiry", "2026-10-05", "lead");
        await expect(renew(plugin, r, "2026-11-05", { avId: "av-certs", columns: { expiry: "k-expiry" } })).rejects.toThrow("kernel unavailable");
        expect(store["hub-runtime.json"]).toBeUndefined();
    });
});

describe("H04 缺列报错 + H14 提前量校验", () => {
    afterEach(() => setTransport(null));

    it("提醒规则依赖列缺失 → collect 显式抛错（进诊断+保留快照，不静默跳过）", async () => {
        setTransport(async (endpoint: string) => {
            if (endpoint === "/api/av/renderAttributeView") {
                return { code: 0, msg: "", data: { view: { columns: [], rowCount: 0, rows: [] } } };
            }
            return { code: 0, msg: "", data: { rows: { values: [] } } };
        });
        // dbRef 缺 expiry/due 列
        const p = new CertsProvider({ settings: settings(), getDbRef: () => ({ avId: "av-1", columns: { name: "k1", status: "k2" } }) });
        await expect(p.collect(TODAY)).rejects.toThrow(/missing reminder column/);
    });

    it("leadFor：NaN/Infinity/负数回退默认；有限值 clamp 3650", () => {
        const rule: ReminderRuleSpec = { key: "expiry", field: "expiry", kind: "oneoff", leadDays: 30 };
        const s = (v: any): HomeSettings => ({ ...settings(), leadOverrides: { "certs.expiry": v } });
        expect(leadFor(s(NaN), "certs", rule)).toBe(30);
        expect(leadFor(s(Infinity), "certs", rule)).toBe(30);
        expect(leadFor(s(-5), "certs", rule)).toBe(30);
        expect(leadFor(s(99999), "certs", rule)).toBe(3650);
        expect(leadFor(s(10), "certs", rule)).toBe(10);
    });
});

describe("purgeHandled 扩展（handledYear/monthlyCompletions/favorSyncs）", () => {
    it("handledYear 旧年份清理（当年保留，跨年清除）", () => {
        const rt: HubRuntime = {
            ...defaultRuntime(),
            handledYear: {
                "r1::members.birthday": 2025,
                "r2::members.birthday": 2026,
            },
            monthlyCompletions: {
                "2024-01": 5,
                "2026-10": 3,
            },
        };
        purgeHandled(rt, TODAY);
        expect(rt.handledYear["r1::members.birthday"]).toBeUndefined();
        expect(rt.handledYear["r2::members.birthday"]).toBe(2026);
        expect(rt.monthlyCompletions["2024-01"]).toBeUndefined();
        expect(rt.monthlyCompletions["2026-10"]).toBe(3);
    });

    it("favorSyncs 不受影响（由行删除时按需清理）", () => {
        const rt: HubRuntime = {
            ...defaultRuntime(),
            favorSyncs: { "row-1": { docId: "d1", at: "2026-10-01" } },
        };
        purgeHandled(rt, TODAY);
        expect(rt.favorSyncs["row-1"]).toBeDefined();
    });
});

describe("H12 静默时段（摘要与逾期提示共用）", () => {
    const at = (h: number) => new Date(2026, 9, 1, h, 0, 0);

    it("跨零点 22→8：23 点/2 点静默，12 点非静默；边界 8 点结束（不含）", () => {
        const s = settings();
        expect(inSilentHours(s, undefined, at(23))).toBe(true);
        expect(inSilentHours(s, undefined, at(2))).toBe(true);
        expect(inSilentHours(s, undefined, at(12))).toBe(false);
        expect(inSilentHours(s, undefined, at(8))).toBe(false);
        expect(inSilentHours(s, undefined, at(22))).toBe(true);
    });

    it("顺向 1→6：3 点静默，8 点非静默", () => {
        const s = { ...settings(), silentFrom: 1, silentTo: 6 };
        expect(inSilentHours(s, undefined, at(3))).toBe(true);
        expect(inSilentHours(s, undefined, at(8))).toBe(false);
    });

    it("摘要：静默时段不弹且不标记已发（结束后补发）", () => {
        const scan = { reminders: [], counts: { overdue: 1, soon: 1, lead: 0 }, scannedAt: "", errors: [], stale: false, derived: [], byModule: {} } as any;
        const s = { ...settings(), notifyHour: 8 };
        // 23 点（静默）→ 不弹；lastNotifiedDate 未写 → 之后的非静默扫描可补发
        const rt: HubRuntime = { ...defaultRuntime() };
        expect(dailyDigest(scan, s, rt, at(23)).shouldNotify).toBe(false);
        expect(rt.lastNotifiedDate).toBeUndefined();
        // 12 点（非静默，已过 notifyHour）→ 弹
        expect(dailyDigest(scan, s, rt, at(12)).shouldNotify).toBe(true);
    });
});

describe("29 组每周预告", () => {
    const scanWith = (n: number) => ({
        reminders: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, moduleId: "certs", ruleKey: "expiry", rowId: `r${i}`, title: `t${i}`, dueDate: "2026-10-05", daysLeft: 3, level: "soon" as const })),
        counts: { overdue: 0, soon: n, lead: 0 }, scannedAt: "", errors: [], stale: false, derived: [], byModule: {},
    } as any);

    it("isoWeekKey：2026-10-04（周日）→ 2026-W40；2026-01-01 → 2026-W01；跨年周末不崩", () => {
        expect(isoWeekKey(new Date(2026, 9, 4))).toBe("2026-W40");
        expect(isoWeekKey(new Date(2026, 0, 1))).toBe("2026-W01");
        expect(isoWeekKey(new Date(2027, 0, 3))).toMatch(/^202[67]-W\d{2}$/);
    });

    it("周日 + 有事项 + 未发 → 弹并记周键；同周再扫不重弹；非周日不弹", () => {
        const sunday = new Date(2026, 9, 4, 10, 0); // 2026-10-04 周日 10 点（非静默）
        const s = settings();
        const rt: HubRuntime = { ...defaultRuntime() };
        expect(weeklyPreview(scanWith(3), s, rt, sunday).shouldNotify).toBe(true);
        markWeeklyNotified(rt, sunday);
        expect(rt.lastWeeklyDigest).toBe("2026-W40");
        expect(weeklyPreview(scanWith(3), s, rt, new Date(2026, 9, 6, 10, 0)).shouldNotify).toBe(false); // 同周周二
        expect(weeklyPreview(scanWith(3), s, rt, new Date(2026, 9, 11, 10, 0)).shouldNotify).toBe(true); // 下周日新周键
    });

    it("静默时段/零事项不弹", () => {
        const sundayNight = new Date(2026, 9, 4, 23, 0); // 周日 23 点（静默）
        const rt: HubRuntime = { ...defaultRuntime() };
        expect(weeklyPreview(scanWith(3), settings(), rt, sundayNight).shouldNotify).toBe(false);
        expect(weeklyPreview(scanWith(0), settings(), rt, new Date(2026, 9, 4, 10, 0)).shouldNotify).toBe(false);
    });
});

describe("updateMemo（246 波收件箱深化）", () => {
    it("标题/到期日修正经写队列落盘；未知 id 不动", async () => {
        const { plugin, store } = memoryPlugin();
        const { updateMemo } = await import("@/core/hub/actions");
        await withRuntime(plugin, (rt) => {
            rt.memos = [{ id: "m1", title: "旧标题", dueDate: "2026-10-01", createdAt: "t" }];
        });
        await updateMemo(plugin, "m1", { title: "新标题", dueDate: "2026-11-01" });
        const saved = JSON.parse(store["hub-runtime.json"]);
        expect(saved.memos[0].title).toBe("新标题");
        expect(saved.memos[0].dueDate).toBe("2026-11-01");
        await updateMemo(plugin, "m-不存在", { title: "幽灵" });
        const after = JSON.parse(store["hub-runtime.json"]);
        expect(after.memos[0].title).toBe("新标题");
    });
});
