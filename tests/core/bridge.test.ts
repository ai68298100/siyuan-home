/**
 * 服务桥单测（EC03/v0.3）：capabilities/summary 计数/addMemo 转发与校验。
 */
import { describe, it, expect } from "vitest";
import { buildLvHomeBridge, type BridgeHost } from "@/bridge/external-bridge";
import { defaultSettings } from "@/core/settings";

function host(over: Partial<BridgeHost> = {}): BridgeHost {
    return {
        settings: defaultSettings(),
        scan: {
            reminders: [
                { level: "overdue", daysLeft: -2 },
                { level: "overdue", daysLeft: -1 },
                { level: "soon", daysLeft: 3 },
                { level: "lead", daysLeft: 20 },
                { level: "soon", daysLeft: 0 },
            ],
            stale: false,
        },
        showTab: () => undefined,
        openRemindersTab: () => undefined,
        addMemo: async () => undefined,
        onBridgeDisposed: () => undefined,
        ...over,
    };
}

describe("LvHome 服务桥（EC03/v0.3）", () => {
    it("capabilities 与 protocol 固定", () => {
        const api = buildLvHomeBridge(host());
        expect(api.protocol).toBe(1);
        expect(api.capabilities).toEqual(["whenReady", "openButler", "openReminders", "addMemo", "summary"]);
    });

    it("summary：overdue/soon/today 计数正确", () => {
        const api = buildLvHomeBridge(host());
        const s = api.summary();
        expect(s.overdue).toBe(2);
        expect(s.soon).toBe(2);
        expect(s.today).toBe(3); // daysLeft<=0：两条 overdue + 一条 daysLeft=0 的 soon
        expect(s.updatedAt).toBeTruthy();
    });

    it("openButler/openReminders 转发到宿主", () => {
        let butler = 0;
        let reminders = 0;
        const api = buildLvHomeBridge(host({
            showTab: () => { butler++; },
            openRemindersTab: () => { reminders++; },
        }));
        api.openButler();
        api.openReminders();
        expect(butler).toBe(1);
        expect(reminders).toBe(1);
    });

    it("addMemo：空标题抛错；合法标题转发宿主", async () => {
        let memoTitle = "";
        const api = buildLvHomeBridge(host({ addMemo: async (t) => { memoTitle = t; } }));
        await expect(api.addMemo("  ", "2026-10-10")).rejects.toThrow("标题");
        await api.addMemo("给老师打电话", "2026-10-10");
        expect(memoTitle).toBe("给老师打电话");
    });

    it("whenReady 恒 resolve true", async () => {
        expect(await buildLvHomeBridge(host()).whenReady()).toBe(true);
    });
});
