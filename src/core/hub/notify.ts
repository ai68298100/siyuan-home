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

/** ISO 周键（29 组每周预告去重用），如 2026-W40（周四锚点标准算法） */
export function isoWeekKey(now: Date): string {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = (d.getDay() + 6) % 7; // 周一=0
    d.setDate(d.getDate() - day + 3); // 本周四（ISO 周锚点）
    const isoYear = d.getFullYear();
    const week1Thu = new Date(isoYear, 0, 4);
    week1Thu.setDate(week1Thu.getDate() - ((week1Thu.getDay() + 6) % 7) + 3); // 第 1 周的周四
    const week = Math.round((d.getTime() - week1Thu.getTime()) / 604800000) + 1;
    return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export interface WeeklyPreview {
    shouldNotify: boolean;
    /** 未来 7 天（含今天）事项数 */
    upcoming: number;
    weekKey: string;
}

/**
 * 每周预告摘要（29 组）：周日全量扫描时推送"未来 7 天"一次。
 * 去重键 = ISO 周；仅在非静默时段；无事项不打扰。
 */
export function weeklyPreview(scan: ScanResult, settings: HomeSettings, rt: HubRuntime, now: Date = new Date()): WeeklyPreview {
    const weekKey = isoWeekKey(now);
    const isSunday = now.getDay() === 0;
    const upcoming = scan.reminders.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 7).length;
    const sent = rt.lastWeeklyDigest === weekKey;
    return {
        shouldNotify: isSunday && !sent && upcoming > 0 && !inSilentHours(settings, now),
        upcoming,
        weekKey,
    };
}

/** 标记本周预告已发 */
export function markWeeklyNotified(rt: HubRuntime, now: Date = new Date()): void {
    rt.lastWeeklyDigest = isoWeekKey(now);
}
