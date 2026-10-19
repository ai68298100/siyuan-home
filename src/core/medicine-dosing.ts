/**
 * 家庭用药剂量追踪与剩余药量消耗预警（§16/§17 298波）：
 * 依据药箱（medicine）台账中的库存量、有效期与医嘱用法用量（每日频次与每次剂量），
 * 自动测算预计可用天数、断药耗尽日，并判定效期倒挂（吃完前已过期），构建用药供给预警。
 * 纯函数，无思源/DOM 强依赖，100% 可单元测试。
 */
import type { AvRow } from "./siyuan";

export type SupplyStatus = "out_of_stock" | "critical" | "warning" | "sufficient" | "unknown";

export interface DosingInstruction {
    timesPerDay: number;
    amountPerTime: number;
    unit: string;
    dailyConsumption: number;
    raw: string;
}

export interface MedicineSupplyItem {
    id: string;
    name: string;
    member?: string;
    currentStock: number;
    dosing?: DosingInstruction;
    daysRemaining?: number;
    estimatedRunoutDate?: string;
    expiryDate?: string;
    daysUntilExpiry?: number;
    isExpiringBeforeRunout: boolean;
    status: SupplyStatus;
    note?: string;
}

export interface MedicineSupplyReport {
    totalActiveCount: number;
    outOfStockCount: number;
    criticalCount: number;   // <= 7 天
    warningCount: number;    // <= 30 天
    sufficientCount: number; // > 30 天
    expiringBeforeRunoutCount: number;
    items: MedicineSupplyItem[];
}

function cellText(v: any): string {
    return String(v?.text?.content ?? v?.block?.content ?? "").trim();
}

function cellNumber(v: any): number | undefined {
    return v?.number?.isNotEmpty && typeof v.number.content === "number" ? v.number.content : undefined;
}

function cellDate(v: any): string {
    if (v?.date?.isNotEmpty && v.date.content) {
        const d = new Date(v.date.content);
        if (!isNaN(d.getTime())) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        }
    }
    return String(v?.text?.content ?? "").trim();
}

/**
 * 计算两个 YYYY-MM-DD 日期的相隔天数 (target - base)
 */
export function diffCalendarDays(targetDateStr: string, baseDateStr: string): number {
    const p1 = targetDateStr.split("-").map(Number);
    const p2 = baseDateStr.split("-").map(Number);
    if (p1.length < 3 || p2.length < 3) return 0;
    const d1 = new Date(p1[0], p1[1] - 1, p1[2]);
    const d2 = new Date(p2[0], p2[1] - 1, p2[2]);
    return Math.round((d1.getTime() - d2.getTime()) / (24 * 3600 * 1000));
}

/**
 * 依据基准日期向后累加 N 天，返回 YYYY-MM-DD
 */
