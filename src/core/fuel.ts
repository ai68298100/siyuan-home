/**
 * 车辆能源记录与油耗/电耗统计。
 *
 * 记录按车辆台账行归属，建议持久化到 rowlogs.json 的 fuelings/chargings
 * 分组。统计采用“满油/满充到下一次满油/满充”的主口径；当用户没有标记
 * 满油/满充时，退化为相邻记录的估算值，并在结果中明确标记 estimated。
 * 本文件不依赖思源 API，便于页面、导入和单测共用。
 */

export type EnergyKind = "fuel" | "charging";

/** 油品枚举保持开放字符串，避免不同国家/车型新增油品时需要迁移数据库。 */
export type FuelGrade = "92" | "95" | "98" | "0" | "diesel" | "other" | (string & {});

export type ChargingMode = "ac" | "dc" | "other" | (string & {});

/** 一次加油或充电记录。quantity 的单位由 kind 决定：fuel=升，charging=千瓦时。 */
export interface EnergyRecord {
    kind: EnergyKind;
    date: string;
    /** 录入时刻，用于同日多次补能的稳定排序。 */
    at?: string;
    /** 本次加油/充电时的车辆总里程（公里）。 */
    odometer: number;
    /** 加油量（升）或充电量（kWh）。 */
    quantity: number;
    /** 单价（元/升或元/kWh）。未知时可不填。 */
    unitPrice?: number;
    /** 总价（元）。不填时由 quantity × unitPrice 推导。 */
    totalCost?: number;
    /** 是否加满/充满。用于准确的满量法油耗计算。 */
    full?: boolean;
    fuelGrade?: FuelGrade;
    chargingMode?: ChargingMode;
    station?: string;
    note?: string;
}

export interface EnergyInterval {
    fromDate: string;
    toDate: string;
    fromOdometer: number;
    toOdometer: number;
    distance: number;
    quantity: number;
    cost: number;
    /** 区间内费用是否完整；false 时 cost 仅是已知部分和。 */
    costKnown: boolean;
    /** 没有完整满油/满充边界时的相邻记录估算。 */
    estimated: boolean;
    consumptionPer100Km: number;
    costPer100Km: number;
}

export interface EnergyStats {
    kind: EnergyKind;
    /** 原始有效记录数（不含非法数量/里程/日期）。 */
    recordCount: number;
    /** 有效记录中填有费用的条数。 */
    costRecordCount: number;
    /** 每条记录都有费用时为 true；否则 totalCost 是已记录费用小计。 */
    costComplete: boolean;
    /** 所有有效记录的购买/充电总量。 */
    totalQuantity: number;
    /** 统计区间实际覆盖的总量；满量法会排除首个满量点之前的未闭合区间。 */
    coveredQuantity: number;
    totalCost: number;
    totalDistance: number;
    /** 按已填写费用的记录计算加权平均单价；costComplete=false 时仅代表已填写记录。 */
    averageUnitPrice?: number;
    consumptionPer100Km?: number;
    costPer100Km?: number;
    /** full = 至少有一个完整满量区间；estimated = 相邻记录估算。 */
    method: "full" | "estimated";
    intervals: EnergyInterval[];
    warnings: EnergyWarning[];
}

export type EnergyWarning =
    | "insufficient_records"
    | "estimated_consumption"
    | "missing_costs"
    | "incomplete_initial_interval"
    | "incomplete_latest_interval"
    | "non_increasing_odometer";

