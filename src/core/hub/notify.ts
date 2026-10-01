/**
 * 每日摘要通知（B3 前端版）：计数判定 + i18n 文案渲染分离（core 层不做文案）。
 * kernel.js 定时版（B2d）后续接管触发，判定逻辑复用。
 */
import type { HomeSettings } from "@/types";
import { localDateKey } from "./rule";
import type { HubRuntime } from "./runtime";
import type { ScanResult } from "./scanner";

export interface DigestInfo {
    /** 今日是否应发（notifyHour 已过 + 今日未发 + 有事项） */
    shouldNotify: boolean;
    overdue: number;
    soon: number;
}

export function dailyDigest(scan: ScanResult, settings: HomeSettings, rt: HubRuntime, now: Date = new Date()): DigestInfo {
    const today = localDateKey(now);
    const already = rt.lastNotifiedDate === today;
    const afterHour = now.getHours() >= (settings.notifyHour ?? 8);
    const hasItems = scan.counts.overdue > 0 || scan.counts.soon > 0;
    return {
        shouldNotify: !already && afterHour && hasItems,
        overdue: scan.counts.overdue,
        soon: scan.counts.soon,
    };
}

/** 发摘要（文案 i18n 由调用方拼）并标记今日已发（调用方负责持久化 runtime） */
export function markNotified(rt: HubRuntime, now: Date = new Date()): void {
    rt.lastNotifiedDate = localDateKey(now);
}