export function addDaysToDate(baseDateStr: string, days: number): string {
    const p = baseDateStr.split("-").map(Number);
    if (p.length < 3) return baseDateStr;
    const d = new Date(p[0], p[1] - 1, p[2]);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function getTodayStr(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/**
 * 从医嘱/用法用量自由文本中解析每日频次与每次剂量
 * 支持常见中文格式：
 * - "一日3次，每次2片"
 * - "每日2次，每次1粒"
 * - "早晚各1粒"
 * - "每日一次，每次10ml"
 * - "每8小时一次，每次1片"
 * - "隔日一次，每次1片"
 */
const U = "(?:片|粒|颗|袋|包|支|丸|瓶|滴|ml|毫升|g|克)";
const R_MORNING = new RegExp(`早晚各(\\d+(?:\\.\\d+)?)\\s*(${U})?`);
const R_DAILY = new RegExp(`(?:[一每1234567890]日|每天|每日)(\\d+)次.*?(?:每次|每次服|次服)(\\d+(?:\\.\\d+)?)\\s*(${U})?`);
const R_ONCE = new RegExp(`(?:每日一次|每天一次|每日1次|每天1次|每日|每天).*?(?:每次|每次服)(\\d+(?:\\.\\d+)?)\\s*(${U})?`);
const R_HOURS = new RegExp(`每(\\d+)小时一次.*?(?:每次|每次服)(\\d+(?:\\.\\d+)?)\\s*(${U})?`);
const R_ALT = new RegExp(`隔日一次.*?(?:每次|每次服)(\\d+(?:\\.\\d+)?)\\s*(${U})?`);

function dosing(timesPerDay: number, amountPerTime: number, unit: string, raw: string): DosingInstruction {
    return {
        timesPerDay,
        amountPerTime,
        unit,
        dailyConsumption: Math.round(timesPerDay * amountPerTime * 100) / 100,
        raw,
    };
}

/**
 * 从医嘱/用法用量自由文本中解析每日频次与每次剂量
 * 支持："一日3次，每次2片" / "早晚各1粒" / "每日一次，每次10ml" / "每8小时一次，每次1片" / "隔日一次，每次1片"
 */
export function parseDosingInstructions(rawText: string): DosingInstruction | undefined {
    if (!rawText || typeof rawText !== "string") return undefined;
    const str = rawText.trim().replace(/\s+/g, "");
    const raw = rawText.trim();

    let m = str.match(R_MORNING);
    if (m) return dosing(2, parseFloat(m[1]), m[2] || "片", raw);

    m = str.match(R_DAILY);
    if (m) return dosing(parseInt(m[1], 10), parseFloat(m[2]), m[3] || "片", raw);

    m = str.match(R_ONCE);
    if (m) return dosing(1, parseFloat(m[1]), m[2] || "片", raw);

    m = str.match(R_HOURS);
    if (m) {
        const hours = parseInt(m[1], 10);
        return dosing(hours > 0 ? Math.round(24 / hours) : 1, parseFloat(m[2]), m[3] || "片", raw);
    }

    m = str.match(R_ALT);
    if (m) return dosing(0.5, parseFloat(m[1]), m[2] || "片", raw);

    return undefined;
}

/**
 * 测算单味药品的可用天数与断药耗尽情况
 */
export function calculateMedicineSupply(
    currentStock: number,
    dosing?: DosingInstruction,
    options?: {
        today?: string;
        expiryDate?: string;
    },
): {
    daysRemaining?: number;
    estimatedRunoutDate?: string;
    daysUntilExpiry?: number;
    isExpiringBeforeRunout: boolean;
    status: SupplyStatus;
} {
    const today = options?.today || getTodayStr();

    if (currentStock <= 0) {
        return {
            daysRemaining: 0,
            estimatedRunoutDate: today,
            isExpiringBeforeRunout: false,
            status: "out_of_stock",
        };
    }

    if (!dosing || dosing.dailyConsumption <= 0) {
        return {
            isExpiringBeforeRunout: false,
            status: "unknown",
        };
    }

    const daysRemaining = Math.floor(currentStock / dosing.dailyConsumption);
    const estimatedRunoutDate = addDaysToDate(today, daysRemaining);

    let daysUntilExpiry: number | undefined;
    let isExpiringBeforeRunout = false;

    if (options?.expiryDate && options.expiryDate !== "—") {
        daysUntilExpiry = diffCalendarDays(options.expiryDate, today);
        if (daysUntilExpiry < daysRemaining && daysUntilExpiry >= 0) {
            isExpiringBeforeRunout = true;
        }
    }

    let status: SupplyStatus;
    if (daysRemaining <= 7) {
        status = "critical";
    } else if (daysRemaining <= 30) {
        status = "warning";
    } else {
        status = "sufficient";
    }

    return {
        daysRemaining,
        estimatedRunoutDate,
        daysUntilExpiry,
        isExpiringBeforeRunout,
        status,
    };
}

/**
 * 批量汇总药箱药品用药消耗与断药预警报告
 */
export function evaluateMedicineSupplyReport(
    rows: AvRow[],
    cols: Record<string, string>,
    options?: {
        today?: string;
        defaultDailyConsumption?: number; // 未填用法时可选默认值（如 1）
    },
): MedicineSupplyReport {
    const today = options?.today || getTodayStr();
    const items: MedicineSupplyItem[] = [];

    let outOfStock = 0;
    let critical = 0;
    let warning = 0;
    let sufficient = 0;
    let expiringBeforeRunout = 0;

    for (const row of rows) {
        const name = (cols.name && cellText(row.cells[cols.name])) || "";
        if (!name || name === "—") continue;

        const stockVal = cols.stock_qty ? cellNumber(row.cells[cols.stock_qty]) : undefined;
        const currentStock = stockVal !== undefined ? stockVal : 0;
        const expiryDate = cols.expiry ? cellDate(row.cells[cols.expiry]) : undefined;
        const member = cols.member ? cellText(row.cells[cols.member]) : undefined;
        const note = cols.note ? cellText(row.cells[cols.note]) : undefined;

        // 尝试从 note 或单独用法字段中解析用法用量
        let dosing = note ? parseDosingInstructions(note) : undefined;
        if (!dosing && options?.defaultDailyConsumption && currentStock > 0) {
            dosing = {
                timesPerDay: 1,
                amountPerTime: options.defaultDailyConsumption,
                unit: "片",
                dailyConsumption: options.defaultDailyConsumption,
                raw: `默认日服 ${options.defaultDailyConsumption} 片`,
            };
        }

        const supply = calculateMedicineSupply(currentStock, dosing, {
            today,
            expiryDate,
        });

        if (supply.status === "out_of_stock") outOfStock++;
        else if (supply.status === "critical") critical++;
        else if (supply.status === "warning") warning++;
        else if (supply.status === "sufficient") sufficient++;

        if (supply.isExpiringBeforeRunout) {
            expiringBeforeRunout++;
        }

        items.push({
            id: row.itemID,
            name,
            member: member && member !== "—" ? member : undefined,
            currentStock,
            dosing,
            daysRemaining: supply.daysRemaining,
            estimatedRunoutDate: supply.estimatedRunoutDate,
            expiryDate,
            daysUntilExpiry: supply.daysUntilExpiry,
            isExpiringBeforeRunout: supply.isExpiringBeforeRunout,
            status: supply.status,
            note: note && note !== "—" ? note : undefined,
        });
    }

    // 排序：缺药与紧迫断药排在最前，其次为临期药，充足排在最后
    items.sort((a, b) => {
        const rank = (s: SupplyStatus) => {
            switch (s) {
                case "out_of_stock": return 0;
                case "critical": return 1;
                case "warning": return 2;
                case "sufficient": return 3;
                default: return 4;
            }
        };
        const rDiff = rank(a.status) - rank(b.status);
        if (rDiff !== 0) return rDiff;
        const d1 = a.daysRemaining ?? 9999;
        const d2 = b.daysRemaining ?? 9999;
        return d1 - d2;
    });

    return {
        totalActiveCount: items.length,
        outOfStockCount: outOfStock,
        criticalCount: critical,
        warningCount: warning,
        sufficientCount: sufficient,
        expiringBeforeRunoutCount: expiringBeforeRunout,
        items,
    };
}

/**
 * 格式化药箱用药供给分析简报
 */
export function formatMedicineSupplyReportText(report: MedicineSupplyReport): string {
    const lines = [
        `【用药供给预警】总计:${report.totalActiveCount} 缺药/紧迫:${report.outOfStockCount + report.criticalCount} 倒挂:${report.expiringBeforeRunoutCount}`,
    ];
    for (const it of report.items) {
        const tag = it.status === "out_of_stock" ? "❌缺药" : it.status === "critical" ? "🚨紧迫" : it.status === "warning" ? "⚠️预警" : "✔充足";
        const rem = it.daysRemaining !== undefined ? `剩${it.daysRemaining}天` : "用量未定";
        const inv = it.isExpiringBeforeRunout ? "(先过期)" : "";
        lines.push(`${tag} ${it.name} 存:${it.currentStock} ${rem}${inv}`);
    }
    return lines.join("\n");
}

export interface MedicineSupplyDialogOptions {
    report: MedicineSupplyReport;
    t: (k: string) => string;
    DialogCls: any;
    showMessageFn: any;
}

export function openMedicineSupplyDialog(options: MedicineSupplyDialogOptions): void {
    const { report, t, DialogCls, showMessageFn } = options;

    const dlg = new DialogCls({
        title: t("ledger.medicineSupplyTitle"),
        content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-med-supply-body"></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-med-supply-close">${t("close")}</button><button class="b3-button" id="lv-med-supply-copy">${t("ledger.medicineSupplyCopy")}</button></div>`,
        width: "600px",
    });

    const body = dlg.element.querySelector("#lv-med-supply-body") as HTMLElement;
    const copyBtn = dlg.element.querySelector("#lv-med-supply-copy") as HTMLButtonElement;
    (dlg.element.querySelector("#lv-med-supply-close") as HTMLButtonElement).onclick = () => dlg.destroy();

    const metrics = document.createElement("div");
    metrics.style.cssText = "display:grid;grid-template-columns:repeat(4, 1fr);gap:8px";
    const makeBox = (cap: string, v: string | number, sub?: string, color?: string) => {
        const d = document.createElement("div");
        d.className = "lv-metric-item";
        d.innerHTML = `<span class="lv-caption">${cap}</span><b class="lv-num" style="font-size:16px;${color ? `color:${color}` : ""}">${v}</b>${sub ? `<span class="lv-caption">${sub}</span>` : ""}`;
        return d;
    };

    metrics.append(
        makeBox(t("ledger.medicineSupplyTotal"), report.totalActiveCount),
        makeBox(t("ledger.medicineSupplyCritical"), report.outOfStockCount + report.criticalCount, `缺 ${report.outOfStockCount} · ≤7天 ${report.criticalCount}`, "var(--lv-warn)"),
        makeBox(t("ledger.medicineSupplyWarning"), report.warningCount, "≤30天用量", "var(--lv-amber, #e67e22)"),
        makeBox(t("ledger.medicineSupplyInverted"), report.expiringBeforeRunoutCount, t("ledger.medicineSupplyInvertBadge")),
    );
    body.appendChild(metrics);

    const listSec = document.createElement("div");
    listSec.style.cssText = "display:flex;flex-direction:column;gap:6px;margin-top:4px";

    for (const item of report.items) {
        const rowEl = document.createElement("div");
        rowEl.className = "lv-metric-item";
        rowEl.style.cssText = "flex-direction:row;align-items:center;justify-content:space-between;padding:8px 12px;font-size:12px";

        const left = document.createElement("div");
        left.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0;flex:1";

        let badgeClass = "green";
        let badgeText = "充足";
        if (item.status === "out_of_stock") {
            badgeClass = "red";
            badgeText = t("ledger.medicineOutOfStock");
        } else if (item.status === "critical") {
            badgeClass = "red";
            badgeText = "紧迫断药";
        } else if (item.status === "warning") {
            badgeClass = "yellow";
            badgeText = "临期关注";
        } else if (item.status === "unknown") {
            badgeClass = "gray";
            badgeText = "用量未填";
        }

        const badge = document.createElement("span");
        badge.className = `lv-badge ${badgeClass}`;
        badge.textContent = badgeText;

        const nameSpan = document.createElement("b");
        nameSpan.style.cssText = "color:var(--lv-tx)";
        nameSpan.textContent = item.name;

        const doseSpan = document.createElement("span");
        doseSpan.className = "lv-caption";
        doseSpan.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px";
        doseSpan.textContent = item.dosing ? t("ledger.medicineDailyDose").replace("${dose}", `${item.dosing.dailyConsumption}${item.dosing.unit}`) : "（未录医嘱）";

        left.append(badge, nameSpan, doseSpan);

        if (item.isExpiringBeforeRunout) {
            const invertBadge = document.createElement("span");
            invertBadge.className = "lv-badge orange";
            invertBadge.textContent = t("ledger.medicineSupplyInvertBadge");
            left.appendChild(invertBadge);
        }

        const right = document.createElement("div");
        right.style.cssText = "text-align:right;flex-shrink:0";
        const daysDesc = item.daysRemaining !== undefined
            ? t("ledger.medicineDaysSupply").replace("${n}", String(item.daysRemaining))
            : `库存 ${item.currentStock}`;
        const runoutDesc = item.estimatedRunoutDate
            ? t("ledger.medicineRunoutDate").replace("${date}", item.estimatedRunoutDate)
            : (item.expiryDate ? `效期: ${item.expiryDate}` : "");

        right.innerHTML = `<div><b class="lv-num" style="color:${item.status === 'out_of_stock' || item.status === 'critical' ? 'var(--lv-warn)' : 'var(--lv-tx)'}">${daysDesc}</b></div><span class="lv-caption">${runoutDesc}</span>`;

        rowEl.append(left, right);
        listSec.appendChild(rowEl);
    }

    body.appendChild(listSec);

    copyBtn.onclick = async () => {
        const text = formatMedicineSupplyReportText(report);
        try {
            await navigator.clipboard.writeText(text);
            showMessageFn(t("ledger.medicineSupplyCopied"), 2500, "info");
        } catch {
            showMessageFn(t("ledger.copyAsImageFail"), 4000, "error");
        }
    };
}
