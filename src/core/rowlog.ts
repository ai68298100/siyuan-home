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

/** 位置变更（assets 物品搬家）/ 转学插班（schooling）：from→to 一条记录 */
export interface MoveEntry {
    date: string;
    from: string;
    to: string;
    at: string;
}

/** 价格历史（shopping 复购比价；同日多条合法——不同渠道/批次价格并存） */
export interface PriceEntry {
    date: string;
    price: number;
    channel: string;
    at: string;
}

/** 行日志集合：按类型分组（估值=口径日覆盖；其余=追加+完全重复去重） */
export interface RowLog {
    valuations?: ValuationEntry[];
    moves?: MoveEntry[];
    prices?: PriceEntry[];
    transfers?: MoveEntry[];
}

export type RowLogs = Record<string, RowLog>;

export type LogKind = "valuations" | "moves" | "prices" | "transfers";

export function logKey(avId: string, rowId: string): string {
    return `${avId}|${rowId}`;
}

/** 泛型读取：按日期升序 */
export function getEntries<T>(logs: RowLogs, avId: string, rowId: string, kind: LogKind): T[] {
    return [...((logs[logKey(avId, rowId)]?.[kind] as T[]) ?? [])].sort((a, b) =>
        String((a as { date: string }).date).localeCompare(String((b as { date: string }).date)),
    );
}

/** 泛型追加：完全相同的条目（除 at 外）去重；返回新对象 */
export function appendEntry(logs: RowLogs, avId: string, rowId: string, kind: LogKind, entry: Record<string, unknown>): RowLogs {
    const key = logKey(avId, rowId);
    const log = logs[key] ?? {};
    const list = (log[kind] as unknown as Record<string, unknown>[]) ?? [];
    const sig = (e: Record<string, unknown>) => JSON.stringify({ ...e, at: "" });
    if (list.some((e) => sig(e) === sig(entry))) return logs;
    return { ...logs, [key]: { ...log, [kind]: [...list, entry] } };
}

/** 泛型删除：按条目全等（忽略 at）；行下全空时清 key */
export function removeEntry(logs: RowLogs, avId: string, rowId: string, kind: LogKind, entry: Record<string, unknown>): RowLogs {
    const key = logKey(avId, rowId);
    const log = logs[key];
    const list = log?.[kind] as unknown as Record<string, unknown>[] | undefined;
    if (!list) return logs;
    const sig = (e: Record<string, unknown>) => JSON.stringify({ ...e, at: "" });
    const rest = list.filter((e) => sig(e) !== sig(entry));
    const next = { ...logs, [key]: { ...log, [kind]: rest } };
    pruneKeyIfEmpty(next, key);
    return next;
}

/** 某行估值时间线：按日期升序（同日期去重由 append 保证） */
export function getValuations(logs: RowLogs, avId: string, rowId: string): ValuationEntry[] {
    return getEntries<ValuationEntry>(logs, avId, rowId, "valuations");
}

/** 记一笔估值：同日期覆盖（快照语义——口径日只有一个值），其余追加；返回新对象（调用方持有保存） */
export function appendValuation(logs: RowLogs, avId: string, rowId: string, date: string, value: number, at: string): RowLogs {
    if (!date || !Number.isFinite(value)) return logs;
    const key = logKey(avId, rowId);
    const log = logs[key] ?? {};
    const rest = (log.valuations ?? []).filter((v) => v.date !== date);
    return { ...logs, [key]: { ...log, valuations: [...rest, { date, value, at }] } };
}

/** key 下所有类型皆空时删除该 key（防 rowlogs.json 无限膨胀；单类型删空不误伤其他类型） */
function pruneKeyIfEmpty(logs: RowLogs, key: string): void {
    const log = logs[key];
    if (!log) return;
    if (Object.values(log).every((v) => !Array.isArray(v) || v.length === 0)) delete logs[key];
}

/** 删除某口径日的估值；行下全空时清 key */
export function removeValuation(logs: RowLogs, avId: string, rowId: string, date: string): RowLogs {
    const key = logKey(avId, rowId);
    const log = logs[key];
    if (!log?.valuations) return logs;
    const rest = log.valuations.filter((v) => v.date !== date);
    const next = { ...logs, [key]: { ...log, valuations: rest } };
    pruneKeyIfEmpty(next, key);
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
