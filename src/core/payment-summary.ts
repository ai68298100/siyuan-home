/**
 * Upcoming payment projection for subscriptions and insurance.
 *
 * This is deliberately a pure read model: it never writes a ledger row,
 * advances a renewal date, or treats a contract deposit as a payment.
 */
import { selectCellContent } from "@/core/avcell";
import { differenceInCalendarDays } from "date-fns";

export type PaymentModuleId = "memberships" | "insurance";

export interface PaymentRowLike {
    itemID: string;
    cells: Record<string, any>;
    /** Resolved settings member id, when the source row has a member relation. */
    memberId?: string;
}

export interface PaymentSource {
    moduleId: PaymentModuleId;
    columns?: Record<string, string>;
    rows: PaymentRowLike[];
}

export interface UpcomingPaymentItem {
    moduleId: PaymentModuleId;
    rowId: string;
    title: string;
    dueDate: string;
    amount: number;
    cycle: string;
    monthlyCost: number;
    /** Calendar days from the scan date; the upcoming window is 0..30. */
    daysUntil: number;
    memberId?: string;
}

/** Active payment commitments ranked by their monthly equivalent. */
export interface PaymentCommitmentItem {
    moduleId: PaymentModuleId;
    rowId: string;
    title: string;
    amount: number;
    cycle: string;
    monthlyCost: number;
    memberId?: string;
}

export interface PaymentBreakdown {
    /** Active rows that have a positive amount and a recognized payment source. */
    sourceCount: number;
    /** Monthly equivalent across active membership and insurance rows. */
    monthlyTotal: number;
    /** Annualized monthly equivalent. */
    annualTotal: number;
    /** Amount due today through the next seven calendar days. */
    next7Total: number;
    /** Amount due today through the next thirty calendar days. */
    next30Total: number;
    /** Amount whose payment date is already past due. */
    overdueTotal: number;
}

export interface PaymentScope extends PaymentBreakdown {
    /** Per-ledger totals. Missing keys mean that ledger had no usable payment rows. */
    byModule: Partial<Record<PaymentModuleId, PaymentBreakdown>>;
    /** Rows that need attention before the monthly projection is fully trustworthy. */
    dataQuality: {
        missingCycle: number;
        unknownCycle: number;
        missingDate: number;
    };
}

export interface PaymentSummary extends PaymentScope {
    /** Member-scoped totals for rows whose relation resolved to a settings member. */
    byMember: Record<string, PaymentScope>;
    /** Items due in the next thirty calendar days, sorted by date then title. */
    upcoming: UpcomingPaymentItem[];
    /** Active payment rows whose date is before the scan date, oldest first. */
    overdue: UpcomingPaymentItem[];
    /** All active commitments ranked by monthly equivalent; views take their top three. */
    topRecurring: PaymentCommitmentItem[];
}

const MONTHLY_FACTORS: Record<string, number> = {
    day: 365 / 12,
    week: 52 / 12,
    month: 1,
    quarter: 1 / 3,
    year: 1 / 12,
};

const INACTIVE_STATUS: Record<PaymentModuleId, ReadonlySet<string>> = {
    memberships: new Set(["m_expired", "refunded"]),
    insurance: new Set(["ins_expired", "surrendered"]),
};

function readText(cell: any): string {
    if (!cell) return "";
    return String(cell?.text?.content ?? selectCellContent(cell) ?? cell?.content ?? "").trim();
}

