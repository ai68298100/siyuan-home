import { describe, expect, it } from "vitest";
import { buildPaymentSummary, type PaymentSource } from "@/core/payment-summary";

const today = new Date(2026, 9, 15);

function cell(value: unknown, type: "text" | "number" | "select" | "date") {
    if (type === "number") return { number: { content: value } };
    if (type === "date") return { date: { content: value } };
    if (type === "select") return { select: { content: value } };
    return { text: { content: value } };
}

function source(moduleId: PaymentSource["moduleId"], rows: any[]): PaymentSource {
    return {
        moduleId,
        columns: moduleId === "memberships"
            ? { name: "name", status: "status", amount: "amount", cycle: "cycle", next_pay: "next_pay" }
            : { name: "name", status: "status", premium: "premium", pay_cycle: "pay_cycle", next_pay: "next_pay" },
        rows,
    };
}

describe("buildPaymentSummary", () => {
    it("combines membership and insurance payments with monthly equivalents", () => {
        const summary = buildPaymentSummary([
            source("memberships", [{ itemID: "m1", cells: {
                name: cell("云盘", "text"), status: cell("active", "select"), amount: cell(120, "number"),
                cycle: cell("year", "select"), next_pay: cell("2026-10-20", "date"),
            } }]),
            source("insurance", [{ itemID: "i1", cells: {
                name: cell("医疗险", "text"), status: cell("in_force", "select"), premium: cell(300, "number"),
                pay_cycle: cell("quarter", "select"), next_pay: cell("2026-10-22", "date"),
            } }]),
        ], today);

        expect(summary.sourceCount).toBe(2);
        expect(summary.monthlyTotal).toBe(110);
        expect(summary.annualTotal).toBe(1320);
        expect(summary.next7Total).toBe(420);
        expect(summary.next30Total).toBe(420);
        expect(summary.upcoming.map((item) => item.rowId)).toEqual(["m1", "i1"]);
    });

    it("includes today and the seventh day, excludes overdue and day 31", () => {
        const summary = buildPaymentSummary([source("memberships", [
            { itemID: "overdue", cells: { name: cell("旧账", "text"), amount: cell(10, "number"), cycle: cell("month", "select"), next_pay: cell("2026-10-14", "date") } },
            { itemID: "today", cells: { name: cell("今天", "text"), amount: cell(20, "number"), cycle: cell("month", "select"), next_pay: cell("2026-10-15", "date") } },
            { itemID: "day7", cells: { name: cell("第七天", "text"), amount: cell(30, "number"), cycle: cell("month", "select"), next_pay: cell("2026-10-22", "date") } },
            { itemID: "day31", cells: { name: cell("窗口外", "text"), amount: cell(40, "number"), cycle: cell("month", "select"), next_pay: cell("2026-11-15", "date") } },
        ])], today);

        expect(summary.next7Total).toBe(50);
        expect(summary.next30Total).toBe(50);
        expect(summary.upcoming.map((item) => item.rowId)).toEqual(["today", "day7"]);
    });

    it("filters inactive rows and ignores invalid or non-positive amounts", () => {
        const summary = buildPaymentSummary([
            source("memberships", [
                { itemID: "expired", cells: { status: cell("m_expired", "select"), amount: cell(100, "number") } },
                { itemID: "refunded", cells: { status: cell("refunded", "select"), amount: cell(100, "number") } },
                { itemID: "free", cells: { status: cell("active", "select"), amount: cell(0, "number") } },
                { itemID: "bad-date", cells: { status: cell("active", "select"), amount: cell(12, "number"), next_pay: cell("2026-02-30", "date") } },
            ]),
            source("insurance", [{ itemID: "surrendered", cells: { status: cell("surrendered", "select"), premium: cell(500, "number") } }]),
        ], today);

        expect(summary.sourceCount).toBe(1);
        expect(summary.monthlyTotal).toBe(12);
        expect(summary.upcoming).toEqual([]);
    });

    it("accepts SiYuan AV date cells whose content is a millisecond timestamp", () => {
        const summary = buildPaymentSummary([source("memberships", [{
            itemID: "timestamp",
            cells: {
                name: cell("时间戳订阅", "text"),
                amount: cell(25, "number"),
                cycle: cell("month", "select"),
                next_pay: cell(new Date(2026, 9, 20).getTime(), "date"),
            },
        }])], today);
        expect(summary.next7Total).toBe(25);
        expect(summary.upcoming[0]).toMatchObject({ rowId: "timestamp", dueDate: "2026-10-20" });
    });

    it("does not treat a missing source column as a payment", () => {
        const summary = buildPaymentSummary([{ moduleId: "insurance", columns: { name: "name" }, rows: [{ itemID: "x", cells: { name: cell("保单", "text") } }] }], today);
        expect(summary).toEqual({ sourceCount: 0, monthlyTotal: 0, annualTotal: 0, next7Total: 0, next30Total: 0, upcoming: [] });
    });
});
