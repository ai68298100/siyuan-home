/**
 * 家庭生活指数与全景年度生活盘点（§16/§17 300波里程碑）：
 * 综合健康安全、资产履约、生活效率与文化成长四大维度，
 * 计算家庭生活综合指数（0-100分），识别优势亮点与关键建议，生成年度生活管理报告。
 * 纯函数，无思源/DOM 强依赖，100% 可单元测试。
 */
import { formatAmount } from "./format";
import type { Reminder, DbRef } from "@/types";

export type LifeDimension = "health_safety" | "finance_contracts" | "daily_efficiency" | "culture_growth";
export type LifeScoreLevel = "excellent" | "good" | "fair" | "needs_attention";

export interface FamilyLifeContext {
    memberCount: number;
    totalReminders: number;
    overdueReminders: number;
    medicineCount: number;
    expiredMedicineCount: number;
    vaccineCompletionRate?: number; // 0-100
    contractsActiveCount: number;
    totalDepositAmount: number;
    mediaCompletedCount: number;
    mediaTotalCount: number;
    hasEmergencyKit?: boolean;
}

export interface DimensionAnalysis {
    dimension: LifeDimension;
    title: string;
    score: number; // 0-100
    weight: number; // 0-1
    weightedScore: number;
    highlights: string[];
    suggestions: string[];
}

export interface FamilyLifeIndexReport {
    overallScore: number; // 0-100
    level: LifeScoreLevel;
    levelLabel: string;
    dimensions: Record<LifeDimension, DimensionAnalysis>;
    metrics: FamilyLifeContext;
    topHighlights: string[];
    topSuggestions: string[];
}

/**
 * 测算家庭生活指数与综合盘点报告
 */
