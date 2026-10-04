/**
 * 深度健康检查（D12 最小版）：登记存在 ≠ 健康。
 * 对每个启用模块实际发起读取，报告行数、读取完整性、schema 声明但台账缺失的列，
 * 以及建库/读取错误。结果带检查时间；只读，不修复（修复动作属 F07 局部修复，另行）。
 */
import type { HomeSettings } from "@/types";
import { renderLedgerAll } from "./siyuan";

export interface ModuleHealth {
    moduleId: string;
    ok: boolean;
    /** 台账行数（render 视图行数） */
    rows?: number;
    /** 读取是否完整（false = 返回行数 < rowCount，扫描可能遗漏） */
    complete?: boolean;
    /** schema 声明但 dbRef.columns 缺失的列 key */
    missingColumns?: string[];
    error?: string;
}

export interface HealthReport {
    at: string;
    modules: ModuleHealth[];
}

export async function runHealthCheck(
    settings: HomeSettings,
    schemaCatalog: Record<string, { columns?: { key: string }[] }>,
): Promise<HealthReport> {
    const modules: ModuleHealth[] = [];
    for (const moduleId of settings.enabledModules) {
        const ref = settings.dbRefs[moduleId];
        const schema = schemaCatalog[moduleId];
        if (!ref?.avId || !ref.columns) {
            modules.push({ moduleId, ok: false, error: "not provisioned" });
            continue;
        }
        try {
            const read = await renderLedgerAll(ref.avId);
            const declared = new Set((schema?.columns ?? []).map((c) => c.key));
            const missing = [...declared].filter((k) => !ref.columns![k]);
            modules.push({
                moduleId,
                ok: read.complete,
                rows: read.rows.length,
                complete: read.complete,
                missingColumns: missing,
                error: read.complete ? undefined : `incomplete read (${read.rows.length}/${read.rowCount})`,
            });
        } catch (e) {
            modules.push({ moduleId, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
    }
    return { at: new Date().toISOString(), modules };
}
