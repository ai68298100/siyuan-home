/**
 * 支出趋势与分类预算限额分析对话框（315波，G6）：
 * 聚合台账历史支出、分析月度环比/年度预测、比对分类月度预算限额，
 * 集中展示趋势、异常突增与超限/预警指标。
 * 纯逻辑 + DOM 独立模块，按需动态加载以减轻页面体积。
 */

import { calculateExpenseTrend, formatExpenseTrendReport, type ExpenseEntry } from "./expense-trend";
import { evaluateBudgetUsage, formatBudgetLimitReport } from "./budget-limit";

export interface ExpenseDialogOptions {
    entries: ExpenseEntry[];
    budgetLimits?: Record<string, number>;
    t: (k: string) => string;
    DialogCls: new (options: { title: string; content: string; width?: string }) => {
        element: HTMLElement;
        destroy: () => void;
    };
    showMessageFn: (message: string, timeout?: number, type?: "info" | "error") => void;
}

export function openExpenseTrendDialog(opts: ExpenseDialogOptions): void {
    const { entries, budgetLimits = {}, t, DialogCls, showMessageFn } = opts;

    const trendReport = calculateExpenseTrend(entries);
    const trendText = formatExpenseTrendReport(trendReport);

    const budgetReport = evaluateBudgetUsage(entries, budgetLimits);
    const catLabel = (c: string) => {
        const key = `field.category.opt.${c}`;
        const val = t(key);
        return val !== key ? val : c;
    };
    const budgetText = formatBudgetLimitReport(budgetReport, catLabel);

    const fullReportText = `${trendText}\n\n${budgetText}`;

    const dlg = new DialogCls({
        title: t("ledger.expenseTrendTitle"),
        content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-expense-body">
  <pre class="lv-caption" style="white-space:pre-wrap;line-height:1.7;margin:0"></pre>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel">${t("close")}</button>
  <button class="b3-button" id="lv-et-copy">${t("ledger.emergencyKitCopy")}</button>
</div>`,
        width: "580px",
    });

    const pre = dlg.element.querySelector("pre");
    if (pre) pre.textContent = fullReportText;

    (dlg.element.querySelector(".b3-button--cancel") as HTMLButtonElement).onclick = () => dlg.destroy();
    (dlg.element.querySelector("#lv-et-copy") as HTMLButtonElement).onclick = async () => {
        try {
            await navigator.clipboard.writeText(fullReportText);
            showMessageFn(t("overview.lifeIndexCopied"), 2500, "info");
        } catch {
            showMessageFn(t("ledger.copyAsImageFail"), 4000, "error");
        }
    };
}
