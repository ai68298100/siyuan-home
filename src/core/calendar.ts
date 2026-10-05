/**
 * 原生日历视图（路线图"下一阶段"，230 波）：月历网格纯函数。
 * 周一起始（中文日历惯例）；233 波改为真实相邻月日期（首尾补位显示上月末/下月初，
 * 可点选可看提醒点），不再返回 null 占位。
 */
import { localDateKey } from "./hub/rule";

export interface CalCell {
    /** yyyy-MM-dd（本地时区）；首尾补位为相邻月真实日期 */
    key: string;
    day: number;
    inMonth: boolean;
}

export function monthGrid(year: number, month0: number): CalCell[] {
    const first = new Date(year, month0, 1);
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // 周一起始：getDay 周日=0 → 偏移 6
    const cells: CalCell[] = [];
    // 前导：上月末尾 lead 天
    for (let i = lead; i >= 1; i--) {
        const d = new Date(year, month0, 1 - i);
        cells.push({ key: localDateKey(d), day: d.getDate(), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push({ key: localDateKey(new Date(year, month0, d)), day: d, inMonth: true });
    }
    // 尾补：下月开头补齐整周
    let next = 1;
    while (cells.length % 7 !== 0) {
        const d = new Date(year, month0 + 1, next);
        cells.push({ key: localDateKey(d), day: d.getDate(), inMonth: false });
        next++;
    }
    return cells;
}

/** 当月天数（闰年由 Date 归一化处理） */
export function daysInMonth(year: number, month0: number): number {
    return new Date(year, month0 + 1, 0).getDate();
}