export function calculateFamilyLifeIndex(ctx: FamilyLifeContext): FamilyLifeIndexReport {
    // 1. 健康与安全维度 (权重 30%)
    let healthScore = 80;
    const healthHighlights: string[] = [];
    const healthSuggestions: string[] = [];

    if (ctx.medicineCount > 0) {
        if (ctx.expiredMedicineCount === 0) {
            healthScore += 10;
            healthHighlights.push(`药箱 ${ctx.medicineCount} 种药品均在保`);
        } else {
            healthScore -= Math.min(30, ctx.expiredMedicineCount * 10);
            healthSuggestions.push(`发现 ${ctx.expiredMedicineCount} 种药品过期，请清理`);
        }
    } else {
        healthSuggestions.push("建议在药箱建档常用药与急救品");
    }

    if (ctx.hasEmergencyKit) {
        healthScore += 10;
        healthHighlights.push("已建立应急物资储备与巡检机制");
    } else {
        healthSuggestions.push("建议储备基础应急物资与生存包");
    }

    if (ctx.vaccineCompletionRate !== undefined) {
        if (ctx.vaccineCompletionRate >= 90) {
            healthHighlights.push(`疫苗接种率达 ${ctx.vaccineCompletionRate}%`);
        } else {
            healthSuggestions.push(`疫苗接种率为 ${ctx.vaccineCompletionRate}%，有待接种`);
        }
    }

    healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

    // 2. 资产与合约维度 (权重 25%)
    let financeScore = 75;
    const financeHighlights: string[] = [];
    const financeSuggestions: string[] = [];

    if (ctx.contractsActiveCount > 0) {
        financeScore += 15;
        financeHighlights.push(`在管 ${ctx.contractsActiveCount} 份履约中合同与协议`);
        if (ctx.totalDepositAmount > 0) {
            financeHighlights.push(`在押租房/物业押金 ¥${formatAmount(ctx.totalDepositAmount)}`);
        }
    } else {
        financeSuggestions.push("建议登记租房/维保等长期合同");
    }

    financeScore = Math.max(0, Math.min(100, Math.round(financeScore)));

    // 3. 日常生活效率维度 (权重 25%)
    let efficiencyScore = 85;
    const effHighlights: string[] = [];
    const effSuggestions: string[] = [];

    if (ctx.totalReminders > 0) {
        const overdueRate = ctx.overdueReminders / ctx.totalReminders;
        if (ctx.overdueReminders === 0) {
            efficiencyScore += 15;
            effHighlights.push("家庭待办零逾期，跟进及时");
        } else if (overdueRate <= 0.2) {
            efficiencyScore -= 10;
            effSuggestions.push(`${ctx.overdueReminders} 项事务逾期，建议优先处理`);
        } else {
            efficiencyScore -= 30;
            effSuggestions.push(`逾期事务较多(${ctx.overdueReminders}项)，请分诊改派`);
        }
    } else {
        effHighlights.push("无堆积到期事项，节奏井然");
    }

    efficiencyScore = Math.max(0, Math.min(100, Math.round(efficiencyScore)));

    // 4. 文化成长与精神生活 (权重 20%)
    let cultureScore = 70;
    const cultHighlights: string[] = [];
    const cultSuggestions: string[] = [];

    if (ctx.mediaCompletedCount > 0) {
        cultureScore += Math.min(30, ctx.mediaCompletedCount * 5);
        const rate = ctx.mediaTotalCount > 0 ? Math.round((ctx.mediaCompletedCount / ctx.mediaTotalCount) * 100) : 100;
        cultHighlights.push(`年内完结 ${ctx.mediaCompletedCount} 部书影音(完结率 ${rate}%)`);
    } else {
        cultSuggestions.push("建议在书影音库登记在读书影");
    }

    cultureScore = Math.max(0, Math.min(100, Math.round(cultureScore)));

    // 综合加权计算 (总分 100)
    const dimHealth: DimensionAnalysis = {
        dimension: "health_safety",
        title: "健康与安全守护",
        score: healthScore,
        weight: 0.30,
        weightedScore: Math.round(healthScore * 0.30 * 10) / 10,
        highlights: healthHighlights,
        suggestions: healthSuggestions,
    };

    const dimFinance: DimensionAnalysis = {
        dimension: "finance_contracts",
        title: "资产与合约履约",
        score: financeScore,
        weight: 0.25,
        weightedScore: Math.round(financeScore * 0.25 * 10) / 10,
        highlights: financeHighlights,
        suggestions: financeSuggestions,
    };

    const dimEfficiency: DimensionAnalysis = {
        dimension: "daily_efficiency",
        title: "生活秩序与日程",
        score: efficiencyScore,
        weight: 0.25,
        weightedScore: Math.round(efficiencyScore * 0.25 * 10) / 10,
        highlights: effHighlights,
        suggestions: effSuggestions,
    };

    const dimCulture: DimensionAnalysis = {
        dimension: "culture_growth",
        title: "文化滋养与陪伴",
        score: cultureScore,
        weight: 0.20,
        weightedScore: Math.round(cultureScore * 0.20 * 10) / 10,
        highlights: cultHighlights,
        suggestions: cultSuggestions,
    };

    const overallScore = Math.round(
        dimHealth.weightedScore + dimFinance.weightedScore + dimEfficiency.weightedScore + dimCulture.weightedScore,
    );

    let level: LifeScoreLevel = "good";
    let levelLabel = "生活良序";
    if (overallScore >= 90) {
        level = "excellent";
        levelLabel = "幸福卓越";
    } else if (overallScore >= 80) {
        level = "good";
        levelLabel = "生活良序";
    } else if (overallScore >= 65) {
        level = "fair";
        levelLabel = "稳步经营";
    } else {
        level = "needs_attention";
        levelLabel = "亟待关注";
    }

    const allHighlights = [
        ...healthHighlights,
        ...financeHighlights,
        ...effHighlights,
        ...cultHighlights,
    ];
    const allSuggestions = [
        ...healthSuggestions,
        ...financeSuggestions,
        ...effSuggestions,
        ...cultSuggestions,
    ];

    return {
        overallScore,
        level,
        levelLabel,
        dimensions: {
            health_safety: dimHealth,
            finance_contracts: dimFinance,
            daily_efficiency: dimEfficiency,
            culture_growth: dimCulture,
        },
        metrics: ctx,
        topHighlights: allHighlights.slice(0, 4),
        topSuggestions: allSuggestions.slice(0, 4),
    };
}

