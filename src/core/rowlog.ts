/**
 * 行级子记录日志（子记录模型定案 2026-10-04，解锁时间线类待办）。
 * AV 单元格放不了数组 → 时间线类数据（估值快照/位置变更/价格历史/换证链）存
 * plugin data 文件 rowlogs.json（与 settings 同通道，随思源同步），
 * key = `${avId}|${rowId}`，值按日志类型分组。不建新数据库。
 * 纯逻辑无思源依赖，可单测；持久化函数薄封装 load/save。
 */
import type { Plugin } from "siyuan";
import { loadDataSafe } from "./settings";

export const ROWLOGS_NAME = "rowlogs.json";

/** 估值快照（assets；date=快照口径日，value=估值，at=录入时刻） */
export interface ValuationEntry {
    date: string;
    value: number;
    at: string;
}

/** 行日志集合：类型分组，后续时间线类（位置/价格/换证）在此扩展字段 */
export interface RowLog {
    valuations?: ValuationEntry[];
}

export type RowLogs = Record<string, RowLog>;

export function logKey(avId: string, rowId: string): string {
    return `${avId}|${rowId}`;
}

/** 某行估值时间线：按日期升序（同日期去重由 append 保证） */
export function getValuations(logs: RowLogs, avId: string, rowId: string): ValuationEntry[] {
    return [...(logs[logKey(avId, rowId)]?.valuations ?? [])].sort((a, b) => a.date.localeCompare(b.date));
}

/** 记一笔估值：同日期覆盖（快照语义——口径日只有一个值），其余追加；返回新对象（调用方持有保存） */
export function appendValuation(logs: RowLogs, avId: string, rowId: string, date: string, value: number, at: string): RowLogs {
    if (!date || !Number.isFinite(value)) return logs;
    const key = logKey(avId, rowId);
    const log = logs[key] ?? {};
    const rest = (log.valuations ?? []).filter((v) => v.date !== date);
    return { ...logs, [key]: { ...log, valuations: [...rest, { date, value, at }] } };
}

/** 删除某口径日的估值；行无残留时清 key（防 rowlogs.json 无限膨胀） */
export function removeValuation(logs: RowLogs, avId: string, rowId: string, date: string): RowLogs {
    const key = logKey(avId, rowId);
    const log = logs[key];
    if (!log?.valuations) return logs;
    const rest = log.valuations.filter((v) => v.date !== date);
    const next = { ...logs };
    if (rest.length === 0) delete next[key];
    else next[key] = { ...log, valuations: rest };
    return next;
}

/** 行删除后清整行日志（详情抽屉删除路径调用；不存在的 key 安静返回） */
export function removeRowLog(logs: RowLogs, avId: string, rowId: string): RowLogs {
    const key = logKey(avId, rowId);
    if (!(key in logs)) return logs;
    const next = { ...logs };
    delete next[key];
    return next;
}

/** 载入 rowlogs.json（坏文件容错同 settings：备份标记 + 回退空） */
export async function loadRowLogs(plugin: Plugin): Promise<RowLogs> {
    const { data, corrupted } = await loadDataSafe(plugin, ROWLOGS_NAME);
    if (corrupted || !data || typeof data !== "object" || Array.isArray(data)) return {};
    return data as RowLogs;
}

export async function saveRowLogs(plugin: Plugin, logs: RowLogs): Promise<void> {
    await plugin.saveData(ROWLOGS_NAME, logs);
}
