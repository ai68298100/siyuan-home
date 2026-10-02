/**
 * 每日摘要通知（B3 前端版）：计数判定 + i18n 文案渲染分离（core 层不做文案）。
 * kernel.js 定时版（B2d）后续接管触发，判定逻辑复用。
 */
import type { HomeSettings } from "@/types";
import { localDateKey } from "./rule";
import type { HubRuntime } from "./runtime";
import type { ScanResult } from "./scanner";

export interface DigestInfo {
    /** 今日是否应发（notifyHour 已过 + 今日未发 + 有事项 + 非静默时段） */
    shouldNotify: boolean;
    overdue: number;
    soon: number;
}

/** 静默时段判断（H12：摘要与逾期提示共用同一规则；跨零点用 from>to 表示，如 22→8） */
export function inSilentHours(settings: HomeSettings, now: Date = new Date()): boolean {
    const h = now.getHours();
    const from = settings.silentFrom ?? 22;
    const to = settings.silentTo ?? 8;
    return from > to ? h >= from || h < to : h >= from && h < to;
}

export function dailyDigest(scan: ScanResult, settings: HomeSettings, rt: HubRuntime, now: Date = new Date()): DigestInfo {
    const today = localDateKey(now);
    const already = rt.lastNotifiedDate === today;
    const afterHour = now.getHours() >= (settings.notifyHour ?? 8);
    const hasItems = scan.counts.overdue > 0 || scan.counts.soon > 0;
    // H12：静默时段不弹；lastNotifiedDate 未标记 → 静默结束后的下一次扫描自然补发
    return {
        shouldNotify: !already && afterHour && hasItems && !inSilentHours(settings, now),
        overdue: scan.counts.overdue,
        soon: scan.counts.soon,
    };
}

/** 发摘要（文案 i18n 由调用方拼）并标记今日已发（调用方负责持久化 runtime） */
export function markNotified(rt: HubRuntime, now: Date = new Date()): void {
    rt.lastNotifiedDate = localDateKey(now);
}
