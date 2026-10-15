import { Dialog, confirm, showMessage } from "siyuan";
import { parseCsv } from "@/core/csv";
import { planImport, guessMapping } from "@/core/importer";
import { addDetachedRow, setCell, RowIdentityPendingError } from "@/core/siyuan";
import { selectCellValue } from "@/core/avcell";

interface CsvModalOptions {
    active: string;
    ref?: { avId?: string; columns?: Record<string, string> };
    schemaCatalog?: Record<string, any>;
    members?: any[];
    t: (key: string) => string;
    onReload: () => Promise<void>;
    onRefreshHub: (modules: string[]) => Promise<unknown>;
}

function cellValue(type: string, v: any, members: any[] = []): unknown | null {
    switch (type) {
        case "select": return selectCellValue(v);
        case "relation": {
            const relationID = typeof v === "string" ? v.trim() : "";
            const linked = relationID && members.some((m) => m.avItemId === relationID);
            return linked ? { type: "relation", relation: { blockIDs: [relationID], contents: null } } : null;
        }
        case "date": return v === "" ? { type: "date", date: { isNotEmpty: false } } : { type: "date", date: { content: new Date(`${v}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true } };
        case "number": return v === "" || v === null ? { type: "number", number: { isNotEmpty: false } } : { type: "number", number: { content: Number(v), isNotEmpty: true } };
        case "url": return { type: "url", url: { content: v } };
        case "checkbox": return { type: "checkbox", checkbox: { checked: !!v } };
        default: return { type: "text", text: { content: String(v) } };
    }
}

export function openCsvModal({ active, ref, schemaCatalog, members = [], t, onReload, onRefreshHub }: CsvModalOptions): void {
    if (!ref?.avId) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.style.display = "none";
    input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        let table: string[][];
        try {
            table = parseCsv(await file.text());
        } catch (e) {
            showMessage(t("ledger.importBadCsv") + ` (${e instanceof Error ? e.message : String(e)})`, 5000, "error");
            return;
        }
        if (table.length < 2) { showMessage(t("ledger.importBadCsv"), 5000, "error"); return; }
        const headers = table[0];
        const importableTypes = new Set(["text", "number", "date", "checkbox", "select"]);
        const schemaCols: any[] = (schemaCatalog?.[active]?.columns ?? []).filter((c: any) => importableTypes.has(c.type));
        const labelOf = (key: string) => (t(`field.${key}`) !== `field.${key}` ? t(`field.${key}`) : key);
        let mapping = guessMapping(headers, schemaCols, labelOf);
        const dlg = new Dialog({
            title: t("ledger.importCsv"),
            content: `<div class="b3-dialog__content" id="lv-csvimp-body" style="max-height:60vh;overflow:auto">
<p class="lv-caption ft__on-surface">${t("ledger.importMapHint").replace("${file}", file.name).replace("${n}", String(table.length - 1))}</p>
<div id="lv-csvimp-map"></div></div>
<div class="b3-dialog__action"><span class="lv-caption" style="flex:1" id="lv-csvimp-stat"></span><button class="b3-button b3-button--cancel" id="lv-csvimp-close">${t("cancel")}</button><button class="b3-button" id="lv-csvimp-start">${t("ledger.importStart")}</button></div>`,
            width: "560px",
        });
        const mapBox = dlg.element.querySelector("#lv-csvimp-map") as HTMLElement;
        const selects: HTMLSelectElement[] = [];
        headers.forEach((h, i) => {
            const line = document.createElement("div");
            line.className = "fn__flex";
            line.style.cssText = "gap:8px;align-items:center;padding:3px 0;font-size:13px";
            const label = document.createElement("span");
            label.style.cssText = "flex:1;word-break:break-all";
            label.textContent = h || `#${i + 1}`;
            const sel = document.createElement("select");
            sel.className = "b3-select";
            sel.style.cssText = "width:200px;flex-shrink:0";
            sel.add(new Option(t("ledger.importSkip"), ""));
            for (const c of schemaCols) sel.add(new Option(labelOf(c.key), c.key));
            sel.value = mapping[i] ?? "";
            selects.push(sel);
            line.append(label, sel);
            mapBox.appendChild(line);
        });
        (dlg.element.querySelector("#lv-csvimp-close") as HTMLButtonElement).onclick = () => dlg.destroy();
        (dlg.element.querySelector("#lv-csvimp-start") as HTMLButtonElement).onclick = async (event) => {
            const startBtn = event.currentTarget as HTMLButtonElement;
            if (startBtn.disabled) return;
            mapping = Object.fromEntries(selects.map((s, i) => [i, s.value || undefined]));
            const mappedCount = Object.values(mapping).filter(Boolean).length;
            if (mappedCount === 0) { showMessage(t("ledger.importNoMap"), 4000, "error"); return; }
            const plan = planImport(table, mapping, schemaCols, "name");
            if (plan.rows.length === 0) { showMessage(t("ledger.importNoRows"), 4000, "error"); return; }
            startBtn.disabled = true;
            dlg.destroy();
            confirm(
                t("ledger.importCsv"),
                t("ledger.importConfirm")
                    .replace("${n}", String(plan.rows.length))
                    .replace("${skip}", String(plan.skipped))
                    .replace("${warnings}", String(plan.rows.reduce((n, row) => n + row.warnings.length, 0))),
                async () => {
                    try {
                        let ok = 0;
                        const importOperationKey = `ledger-import:${active}:${file.name}:${file.size}:${file.lastModified}`;
                        const failed: number[] = [];
                        const partial: number[] = [];
                        const pending: number[] = [];
                        for (let i = 0; i < plan.rows.length; i++) {
                            const row = plan.rows[i];
                            let created = false;
                            try {
                                const rowOperationKey = `${importOperationKey}:row:${i}`;
                                const itemID = await addDetachedRow(ref!.avId!, row.name, { idempotencyKey: rowOperationKey });
                                created = true;
                                for (const c of row.cells) {
                                    if (ref!.columns![c.key]) await setCell(ref!.avId!, ref!.columns![c.key], itemID, cellValue(c.type, c.value, members), {
                                        idempotencyKey: `${rowOperationKey}:cell:${c.key}`,
                                    });
                                }
                                ok++;
                            } catch (e) {
                                if (e instanceof RowIdentityPendingError) pending.push(i + 1);
                                else if (created) partial.push(i + 1);
                                else failed.push(i + 1);
                            }
                        }
                        await onReload();
                        try {
                            await onRefreshHub([active]);
                        } catch (e) {
                            showMessage(t("ledger.importRefreshFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                        }
                        const failTxt = failed.length ? ` · ${t("ledger.importRowFail").replace("${n}", String(failed.length))} (#${failed.slice(0, 3).join(", #")}${failed.length > 3 ? "..." : ""})` : "";
                        const partialTxt = partial.length ? ` · ${t("ledger.importPartial").replace("${n}", String(partial.length))} (#${partial.slice(0, 3).join(", #")}${partial.length > 3 ? "..." : ""})` : "";
                        const pendingTxt = pending.length ? ` · ${t("ledger.importPending").replace("${n}", String(pending.length))} (#${pending.slice(0, 3).join(", #")}${pending.length > 3 ? "..." : ""})` : "";
                        const warningRows = plan.rows.flatMap((row, i) => row.warnings.map((warning) => `#${i + 1} ${t(`field.${warning.key}`) !== `field.${warning.key}` ? t(`field.${warning.key}`) : warning.key}: ${warning.message}`));
                        const warningTxt = warningRows.length ? ` · ${t("ledger.importWarnings").replace("${n}", String(warningRows.length))}: ${warningRows.slice(0, 3).join("; ")}${warningRows.length > 3 ? "..." : ""}` : "";
                        const hasIssues = failed.length + partial.length + pending.length + warningRows.length > 0;
                        showMessage(t("ledger.importDone").replace("${ok}", String(ok)).replace("${skip}", String(plan.skipped)) + failTxt + partialTxt + pendingTxt + warningTxt, 10000, hasIssues ? "error" : "info");
                    } catch (e) {
                        showMessage(t("ledger.importRefreshFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                    }
                },
            );
        };
    };
    input.click();
}
