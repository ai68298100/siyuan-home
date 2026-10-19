/**
 * 家庭公用事业费与能源用水电燃气阶梯用量折算（§16/§17 299波）：
 * 依据抄表读数（MeterEntry）的实际用量（度/立方米），按阶梯累进分档模型测算
 * 各档位用量拆分、预估费用账单、下一阶梯剩余余量与高能耗加价预警。
 * 纯函数，无思源/DOM 强依赖，100% 可单元测试。
 */
import type { MeterEntry, RowLogs } from "./rowlog";
import type { AvRow } from "./siyuan";
import type { AvCellLike } from "./avcell";
import { formatAmount } from "./format";

export type UtilityType = "electricity" | "water" | "gas";

export interface TierSpec {
    tier: number;
    /** 该阶梯包含的最大累计用量上限（如 260 度，无穷大表示最高档） */
    maxUsage: number;
    /** 该阶梯内每单位单价（元） */
    unitPrice: number;
    label: string;
}

export interface TierBreakdown {
    tier: number;
    label: string;
    usageInTier: number;
    unitPrice: number;
    costInTier: number;
}

export interface TierCalculationResult {
    totalUsage: number;
    totalCost: number;
    currentTier: number;
    breakdowns: TierBreakdown[];
    /** 距离下一更高加价阶梯还剩的额度（处于最高档时为 0） */
    nextTierRemaining: number;
    isHighTier: boolean; // 是否处于第 2 档及以上
    unitLabel: string;
}

export interface PeriodReadingAnalysis {
    date: string;
    reading: number;
    usage: number;
    tier: number;
    estimatedCost: number;
}

export interface UtilityAnalysisReport {
    utilityType: UtilityType;
    unitName: string;
    totalRecordedReadings: number;
    totalUsageSum: number;
    latestPeriodUsage: number;
    averageUsage: number;
    latestCalculation: TierCalculationResult;
    history: PeriodReadingAnalysis[];
}

/** 居民阶梯电价参考标准（以中国典型城市月度标准为基准） */
export const DEFAULT_ELECTRICITY_TIERS: readonly TierSpec[] = [
    { tier: 1, maxUsage: 260, unitPrice: 0.612, label: "基准用电档" },
    { tier: 2, maxUsage: 400, unitPrice: 0.662, label: "适度改善档" },
    { tier: 3, maxUsage: Infinity, unitPrice: 0.912, label: "高能耗累进档" },
];

/** 居民阶梯水价参考标准（按月度用量 m³） */
export const DEFAULT_WATER_TIERS: readonly TierSpec[] = [
    { tier: 1, maxUsage: 18, unitPrice: 3.45, label: "基础生活用水" },
    { tier: 2, maxUsage: 25, unitPrice: 4.83, label: "适度改善用水" },
    { tier: 3, maxUsage: Infinity, unitPrice: 5.83, label: "超额惩罚加价" },
];

/** 居民阶梯燃气参考标准（按月度用量 m³） */
export const DEFAULT_GAS_TIERS: readonly TierSpec[] = [
    { tier: 1, maxUsage: 26, unitPrice: 3.00, label: "基础生活用气" },
    { tier: 2, maxUsage: 55, unitPrice: 3.30, label: "采暖改善用气" },
    { tier: 3, maxUsage: Infinity, unitPrice: 4.20, label: "超额消费用气" },
];

export function getDefaultTiers(type: UtilityType): TierSpec[] {
    switch (type) {
        case "electricity": return [...DEFAULT_ELECTRICITY_TIERS];
        case "water": return [...DEFAULT_WATER_TIERS];
        case "gas": return [...DEFAULT_GAS_TIERS];
    }
}

export function getUtilityUnit(type: UtilityType): string {
    switch (type) {
        case "electricity": return "度";
        case "water": return "m³";
        case "gas": return "m³";
    }
}

/**
 * 依据阶梯模型累进测算指定用量的分段费用与阶梯跨度
 */
