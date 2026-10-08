/**
 * 提醒扫描器（03 §3）：模块 providers → 派生提醒 → 运行态合并 → HubState 缓存。
 * 单模块失败不拖垮全局（33.3：失败记入 cache.errors，呈现 stale 数据而非"暂无事项"）。
 * H04：失败模块保留上次成功快照（cache.byModule 带数据时间），成功模块更新自己的切片；
 * 禁用模块不发起请求、其旧快照剔除。
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
    /** 运行态合并前的派生列表（H02：动作后免重扫即时重算可见集合） */
    derived: Reminder[];
    /** 各模块本次生效的派生切片与数据时间（H04：失败模块为上次快照，行数口径随快照同策略） */
    byModule: Record<string, { reminders: Reminder[]; at: string; rowCount?: number; memberCounts?: Record<string, number> }>;
}

/** 264 波：行数口径（台账行数 + 成员行分布；providers 全量读表时顺手上报） */
export type ModuleStats = { rowCount: number; memberCounts: Record<string, number> };

export async function runScan(
    providers: DataProvider[],
    settings: HomeSettings,
    rt: HubRuntime,
    today: Date = new Date(),
    /** PF06 增量刷新：只实扫这些模块，其余沿用上次快照（不标记失败）；缺省全量 */
    only?: Set<string>,
    /** 264 波：providers 经 deps.onStats 写入的行数口径，成功模块并入 byModule */
    statsSink?: Map<string, ModuleStats>,
): Promise<ScanResult> {
    const enabled = new Set(settings.enabledModules);
    const derivedByModule = new Map<string, Reminder[]>();
    const atByModule = new Map<string, string>();
    const errors: { moduleId: string; message: string }[] = [];
    const prevByModule = rt.cache?.byModule ?? {};
    const now = today.toISOString();

    await Promise.all(
        providers.map(async (p) => {
            // 禁用模块不发起读请求（PF04 方向）；adhoc 为备忘通道，不受模块开关约束
            if (!enabled.has(p.moduleId) && p.moduleId !== "adhoc") return;
            // PF06：不在本次范围的模块沿用旧快照（数据时间不变，不冒充新扫描）
            if (only && !only.has(p.moduleId)) {
                const kept = prevByModule[p.moduleId];
                if (kept) {
                    derivedByModule.set(p.moduleId, kept.reminders);
                    atByModule.set(p.moduleId, kept.at);
                }
                return;
            }
            try {
                derivedByModule.set(p.moduleId, await p.collect(today));
                atByModule.set(p.moduleId, now);
            } catch (e) {
                errors.push({ moduleId: p.moduleId, message: e instanceof Error ? e.message : String(e) });
                // H04：失败模块保留旧提醒，数据时间也是旧的（不冒充新扫描）
                const prev = prevByModule[p.moduleId];
                if (prev) {
                    derivedByModule.set(p.moduleId, prev.reminders);
                    atByModule.set(p.moduleId, prev.at);
                }
            }
        }),
    );

    const byModule: ScanResult["byModule"] = {};
    for (const [moduleId, list] of derivedByModule) {
        const at = atByModule.get(moduleId) ?? now;
        // 264 波：行数口径只属于本轮实扫成功的模块；沿用旧快照（失败/增量跳过）时
        // 旧口径随快照整体保留（H04 同策略，不冒充新扫描也不丢旧口径）
        const stats = statsSink?.get(moduleId);
        if (at === now) {
            byModule[moduleId] = {
                reminders: list, at,
                ...(stats ? { rowCount: stats.rowCount, memberCounts: stats.memberCounts } : {}),
            };
        } else {
            const prev = prevByModule[moduleId];
            byModule[moduleId] = {
                reminders: list, at,
                ...(prev?.rowCount !== undefined ? { rowCount: prev.rowCount } : {}),
                ...(prev?.memberCounts ? { memberCounts: prev.memberCounts } : {}),
            };
        }
    }
    const derived = [...derivedByModule.values()].flat();
    const visible = applyRuntime(derived, rt, today);
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
        derived,
        byModule,
    };
}

/** 从派生列表重算可见集合（H02：动作后免重扫；禁用模块在此收敛） */
export function deriveVisible(
    derived: Reminder[],
    settings: HomeSettings,
    rt: HubRuntime,
    today: Date = new Date(),
): { reminders: Reminder[]; counts: ScanResult["counts"] } {
    const enabled = new Set(settings.enabledModules);
    const visible = applyRuntime(
        derived.filter((r) => enabled.has(r.moduleId) || r.moduleId === "adhoc"),
        rt,
        today,
    );
    return {
        reminders: visible,
        counts: {
            overdue: visible.filter((r) => r.level === "overdue").length,
            soon: visible.filter((r) => r.level === "soon").length,
            lead: visible.filter((r) => r.level === "lead").length,
        },
    };
}
