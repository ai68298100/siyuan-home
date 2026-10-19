import { describe, expect, it } from "vitest";
import { calculateEnergyStats, normalizeEnergyRecords, type EnergyRecord } from "@/core/fuel";

const fuel = (date: string, odometer: number, quantity: number, totalCost: number, full = false): EnergyRecord => ({
    kind: "fuel", date, odometer, quantity, totalCost, full,
});

describe("fuel statistics", () => {
    it("uses full-to-full intervals and accumulates partial refuels", () => {
        const stats = calculateEnergyStats([
            fuel("2026-01-01", 10000, 40, 300, true),
            fuel("2026-01-10", 10500, 10, 80),
            fuel("2026-01-20", 11000, 30, 240, true),
            fuel("2026-01-30", 11500, 20, 170),
        ], "fuel");

        expect(stats.method).toBe("full");
        expect(stats.intervals).toHaveLength(1);
        expect(stats.intervals[0]).toMatchObject({ distance: 1000, quantity: 40, cost: 320, estimated: false });
        expect(stats.consumptionPer100Km).toBe(4);
        expect(stats.costPer100Km).toBe(32);
        expect(stats.totalQuantity).toBe(100);
        expect(stats.totalCost).toBe(790);
        expect(stats.warnings).toContain("incomplete_latest_interval");
    });

    it("falls back to adjacent-record estimates when full markers are absent", () => {
        const stats = calculateEnergyStats([
            fuel("2026-01-01", 1000, 20, 160),
            fuel("2026-01-10", 1250, 18, 150),
            fuel("2026-01-20", 1500, 19, 170),
        ], "fuel");

        expect(stats.method).toBe("estimated");
        expect(stats.intervals).toHaveLength(2);
        expect(stats.intervals.every((item) => item.estimated)).toBe(true);
        expect(stats.totalDistance).toBe(500);
        expect(stats.coveredQuantity).toBe(37);
        expect(stats.consumptionPer100Km).toBeCloseTo(7.4);
    });

    it("keeps charging separate from fuel and accepts zero-cost charging", () => {
        const records: EnergyRecord[] = [
            { kind: "fuel", date: "2026-01-01", odometer: 100, quantity: 20, totalCost: 160 },
            { kind: "charging", date: "2026-01-02", odometer: 200, quantity: 30, totalCost: 0, full: true },
            { kind: "charging", date: "2026-01-05", odometer: 500, quantity: 45, totalCost: 45, full: true },
        ];
        const stats = calculateEnergyStats(records, "charging");
        expect(stats.recordCount).toBe(2);
        expect(stats.totalCost).toBe(45);
        expect(stats.intervals[0]).toMatchObject({ distance: 300, quantity: 45, cost: 45 });
        expect(calculateEnergyStats(records, "fuel").recordCount).toBe(1);
    });

    it("filters malformed records and sorts valid records", () => {
        const records: EnergyRecord[] = [
            fuel("2026-02-01", 1200, 10, 80),
            fuel("bad", 1300, 10, 80),
            fuel("2026-01-01", 1000, 10, 80),
            fuel("2026-01-15", 1100, 0, 0),
            { kind: "charging", date: "2025-01-01", odometer: 0, quantity: 20, totalCost: 20 },
        ];
        expect(normalizeEnergyRecords(records, "fuel").map((r) => r.date)).toEqual(["2026-01-01", "2026-02-01"]);
    });

    it("supports unit price fallback and leaves cost undefined when unavailable", () => {
        const stats = calculateEnergyStats([
            { kind: "fuel", date: "2026-01-01", odometer: 100, quantity: 10, unitPrice: 8 },
            { kind: "fuel", date: "2026-01-10", odometer: 200, quantity: 10 },
        ], "fuel");
        expect(stats.totalCost).toBe(80);
        expect(stats.costRecordCount).toBe(1);
        expect(stats.averageUnitPrice).toBe(8);
        expect(stats.costPer100Km).toBeUndefined();
        expect(stats.warnings).toContain("missing_costs");
    });

    it("cuts a full-to-full interval after an intervening odometer reset", () => {
        const stats = calculateEnergyStats([
            fuel("2026-01-01", 20000, 40, 320, true),
            fuel("2026-01-10", 19000, 10, 80),
            fuel("2026-01-20", 20500, 30, 240, true),
            fuel("2026-01-30", 21000, 35, 280, true),
        ], "fuel");
        expect(stats.warnings).toContain("non_increasing_odometer");
        expect(stats.intervals).toHaveLength(1);
        expect(stats.intervals[0]).toMatchObject({ fromOdometer: 20500, toOdometer: 21000, distance: 500, quantity: 35 });
    });

    it("keeps same-day entry order and rejects impossible calendar dates", () => {
        const records = [
            fuel("2026-01-01", 1000, 20, 160, true),
            fuel("2026-01-01", 900, 10, 80),
            fuel("2026-02-30", 1100, 10, 80, true),
        ];
        const normalized = normalizeEnergyRecords(records, "fuel");
        expect(normalized.map((item) => item.odometer)).toEqual([1000, 900]);
        const stats = calculateEnergyStats(records, "fuel");
        expect(stats.warnings).toContain("non_increasing_odometer");
        expect(stats.intervals).toHaveLength(0);
    });
});

