/**
 * 21 组：settings 迁移测试（v0.1 遗留结构 → v0.2 读取兼容）
 * + 15 组：坏文件容错 + 17 组：同键通知合并器。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadSettings, saveSettings, normalizeImportedSettings, normalizeCheckinBindings } from "@/core/settings";
import { loadRuntime, saveRuntime, defaultRuntime } from "@/core/hub/runtime";
import { coalescedNotify, resetNotifyState } from "@/libs/notify-queue";

function pluginWithSettings(data: unknown) {
    return {
        loadData: async (name: string) => (name === "settings.json" ? JSON.parse(JSON.stringify(data)) : null),
        saveData: async () => undefined,
    } as any;
}

describe("settings 迁移（21 组：v0.1 → v0.2）", () => {
    it("遗留字段透传保留、未知模块 id 过滤、缺失字段补默认", async () => {
        const legacy = {
            enabledModules: ["certs", "members", "ghost-module"],
            members: [{ id: "m1", name: "张三", role: "self", createdAt: "2026-09-01T00:00:00Z" }],
            reminderAdvanceDays: 7, // v0.1 遗留字段
            someFutureField: "future", // 前向兼容：未知字段不丢
        };
        const s = await loadSettings(pluginWithSettings(legacy));
        expect(s.enabledModules.sort()).toEqual(["certs", "members"]); // 未知 id 不入运行时
        expect(s.notifyHour).toBe(8);
        expect(s.silentFrom).toBe(22);
        expect(s.members).toHaveLength(1);
        expect((s as any).reminderAdvanceDays).toBe(7);
        expect((s as any).someFutureField).toBe("future");
    });

    it("空存储 → 全默认", async () => {
        const s = await loadSettings(pluginWithSettings(null));
        expect(s.enabledModules.length).toBeGreaterThan(0);
        expect(s.members).toEqual([]);
        expect(s.onboarded).toBe(false);
    });

    it("成员 sex 清洗（D23）：合法保留，非法/缺失清除", async () => {
        const legacy = {
            enabledModules: ["members"],
            members: [
                { id: "m1", name: "哥哥", role: "child", sex: "male", createdAt: "2026-09-01T00:00:00Z" },
                { id: "m2", name: "妹", role: "child", sex: "boy", createdAt: "2026-09-01T00:00:00Z" },
                { id: "m3", name: "未填", role: "child", createdAt: "2026-09-01T00:00:00Z" },
            ],
        };
        const s = await loadSettings(pluginWithSettings(legacy));
        expect(s.members[0].sex).toBe("male");
        expect(s.members[1].sex).toBeUndefined();
        expect(s.members[2].sex).toBeUndefined();
    });
});

describe("坏文件容错（15 组）", () => {
    it("runtime：loadData 抛错 → 回退默认运行态（与 settings 同一 loadDataSafe 路径）", async () => {
        const plugin = {
            loadData: async () => { throw new Error("runtime corrupted"); },
            saveData: async () => undefined,
        } as any;
        const rt = await loadRuntime(plugin);
        expect(rt.snoozed).toEqual({});
        expect(rt.memos).toEqual([]);
        expect(rt.schemaVersion).toBe(1);
    });

    it("loadData 抛错 → 回退默认 + corruptedSettings 标记 + 备份 marker 落盘", async () => {
        const saved: Record<string, unknown> = {};
        const plugin = {
            loadData: async () => { throw new Error("invalid json"); },
            saveData: async (n: string, v: unknown) => { saved[n] = v; },
        } as any;
        const s = await loadSettings(plugin);
        expect(s.enabledModules.length).toBeGreaterThan(0); // 默认值
        expect(s.corruptedSettings).toBe(true);
        const marker = saved["settings.json.corrupted.json"] as any;
        expect(marker.source).toBe("settings.json");
        expect(marker.reason).toContain("invalid json");
    });

    it("loadData 返回非对象（手工改坏）→ 同样回退并标记", async () => {
        const saved: Record<string, unknown> = {};
        const plugin = {
            loadData: async () => "corrupted-string",
            saveData: async (n: string, v: unknown) => { saved[n] = v; },
        } as any;
        const s = await loadSettings(plugin);
        expect(s.corruptedSettings).toBe(true);
        expect((saved["settings.json.corrupted.json"] as any).reason).toContain("non-object");
    });

    it("SiYuan 缺失文件返回空字符串 → 按未建库默认值处理，不误报损坏", async () => {
        const saved: Record<string, unknown> = {};
        const plugin = {
            loadData: async () => "",
            saveData: async (name: string, value: unknown) => { saved[name] = value; },
        } as any;
        const s = await loadSettings(plugin);
        expect(s.corruptedSettings).toBeUndefined();
        expect(saved["settings.json.corrupted.json"]).toBeUndefined();
        expect(s.onboarded).toBe(false);
    });

    it("设置字段逐项归一化：null/数组/错型不会穿透到运行时", async () => {
        const plugin = pluginWithSettings({
            enabledModules: ["certs", 42, null],
            members: [null, ["bad"], { id: "m1", name: 42, role: "wizard", createdAt: 7, sex: "unknown" }],
            leadOverrides: [],
            dbRefs: { certs: null, members: { avId: 42, columns: { name: "k1", bad: 9 } } },
            notifyHour: "8",
            silentFrom: Infinity,
            silentTo: null,
            checkinBindings: "bad",
            webhookEnabled: "yes",
            webhookUrl: 9,
        });
        const settings = await loadSettings(plugin);
        expect(settings.enabledModules).toEqual(["certs"]);
        expect(settings.members).toEqual([expect.objectContaining({ id: "m1", name: "?", role: "other", createdAt: expect.any(String) })]);
        expect(settings.leadOverrides).toEqual({});
        expect(settings.dbRefs).toEqual({ members: { columns: { name: "k1" } } });
        expect(settings.notifyHour).toBe(8);
        expect(settings.silentFrom).toBe(22);
        expect(settings.silentTo).toBe(8);
        expect(settings.checkinBindings).toEqual([]);
        expect(settings.webhookEnabled).toBe(false);
        expect(settings.webhookUrl).toBe("");
    });

    it("运行态缓存逐项归一化：错误 map/list/cache 字段安全回退", async () => {
        const plugin = pluginWithSettings(null);
        plugin.loadData = async (name: string) => name === "hub-runtime.json" ? {
            snoozed: null,
            muted: [],
            handledYear: { good: 2026, bad: "2026" },
            handled: { good: { title: "t", moduleId: "certs", ruleKey: "expiry", dueDate: "2026-10-01", at: "2026-09-01" }, bad: null },
            renewHistory: "bad",
            memos: [null, { id: "m1", title: "memo", dueDate: "2026-10-01", createdAt: "2026-09-01" }, { id: "bad" }],
            cache: { reminders: "bad", derived: [{ id: "r", moduleId: "certs", ruleKey: "expiry", rowId: "row", title: "r", dueDate: "2026-10-01", daysLeft: 1, level: "soon" }], byModule: [] },
        } : null;
        const rt = await loadRuntime(plugin);
        expect(rt.snoozed).toEqual({});
        expect(rt.muted).toEqual({});
        expect(rt.handledYear).toEqual({ good: 2026 });
        expect(Object.keys(rt.handled)).toEqual(["good"]);
        expect(rt.renewHistory).toEqual({});
        expect(rt.memos).toHaveLength(1);
        expect(rt.cache?.reminders).toEqual([]);
        expect(rt.cache?.derived).toHaveLength(1);
        expect(rt.cache?.byModule).toEqual({});
    });

    it("运行态序列化去重按插件实例隔离：新实例的首写不会被旧实例跳过", async () => {
        const writesA: unknown[] = [];
        const writesB: unknown[] = [];
        const a = { saveData: async (_name: string, value: unknown) => { writesA.push(value); } } as any;
        const b = { saveData: async (_name: string, value: unknown) => { writesB.push(value); } } as any;
        await saveRuntime(a, defaultRuntime());
        await saveRuntime(a, defaultRuntime());
        await saveRuntime(b, defaultRuntime());
        expect(writesA).toHaveLength(1);
        expect(writesB).toHaveLength(1);
    });
});

describe("导入归一化（16 轮：未知模块剔除 + 成员字段修复）", () => {
    it("未知模块剔除并报告；已知模块保留", () => {
        const { settings, droppedModules } = normalizeImportedSettings({
            enabledModules: ["certs", "members", "ghost", "future-thing"],
            members: [],
        });
        expect(settings.enabledModules.sort()).toEqual(["certs", "members"]);
        expect(droppedModules.sort()).toEqual(["future-thing", "ghost"]);
    });

    it("成员修复：缺 id 补 id、缺名补 ?、非法角色归 other", () => {
        const { settings, repairedMembers } = normalizeImportedSettings({
            enabledModules: ["certs"],
            members: [
                { name: "张三", role: "self" },                    // 缺 id
                { id: "m2", role: "child" },                        // 缺名
                { id: "m3", name: "李四", role: "wizard" },         // 非法角色
                { id: "m4", name: "王五", role: "elder" },          // 合法
            ],
        });
        expect(repairedMembers).toBe(3);
        expect(settings.members[0].id).toBeTruthy();
        expect(settings.members[1].name).toBe("?");
        expect(settings.members[2].role).toBe("other");
        expect(settings.members[3].role).toBe("elder");
    });

    it("导出↔导入往返（101 波）：合法设置经 JSON 序列化 + 归一化，字段零丢失零修复", () => {
        const original = {
            enabledModules: ["certs", "members", "health", "parenting"],
            members: [
                { id: "m1", name: "张三", role: "self", sex: "male", birthday: "1990-01-02", createdAt: "2026-09-01T00:00:00Z" },
                { id: "m2", name: "女儿", role: "child", birthday: "2020-06-01", lunarBirthday: true, createdAt: "2026-09-01T00:00:00Z" },
            ],
            leadOverrides: { "certs.expiry": 21 },
            dbRefs: { certs: { avId: "av-1", docId: "doc-1", columns: { name: "k1" } } },
            checkinBindings: [{ itemId: "i1", itemName: "跑步", memberId: "m1", metric: "count" }],
            notifyHour: 7,
            silentFrom: 23,
            someFutureField: "forward-compat", // 前向兼容：未知字段透传
        };
        // 模拟真实导出→导入：JSON 序列化（exportSettings 即 JSON.stringify(plugin.settings)）
        const { settings, droppedModules, repairedMembers } = normalizeImportedSettings(
            JSON.parse(JSON.stringify(original)),
        );
        expect(droppedModules).toEqual([]);
        expect(repairedMembers).toBe(0);
        expect(settings.enabledModules).toEqual(original.enabledModules);
        expect(settings.members).toEqual(original.members);
        expect(settings.leadOverrides).toEqual(original.leadOverrides);
        expect(settings.dbRefs).toEqual(original.dbRefs);
        expect(settings.checkinBindings).toEqual(original.checkinBindings);
        expect(settings.notifyHour).toBe(7);
        expect(settings.silentFrom).toBe(23);
        expect((settings as any).someFutureField).toBe("forward-compat");
    });
});

describe("打卡绑定归一化（EC09/D20，第六十六轮）", () => {
    it("缺 id/成员/metric 非法剔除；同 itemId+memberId 去重首见保留；缺名回退 itemId", () => {
        const out = normalizeCheckinBindings([
            { itemId: "i1", itemName: "跑步", memberId: "m1", metric: "count" },
            { itemId: "i1", itemName: "重复", memberId: "m1", metric: "count" },   // 去重
            { itemId: "i2", memberId: "m1", metric: "count" },                      // 合法缺名
            { itemId: "", memberId: "m1", metric: "count" },                        // 缺 itemId
            { itemId: "i3", memberId: "", metric: "count" },                        // 缺 memberId
            { itemId: "i4", memberId: "m2", metric: "weight" },                     // metric 非法
            null, "junk",                                                           // 非对象
        ]);
        expect(out).toHaveLength(2);
        expect(out[0]).toEqual({ itemId: "i1", itemName: "跑步", memberId: "m1", metric: "count" });
        expect(out[1].itemName).toBe("i2"); // 缺名回退 itemId
    });

    it("非数组/缺失 → 空数组（旧设置无此字段兼容）", () => {
        expect(normalizeCheckinBindings(undefined)).toEqual([]);
        expect(normalizeCheckinBindings("junk")).toEqual([]);
        expect(normalizeImportedSettings({ enabledModules: ["certs"] }).settings.checkinBindings).toEqual([]);
    });
});

describe("通知合并器（17 组防轰炸适配）", () => {
    beforeEach(() => resetNotifyState());

    it("同键窗口期内只弹一次；窗口过后可再弹", () => {
        const t0 = 1_000_000;
        let shown = 0;
        const show = () => { shown++; };
        expect(coalescedNotify("k", show, t0)).toBe(true);
        expect(coalescedNotify("k", show, t0 + 30_000)).toBe(false); // 30s < 60s 窗口
        expect(coalescedNotify("k", show, t0 + 61_000)).toBe(true); // 窗口过后恢复
        expect(shown).toBe(2);
    });

    it("不同键互不影响", () => {
        const t0 = 1_000_000;
        let shown = 0;
        expect(coalescedNotify("a", () => { shown++; }, t0)).toBe(true);
        expect(coalescedNotify("b", () => { shown++; }, t0)).toBe(true);
        expect(shown).toBe(2);
    });
});

describe("saveSettings 写入重试（§15/186 波）", () => {
    const settings = { enabledModules: ["certs"], members: [] } as any;

    it("首次失败 → 重试一次成功（不抛错，共两次写入）", async () => {
        let calls = 0;
        const plugin = { saveData: async () => { calls++; if (calls === 1) throw new Error("busy"); } } as any;
        await saveSettings(plugin, settings);
        expect(calls).toBe(2);
    });

    it("重试仍失败 → 抛带原始信息的错误（调用方上报）", async () => {
        let calls = 0;
        const plugin = { saveData: async () => { calls++; throw new Error("kernel gone"); } } as any;
        await expect(saveSettings(plugin, settings)).rejects.toThrow(/kernel gone/);
        expect(calls).toBe(2);
    });
});

describe("导入钳制（229 波恢复 e2e 发现）", () => {
    it("敌意时刻被钳制到 0-23（notifyHour=99 曾致摘要永不触发）", () => {
        const { settings } = normalizeImportedSettings({
            enabledModules: ["certs"],
            members: [],
            dbRefs: {},
            notifyHour: 99,
            silentFrom: -5,
            silentTo: "8",
        });
        expect(settings.notifyHour).toBe(23);
        expect(settings.silentFrom).toBe(0);
        expect(settings.silentTo).toBe(8); // 非数值回退默认
    });
});
