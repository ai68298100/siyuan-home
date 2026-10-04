/**
 * 升级演练（UG01 离线部分，第一百九十八波）：0.2.0→0.3.0 首次升级前的迁移完整性预演。
 * 覆盖：旧档升级三连（load 补默认 → save → load 不动点）、写入中断的坏文件回退、
 * 导入垃圾形状的归一化鲁棒。只增列 provision 演练由 provisioner.test「复用原库补列续跑」承担。
 */
import { describe, it, expect } from "vitest";
import { loadSettings, saveSettings, loadDataSafe, normalizeImportedSettings } from "@/core/settings";
import type { HomeSettings } from "@/types";

const pluginWith = (storage: Record<string, unknown>) => ({
    loadData: async (n: string) => (n in storage ? JSON.parse(JSON.stringify(storage[n])) : null),
    saveData: async (n: string, v: unknown) => { storage[n] = JSON.parse(JSON.stringify(v)); },
}) as any;

describe("升级演练（UG01 离线部分）", () => {
    it("v0.1 旧档升级三连：load 补默认 → save → load 深度一致（不动点，旧字段保留、无漂移）", async () => {
        const storage: Record<string, unknown> = {};
        const legacy = {
            enabledModules: ["certs", "members"],
            members: [{ id: "m1", name: "张三", role: "self", createdAt: "2026-09-01T00:00:00Z" }],
            reminderAdvanceDays: 7, // v0.1 遗留字段
            legacyField: "keep", // 未来字段前向兼容样本
        };
        storage["settings.json"] = legacy;
        const plugin = pluginWith(storage);
        const s1: HomeSettings = await loadSettings(plugin);
        expect(s1.notifyHour).toBe(8); // 缺省补齐
        expect(s1.members[0].avItemId).toBeUndefined();
        await saveSettings(plugin, s1);
        const s2 = await loadSettings(plugin);
        expect(s2).toEqual(s1); // 不动点：升级后第二轮 load 不再漂移
        expect((s2 as any).reminderAdvanceDays).toBe(7);
        expect((s2 as any).legacyField).toBe("keep");
    });

    it("写入中断（读时 JSON 截断）→ 备份标记 + 默认值回退，启动不崩", async () => {
        const broken = {
            loadData: async () => { throw new Error("Unexpected end of JSON input"); },
            saveData: async () => undefined,
        } as any;
        const { data, corrupted } = await loadDataSafe(broken, "settings.json");
        expect(data).toBeNull();
        expect(corrupted).toBe(true);
        const s = await loadSettings(broken);
        expect(s.enabledModules.length).toBeGreaterThan(0); // 默认值回退
        expect(s.onboarded).toBe(false);
    });

    it("导入垃圾形状 → 归一化不崩：未知模块剔除、坏成员修复、结构齐备", async () => {
        const empty = normalizeImportedSettings({} as any);
        expect(empty.settings.enabledModules).toEqual([]); // 导入方语义：空输入=空启用集
        expect(empty.settings.members).toEqual([]);
        expect(empty.droppedModules).toEqual([]);

        const messy = normalizeImportedSettings({
            enabledModules: ["certs", 42, "ghost"],
            members: [{ name: " " }, { id: "m2", name: "李四", role: "boss" }],
            checkinBindings: [{ itemId: "x", memberId: "m2", metric: "nonsense" }, "junk"],
        } as any);
        expect(messy.settings.enabledModules).toEqual(["certs"]);
        expect(messy.droppedModules).toEqual(["ghost"]);
        expect(messy.settings.members[0].name).toBe("?");
        expect(messy.settings.members[1].role).toBe("other");
        expect(messy.repairedMembers).toBeGreaterThanOrEqual(3);
        expect(messy.settings.checkinBindings).toEqual([]); // metric 非法剔除、非对象剔除
    });
});
