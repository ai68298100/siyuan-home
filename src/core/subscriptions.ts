/**
 * 会员与周期订阅支出折算与统计（§16/288波）：
 * 统计有效会员、订阅与预付费服务的周期金额，将不同周期（日/周/月/季/年）
 * 统一年化与月化折算，提供月均开销、年化总支出、自动续费占比及按金额排序清单。
 */
import type { AvRow } from "@/core/siyuan";
import { formatAmount } from "./format";

export type SubscriptionCycle = "day" | "week" | "month" | "quarter" | "half_year" | "year";

export interface SubscriptionItemStat {
    id: string;
    name: string;
    rawAmount: number;
    cycle: string;
    monthlyCost: number;
    annualCost: number;
    autoRenew: boolean;
    category?: string;
    seatRole?: string;
    nextPay?: string;
}

export interface SubscriptionCategoryStat {
    category: string;
    monthlyCost: number;
    annualCost: number;
    count: number;
}

export interface SubscriptionOverviewReport {
    activeCount: number;
    totalMonthlyCost: number;
    totalAnnualCost: number;
    autoRenewCount: number;
    autoRenewRate: number; // 0-100 百分比
    items: SubscriptionItemStat[];
    categoryBreakdown: SubscriptionCategoryStat[];
}

function cellString(row: AvRow, keyID?: string): string | undefined {
    if (!keyID) return undefined;
    const cell = row.cells?.[keyID];
    if (!cell) return undefined;
    if (cell.type === "text" && cell.text?.content) return String(cell.text.content).trim();
    if (cell.type === "block" && cell.block?.content) return String(cell.block.content).trim();
    if (cell.type === "date" && cell.date?.content) return String(cell.date.content).trim();
    if (cell.type === "select" && cell.select?.content) return String(cell.select.content).trim();
    return undefined;
}

function cellNumber(row: AvRow, keyID?: string): number | undefined {
    if (!keyID) return undefined;
    const cell = row.cells?.[keyID];
    if (!cell) return undefined;
    if (cell.type === "number" && typeof cell.number?.content === "number" && Number.isFinite(cell.number.content)) {
        return cell.number.content;
    }
    return undefined;
}

function cellBoolean(row: AvRow, keyID?: string): boolean {
    if (!keyID) return false;
    const cell = row.cells?.[keyID];
    return cell?.type === "checkbox" ? !!cell.checkbox?.checked : false;
}

/**
 * 将任意周期金额折算为月均与年化金额
 */
export function normalizeCycleCost(amount: number, cycle: string | undefined): { monthly: number; annual: number } {
    if (!Number.isFinite(amount) || amount <= 0) {
        return { monthly: 0, annual: 0 };
    }

    const c = String(cycle ?? "month").toLowerCase().trim();

    let annual = 0;
    let monthly = 0;

    switch (c) {
        case "day":
            annual = amount * 365;
            monthly = (amount * 365) / 12;
            break;
        case "week":
            annual = amount * 52;
            monthly = (amount * 52) / 12;
            break;
        case "month":
            annual = amount * 12;
            monthly = amount;
            break;
        case "quarter":
            annual = amount * 4;
            monthly = amount / 3;
            break;
        case "half_year":
        case "6month":
            annual = amount * 2;
            monthly = amount / 6;
            break;
        case "year":
        default:
            annual = amount;
            monthly = amount / 12;
            break;
    }

    return {
        monthly: Math.round(monthly * 100) / 100,
        annual: Math.round(annual * 100) / 100,
    };
}

/**
 * 汇总计算全部有效会员与订阅的支出折算报告
 */
export function calculateSubscriptionStats(
    rows: AvRow[],
    cols: Record<string, string>,
): SubscriptionOverviewReport {
    const items: SubscriptionItemStat[] = [];
    const catMap = new Map<string, { monthlyCost: number; annualCost: number; count: number }>();

    let totalMonthlyCost = 0;
    let totalAnnualCost = 0;
    let autoRenewCount = 0;

    for (const row of rows) {
        const status = cellString(row, cols.status) || "active";
        // 排除已过期与已退款项目
        if (status === "m_expired" || status === "refunded") {
            continue;
        }

        const name = cellString(row, cols.name) || "未命名服务";
        const amount = cellNumber(row, cols.amount) ?? 0;
        const cycle = cellString(row, cols.cycle) || "year";
        const autoRenew = cellBoolean(row, cols.auto_renew);
        const category = cellString(row, cols.category) || "subscription";
        const seatRole = cellString(row, cols.seat_role);
        const nextPay = cellString(row, cols.next_pay);

        const { monthly, annual } = normalizeCycleCost(amount, cycle);

        if (autoRenew) {
            autoRenewCount++;
        }

        totalMonthlyCost += monthly;
        totalAnnualCost += annual;

        const statItem: SubscriptionItemStat = {
            id: row.itemID,
            name,
            rawAmount: amount,
            cycle,
            monthlyCost: monthly,
            annualCost: annual,
            autoRenew,
            category,
            seatRole,
            nextPay,
        };
        items.push(statItem);

        // 类别聚合
        let cStat = catMap.get(category);
        if (!cStat) {
            cStat = { monthlyCost: 0, annualCost: 0, count: 0 };
            catMap.set(category, cStat);
        }
        cStat.count++;
        cStat.monthlyCost += monthly;
        cStat.annualCost += annual;
    }

    // 排序：年化开销降序
    items.sort((a, b) => b.annualCost - a.annualCost);

    const activeCount = items.length;
    const autoRenewRate = activeCount > 0 ? Math.round((autoRenewCount / activeCount) * 100) : 0;

    const categoryBreakdown: SubscriptionCategoryStat[] = Array.from(catMap.entries())
        .map(([category, stat]) => ({
            category,
            monthlyCost: Math.round(stat.monthlyCost * 100) / 100,
            annualCost: Math.round(stat.annualCost * 100) / 100,
            count: stat.count,
        }))
        .sort((a, b) => b.annualCost - a.annualCost);

    return {
        activeCount,
        totalMonthlyCost: Math.round(totalMonthlyCost * 100) / 100,
        totalAnnualCost: Math.round(totalAnnualCost * 100) / 100,
        autoRenewCount,
        autoRenewRate,
        items,
        categoryBreakdown,
    };
}