/**
 * 格式化家庭生活指数年度盘点简报文本
 */
export function formatLifeIndexReportText(report: FamilyLifeIndexReport): string {
    const d = report.dimensions;
    const lines = [
        `【生活指数盘点】${report.overallScore}分·${report.levelLabel}`,
        `健康:${d.health_safety.score} 合约:${d.finance_contracts.score} 日常:${d.daily_efficiency.score} 文化:${d.culture_growth.score}`,
    ];
    if (report.topHighlights.length > 0) {
        lines.push("亮点: " + report.topHighlights.join("；"));
    }
    if (report.topSuggestions.length > 0) {
        lines.push("建议: " + report.topSuggestions.join("；"));
    }
    return lines.join("\n");
}

/**
 * 从各个模块台账安全采集生活指数上下文数据
 */
export async function collectFamilyLifeContext(
    plugin: { settings: { members?: unknown[]; dbRefs?: Record<string, DbRef> } },
    reminders: Reminder[],
    today: string,
): Promise<FamilyLifeContext> {
    const memberCount = plugin.settings.members?.length ?? 0;
    const totalReminders = reminders.length;
    const overdueReminders = reminders.filter((r) => r.level === "overdue").length;

    let medicineCount = 0;
    let expiredMedicineCount = 0;
    let contractsActiveCount = 0;
    let totalDepositAmount = 0;
    let mediaCompletedCount = 0;
    let mediaTotalCount = 0;
    let hasEmergencyKit = false;

    const { renderLedgerAll } = await import("./siyuan");

    const readRows = async (ref?: DbRef) => {
        if (!ref?.avId) return [];
        try {
            const res = await renderLedgerAll(ref.avId);
            return res.complete ? res.rows : [];
        } catch {
            return [];
        }
    };

    const medRows = await readRows(plugin.settings.dbRefs?.medicine);
    medicineCount = medRows.length;
    const medExp = plugin.settings.dbRefs?.medicine?.columns?.expiry;
    if (medExp) {
        for (const r of medRows) {
            const exp = String(r.cells[medExp]?.date?.content ?? r.cells[medExp]?.text?.content ?? "");
            if (exp && exp < today) expiredMedicineCount++;
        }
    }

    const ctRows = await readRows(plugin.settings.dbRefs?.contracts);
    contractsActiveCount = ctRows.length;
    const ctDep = plugin.settings.dbRefs?.contracts?.columns?.deposit;
    if (ctDep) {
        for (const r of ctRows) {
            const dep = r.cells[ctDep]?.number?.content;
            if (typeof dep === "number" && dep > 0) totalDepositAmount += dep;
        }
    }

    const mediaRows = await readRows(plugin.settings.dbRefs?.media);
    mediaTotalCount = mediaRows.length;
    const mediaSt = plugin.settings.dbRefs?.media?.columns?.status;
    if (mediaSt) {
        for (const r of mediaRows) {
            const st = String(r.cells[mediaSt]?.select?.content ?? "");
            if (st === "done" || st === "已看" || st === "已读") mediaCompletedCount++;
        }
    }

    const stockRows = await readRows(plugin.settings.dbRefs?.stock);
    const stockCat = plugin.settings.dbRefs?.stock?.columns?.category;
    if (stockCat) {
        hasEmergencyKit = stockRows.some((r) => String(r.cells[stockCat]?.select?.content ?? "") === "emergency_st");
    }

    return {
        memberCount,
        totalReminders,
        overdueReminders,
        medicineCount,
        expiredMedicineCount,
        contractsActiveCount,
        totalDepositAmount,
        mediaCompletedCount,
        mediaTotalCount,
        hasEmergencyKit,
    };
}

/**
 * 组装并弹出生活指数与年度盘点模态框
 */