export function calculateTieredCost(
    totalUsage: number,
    tiers: TierSpec[],
    unitLabel = "度",
): TierCalculationResult {
    const usage = Math.max(0, Number.isFinite(totalUsage) ? totalUsage : 0);
    const sortedTiers = [...tiers].sort((a, b) => a.tier - b.tier);

    let remaining = usage;
    let accumulatedCost = 0;
    let currentTier = sortedTiers[0]?.tier ?? 1;
    let prevLimit = 0;
    const breakdowns: TierBreakdown[] = [];

    for (const t of sortedTiers) {
        if (remaining <= 0 && breakdowns.length > 0) {
            breakdowns.push({
                tier: t.tier,
                label: t.label,
                usageInTier: 0,
                unitPrice: t.unitPrice,
                costInTier: 0,
            });
            prevLimit = t.maxUsage;
            continue;
        }

        const tierCapacity = t.maxUsage === Infinity ? remaining : t.maxUsage - prevLimit;
        const usedInTier = Math.min(remaining, Math.max(0, tierCapacity));
        const costInTier = Math.round(usedInTier * t.unitPrice * 100) / 100;

        breakdowns.push({
            tier: t.tier,
            label: t.label,
            usageInTier: Math.round(usedInTier * 100) / 100,
            unitPrice: t.unitPrice,
            costInTier,
        });

        accumulatedCost += costInTier;
        remaining = Math.max(0, remaining - usedInTier);
        currentTier = t.tier;
        prevLimit = t.maxUsage;
    }

    // 测算距离下一阶梯还剩多少度
    let nextTierRemaining = 0;
    const currSpec = sortedTiers.find((t) => t.tier === currentTier);
    if (currSpec && currSpec.maxUsage !== Infinity) {
        nextTierRemaining = Math.max(0, Math.round((currSpec.maxUsage - usage) * 100) / 100);
    }

    return {
        totalUsage: Math.round(usage * 100) / 100,
        totalCost: Math.round(accumulatedCost * 100) / 100,
        currentTier,
        breakdowns,
        nextTierRemaining,
        isHighTier: currentTier > 1,
        unitLabel,
    };
}

/**
 * 分析抄表流水（MeterEntry），计算历史用量趋势与最新阶梯账单
 */
export function analyzeMeterReadingsUtility(
    readings: MeterEntry[],
    utilityType: UtilityType = "electricity",
    customTiers?: TierSpec[],
): UtilityAnalysisReport {
    const tiers = customTiers ?? getDefaultTiers(utilityType);
    const unitName = getUtilityUnit(utilityType);

    const validEntries = (readings ?? [])
        .filter((r) => r && r.date && Number.isFinite(r.reading))
        .sort((a, b) => a.date.localeCompare(b.date));

    let totalUsageSum = 0;
    const history: PeriodReadingAnalysis[] = [];

    for (let i = 0; i < validEntries.length; i++) {
        const item = validEntries[i];
        const usage = item.usage !== undefined && item.usage >= 0 ? item.usage : 0;
        totalUsageSum += usage;
        const calc = calculateTieredCost(usage, tiers, unitName);

        history.push({
            date: item.date,
            reading: item.reading,
            usage,
            tier: calc.currentTier,
            estimatedCost: calc.totalCost,
        });
    }

    const latest = history[history.length - 1];
    const latestUsage = latest ? latest.usage : 0;
    const latestCalculation = calculateTieredCost(latestUsage, tiers, unitName);
    const averageUsage = history.length > 0 ? Math.round((totalUsageSum / history.length) * 100) / 100 : 0;

    return {
        utilityType,
        unitName,
        totalRecordedReadings: validEntries.length,
        totalUsageSum: Math.round(totalUsageSum * 100) / 100,
        latestPeriodUsage: latestUsage,
        averageUsage,
        latestCalculation,
        history,
    };
}

/**
 * 格式化阶梯公用事业费用分析简报
 */
