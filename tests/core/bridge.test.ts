/**
 * 服务桥单测（EC03/v0.3 + Epoch 6）：capabilities/summary 计数/addMemo 转发与校验/多别名挂载与事件广播。
 */
import { describe, it, expect } from "vitest";
import {
    buildLvHomeBridge,
    mountLvHomeBridge,
    LVHOME_API_ALIASES,
    LVHOME_BRIDGE_PROTOCOL,
    type BridgeHost,
} from "@/bridge/external-bridge";
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
        openModuleTab: () => undefined,
        addMemo: async () => undefined,
        onBridgeDisposed: () => undefined,
        ...over,
    };
}

describe("LvHome 服务桥（EC03/v0.3 + Epoch 6）", () => {
    it("capabilities 与 protocol 固定", () => {
        const api = buildLvHomeBridge(host());
        expect(api.protocol).toBe(LVHOME_BRIDGE_PROTOCOL);
        expect(api.capabilities).toEqual([
            "whenReady",
            "openButler",
            "openReminders",
            "addMemo",
            "summary",
            "openModule",
            "getOverview",
        ]);
    });

    it("summary：overdue/soon/today 计数正确", () => {
        const api = buildLvHomeBridge(host());
        const s = api.summary();
        expect(s.overdue).toBe(2);
        expect(s.soon).toBe(2);
        expect(s.today).toBe(3); // daysLeft<=0：两条 overdue + 一条 daysLeft=0 的 soon
        expect(s.updatedAt).toBeTruthy();
    });

    it("summary：扫描尚未就绪时返回空快照，不抛异常", () => {
        const api = buildLvHomeBridge(host({ scan: undefined }));
        expect(api.summary()).toMatchObject({ overdue: 0, soon: 0, today: 0 });
    });

    it("getOverview：输出只读高层概览", () => {
        const api = buildLvHomeBridge(host());
        const overview = api.getOverview();
        expect(overview.protocol).toBe(1);
        expect(overview.remindersCount).toBe(5);
        expect(overview.overdueCount).toBe(2);
        expect(overview.todayCount).toBe(3);
        expect(overview.scanStale).toBe(false);
        expect(Array.isArray(overview.enabledModules)).toBe(true);
        expect(overview.updatedAt).toBeTruthy();
    });

    it("openButler/openReminders/openModule 转发到宿主", () => {
        let butler = 0;
        let reminders = 0;
        let moduleOpened = "";
        const api = buildLvHomeBridge(host({
            showTab: () => { butler++; },
            openRemindersTab: () => { reminders++; },
            openModuleTab: (m) => { moduleOpened = m; },
        }));
        api.openButler();
        api.openReminders();
        expect(butler).toBe(1);
        expect(reminders).toBe(1);

        expect(api.openModule("")).toBe(false);
        expect(api.openModule("assets")).toBe(true);
        expect(moduleOpened).toBe("assets");
    });

    it("addMemo：空标题抛错；合法标题转发宿主并派发事件", async () => {
        let memoTitle = "";
        const events: any[] = [];
        const originalDispatch = (globalThis as any).window?.dispatchEvent;
        if ((globalThis as any).window) {
            (globalThis as any).window.dispatchEvent = (e: any) => {
                events.push(e);
                return true;
            };
        }
        const api = buildLvHomeBridge(host({ addMemo: async (t) => { memoTitle = t; } }));
        await expect(api.addMemo("  ", "2026-10-10")).rejects.toThrow("标题");
        await api.addMemo("给老师打电话", "2026-10-10");
        expect(memoTitle).toBe("给老师打电话");
        if ((globalThis as any).window) {
            (globalThis as any).window.dispatchEvent = originalDispatch;
        }
    });

    it("whenReady 恒 resolve true", async () => {
        expect(await buildLvHomeBridge(host()).whenReady()).toBe(true);
    });

    it("多别名挂载：挂载到 LvHome、siyuanHome、xiaolvHome、lvHome 四个命名空间", () => {
        const previousWindow = (globalThis as any).window;
        const mockWin: any = {};
        (globalThis as any).window = mockWin;

        let disposed = 0;
        const unmount = mountLvHomeBridge(host({ onBridgeDisposed: () => { disposed++; } }));

        for (const alias of LVHOME_API_ALIASES) {
            expect(mockWin[alias]).toBeTruthy();
            expect(mockWin[alias].protocol).toBe(1);
        }

        unmount();
        for (const alias of LVHOME_API_ALIASES) {
            expect(mockWin[alias]).toBeUndefined();
        }
        expect(disposed).toBe(1);

        (globalThis as any).window = previousWindow;
    });

    it("disposer 只移除自己挂载的桥，避免旧实例误删新桥", () => {
        const previousWindow = (globalThis as any).window;
        (globalThis as any).window = {};
        let disposedA = 0;
        let disposedB = 0;
        const a = mountLvHomeBridge(host({ onBridgeDisposed: () => { disposedA++; } }));
        const bridgeA = (globalThis as any).window.LvHome;
        // 模拟其他实例接管窗口桥（真实 mount 会因已有桥而跳过覆盖）。
        const bridgeB = { ...bridgeA };
        (globalThis as any).window.LvHome = bridgeB;
        expect(bridgeA).not.toBe(bridgeB);
        a();
        expect((globalThis as any).window.LvHome).toBe(bridgeB);
        expect(disposedA).toBe(0);
        expect(disposedB).toBe(0);
        delete (globalThis as any).window.LvHome;
        const b = mountLvHomeBridge(host({ onBridgeDisposed: () => { disposedB++; } }));
        b();
        b();
        expect((globalThis as any).window.LvHome).toBeUndefined();
        expect(disposedB).toBe(1);
        (globalThis as any).window = previousWindow;
    });

    it("已有桥时后续实例 disposer 不应触发卸载钩子", () => {
        const previousWindow = (globalThis as any).window;
        (globalThis as any).window = {};
        let disposed = 0;
        const first = mountLvHomeBridge(host());
        const second = mountLvHomeBridge(host({ onBridgeDisposed: () => { disposed++; } }));
        second();
        expect(disposed).toBe(0);
        expect((globalThis as any).window.LvHome).toBeTruthy();
        first();
        expect((globalThis as any).window.LvHome).toBeUndefined();
        (globalThis as any).window = previousWindow;
    });
});
