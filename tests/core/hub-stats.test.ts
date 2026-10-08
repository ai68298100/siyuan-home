// 264 波：行数口径（rowCount/memberCounts）并入模块快照的扫描器单测
// 口径语义：只并入本轮实扫成功的模块；失败/沿用旧快照不冒充新口径（H04 同策略）。
import { describe, expect, it } from "vitest";
import { runScan, type ModuleStats } from "@/core/hub/scanner";
import type { DataProvider } from "@/core/hub/providers";
import type { HubRuntime, } from "@/core/hub/runtime";
import { defaultRuntime } from "@/core/hub/runtime";
import type { HomeSettings, Reminder } from "@/types";

const TODAY = new Date("2026-10-08T00:00:00");

const settings = (): HomeSettings => ({ enabledModules: ["certs", "members"] }) as HomeSettings;

const rem = (id: string, due: string, level: Reminder["level"] = "lead"): Reminder => ({
    id, moduleId: id.split("::")[1]?.split(".")[0] ?? "certs", ruleKey: "expiry", rowId: id,
    title: id, dueDate: due, daysLeft: 3, level, kind: "oneoff",
});

const ok = (moduleId: string, list: Reminder[]): DataProvider => ({ moduleId, collect: async () => list });
const fail = (moduleId: string): DataProvider => ({ moduleId, collect: async () => { throw new Error("kernel down"); } });

describe("264 波 行数口径并入模块快照", () => {
    it("实扫成功的模块并入 rowCount/memberCounts", async () => {
        const sink = new Map<string, ModuleStats>([
            ["certs", { rowCount: 12, memberCounts: { m1: 5, m2: 7 } }],
            ["members", { rowCount: 2, memberCounts: {} }],
        ]);
        const res = await runScan(
            [ok("certs", [rem("a::certs.expiry", "2026-10-20")]), ok("members", [rem("b::members.birthday", "2026-10-20", "lead")])],
            settings(), defaultRuntime(), TODAY, undefined, sink,
        );
        expect(res.byModule.certs.rowCount).toBe(12);
        expect(res.byModule.certs.memberCounts).toEqual({ m1: 5, m2: 7 });
        expect(res.byModule.members.rowCount).toBe(2);
    });

    it("失败模块不冒充新口径（沿用旧快照的 rowCount）", async () => {
        const rt: HubRuntime = defaultRuntime();
        rt.cache = {
            reminders: [], counts: { overdue: 0, soon: 0, lead: 0 }, errors: [], derived: [],
            byModule: { certs: { reminders: [rem("old::certs.expiry", "2026-10-02", "overdue")], at: "2026-09-30T00:00:00Z", rowCount: 9, memberCounts: { m1: 9 } } },
        };
        // 失败模块也误报了 stats（providers 成功路径才上报；此处模拟异常时序）→ 不得并入
        const sink = new Map<string, ModuleStats>([["certs", { rowCount: 99, memberCounts: {} }]]);
        const res = await runScan([fail("certs")], settings(), rt, TODAY, undefined, sink);
        expect(res.stale).toBe(true);
        expect(res.byModule.certs.rowCount).toBe(9);
        expect(res.byModule.certs.memberCounts).toEqual({ m1: 9 });
        expect(res.byModule.certs.at).toBe("2026-09-30T00:00:00Z");
    });

    it("增量刷新（only）沿用旧快照的口径，不写新值", async () => {
        const rt: HubRuntime = defaultRuntime();
        rt.cache = {
            reminders: [], counts: { overdue: 0, soon: 0, lead: 0 }, errors: [], derived: [],
            byModule: { certs: { reminders: [], at: "2026-09-30T00:00:00Z", rowCount: 9 } },
        };
        const sink = new Map<string, ModuleStats>([["certs", { rowCount: 99, memberCounts: {} }]]);
        const res = await runScan([ok("certs", [])], settings(), rt, TODAY, new Set(["members"]), sink);
        // certs 不在 only 范围 → 沿用旧快照；sink 里的值不得写入
        expect(res.byModule.certs.rowCount).toBe(9);
    });
});