export function formatUtilityReportText(report: UtilityAnalysisReport): string {
    const typeLabel = report.utilityType === "electricity" ? "电费" : report.utilityType === "water" ? "水费" : "燃气费";
    const c = report.latestCalculation;
    const lines = [
        `【${typeLabel}阶梯测算】最新:${report.latestPeriodUsage}${report.unitName} 预估:¥${formatAmount(c.totalCost)} (第${c.currentTier}档)`,
    ];
    if (c.isHighTier) {
        lines.push(`🚨已跨入第${c.currentTier}阶梯加价`);
    } else if (c.nextTierRemaining > 0) {
        lines.push(`余量:距下档剩${c.nextTierRemaining}${report.unitName}`);
    }
    for (const b of c.breakdowns) {
        if (b.usageInTier > 0) {
            lines.push(`·第${b.tier}档(${b.label}): ${b.usageInTier}${report.unitName}×¥${b.unitPrice}=¥${formatAmount(b.costInTier)}`);
        }
    }
    return lines.join("\n");
}

export interface UtilityTiersDialogOptions {
    allHouseRows: AvRow[];
    currentLogs: RowLogs;
    ref: { avId?: string; columns?: Record<string, string> };
    t: (k: string) => string;
    DialogCls: new (options: { title: string; content: string; width?: string }) => { element: HTMLElement; destroy: () => void };
    showMessageFn: (message: string, timeout?: number, type?: "info" | "error") => void;
    cellTextFn: (v: AvCellLike | null | undefined, k?: string) => string;
    getEntriesFn: <T>(logs: RowLogs, avId: string, rowId: string, kind: string) => T[];
}

