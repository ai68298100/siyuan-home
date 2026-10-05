/**
 * 原生日历视图（路线图"下一阶段"，230 波）：月历网格纯函数。
 * 周一起始（中文日历惯例）；固定补齐整周，尾补空格供网格占位。
 */
import { localDateKey } from "./hub/rule";

export interface CalCell {
    /** yyyy-MM-dd（本地时区）；补位格为 null */
    key: string | null;
    day: number;
    inMonth: boolean;
}

export function monthGrid(year: number, month0: number): CalCell[] {
    const first = new Date(year, month0, 1);
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // 周一起始：getDay 周日=0 → 偏移 6
    const cells: CalCell[] = [];
    for (let i = 0; i < lead; i++) cells.push({ key: null, day: 0, inMonth: false });
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push({ key: localDateKey(new Date(year, month0, d)), day: d, inMonth: true });
    }
    while (cells.length % 7 !== 0) cells.push({ key: null, day: 0, inMonth: false });
    return cells;
}

/** 当月天数（闰年由 Date 归一化处理） */
export function daysInMonth(year: number, month0: number): number {
    return new Date(year, month0 + 1, 0).getDate();
}
