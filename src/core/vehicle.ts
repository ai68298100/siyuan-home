/**
 * 车辆维护/维修记录与统计。
 *
 * 记录存放在 rowlogs.json 的 maintenance 分组，和能源流水一样按车辆
 * 台账行隔离。这里仅处理无思源依赖的校验、排序和汇总，方便页面、导入
 * 及测试共用。
 */

import { calculateEnergyStats, normalizeEnergyRecords, type EnergyRecord, type EnergyStats } from "@/core/fuel";

export type MaintenanceCategory =
    | "routine"
    | "repair"
    | "tires"
    | "battery"
    | "inspection"
    | "cleaning"
    | "other"
    | (string & {});

export interface MaintenanceRecord {
    category: MaintenanceCategory;
    date: string;
    /** 维护发生时的车辆总里程（公里）。 */
    odometer: number;
    /** 本次维护实际支出（元）；未知时可省略。 */
    cost?: number;
    /** 可选的下次按日期提醒。 */
    nextDate?: string;
    /** 可选的下次按里程提醒（公里）。 */
    nextOdometer?: number;
    shop?: string;
    note?: string;
    /** 录入时刻，用于同日多笔记录稳定排序。 */
    at?: string;
}

export interface MaintenanceCategoryStats {
    count: number;
    cost: number;
}

export interface MaintenanceStats {
    recordCount: number;
    costRecordCount: number;
    totalCost: number;
    averageCost?: number;
    byCategory: Record<string, MaintenanceCategoryStats>;
    latest?: MaintenanceRecord;
    /** 当前日期之后最近的日期提醒。 */
    nextDate?: string;
    /** 当前里程之后最近的里程提醒。 */
    nextOdometer?: number;
    /** 当前日期之前最近的日期提醒，供页面显示逾期状态。 */
    overdueDate?: string;
    /** 当前里程之前最近的里程提醒，供页面显示逾期状态。 */
    overdueOdometer?: number;
}

/**
 * 车辆详情顶部使用的统一成本摘要。
 *
 * 能源和维护费用仍按各自口径统计；这里仅在金额维度汇总，绝不把油耗
 * 与电耗相加。所有金额都代表已录入的流水，缺失金额时由 costComplete
 * 明确提示，避免让用户把小计当成完整成本。
 */
export interface VehicleCostSummary {
    fuel: EnergyStats;
    charging: EnergyStats;
    maintenance: MaintenanceStats;
    fuelCost: number;
    chargingCost: number;
    maintenanceCost: number;
    totalCost: number;
    costComplete: boolean;
    eventCount: number;
    latestDate?: string;
}

export function calculateVehicleCostSummary(
    fuelRecords: readonly EnergyRecord[],
    chargingRecords: readonly EnergyRecord[],
    maintenanceRecords: readonly MaintenanceRecord[],
    asOfDate = new Date().toISOString().slice(0, 10),
    currentOdometer?: number,
): VehicleCostSummary {
    const fuel = calculateEnergyStats(fuelRecords, "fuel");
    const charging = calculateEnergyStats(chargingRecords, "charging");
    const maintenance = calculateMaintenanceStats(maintenanceRecords, asOfDate, currentOdometer);
    const fuelCost = fuel.totalCost;
    const chargingCost = charging.totalCost;
    const maintenanceCost = maintenance.totalCost;
    const allDates = [
        ...normalizeEnergyRecords(fuelRecords, "fuel").map((record) => record.date),
        ...normalizeEnergyRecords(chargingRecords, "charging").map((record) => record.date),
        ...normalizeMaintenanceRecords(maintenanceRecords).map((record) => record.date),
    ];
    return {
        fuel,
        charging,
        maintenance,
        fuelCost,
        chargingCost,
        maintenanceCost,
        totalCost: fuelCost + chargingCost + maintenanceCost,
        costComplete: (fuel.recordCount === 0 || fuel.costComplete)
            && (charging.recordCount === 0 || charging.costComplete)
            && (maintenance.recordCount === 0 || maintenance.costRecordCount === maintenance.recordCount),
        eventCount: fuel.recordCount + charging.recordCount + maintenance.recordCount,
        latestDate: allDates.sort()[allDates.length - 1],
    };
}

function finiteNonNegative(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function finitePositive(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validDate(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return false;
    const day = value.slice(0, 10);
    const parsed = new Date(`${day}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

function validOptionalDate(value: unknown): value is string | undefined {
    return value === undefined || validDate(value);
}

/** 仅保留可参与统计的记录，并按日期、录入时刻排序。 */
export function normalizeMaintenanceRecords(records: readonly MaintenanceRecord[]): MaintenanceRecord[] {
    return records
        .filter((record) =>
            typeof record?.category === "string" && record.category.trim().length > 0
            && validDate(record.date)
            && finitePositive(record.odometer)
            && (record.cost === undefined || finiteNonNegative(record.cost))
            && validOptionalDate(record.nextDate)
            && (record.nextOdometer === undefined || finitePositive(record.nextOdometer)),
        )
        .map((record) => ({ ...record, category: record.category.trim() }))
        .sort((a, b) => a.date.localeCompare(b.date) || String(a.at ?? "").localeCompare(String(b.at ?? "")));
}

/**
 * 汇总维护费用和下次提醒。
 *
 * `asOfDate` 与 `currentOdometer` 只用于过滤已经过期的提醒；省略里程时，
 * 仍会返回最近的未来日期和里程阈值，供页面显示“待安排”状态。
 */
export function calculateMaintenanceStats(
    records: readonly MaintenanceRecord[],
    asOfDate = new Date().toISOString().slice(0, 10),
    currentOdometer?: number,
): MaintenanceStats {
    const valid = normalizeMaintenanceRecords(records);
    const byCategory: Record<string, MaintenanceCategoryStats> = {};
    let totalCost = 0;
    let costRecordCount = 0;
    for (const record of valid) {
        const bucket = byCategory[record.category] ?? { count: 0, cost: 0 };
        bucket.count += 1;
        if (record.cost !== undefined) {
            bucket.cost += record.cost;
            totalCost += record.cost;
            costRecordCount += 1;
        }
        byCategory[record.category] = bucket;
    }

    const dateDue = valid
        .map((record) => record.nextDate)
        .filter((date): date is string => !!date && date >= asOfDate)
        .sort()[0];
    const overdueDateValues = valid
        .map((record) => record.nextDate)
        .filter((date): date is string => !!date && date < asOfDate)
        .sort();
    const odometerDue = valid
        .map((record) => record.nextOdometer)
        .filter((odometer): odometer is number =>
            odometer !== undefined && (currentOdometer === undefined || odometer >= currentOdometer),
        )
        .sort((a, b) => a - b)[0];
    const overdueOdometerValues = currentOdometer === undefined
        ? []
        : valid
            .map((record) => record.nextOdometer)
            .filter((odometer): odometer is number => odometer !== undefined && odometer < currentOdometer)
            .sort((a, b) => b - a);

    return {
        recordCount: valid.length,
        costRecordCount,
        totalCost,
        averageCost: costRecordCount > 0 ? totalCost / costRecordCount : undefined,
        byCategory,
        latest: valid.length > 0 ? valid[valid.length - 1] : undefined,
        nextDate: dateDue,
        nextOdometer: odometerDue,
        overdueDate: overdueDateValues.length > 0 ? overdueDateValues[overdueDateValues.length - 1] : undefined,
        overdueOdometer: overdueOdometerValues[0],
    };
}
