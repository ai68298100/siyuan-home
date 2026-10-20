/**
 * 市政与垃圾分类回收日程弹窗（§16/§17 316波，调研缺口 G7）：
 * 展示未来两周垃圾清运节点（按日期排布、今天/明天突出徽章），
 * 支持一键复制清运时间表。
 * 独立模块，按需延迟加载以减轻主包负担。
 */

import { nextWastePickups, formatWasteScheduleText, DEFAULT_WASTE_RULES, type WasteRule } from "./waste-schedule";

export interface WasteDialogOptions {
    t: (k: string) => string;
    rules?: WasteRule[];
    DialogCls: new (options: { title: string; content: string; width?: string }) => {
        element: HTMLElement;
        destroy: () => void;
    };
    showMessageFn: (message: string, timeout?: number, type?: "info" | "error") => void;
}

export function openWasteScheduleDialog(opts: WasteDialogOptions): void {
    const { t, rules = DEFAULT_WASTE_RULES, DialogCls, showMessageFn } = opts;

    const pickups = nextWastePickups(rules);
    const reportText = formatWasteScheduleText(pickups);

    const dlg = new DialogCls({
        title: t("ledger.wasteTitle"),
        content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-waste-body">
  <div class="lv-card" style="display:flex;flex-direction:column;gap:6px;padding:10px 12px;background:var(--lv-surface-2);margin-bottom:10px">
    <span class="lv-caption" style="font-weight:600">${t("ledger.wasteIntro")}</span>
  </div>
  <div id="lv-waste-list" style="display:flex;flex-direction:column;gap:6px"></div>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel">${t("close")}</button>
  <button class="b3-button" id="lv-waste-copy">${t("ledger.emergencyKitCopy")}</button>
</div>`,
        width: "560px",
    });

    const listEl = dlg.element.querySelector("#lv-waste-list") as HTMLElement;
    (dlg.element.querySelector(".b3-button--cancel") as HTMLButtonElement).onclick = () => dlg.destroy();

    // 按日期聚类渲染条目
    const byDate = new Map<string, typeof pickups>();
    for (const p of pickups) {
        const list = byDate.get(p.date) ?? [];
        list.push(p);
        byDate.set(p.date, list);
    }

    for (const [date, items] of byDate) {
        const row = document.createElement("div");
        row.className = "lv-metric-item";
        row.style.cssText = "flex-direction:row;align-items:center;justify-content:space-between;padding:8px 12px;font-size:12.5px";

        const left = document.createElement("div");
        left.style.cssText = "display:flex;align-items:center;gap:8px;min-width:0;flex:1";

        const first = items[0];
        const badge = document.createElement("span");
        if (first.isToday) {
            badge.className = "lv-badge red";
            badge.textContent = t("ledger.wasteToday");
        } else if (first.isTomorrow) {
            badge.className = "lv-badge orange";
            badge.textContent = t("ledger.wasteTomorrow");
        } else {
            badge.className = "lv-badge gray";
            badge.textContent = `${first.daysLeft} ${t("days.unit")}`;
        }

        const dateSpan = document.createElement("b");
        dateSpan.style.cssText = "color:var(--lv-tx)";
        dateSpan.textContent = date;

        const typesSpan = document.createElement("span");
        typesSpan.className = "lv-caption";
        typesSpan.textContent = items.map((it) => it.label).join("、");

        left.append(badge, dateSpan, typesSpan);
        row.appendChild(left);
        listEl.appendChild(row);
    }

    (dlg.element.querySelector("#lv-waste-copy") as HTMLButtonElement).onclick = async () => {
        try {
            await navigator.clipboard.writeText(reportText);
            showMessageFn(t("overview.lifeIndexCopied"), 2500, "info");
        } catch {
            showMessageFn(t("ledger.copyAsImageFail"), 4000, "error");
        }
    };
}