function readNumber(cell: any): number {
    if (!cell) return 0;
    const raw = cell?.number?.content ?? cell?.number ?? cell?.content;
    const value = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function readDate(cell: any): string | undefined {
    const raw = cell?.date?.content ?? cell?.text?.content ?? cell?.content;
    // SiYuan AV date cells expose `date.content` as a millisecond timestamp.
    // Keep the conversion local-time based so a UTC offset cannot move the day.
    if (typeof raw === "number" && Number.isFinite(raw)) {
        const date = new Date(raw);
        if (!Number.isNaN(date.getTime())) return localDateKey(date);
    }
    const value = String(raw ?? "").trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return undefined;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
    return `${match[1]}-${match[2]}-${match[3]}`;
}

function dateFromKey(value: string): Date {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function localDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeToday(today: Date): Date {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function daysBetween(from: Date, to: Date): number {
    return differenceInCalendarDays(to, from);
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

function compareStableText(left: string, right: string): number {
    if (left === right) return 0;
    return left < right ? -1 : 1;
}

function emptyBreakdown(): PaymentBreakdown {
    return { sourceCount: 0, monthlyTotal: 0, annualTotal: 0, next7Total: 0, next30Total: 0, overdueTotal: 0 };
}

function roundBreakdown(value: PaymentBreakdown): PaymentBreakdown {
    return {
        sourceCount: value.sourceCount,
        monthlyTotal: roundMoney(value.monthlyTotal),
        annualTotal: roundMoney(value.monthlyTotal * 12),
        next7Total: roundMoney(value.next7Total),
        next30Total: roundMoney(value.next30Total),
        overdueTotal: roundMoney(value.overdueTotal),
    };
}

function emptyQuality(): PaymentScope["dataQuality"] {
    return { missingCycle: 0, unknownCycle: 0, missingDate: 0 };
}

function emptyScope(): PaymentScope {
    return { ...emptyBreakdown(), byModule: {}, dataQuality: emptyQuality() };
}

function finalizeScope(value: PaymentScope): PaymentScope {
    return {
        ...roundBreakdown(value),
        byModule: Object.fromEntries(Object.entries(value.byModule).map(([moduleId, breakdown]) => [moduleId, roundBreakdown(breakdown)])),
        dataQuality: { ...value.dataQuality },
    };
}

function sourceFields(moduleId: PaymentModuleId): { amount: string; cycle: string; due: string } {
    return moduleId === "insurance"
        ? { amount: "premium", cycle: "pay_cycle", due: "next_pay" }
        : { amount: "amount", cycle: "cycle", due: "next_pay" };
}

/**
 * Build one payment view from the rows already read for the enabled ledgers.
 * The date window is inclusive of today and does not include overdue rows;
 * overdue items remain available through the reminder hub.
 */
export function buildPaymentSummary(sources: PaymentSource[], today: Date): PaymentSummary {
    const now = normalizeToday(today);
    let monthlyTotal = 0;
    let next7Total = 0;
    let next30Total = 0;
    let overdueTotal = 0;
    let sourceCount = 0;
    const upcoming: UpcomingPaymentItem[] = [];
    const overdue: UpcomingPaymentItem[] = [];
    const commitments: PaymentCommitmentItem[] = [];
    const moduleTotals = new Map<PaymentModuleId, PaymentBreakdown>();
    const memberTotals = new Map<string, PaymentScope>();
    const dataQuality = emptyQuality();

    for (const source of sources) {
        const columns = source.columns;
        if (!columns) continue;
        const fields = sourceFields(source.moduleId);
        const nameColumn = columns.name;
        const statusColumn = columns.status;
        const amountColumn = columns[fields.amount];
        const cycleColumn = columns[fields.cycle];
        const dueColumn = columns[fields.due];
        if (!amountColumn) continue;

        for (const row of source.rows ?? []) {
            const status = statusColumn ? (selectCellContent(row.cells?.[statusColumn]) ?? readText(row.cells?.[statusColumn])) : "active";
            if (INACTIVE_STATUS[source.moduleId].has(status)) continue;

            const amount = readNumber(row.cells?.[amountColumn]);
            if (amount <= 0) continue;
            const memberScope = row.memberId ? (memberTotals.get(row.memberId) ?? emptyScope()) : undefined;
            const rawCycle = cycleColumn ? (selectCellContent(row.cells?.[cycleColumn]) ?? readText(row.cells?.[cycleColumn])).trim() : "";
            if (!rawCycle) {
                dataQuality.missingCycle++;
                if (memberScope) memberScope.dataQuality.missingCycle++;
            } else if (!Object.prototype.hasOwnProperty.call(MONTHLY_FACTORS, rawCycle)) {
                dataQuality.unknownCycle++;
                if (memberScope) memberScope.dataQuality.unknownCycle++;
            }
            const cycle = rawCycle || "month";
            // Keep the row visible for correction, but mark unknown values instead
            // of silently presenting them as a trustworthy monthly projection.
            const monthlyCost = amount * (MONTHLY_FACTORS[cycle] ?? 1);
            monthlyTotal += monthlyCost;
            sourceCount++;
            commitments.push({
                moduleId: source.moduleId,
                rowId: row.itemID,
                title: (nameColumn ? readText(row.cells?.[nameColumn]) : "") || "—",
                amount: roundMoney(amount),
                cycle,
                monthlyCost: roundMoney(monthlyCost),
                ...(row.memberId ? { memberId: row.memberId } : {}),
            });
            const moduleTotal = moduleTotals.get(source.moduleId) ?? emptyBreakdown();
            moduleTotal.monthlyTotal += monthlyCost;
            moduleTotal.sourceCount++;
            moduleTotals.set(source.moduleId, moduleTotal);
            if (memberScope) {
                memberScope.monthlyTotal += monthlyCost;
                memberScope.sourceCount++;
                const memberModule = memberScope.byModule[source.moduleId] ?? emptyBreakdown();
                memberModule.monthlyTotal += monthlyCost;
                memberModule.sourceCount++;
                memberScope.byModule[source.moduleId] = memberModule;
                memberTotals.set(row.memberId!, memberScope);
            }

            const dueDate = dueColumn ? readDate(row.cells?.[dueColumn]) : undefined;
            if (!dueDate) {
                dataQuality.missingDate++;
                if (memberScope) memberScope.dataQuality.missingDate++;
                continue;
            }
            const days = daysBetween(now, dateFromKey(dueDate));
            const item = {
                moduleId: source.moduleId,
                rowId: row.itemID,
                title: (nameColumn ? readText(row.cells?.[nameColumn]) : "") || "—",
                dueDate,
                amount: roundMoney(amount),
                cycle: cycle || "month",
                monthlyCost: roundMoney(monthlyCost),
                daysUntil: days,
                ...(row.memberId ? { memberId: row.memberId } : {}),
            } satisfies UpcomingPaymentItem;
            if (days < 0) {
                overdueTotal += amount;
                moduleTotal.overdueTotal += amount;
                if (memberScope) {
                    memberScope.overdueTotal += amount;
                    memberScope.byModule[source.moduleId].overdueTotal += amount;
                }
                overdue.push(item);
                continue;
            }
            if (days > 30) continue;
            if (days <= 7) {
                next7Total += amount;
                moduleTotal.next7Total += amount;
                if (memberScope) {
                    memberScope.next7Total += amount;
                    memberScope.byModule[source.moduleId].next7Total += amount;
                }
            }
            next30Total += amount;
            moduleTotal.next30Total += amount;
            if (memberScope) {
                memberScope.next30Total += amount;
                memberScope.byModule[source.moduleId].next30Total += amount;
            }
            upcoming.push(item);
        }
    }

    upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, undefined, { numeric: true }));
    overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, undefined, { numeric: true }));
    commitments.sort((a, b) => b.monthlyCost - a.monthlyCost || compareStableText(a.title, b.title) || compareStableText(a.rowId, b.rowId));
    const byModule = Object.fromEntries([...moduleTotals.entries()].map(([moduleId, value]) => [moduleId, roundBreakdown(value)])) as Partial<Record<PaymentModuleId, PaymentBreakdown>>;
    const byMember = Object.fromEntries([...memberTotals.entries()].map(([memberId, value]) => [memberId, finalizeScope(value)]));
    return {
        sourceCount,
        monthlyTotal: roundMoney(monthlyTotal),
        annualTotal: roundMoney(monthlyTotal * 12),
        next7Total: roundMoney(next7Total),
        next30Total: roundMoney(next30Total),
        overdueTotal: roundMoney(overdueTotal),
        byModule,
        dataQuality: { ...dataQuality },
        byMember,
        upcoming,
        overdue,
        topRecurring: commitments,
    };
}

export { MONTHLY_FACTORS as PAYMENT_MONTHLY_FACTORS };