export interface SubscriptionStatsDialogOptions {
    rows: AvRow[];
    columns: Record<string, string>;
    t: (k: string) => string;
    DialogCls: new (options: { title: string; content: string; width?: string }) => { element: HTMLElement; destroy: () => void };
    showMessageFn: (message: string, timeout?: number, type?: "info" | "error") => void;
}

export function openSubscriptionStatsDialog(options: SubscriptionStatsDialogOptions): void {
    const { rows, columns, t, DialogCls, showMessageFn } = options;

    const stats = calculateSubscriptionStats(rows, columns);

    const dlg = new DialogCls({
        title: t("ledger.subscriptionStats"),
        content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-sub-stats-body"></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-sub-stats-close">${t("close")}</button><button class="b3-button" id="lv-sub-stats-copy">${t("ledger.subscriptionCopy")}</button></div>`,
        width: "560px",
    });

    const body = dlg.element.querySelector("#lv-sub-stats-body") as HTMLElement;
    const copyBtn = dlg.element.querySelector("#lv-sub-stats-copy") as HTMLButtonElement;
    (dlg.element.querySelector("#lv-sub-stats-close") as HTMLButtonElement).onclick = () => dlg.destroy();

    if (stats.activeCount === 0) {
        const empty = document.createElement("div");
        empty.className = "lv-caption";
        empty.style.cssText = "text-align:center;padding:24px 0";
        empty.textContent = t("ledger.subscriptionEmpty");
        body.appendChild(empty);
        copyBtn.disabled = true;
        return;
    }

    const metrics = document.createElement("div");
    metrics.style.cssText = "display:grid;grid-template-columns:repeat(3, 1fr);gap:10px";

    const mCard = document.createElement("div");
    mCard.className = "lv-metric-item";
    mCard.innerHTML = `<span class="lv-caption">${t("ledger.subscriptionMonthly")}</span><b class="lv-num" style="color:var(--lv-accent);font-size:18px">¥${formatAmount(stats.totalMonthlyCost)}</b><span class="lv-caption">${stats.activeCount} 项在保/在用</span>`;

    const aCard = document.createElement("div");
    aCard.className = "lv-metric-item";
    aCard.innerHTML = `<span class="lv-caption">${t("ledger.subscriptionAnnual")}</span><b class="lv-num" style="color:var(--lv-warn);font-size:18px">¥${formatAmount(stats.totalAnnualCost)}</b><span class="lv-caption">年化折算</span>`;

    const rCard = document.createElement("div");
    rCard.className = "lv-metric-item";
    rCard.innerHTML = `<span class="lv-caption">${t("ledger.subscriptionAutoRenew")}</span><b class="lv-num" style="font-size:18px">${stats.autoRenewRate}%</b><span class="lv-caption">${stats.autoRenewCount} 项自动续费</span>`;

    metrics.append(mCard, aCard, rCard);
    body.appendChild(metrics);

    if (stats.categoryBreakdown.length > 0) {
        const sec = document.createElement("div");
        sec.style.cssText = "margin-top:6px";
        sec.innerHTML = `<div class="ft__on-surface lv-section-title">${t("ledger.subscriptionCount").replace("${n}", String(stats.activeCount))}</div>`;

        const list = document.createElement("div");
        list.style.cssText = "display:flex;flex-direction:column;gap:6px";

        for (const c of stats.categoryBreakdown) {
            const item = document.createElement("div");
            item.className = "lv-metric-item";
            item.style.cssText = "flex-direction:row;align-items:center;justify-content:space-between;padding:7px 12px;font-size:12px";
            const catLabel = t(`field.category.opt.${c.category}`) !== `field.category.opt.${c.category}` ? t(`field.category.opt.${c.category}`) : c.category;
            item.innerHTML = `<span style="font-weight:500">${catLabel} <span class="lv-caption">(${c.count}项)</span></span><span><b class="lv-num">¥${formatAmount(c.monthlyCost)}</b><span class="lv-caption">/月 (年¥${formatAmount(c.annualCost)})</span></span>`;
            list.appendChild(item);
        }
        sec.appendChild(list);
        body.appendChild(sec);
    }

    copyBtn.onclick = async () => {
        const lines = [
            `【订阅与会员支出统计】`,
            `月均支出: ¥${formatAmount(stats.totalMonthlyCost)} | 年化折算: ¥${formatAmount(stats.totalAnnualCost)}`,
            `在用项: ${stats.activeCount} | 自动续费: ${stats.autoRenewCount} (${stats.autoRenewRate}%)`,
        ];
        for (const it of stats.items) {
            lines.push(`· ${it.name}: ¥${it.rawAmount} (${it.cycle}) -> 月均 ¥${formatAmount(it.monthlyCost)}`);
        }
        try {
            await navigator.clipboard.writeText(lines.join("\n"));
            showMessageFn(t("ledger.subscriptionCopied"), 2500, "info");
        } catch {
            showMessageFn(t("ledger.copyAsImageFail"), 4000, "error");
        }
    };
}
