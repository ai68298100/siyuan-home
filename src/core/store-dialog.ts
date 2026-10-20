/**
 * 扫货模式对话框（312 波，G3）：
 * 把 shopping 台账按分类分组，支持在超市里逐项勾选、查看进度、复制清单。
 * 页面（ledger.svelte）只负责传入数据读取函数与 Dialog 类，本模块承担全部 DOM 构建，
 * 以降低 Svelte 页面的体积压力（页内大段 DOM 代码对 gzip 极不友好）。
 */
import { groupShoppingByCategory, storeModeProgress, toggleStoreItem, formatStoreModeText } from "./shopping";
import type { AvCellLike } from "./avcell";

export interface StoreModeDialogOptions {
    t: (k: string) => string;
    DialogCls: new (options: { title: string; content: string; width?: string }) => { element: HTMLElement; destroy: () => void };
    showMessageFn: (message: string, timeout?: number, type?: "info" | "error") => void;
    /** 全量读取当前台账行 */
    loadRows: () => Promise<{ complete: boolean; rows: Array<{ itemID: string; cells: Record<string, AvCellLike> }> }>;
    columns: { name?: string; category?: string; qty?: string; note?: string };
}

export async function openStoreModeDialog(opts: StoreModeDialogOptions): Promise<void> {
    const { t, DialogCls, showMessageFn, loadRows, columns } = opts;

    let res: { complete: boolean; rows: Array<{ itemID: string; cells: Record<string, AvCellLike> }> };
    try {
        res = await loadRows();
    } catch (e) {
        showMessageFn(t("ledger.logReadFailed") + " (" + (e instanceof Error ? e.message : String(e)) + ")", 5000, "error");
        return;
    }
    if (!res.complete) {
        showMessageFn(t("ledger.loadIncomplete"), 5000, "error");
        return;
    }

    const groups = groupShoppingByCategory(res.rows, {
        nameKey: columns.name ?? "name",
        categoryKey: columns.category,
        qtyKey: columns.qty,
        noteKey: columns.note,
    });
    if (groups.length === 0) {
        showMessageFn(t("ledger.storeModeEmpty"), 4000, "info");
        return;
    }

    const dlg = new DialogCls({
        title: t("ledger.storeModeTitle"),
        content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-store-body"></div>
<div class="b3-dialog__action"><span class="lv-caption" id="lv-store-progress" role="status" aria-live="polite" style="flex:1"></span><button class="b3-button b3-button--cancel" id="lv-store-close">${t("close")}</button><button class="b3-button" id="lv-store-copy">${t("ledger.storeModeCopy")}</button></div>`,
        width: "560px",
    });
    const body = dlg.element.querySelector("#lv-store-body") as HTMLElement;
    const progressEl = dlg.element.querySelector("#lv-store-progress") as HTMLElement;
    (dlg.element.querySelector("#lv-store-close") as HTMLButtonElement).onclick = () => dlg.destroy();

    const catLabel = (c: string) => {
        const key = `field.category.opt.${c}`;
        const val = t(key);
        return val !== key ? val : (c || t("ledger.storeModeOther"));
    };

    let checked = new Set<string>();
    const render = () => {
        const p = storeModeProgress(groups, checked);
        progressEl.textContent = t("ledger.storeModeProgress")
            .replace("${done}", String(p.checked))
            .replace("${total}", String(p.total));
        body.replaceChildren();
        for (const g of groups) {
            const gp = p.byGroup.find((x) => x.category === g.category);
            const head = document.createElement("div");
            head.className = "ft__on-surface";
            head.style.cssText = "margin:8px 0 4px;font-size:12px;font-weight:600";
            head.textContent = `${catLabel(g.category)} (${gp?.checked ?? 0}/${gp?.total ?? 0})`;
            body.appendChild(head);
            for (const it of g.items) {
                const label = document.createElement("label");
                label.style.cssText = "display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;font-size:13px;cursor:pointer";
                const box = document.createElement("input");
                box.type = "checkbox";
                box.className = "b3-checkbox";
                box.checked = checked.has(it.itemID);
                box.setAttribute("aria-label", it.name);
                box.onchange = () => { checked = toggleStoreItem(checked, it.itemID); render(); };
                const name = document.createElement("span");
                name.textContent = `${it.name}${it.qty !== undefined ? ` ×${it.qty}` : ""}`;
                if (checked.has(it.itemID)) { name.style.textDecoration = "line-through"; name.style.opacity = "0.55"; }
                label.append(box, name);
                if (it.note) {
                    const note = document.createElement("span");
                    note.className = "lv-caption";
                    note.textContent = it.note;
                    label.appendChild(note);
                }
                body.appendChild(label);
            }
        }
    };
    render();

    (dlg.element.querySelector("#lv-store-copy") as HTMLButtonElement).onclick = async () => {
        const text = formatStoreModeText(groups, checked, catLabel);
        try {
            await navigator.clipboard.writeText(text);
            showMessageFn(t("ledger.shopCopied"), 2500, "info");
        } catch {
            showMessageFn(t("ledger.shopCopyFailed"), 4000, "error");
        }
    };
}