export function openUtilityTiersDialog(options: UtilityTiersDialogOptions): void {
    const { allHouseRows, currentLogs, ref, t, DialogCls, showMessageFn, cellTextFn, getEntriesFn } = options;

    let selectedType: UtilityType = "electricity";
    let selectedRowId = allHouseRows[0].itemID;

    const dlg = new DialogCls({
        title: t("ledger.utilityTiersTitle"),
        content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-util-tiers-body"></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-util-tiers-close">${t("close")}</button><button class="b3-button" id="lv-util-tiers-copy">${t("ledger.utilityCopyReport")}</button></div>`,
        width: "600px",
    });

    const body = dlg.element.querySelector("#lv-util-tiers-body") as HTMLElement;
    const copyBtn = dlg.element.querySelector("#lv-util-tiers-copy") as HTMLButtonElement;
    (dlg.element.querySelector("#lv-util-tiers-close") as HTMLButtonElement).onclick = () => dlg.destroy();

    const render = () => {
        body.replaceChildren();

        const topBar = document.createElement("div");
        topBar.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px";

        const leftSelects = document.createElement("div");
        leftSelects.style.cssText = "display:flex;align-items:center;gap:8px;flex:1";

        const houseSelect = document.createElement("select");
        houseSelect.className = "b3-select";
        houseSelect.style.cssText = "font-size:12px;padding:3px 8px;max-width:180px";
        for (const hr of allHouseRows) {
            const opt = document.createElement("option");
            opt.value = hr.itemID;
            opt.textContent = cellTextFn(hr.cells[ref.columns?.name]);
            if (hr.itemID === selectedRowId) opt.selected = true;
            houseSelect.appendChild(opt);
        }
        houseSelect.onchange = () => { selectedRowId = houseSelect.value; render(); };

        const typeSelect = document.createElement("select");
        typeSelect.className = "b3-select";
        typeSelect.style.cssText = "font-size:12px;padding:3px 8px";
        const typeOptions: { key: UtilityType; label: string }[] = [
            { key: "electricity", label: t("ledger.utilityTypeElectricity") },
            { key: "water", label: t("ledger.utilityTypeWater") },
            { key: "gas", label: t("ledger.utilityTypeGas") },
        ];
        for (const opt of typeOptions) {
            const o = document.createElement("option");
            o.value = opt.key;
            o.textContent = opt.label;
            if (opt.key === selectedType) o.selected = true;
            typeSelect.appendChild(o);
        }
        typeSelect.onchange = () => { selectedType = typeSelect.value as UtilityType; render(); };

        leftSelects.append(houseSelect, typeSelect);
        topBar.appendChild(leftSelects);
        body.appendChild(topBar);

        const readings = getEntriesFn<MeterEntry>(currentLogs, ref.avId, selectedRowId, "meters");

        if (readings.length === 0) {
            const empty = document.createElement("div");
            empty.className = "lv-caption";
            empty.style.cssText = "text-align:center;padding:24px 0";
            empty.textContent = t("ledger.utilityEmptyReadings");
            body.appendChild(empty);
            copyBtn.disabled = true;
            return;
        }
        copyBtn.disabled = false;

        const report = analyzeMeterReadingsUtility(readings, selectedType);

        const metrics = document.createElement("div");
        metrics.style.cssText = "display:grid;grid-template-columns:repeat(4, 1fr);gap:8px";
        const makeBox = (cap: string, v: string | number, sub?: string, color?: string) => {
            const d = document.createElement("div");
            d.className = "lv-metric-item";
            d.innerHTML = `<span class="lv-caption">${cap}</span><b class="lv-num" style="font-size:16px;${color ? `color:${color}` : ""}">${v}</b>${sub ? `<span class="lv-caption">${sub}</span>` : ""}`;
            return d;
        };

        metrics.append(
            makeBox(t("ledger.utilityTotalReadings"), report.totalRecordedReadings, "次抄表"),
            makeBox(t("ledger.utilityAccumulatedUsage"), report.totalUsageSum, report.unitName),
            makeBox(t("ledger.utilityLatestUsage"), report.latestPeriodUsage, report.unitName, "var(--lv-accent)"),
            makeBox(t("ledger.utilityEstimatedBill"), `¥${formatAmount(report.latestCalculation.totalCost)}`, `第 ${report.latestCalculation.currentTier} 阶梯`, "var(--lv-warn)"),
        );
        body.appendChild(metrics);

        if (report.latestCalculation.isHighTier) {
            const warnBox = document.createElement("div");
            warnBox.style.cssText = "padding:8px 12px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-warn);font-size:12px;color:var(--lv-warn)";
            warnBox.textContent = t("ledger.utilityTierWarning").replace("${tier}", String(report.latestCalculation.currentTier));
            body.appendChild(warnBox);
        } else if (report.latestCalculation.nextTierRemaining > 0) {
            const safeBox = document.createElement("div");
            safeBox.style.cssText = "padding:8px 12px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-line);font-size:12px;color:var(--lv-tx-2)";
            safeBox.textContent = t("ledger.utilityTierSafe").replace("${n}", String(report.latestCalculation.nextTierRemaining)).replace("${unit}", report.unitName);
            body.appendChild(safeBox);
        }

        const breakdownSec = document.createElement("div");
        breakdownSec.style.cssText = "display:flex;flex-direction:column;gap:6px;margin-top:2px";
        breakdownSec.innerHTML = `<span class="ft__on-surface" style="font-weight:600;font-size:12px">${t("ledger.utilityBreakdowns")}</span>`;

        for (const b of report.latestCalculation.breakdowns) {
            const item = document.createElement("div");
            item.className = "lv-metric-item";
            item.style.cssText = "flex-direction:row;align-items:center;justify-content:space-between;padding:6px 12px;font-size:12px";
            item.innerHTML = `<span style="font-weight:500">第${b.tier}阶梯（${b.label}）: ${b.usageInTier} ${report.unitName} × ¥${b.unitPrice}</span><b class="lv-num" style="color:var(--lv-tx)">¥${formatAmount(b.costInTier)}</b>`;
            breakdownSec.appendChild(item);
        }
        body.appendChild(breakdownSec);

        copyBtn.onclick = async () => {
            const text = formatUtilityReportText(report);
            try {
                await navigator.clipboard.writeText(text);
                showMessageFn(t("ledger.utilityCopied"), 2500, "info");
            } catch {
                showMessageFn(t("ledger.copyAsImageFail"), 4000, "error");
            }
        };
    };

    render();
}
