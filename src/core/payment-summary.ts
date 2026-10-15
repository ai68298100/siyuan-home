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
}

export interface PaymentSummary {
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
    /** Items due in the next thirty calendar days, sorted by date then title. */
    upcoming: UpcomingPaymentItem[];
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
    let sourceCount = 0;
    const upcoming: UpcomingPaymentItem[] = [];

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
            const cycle = cycleColumn ? (selectCellContent(row.cells?.[cycleColumn]) ?? readText(row.cells?.[cycleColumn])) : "month";
            const monthlyCost = amount * (MONTHLY_FACTORS[cycle] ?? 1);
            monthlyTotal += monthlyCost;
            sourceCount++;

            const dueDate = dueColumn ? readDate(row.cells?.[dueColumn]) : undefined;
            if (!dueDate) continue;
            const days = daysBetween(now, dateFromKey(dueDate));
            if (days < 0 || days > 30) continue;
            if (days <= 7) next7Total += amount;
            next30Total += amount;
            upcoming.push({
                moduleId: source.moduleId,
                rowId: row.itemID,
                title: (nameColumn ? readText(row.cells?.[nameColumn]) : "") || "—",
                dueDate,
                amount: roundMoney(amount),
                cycle: cycle || "month",
                monthlyCost: roundMoney(monthlyCost),
            });
        }
    }

    upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, undefined, { numeric: true }));
    return {
        sourceCount,
        monthlyTotal: roundMoney(monthlyTotal),
        annualTotal: roundMoney(monthlyTotal * 12),
        next7Total: roundMoney(next7Total),
        next30Total: roundMoney(next30Total),
        upcoming,
    };
}

export { MONTHLY_FACTORS as PAYMENT_MONTHLY_FACTORS };
