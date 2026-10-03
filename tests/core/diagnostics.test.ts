/**
 * UG02 脱敏诊断包单测（第八十八轮）：错误消息截断、台账错误脱敏为布尔、形状稳定。
 */
import { describe, it, expect } from "vitest";
import { buildDiagnosticPackage } from "@/core/diagnostics";

const base = {
    diag: {
        version: "0.2.0",
        scannedAt: 1700000000000,
        errors: [{ moduleId: "certs", message: "av.renderAttributeView failed: doc 20261001-abcdef very long ".repeat(10) }],
        ledgers: [
            { id: "certs", provisioned: true, provisional: false, columns: 8, error: "kernel msg with doc-20261001-abcdef" },
            { id: "health", provisioned: false, provisional: true, columns: 0 },
        ],
        contracts: ["certs: column name type drift"],
    },
    enabledModules: ["members", "certs"],
    platform: "TestAgent/1.0",
    generatedAt: "2026-10-04T00:00:00.000Z",
};

describe("diagnostics.buildDiagnosticPackage", () => {
    it("形状稳定：schema 版本 + 全字段在位", () => {
        const p = buildDiagnosticPackage(base);
        expect(p.schema).toBe(1);
        expect(p.plugin).toBe("0.2.0");
        expect(p.platform).toBe("TestAgent/1.0");
        expect(p.enabledModules).toEqual(["members", "certs"]);
        expect(p.scannedAt).toBe(1700000000000);
    });

    it("台账错误脱敏为布尔——原消息不外泄", () => {
        const p = buildDiagnosticPackage(base);
        expect(p.ledgers[0]).toEqual({ id: "certs", provisioned: true, provisional: false, columns: 8, hasError: true });
        expect(p.ledgers[1].hasError).toBe(false);
        expect(JSON.stringify(p)).not.toContain("kernel msg");
    });

    it("扫描错误截断到 200 字符", () => {
        const p = buildDiagnosticPackage(base);
        expect(p.scanErrors[0].moduleId).toBe("certs");
        expect(p.scanErrors[0].message.length).toBeLessThanOrEqual(200);
        expect(p.scanErrors[0].message.length).toBeGreaterThan(50);
    });

    it("schema 校验失败项透传；输入不可变", () => {
        const p = buildDiagnosticPackage(base);
        expect(p.schemaIssues).toEqual(["certs: column name type drift"]);
        p.enabledModules.push("hack");
        expect(base.enabledModules).toEqual(["members", "certs"]);
        p.schemaIssues.push("hack");
        expect(base.diag.contracts).toHaveLength(1);
    });
});
