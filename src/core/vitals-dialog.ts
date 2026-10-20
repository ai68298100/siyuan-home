/**
 * 健康指标流水区块（314 波，G5）：
 * 在 health 台账详情抽屉渲染「生理指标监测（血压/血糖/心率）+ 记一笔 + 趋势简报」。
 * 独立到 core 层避免 Svelte 页面体积膨胀。
 */
import * as rl from "./rowlog";
import { summarizeVitals, type VitalReading, type VitalType } from "./vitals";

export interface VitalsSectionOptions {
    t: (k: string) => string;
    plugin: { saveData: (name: string, data: unknown) => Promise<unknown> };
    avId: string;
    rowId: string;
    body: HTMLElement;
    showMessageFn: (message: string, timeout?: number, type?: "info" | "error") => void;
}

export async function addVitalsSectionImpl(opts: VitalsSectionOptions): Promise<void> {
    const { t, plugin, avId, rowId, body, showMessageFn } = opts;

    const head = document.createElement("div");
    head.className = "ft__on-surface";
    head.style.cssText = "margin-top:10px;padding-top:8px;border-top:1px solid var(--b3-border-color);font-size:12px";
    head.textContent = t("ledger.vitalsTitle");
    body.appendChild(head);

    const summary = document.createElement("div");
    summary.style.cssText = "padding:8px 10px;border-radius:8px;background:var(--b3-theme-background-light);margin-top:6px;font-size:12.5px";
    body.appendChild(summary);

    const form = document.createElement("div");
    form.style.cssText = "display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap";
    const typeSel = document.createElement("select");
    typeSel.className = "b3-select";
    typeSel.style.cssText = "font-size:12px;width:95px";
    typeSel.innerHTML = `<option value="bp">${t("ledger.vitalBp")}</option><option value="bg">${t("ledger.vitalBg")}</option><option value="hr">${t("ledger.vitalHr")}</option>`;
    const dateInp = document.createElement("input");
    dateInp.type = "date";
    dateInp.className = "b3-text-field";
    dateInp.style.cssText = "font-size:12px;width:125px";
    dateInp.value = new Date().toISOString().slice(0, 10);
    const val1Inp = document.createElement("input");
    val1Inp.type = "number";
    val1Inp.className = "b3-text-field";
    val1Inp.placeholder = t("ledger.vitalVal1");
    val1Inp.style.cssText = "font-size:12px;width:80px";
    const val2Inp = document.createElement("input");
    val2Inp.type = "number";
    val2Inp.className = "b3-text-field";
    val2Inp.placeholder = t("ledger.vitalVal2");
    val2Inp.style.cssText = "font-size:12px;width:80px";
    const addBtn = document.createElement("button");
    addBtn.className = "b3-button b3-button--outline";
    addBtn.style.cssText = "font-size:12px";
    addBtn.textContent = t("ledger.valAdd");
    form.append(typeSel, dateInp, val1Inp, val2Inp, addBtn);
    body.appendChild(form);

    const list = document.createElement("div");
    list.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-top:6px;max-height:160px;overflow-y:auto";
    body.appendChild(list);

    let logs: rl.RowLogs = {};
    const readAll = () => (rl.getEntries<VitalReading>(logs, avId, rowId, "vitals") as unknown as VitalReading[]) ?? [];

    const render = () => {
        const curType = (typeSel.value as VitalType) || "bp";
        val2Inp.style.display = curType === "hr" ? "none" : "";
        val2Inp.placeholder = curType === "bp" ? t("ledger.vitalDiastolic") : t("ledger.vitalPostMeal");

        const all = readAll();
        const currentTypeReadings = all.filter((r) => r.type === curType);
        const report = summarizeVitals(currentTypeReadings, curType);

        summary.replaceChildren();
        const title = document.createElement("b");
        title.style.cssText = "font-size:13px;color:var(--lv-accent)";
        title.textContent = report.total > 0
            ? `${t("ledger.vitalLatest")}: ${report.latest ? `${report.latest.val1}${report.latest.val2 !== undefined ? `/${report.latest.val2}` : ""}` : "—"} (${report.latestAssessment?.label ?? "—"})`
            : t("ledger.vitalNoReadings");
        const meta = document.createElement("span");
        meta.className = "lv-caption";
        meta.style.marginLeft = "8px";
        meta.textContent = `${t("ledger.vitalCount")} ${report.total}${report.abnormalCount > 0 ? ` · ${t("ledger.vitalAbnormal")} ${report.abnormalCount}` : ""}`;
        summary.append(title, meta);

        list.replaceChildren();
        if (currentTypeReadings.length === 0) {
            const none = document.createElement("div");
            none.className = "ft__on-surface";
            none.style.cssText = "font-size:12px";
            none.textContent = t("ledger.vitalEmpty");
            list.appendChild(none);
            return;
        }
        for (const r of currentTypeReadings.slice().reverse()) {
            const line = document.createElement("div");
            line.style.cssText = "display:flex;justify-content:space-between;align-items:center;font-size:12.5px";
            const valStr = r.val2 !== undefined ? `${r.val1}/${r.val2}` : String(r.val1);
            const left = document.createElement("span");
            left.textContent = `${r.date} · ${valStr}`;
            const del = document.createElement("button");
            del.className = "b3-button b3-button--text";
            del.style.cssText = "font-size:11.5px;padding:0 4px";
            del.textContent = t("delete");
            del.onclick = async () => {
                del.disabled = true;
                try {
                    logs = await rl.updateRowLogs(plugin as never, (cur) => rl.removeEntry(cur, avId, rowId, "vitals", r as unknown as Record<string, unknown>));
                    render();
                } catch (err) {
                    del.disabled = false;
                    showMessageFn(t("ledger.logDeleteFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 5000, "error");
                }
            };
            line.append(left, del);
            list.appendChild(line);
        }
    };

    typeSel.onchange = render;

    addBtn.onclick = async () => {
        const val1 = Number(val1Inp.value);
        if (!dateInp.value || !Number.isFinite(val1) || val1 <= 0) {
            showMessageFn(t("ledger.logInvalid"), 3000, "error");
            return;
        }
        const curType = (typeSel.value as VitalType) || "bp";
        const val2 = curType !== "hr" && val2Inp.value ? Number(val2Inp.value) : undefined;
        addBtn.disabled = true;
        try {
            logs = await rl.updateRowLogs(plugin as never, (cur) => rl.appendEntry(cur, avId, rowId, "vitals", {
                date: dateInp.value,
                type: curType,
                val1,
                ...(val2 !== undefined ? { val2 } : {}),
                at: new Date().toISOString(),
            }));
            val1Inp.value = "";
            val2Inp.value = "";
            render();
        } catch (err) {
            showMessageFn(t("ledger.logSavedRefreshFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 5000, "error");
        } finally {
            addBtn.disabled = false;
        }
    };

    try {
        logs = await rl.loadRowLogs(plugin as never);
        render();
    } catch (err) {
        summary.textContent = t("ledger.logReadFailed").replace("${msg}", err instanceof Error ? err.message : String(err));
    }
}
