/**
 * 21 组：settings 迁移测试（v0.1 遗留结构 → v0.2 读取兼容）
 * + 15 组：坏文件容错 + 17 组：同键通知合并器。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadSettings } from "@/core/settings";
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
});

describe("坏文件容错（15 组）", () => {
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
