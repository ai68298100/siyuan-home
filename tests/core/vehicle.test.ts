import { describe, expect, it } from "vitest";
import { calculateMaintenanceStats, calculateVehicleCostSummary, normalizeMaintenanceRecords, type MaintenanceRecord } from "@/core/vehicle";
import type { EnergyRecord } from "@/core/fuel";

const service = (date: string, odometer: number, category = "routine", cost?: number): MaintenanceRecord => ({
    date, odometer, category, ...(cost === undefined ? {} : { cost }),
});

describe("vehicle maintenance statistics", () => {
    it("normalizes records and aggregates cost by category", () => {
        const stats = calculateMaintenanceStats([
            service("2026-02-01", 12000, "routine", 420),
            service("2026-01-01", 10000, "tires", 1800),
            service("bad", 11000, "repair", 20),
            service("2026-03-01", 13000, "routine"),
        ], "2026-02-15");

        expect(stats.recordCount).toBe(3);
        expect(stats.costRecordCount).toBe(2);
        expect(stats.totalCost).toBe(2220);
        expect(stats.averageCost).toBe(1110);
        expect(stats.byCategory.routine).toEqual({ count: 2, cost: 420 });
        expect(stats.latest?.date).toBe("2026-03-01");
    });

    it("returns only future date and mileage reminders", () => {
        const records: MaintenanceRecord[] = [
            { ...service("2026-01-01", 10000), nextDate: "2026-01-15", nextOdometer: 12000 },
            { ...service("2026-02-01", 11000), nextDate: "2026-04-01", nextOdometer: 15000 },
            { ...service("2026-03-01", 12000), nextDate: "2026-06-01", nextOdometer: 14000 },
        ];
        const stats = calculateMaintenanceStats(records, "2026-03-01", 13000);
        expect(stats.nextDate).toBe("2026-04-01");
        expect(stats.nextOdometer).toBe(14000);
        expect(stats.overdueDate).toBe("2026-01-15");
        expect(stats.overdueOdometer).toBe(12000);
    });

    it("accepts zero cost and rejects invalid next thresholds", () => {
        const records: MaintenanceRecord[] = [
            { ...service("2026-01-01", 1000, "cleaning", 0), nextDate: "2026-02-30" },
            { ...service("2026-01-02", 1100, "repair", 50), nextOdometer: 0 },
        ];
        expect(normalizeMaintenanceRecords(records)).toHaveLength(0);
    });

    it("summarizes costs by source and marks incomplete amounts", () => {
        const fuel: EnergyRecord[] = [
            { kind: "fuel", date: "2026-01-01", odometer: 1000, quantity: 30, full: true, totalCost: 210 },
            { kind: "fuel", date: "2026-02-01", odometer: 1500, quantity: 32, full: true },
        ];
        const charging: EnergyRecord[] = [
            { kind: "charging", date: "2026-02-10", odometer: 1600, quantity: 20, totalCost: 30 },
        ];
        const maintenance: MaintenanceRecord[] = [
            { category: "routine", date: "2026-02-12", odometer: 1600, cost: 480 },
        ];
        const summary = calculateVehicleCostSummary(fuel, charging, maintenance, "2026-02-15", 1600);
        expect(summary.fuelCost).toBe(210);
        expect(summary.chargingCost).toBe(30);
        expect(summary.maintenanceCost).toBe(480);
        expect(summary.totalCost).toBe(720);
        expect(summary.eventCount).toBe(4);
        expect(summary.latestDate).toBe("2026-02-12");
        expect(summary.costComplete).toBe(false);
    });
});