export function openLifeIndexDialog(
    report: FamilyLifeIndexReport,
    t: (k: string) => string,
    DialogCls: new (options: { title: string; content: string; width?: string }) => { element: HTMLElement; destroy: () => void },
    showMessageFn: (message: string, timeout?: number, type?: "info" | "error") => void,
): void {
    const dlg = new DialogCls({
        title: t("overview.lifeIndexTitle"),
        content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-life-index-body"></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-life-index-close">${t("close")}</button><button class="b3-button" id="lv-life-index-copy">${t("overview.lifeIndexCopy")}</button></div>`,
        width: "580px",
    });

    const body = dlg.element.querySelector("#lv-life-index-body") as HTMLElement;
    const copyBtn = dlg.element.querySelector("#lv-life-index-copy") as HTMLButtonElement;
    (dlg.element.querySelector("#lv-life-index-close") as HTMLButtonElement).onclick = () => dlg.destroy();

    // 1. 顶部总评卡片
    const heroCard = document.createElement("div");
    heroCard.className = "lv-metric-item";
    heroCard.style.cssText = "flex-direction:row;align-items:center;justify-content:space-between;padding:12px 16px";
    heroCard.innerHTML = `<div style="display:flex;flex-direction:column;gap:4px"><span class="lv-caption">${t("overview.lifeIndexScore")}</span><div style="display:flex;align-items:baseline;gap:8px"><b class="lv-num" style="font-size:32px;color:var(--lv-accent)">${report.overallScore}</b><span class="lv-badge green" style="font-size:12px;padding:2px 8px">${report.levelLabel}</span></div></div><div class="lv-caption" style="text-align:right">健康安全 · 资产履约<br/>秩序日程 · 文化滋养</div>`;
    body.appendChild(heroCard);

    // 2. 四大维度网格
    const dimSec = document.createElement("div");
    dimSec.style.cssText = "display:grid;grid-template-columns:repeat(2, 1fr);gap:10px";

    const dims = [
        { icon: "🛡️", d: report.dimensions.health_safety },
        { icon: "📜", d: report.dimensions.finance_contracts },
        { icon: "⏰", d: report.dimensions.daily_efficiency },
        { icon: "📚", d: report.dimensions.culture_growth },
    ];

    for (const item of dims) {
        const card = document.createElement("div");
        card.className = "lv-metric-item";
        card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-weight:600;font-size:12.5px">${item.icon} ${item.d.title}</span><b class="lv-num" style="font-size:15px;color:var(--lv-tx)">${item.d.score}分</b></div><div style="height:3px;background:var(--lv-line);border-radius:2px;overflow:hidden"><div style="height:100%;width:${item.d.score}%;background:var(--lv-accent)"></div></div><span class="lv-caption" style="font-size:11px;color:var(--lv-tx-2)">${item.d.highlights[0] || item.d.suggestions[0] || "平稳运行中"}</span>`;
        dimSec.appendChild(card);
    }
    body.appendChild(dimSec);

    // 3. 高光成就与建议
    if (report.topHighlights.length > 0) {
        const hlSec = document.createElement("div");
        hlSec.style.cssText = "display:flex;flex-direction:column;gap:4px;padding:10px 12px;background:var(--lv-surface-1);border-radius:6px;border:1px solid var(--lv-line);font-size:12px";
        hlSec.innerHTML = `<b style="margin-bottom:2px">${t("overview.lifeIndexHighlights")}</b>` + report.topHighlights.map((h) => `<span class="lv-caption" style="color:var(--lv-tx)">✔ ${h}</span>`).join("");
        body.appendChild(hlSec);
    }

    copyBtn.onclick = async () => {
        const text = formatLifeIndexReportText(report);
        try {
            await navigator.clipboard.writeText(text);
            showMessageFn(t("overview.lifeIndexCopied"), 2500, "info");
        } catch {
            showMessageFn(t("ledger.copyAsImageFail"), 4000, "error");
        }
    };
}