function finitePositive(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validDate(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return false;
    const day = value.slice(0, 10);
    const parsed = new Date(`${day}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

function recordCost(record: EnergyRecord): number | undefined {
    if (typeof record.totalCost === "number" && Number.isFinite(record.totalCost) && record.totalCost >= 0) {
        return record.totalCost;
    }
    if (typeof record.unitPrice === "number" && Number.isFinite(record.unitPrice) && record.unitPrice >= 0) {
        return record.quantity * record.unitPrice;
    }
    return undefined;
}

function sortRecords(records: readonly EnergyRecord[], kind: EnergyKind): EnergyRecord[] {
    return records
        .filter((r) => r.kind === kind && validDate(r.date) && finitePositive(r.odometer) && finitePositive(r.quantity))
        .map((r) => ({ ...r }))
        // 同日优先按录入时刻排序；旧记录无 at 时依赖稳定排序保留数组先后。
        .sort((a, b) => a.date.localeCompare(b.date) || String(a.at ?? "").localeCompare(String(b.at ?? "")));
}

function makeInterval(from: EnergyRecord, to: EnergyRecord, quantity: number, cost: number, costKnown: boolean, estimated: boolean): EnergyInterval | undefined {
    const distance = to.odometer - from.odometer;
    if (!(distance > 0) || !(quantity > 0)) return undefined;
    return {
        fromDate: from.date,
        toDate: to.date,
        fromOdometer: from.odometer,
        toOdometer: to.odometer,
        distance,
        quantity,
        cost,
        costKnown,
        estimated,
        consumptionPer100Km: (quantity / distance) * 100,
        costPer100Km: (cost / distance) * 100,
    };
}

/**
 * 计算某一车辆某种能源的统计。
 *
 * 满量法：从一个 full 记录开始，累积后续记录的数量和费用，到下一个
 * full 记录时结算。没有两个 full 记录时使用相邻记录估算，避免页面显示
 * “暂无数据”而用户又不知道需要如何录入。
 */
export function calculateEnergyStats(records: readonly EnergyRecord[], kind: EnergyKind): EnergyStats {
    const valid = sortRecords(records, kind);
    const costs = valid.map(recordCost);
    const totalQuantity = valid.reduce((sum, r) => sum + r.quantity, 0);
    const totalCost = costs.reduce((sum, value) => sum + (value ?? 0), 0);
    const costRecordCount = costs.filter((value) => value !== undefined).length;

    const fullIntervals: EnergyInterval[] = [];
    let baseline: EnergyRecord | undefined;
    let pendingQuantity = 0;
    let pendingCost = 0;
    let pendingCostsComplete = true;
    let pendingRecordCount = 0;
    let hadRecordsBeforeBaseline = false;
    let nonIncreasingOdometer = false;
    let previousRecord: EnergyRecord | undefined;

    for (const record of valid) {
        if (previousRecord && record.odometer <= previousRecord.odometer) {
            nonIncreasingOdometer = true;
            // 里程表回退/重置时切断当前区间，避免把错误距离用于油耗。
            baseline = record.full ? record : undefined;
            pendingQuantity = 0;
            pendingCost = 0;
            pendingCostsComplete = true;
            pendingRecordCount = 0;
            previousRecord = record;
            continue;
        }
        if (!baseline) {
            if (record.full) baseline = record;
            else hadRecordsBeforeBaseline = true;
            previousRecord = record;
            continue;
        }
        pendingQuantity += record.quantity;
        pendingRecordCount += 1;
        const cost = recordCost(record);
        if (cost !== undefined) {
            pendingCost += cost;
        } else {
            pendingCostsComplete = false;
        }
        if (record.full) {
            const interval = makeInterval(baseline, record, pendingQuantity, pendingCost, pendingCostsComplete, false);
            if (interval) fullIntervals.push(interval);
            else if (record.odometer <= baseline.odometer) nonIncreasingOdometer = true;
            baseline = record;
            pendingQuantity = 0;
            pendingCost = 0;
            pendingCostsComplete = true;
            pendingRecordCount = 0;
        }
        previousRecord = record;
    }

    let intervals = fullIntervals;
    let method: EnergyStats["method"] = "full";
    if (intervals.length === 0 && !nonIncreasingOdometer) {
        method = "estimated";
        intervals = [];
        for (let i = 1; i < valid.length; i++) {
            const current = valid[i];
            const cost = recordCost(current) ?? 0;
            const interval = makeInterval(valid[i - 1], current, current.quantity, cost, recordCost(current) !== undefined, true);
            if (interval) intervals.push(interval);
            else if (current.odometer <= valid[i - 1].odometer) nonIncreasingOdometer = true;
        }
    }

    const totalDistance = intervals.reduce((sum, interval) => sum + interval.distance, 0);
    const coveredQuantity = intervals.reduce((sum, interval) => sum + interval.quantity, 0);
    const coveredCost = intervals.reduce((sum, interval) => sum + interval.cost, 0);
    const allIntervalCostsKnown = intervals.length > 0 && intervals.every((interval) => interval.costKnown);
    const weightedQuantity = valid.reduce((sum, record, index) => sum + (costs[index] !== undefined ? record.quantity : 0), 0);
    const costComplete = costRecordCount === valid.length && valid.length > 0;
    const averageUnitPrice = weightedQuantity > 0 ? totalCost / weightedQuantity : undefined;
    const warnings: EnergyWarning[] = [];
    if (valid.length < 2) warnings.push("insufficient_records");
    if (method === "estimated") warnings.push("estimated_consumption");
    if (costRecordCount < valid.length) warnings.push("missing_costs");
    if (hadRecordsBeforeBaseline && fullIntervals.length > 0) warnings.push("incomplete_initial_interval");
    if (pendingRecordCount > 0 && fullIntervals.length > 0) warnings.push("incomplete_latest_interval");
    if (nonIncreasingOdometer) warnings.push("non_increasing_odometer");

    return {
        kind,
        recordCount: valid.length,
        costRecordCount,
        costComplete,
        totalQuantity,
        coveredQuantity,
        totalCost,
        totalDistance,
        averageUnitPrice,
        consumptionPer100Km: totalDistance > 0 ? (coveredQuantity / totalDistance) * 100 : undefined,
        costPer100Km: allIntervalCostsKnown && totalDistance > 0 ? (coveredCost / totalDistance) * 100 : undefined,
        method,
        intervals,
        warnings,
    };
}

/** 仅保留合法值并按日期排序，供趋势图和导出共用。 */
export function normalizeEnergyRecords(records: readonly EnergyRecord[], kind: EnergyKind): EnergyRecord[] {
    return sortRecords(records, kind);
}

