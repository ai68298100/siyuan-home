import { Dialog } from "siyuan";
import { buildShoppingList } from "@/core/shopping";
import { renderLedgerAll } from "@/core/siyuan";
import { localDateKey } from "@/core/hub/rule";

interface ShoppingModalOptions {
    avId?: string;
    columns?: Record<string, string>;
    t: (key: string) => string;
    showMessage: (msg: string, timeout: number, type: "info" | "error") => void;
}

export async function openShoppingModal({ avId, columns, t, showMessage }: ShoppingModalOptions): Promise<void> {
    if (!avId || !columns?.name || !columns.qty || !columns.low_stock_at) return;
    try {
        const all = await renderLedgerAll(avId);
        if (!all.complete) {
            showMessage(t("ledger.loadIncomplete"), 5000, "error");
            return;
        }
        const items = buildShoppingList(all.rows, {
            nameKey: columns.name,
            qtyKey: columns.qty,
            thresholdKey: columns.low_stock_at,
        });
        const dlg = new Dialog({
            title: t("ledger.shoppingList"),
            content: `<div class="b3-dialog__content" id="lv-shop-body" style="max-height:60vh;overflow:auto"></div>
<div class="b3-dialog__action"><span class="lv-caption" id="lv-shop-total" style="flex:1"></span><button class="b3-button b3-button--cancel" id="lv-shop-close">${t("cancel")}</button><button class="b3-button b3-button--text" id="lv-shop-copy" ${items.length === 0 ? "disabled" : ""}>${t("ledger.shopCopy")}</button></div>`,
            width: "520px",
        });
        const body = dlg.element.querySelector("#lv-shop-body") as HTMLElement;
        if (items.length === 0) {
            const none = document.createElement("div");
            none.className = "ft__on-surface";
            none.style.cssText = "font-size:13px;padding:8px 0";
            none.textContent = t("ledger.shopEmpty");
            body.appendChild(none);
        }
        const qtyInputs: HTMLInputElement[] = [];
        for (const it of items) {
            const line = document.createElement("div");
            line.className = "fn__flex";
            line.style.cssText = "gap:8px;align-items:center;padding:4px 0;font-size:13px";
            const label = document.createElement("span");
            label.style.cssText = "flex:1;word-break:break-all";
            label.textContent = it.name;
            const meta = document.createElement("span");
            meta.className = "lv-caption";
            meta.style.cssText = "flex-shrink:0";
            meta.textContent = t("ledger.shopExisting").replace("${q}", String(it.qty)).replace("${t2}", String(it.threshold));
            const input = document.createElement("input");
            input.type = "number";
            input.className = "b3-text-field";
            input.style.cssText = "width:74px;flex-shrink:0";
            input.min = "1";
            input.value = String(it.suggest);
            input.title = t("ledger.shopBuy");
            qtyInputs.push(input);
            line.append(label, meta, input);
            body.appendChild(line);
        }
        const total = dlg.element.querySelector("#lv-shop-total") as HTMLElement;
        total.textContent = t("ledger.shopTotal").replace("${n}", String(items.length));
        (dlg.element.querySelector("#lv-shop-close") as HTMLButtonElement).onclick = () => dlg.destroy();
        (dlg.element.querySelector("#lv-shop-copy") as HTMLButtonElement).onclick = async () => {
            const lines = items
                .map((it, i) => `${it.name} ×${Math.max(1, Math.floor(Number(qtyInputs[i].value) || 1))}`)
                .join("\n");
            const text = `${t("ledger.shoppingList")} · ${localDateKey(new Date())}\n${lines}`;
            try {
                await navigator.clipboard.writeText(text);
                showMessage(t("ledger.shopCopied"), 2500, "info");
            } catch {
                showMessage(t("ledger.shopCopyFailed"), 4000, "error");
            }
        };
    } catch (e) {
        showMessage(t("ledger.shoppingFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
    }
}
