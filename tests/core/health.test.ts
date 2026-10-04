/**
 * 深度健康检查单测（第一百零四波）：未建库/完整读取/不完整读取/schema 缺列/读取异常 五态。
 * mock 走 setTransport（同 siyuan-read.test 模式）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { runHealthCheck, type HealthReport } from "@/core/health";
import { setTransport } from "@/core/siyuan";

type Handler = (endpoint: string, payload: any) => any;
let handler: Handler = () => ({ code: 0, msg: "", data: {} });

beforeEach(() => {
    setTransport(async (endpoint: string, payload: any) => handler(endpoint, payload) as any);
});

const settings = {
    enabledModules: ["certs", "health", "ghost"],
    dbRefs: {
        certs: { avId: "av-c", docId: "d1", columns: { name: "k1", expiry: "k2" } },
        health: { avId: "av-h", docId: "d2", columns: { name: "k1" } },
        // ghost：启用但未建库
    },
} as any;

const catalog = {
    certs: { columns: [{ key: "name" }, { key: "expiry" }, { key: "renewed_to" }] }, // renewed_to 建库时缺失
    health: { columns: [{ key: "name" }] },
    ghost: { columns: [] },
};

describe("health.runHealthCheck", () => {
    it("五态：未建库 / 完整 / 不完整 / 缺列 / 读取异常", async () => {
        handler = (endpoint, payload) => {
            if (endpoint === "/api/av/renderAttributeView") {
                if (payload.id === "av-c") {
                    // page≥2 返回空（renderLedgerAll 翻页越界即止）→ 保持"不完整读"语义（N7 前：>50 行；此处 rowCount=5 模拟）
                    if (payload.page) return { code: 0, msg: "", data: { view: { columns: [], rowCount: 5, rows: [] } } };
                    return { code: 0, msg: "", data: { view: { columns: [], rowCount: 5, rows: [{ id: "r1", cells: [] }, { id: "r2", cells: [] }] } } };
                }
                if (payload.id === "av-h") {
                    return { code: 0, msg: "", data: { view: { columns: [], rowCount: 1, rows: [{ id: "r9", cells: [] }] } } };
                }
                throw new Error("boom");
            }
            return { code: 0, msg: "", data: {} };
        };
        const report: HealthReport = await runHealthCheck(settings, catalog);
        expect(report.at).toBeTruthy();
        const byId = Object.fromEntries(report.modules.map((m) => [m.moduleId, m]));

        expect(byId.ghost).toMatchObject({ moduleId: "ghost", ok: false, error: "not provisioned" });
        expect(byId.certs).toMatchObject({ moduleId: "certs", ok: false, rows: 2, complete: false, missingColumns: ["renewed_to"] });
        expect(byId.certs.error).toContain("2/5");
        expect(byId.health).toMatchObject({ moduleId: "health", ok: true, rows: 1, complete: true, missingColumns: [] });
        expect(byId.health.error).toBeUndefined();
    });

    it("renderLedger 抛错 → 模块 error 项，不中断其余模块", async () => {
        handler = (endpoint, payload) => {
            if (payload?.id === "av-c") throw new Error("endpoint unavailable");
            if (endpoint === "/api/av/renderAttributeView") {
                return { code: 0, msg: "", data: { view: { columns: [], rowCount: 1, rows: [{ id: "r9", cells: [] }] } } };
            }
            return { code: 0, msg: "", data: {} };
        };
        const report = await runHealthCheck(settings, catalog);
        const byId = Object.fromEntries(report.modules.map((m) => [m.moduleId, m]));
        expect(byId.certs.ok).toBe(false);
        expect(byId.certs.error).toContain("endpoint unavailable");
        expect(byId.health.ok).toBe(true);
        expect(report.modules).toHaveLength(3);
    });
});
