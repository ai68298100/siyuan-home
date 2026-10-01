/**
 * 提醒规则引擎（docs/design/03 + docs/design/09 决策记录）。
 * 纯逻辑 + 农历懒加载（lunar-lazy，bundle 整改 🔴），无思源依赖，可单测。
 *
 * 决策定案（2026-10-01，docs/design/09）：
 * - 公历 2/29 生日：平年在 2/28 提醒；
 * - 农历闰月生日：平年过平月同日；生日当日不存在（如腊月三十遇小月）时向前取最近存在日（腊月廿九）；
 * - recurring 的 due 永远滚动到今天及以后（不产生 overdue）；cycle 未声明时按 oneoff 降级；
 * - recurring 滚动用月数差 O(1) 计算，月末由 addMonths 收敛到月末（不跨月漂移）；
 * - 日期序列化一律用本地时区（localDateKey），禁止 toISOString（UTC 偏移会偏一天）。
 */
import { addDays, addMonths, addYears, differenceInCalendarDays, parseISO, isValid } from "date-fns";
import type { Reminder, ReminderRuleSpec, ReminderLevel } from "@/types";
import { nextLunarAnniversary } from "./lunar-lazy";

export interface LedgerRowDates {
    /** 行块 ID */
    rowId: string;
    memberId?: string;
    title: string;
    /** 规则 field 对应的日期（ISO 或 yyyy-MM-dd） */
    fieldValue?: string;
    /** recurring 的周期值 */
    cycle?: string;
    /** anniversary 的农历标记 */
    lunar?: boolean;
}

const CYCLE_MONTHS: Record<string, number> = {
    day: 0, week: 0, month: 1, quarter: 3, year: 12,
};

export function parseDate(v?: string): Date | undefined {
    if (!v) return undefined;
    const d = v.length === 10 ? parseISO(`${v}T00:00:00`) : parseISO(v);
    return isValid(d) ? d : undefined;
}

/** 本地时区 yyyy-MM-dd（决策 33.3：禁止 toISOString） */
export function localDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function daysInMonth(year: number, month0: number): number {
    return new Date(year, month0 + 1, 0).getDate();
}

/** 下次发生日（含今天）。 */
export async function nextOccurrence(rule: ReminderRuleSpec, row: LedgerRowDates, today: Date): Promise<Date | undefined> {
    const base = parseDate(row.fieldValue);
    if (!base) return undefined;
    const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (rule.kind === "oneoff") return base;

    if (rule.kind === "anniversary") {
        if (row.lunar) return nextLunarAnniversary(base, today0);
        // 公历周年：2/29 平年取 2/28（决策 09）
        const day = Math.min(base.getDate(), daysInMonth(today0.getFullYear(), base.getMonth()));
        const cand = new Date(today0.getFullYear(), base.getMonth(), day);
        if (cand < today0) return addYears(cand, 1);
        return cand;
    }

    // recurring：按周期滚动到今天及以后（O(1) 月数差；day/week 用差值跳步）
    if (row.cycle === "day") {
        const diff = differenceInCalendarDays(today0, base);
        if (diff <= 0) return base;
        return addDays(base, diff);
    }
    if (row.cycle === "week") {
        const diff = differenceInCalendarDays(today0, base);
        if (diff <= 0) return base;
        return addDays(base, Math.ceil(diff / 7) * 7);
    }
    const months = CYCLE_MONTHS[row.cycle ?? ""] ?? 0;
    if (months > 0) {
        const diff = (today0.getFullYear() - base.getFullYear()) * 12 + (today0.getMonth() - base.getMonth());
        if (diff <= 0 && base >= today0) return base;
        const k = Math.max(1, Math.ceil(diff / months));
        const next = addMonths(base, k * months); // date-fns 对月末做 clamp（1/31+1M→2/29）
        return next < today0 ? addMonths(next, months) : next;
    }
    // 未声明周期 → 一次性降级（决策 09）
    return base;
}

/** 紧急分级（03 §4）：🔴 已逾期 / 🟠 7 天内 / 🟡 提前量内 / ⚪ 更远 */
export function levelOf(daysLeft: number, leadDays: number): ReminderLevel {
    if (daysLeft < 0) return "overdue";
    if (daysLeft <= 7) return "soon";
    if (daysLeft <= Math.max(leadDays, 8)) return "lead";
    return "later";
}

/**
 * 规则 + 台账行 → 运行态提醒。
 * leadOverride 合并顺序（33.3）：行级 remind_before > 用户 leadOverrides > schema 默认；
 * 行级与用户级的合并在 DataProvider 层完成，这里只收最终值。
 */
export async function buildReminder(
    rule: ReminderRuleSpec,
    moduleId: string,
    row: LedgerRowDates,
    opts: { today: Date; leadOverride?: number },
): Promise<Reminder | null> {
    const due = await nextOccurrence(rule, row, opts.today);
    if (!due) return null;
    const leadDays = Math.max(0, Math.min(opts.leadOverride ?? rule.leadDays, 3650));
    const daysLeft = differenceInCalendarDays(due, opts.today);
    const level = levelOf(daysLeft, leadDays);
    // 降噪：提前量之外（later）不进列表；overdue 始终保留
    if (level === "later") return null;
    return {
        id: `${row.rowId}::${moduleId}.${rule.key}`,
        moduleId,
        ruleKey: rule.key,
        rowId: row.rowId,
        memberId: row.memberId,
        title: row.title,
        dueDate: localDateKey(due),
        daysLeft,
        level,
    };
}
