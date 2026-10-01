/**
 * 提醒扫描器（03 §3）：模块 providers → 派生提醒 → 运行态合并 → HubState 缓存。
 * 单模块失败不拖垮全局（33.3：失败记入 cache.errors，呈现 stale 数据而非"暂无事项"）。
 */
import type { HomeSettings, Reminder } from "@/types";
import type { DataProvider } from "./providers";
import { applyRuntime, type HubRuntime } from "./runtime";

export interface ScanResult {
    reminders: Reminder[];
    counts: { overdue: number; soon: number; lead: number };
    scannedAt: string;
    errors: { moduleId: string; message: string }[];
    /** true = 至少一个模块失败，当前数据为部分结果 */
    stale: boolean;
}

export async function runScan(
    providers: DataProvider[],
    settings: HomeSettings,
    rt: HubRuntime,
    today: Date = new Date(),
): Promise<ScanResult> {
    const derived: Reminder[] = [];
    const errors: { moduleId: string; message: string }[] = [];
    await Promise.all(
        providers.map(async (p) => {
            try {
                derived.push(...(await p.collect(today)));
            } catch (e) {
                errors.push({ moduleId: p.moduleId, message: e instanceof Error ? e.message : String(e) });
            }
        }),
    );
    // 模块开关二次收敛（33：禁用模块的提醒即时剔除）
    const enabled = new Set(settings.enabledModules);
    const visible = applyRuntime(
        derived.filter((r) => enabled.has(r.moduleId) || r.moduleId === "adhoc"),
        rt,
        today,
    );
    const counts = {
        overdue: visible.filter((r) => r.level === "overdue").length,
        soon: visible.filter((r) => r.level === "soon").length,
        lead: visible.filter((r) => r.level === "lead").length,
    };
    return {
        reminders: visible,
        counts,
        scannedAt: today.toISOString(),
        errors,
        stale: errors.length > 0,
    };
}
