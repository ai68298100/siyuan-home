/**
 * 存放位置全局检索对话框（313 波，G4）：
 * 遍历全已启用模块中含 location / copy_location 的台账，
 * 按位置归集，提供实时关键词搜索、点击直达原文文档、一键复制文本。
 * 独立于页面存在，避免页面膨胀。
 */
import { buildLocationIndex, searchLocations, formatLocationIndexText, type LocationRowInput } from "./location-index";
import type { AvRow } from "./siyuan";
import type { AvCellLike } from "./avcell";

export interface LocationDialogOptions {
    t: (k: string) => string;
    plugin: {
        settings: {
            enabledModules?: string[];
            dbRefs: Record<string, { avId?: string; docId?: string; columns?: Record<string, string> }>;
            members?: Array<{ id: string; avItemId?: string; name: string }>;
        };
        showTabDocs: (docId?: string) => void;
    };
    DialogCls: new (options: { title: string; content: string; width?: string }) => { element: HTMLElement; destroy: () => void };
    showMessageFn: (message: string, timeout?: number, type?: "info" | "error") => void;
    renderLedgerAllFn: (avId: string) => Promise<{ complete: boolean; rows: AvRow[] }>;
    cellTextFn: (v: AvCellLike | null | undefined, k?: string) => string;
}

export async function openLocationIndexDialog(opts: LocationDialogOptions): Promise<void> {
    const { t, plugin, DialogCls, showMessageFn, renderLedgerAllFn, cellTextFn } = opts;
    const enabled = (plugin.settings.enabledModules ?? []).filter((id) => id !== "members" && id !== "adhoc");
    const memberMap = new Map((plugin.settings.members ?? []).map((m) => [m.avItemId ?? m.id, m.name]));

    const inputs: LocationRowInput[] = [];
    const errors: string[] = [];

    for (const mod of enabled) {
        const ref = plugin.settings.dbRefs[mod];
        if (!ref?.avId || !ref.columns?.name) continue;
        const locCol = ref.columns.location;
        const copyCol = ref.columns.copy_location;
        if (!locCol && !copyCol) continue;

        try {
            const res = await renderLedgerAllFn(ref.avId);
            if (!res.complete) continue;
            for (const r of res.rows) {
                const name = cellTextFn(r.cells[ref.columns.name]);
                if (!name) continue;
                const memberCell = ref.columns.member ? r.cells[ref.columns.member] : undefined;
                const memberId = String(memberCell?.relation?.blockIDs?.[0] ?? "");
                const memberName = memberId ? memberMap.get(memberId) : undefined;
                const hint = ref.columns.note ? cellTextFn(r.cells[ref.columns.note]) : undefined;

                if (locCol) {
                    const loc = cellTextFn(r.cells[locCol]);
                    if (loc) inputs.push({ rowId: r.itemID, moduleId: mod, name, location: loc, source: "location", memberName, hint });
                }
                if (copyCol) {
                    const copyLoc = cellTextFn(r.cells[copyCol]);
                    if (copyLoc) inputs.push({ rowId: r.itemID, moduleId: mod, name, location: copyLoc, source: "copy_location", memberName, hint });
                }
            }
        } catch (e) {
            errors.push(`${mod}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    if (inputs.length === 0) {
        showMessageFn(t("ledger.locEmptyAll"), 4000, "info");
        return;
    }

    const index = buildLocationIndex(inputs);
    const modLabel = (m: string) => (t(`module.${m}`) !== `module.${m}` ? t(`module.${m}`) : m);

    const dlg = new DialogCls({
        title: t("ledger.locTitle"),
        content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-loc-body">
  <div style="display:flex;gap:6px;margin-bottom:8px">
    <input class="b3-text-field" id="lv-loc-search" placeholder="${t("ledger.locSearchPlaceholder")}" style="flex:1;font-size:12.5px" />
  </div>
  <div id="lv-loc-results" style="display:flex;flex-direction:column;gap:8px"></div>
</div>
<div class="b3-dialog__action">
  <span class="lv-caption" id="lv-loc-total" style="flex:1"></span>
  <button class="b3-button b3-button--cancel" id="lv-loc-close">${t("close")}</button>
  <button class="b3-button" id="lv-loc-copy">${t("ledger.locCopy")}</button>
</div>`,
        width: "600px",
    });

    const resultsEl = dlg.element.querySelector("#lv-loc-results") as HTMLElement;
    const totalEl = dlg.element.querySelector("#lv-loc-total") as HTMLElement;
    const searchInp = dlg.element.querySelector("#lv-loc-search") as HTMLInputElement;
    (dlg.element.querySelector("#lv-loc-close") as HTMLButtonElement).onclick = () => dlg.destroy();

    totalEl.textContent = t("ledger.locCount").replace("${n}", String(index.total)).replace("${groups}", String(index.groups.length));

    const renderList = (entries: typeof inputs) => {
        resultsEl.replaceChildren();
        if (entries.length === 0) {
            const none = document.createElement("div");
            none.className = "ft__on-surface";
            none.style.cssText = "font-size:12.5px;padding:12px 0;text-align:center";
            none.textContent = t("activity.noMatch");
            resultsEl.appendChild(none);
            return;
        }
        const byLoc = new Map<string, typeof inputs>();
        for (const e of entries) {
            const list = byLoc.get(e.location) ?? [];
            list.push(e);
            byLoc.set(e.location, list);
        }
        for (const [loc, list] of byLoc) {
            const grp = document.createElement("div");
            grp.style.cssText = "border-radius:6px;background:var(--b3-theme-background-light);padding:8px 10px";
            const head = document.createElement("div");
            head.style.cssText = "font-weight:600;font-size:13px;margin-bottom:6px;color:var(--lv-accent);display:flex;justify-content:space-between";
            head.innerHTML = `<span>📍 ${loc}</span><span class="lv-caption">${list.length} 件</span>`;
            grp.appendChild(head);
            for (const it of list) {
                const line = document.createElement("div");
                line.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12.5px";
                const left = document.createElement("span");
                const copyTag = it.source === "copy_location" ? ` <span class="lv-badge gray">${t("ledger.locCopyTag")}</span>` : "";
                const owner = it.memberName ? ` · ${it.memberName}` : "";
                left.innerHTML = `<b>${it.name}</b>${copyTag}<span class="lv-caption" style="margin-left:6px">${modLabel(it.moduleId)}${owner}</span>`;
                const gotoBtn = document.createElement("button");
                gotoBtn.className = "b3-button b3-button--text";
                gotoBtn.style.cssText = "font-size:11.5px;padding:0 4px";
                gotoBtn.textContent = `${t("ledger.openDoc")} →`;
                gotoBtn.onclick = () => {
                    const docId = plugin.settings.dbRefs[it.moduleId]?.docId;
                    if (docId) plugin.showTabDocs(docId);
                };
                line.append(left, gotoBtn);
                grp.appendChild(line);
            }
            resultsEl.appendChild(grp);
        }
    };
    renderList(inputs);

    searchInp.oninput = () => {
        const q = searchInp.value.trim();
        if (!q) { renderList(inputs); return; }
        renderList(searchLocations(inputs, q));
    };

    (dlg.element.querySelector("#lv-loc-copy") as HTMLButtonElement).onclick = async () => {
        const text = formatLocationIndexText(index, modLabel);
        try {
            await navigator.clipboard.writeText(text);
            showMessageFn(t("ledger.shopCopied"), 2500, "info");
        } catch {
            showMessageFn(t("ledger.shopCopyFailed"), 4000, "error");
        }
    };
}
