/**
 * 家务轮换区块（310 波，G1）：
 * 在 chores 台账详情抽屉里渲染「本轮该谁 + 完成历史 + 记一次完成」。
 * 抽到 core 层是为了给 Svelte 页面减负（页内长段 DOM/模板字符串对 gzip 不友好）。
 */
import * as rl from "./rowlog";
import { nextAssignee, buildChoreHistory } from "./chores";
import type { AvCellLike } from "./avcell";

export interface ChoreSectionOptions {
    t: (k: string) => string;
    plugin: { settings: { members?: Array<{ id: string; name: string }> }; saveData: (name: string, data: unknown) => Promise<unknown> };
    avId: string;
    rowId: string;
    body: HTMLElement;
    showMessageFn: (message: string, timeout?: number, type?: "info" | "error") => void;
}

export async function addChoreRotationSectionImpl(opts: ChoreSectionOptions): Promise<void> {
    const { t, plugin, avId, rowId, body, showMessageFn } = opts;
    const roster = (plugin.settings.members ?? []).map((m) => ({ id: m.id, name: m.name }));
    const readCompletions = (logs: rl.RowLogs) =>
        rl.getEntries<Record<string, unknown>>(logs, avId, rowId, "chexecs");

    const head = document.createElement("div");
    head.className = "ft__on-surface";
    head.style.cssText = "margin-top:10px;padding-top:8px;border-top:1px solid var(--b3-border-color);font-size:12px";
    head.textContent = t("ledger.choreRotation");
    body.appendChild(head);

    const summary = document.createElement("div");
    summary.style.cssText = "padding:8px 10px;border-radius:8px;background:var(--b3-theme-background-light);margin-top:6px;font-size:12.5px";
    body.appendChild(summary);

    const list = document.createElement("div");
    list.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-top:6px;max-height:180px;overflow-y:auto";
    body.appendChild(list);

    const form = document.createElement("div");
    form.style.cssText = "display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap";
    const whoSel = document.createElement("select");
    whoSel.className = "b3-select";
    whoSel.style.cssText = "font-size:12px;width:110px";
    for (const m of roster) {
        const o = document.createElement("option");
        o.value = m.id;
        o.textContent = m.name;
        whoSel.append(o);
    }
    const dateInp = document.createElement("input");
    dateInp.type = "date";
    dateInp.className = "b3-text-field";
    dateInp.style.cssText = "font-size:12px;width:130px";
    dateInp.value = new Date().toISOString().slice(0, 10);
    const noteInp = document.createElement("input");
    noteInp.className = "b3-text-field";
    noteInp.placeholder = t("ledger.choreNote");
    noteInp.style.cssText = "font-size:12px;flex:1;min-width:90px";
    const pointsInp = document.createElement("input");
    pointsInp.type = "number";
    pointsInp.className = "b3-text-field";
    pointsInp.placeholder = t("ledger.chorePoints");
    pointsInp.title = t("ledger.chorePointsTip");
    pointsInp.style.cssText = "font-size:12px;width:60px";
    pointsInp.min = "0";
    const addBtn = document.createElement("button");
    addBtn.className = "b3-button b3-button--outline";
    addBtn.style.cssText = "font-size:12px";
    addBtn.textContent = t("ledger.choreDone");
    form.append(whoSel, dateInp, noteInp, pointsInp, addBtn);
    body.appendChild(form);

    let logs: rl.RowLogs = {};
    const render = () => {
        const completions = readCompletions(logs) as unknown as Parameters<typeof buildChoreHistory>[0];
        const today = new Date().toISOString().slice(0, 10);
        const assignee = nextAssignee(roster, completions, today);
        const history = buildChoreHistory(completions, roster);

        summary.replaceChildren();
        const who = document.createElement("b");
        who.style.cssText = "font-size:13px;color:var(--lv-accent)";
        who.textContent = assignee.member
            ? `${t("ledger.choreNext")}: ${assignee.member.name}`
            : t("ledger.choreNoRoster");
        const meta = document.createElement("span");
        meta.className = "lv-caption";
        meta.style.marginLeft = "8px";
        meta.textContent = assignee.lastDone
            ? `${t("ledger.choreLast")} ${assignee.lastDone}${assignee.daysSince !== undefined ? ` · ${assignee.daysSince} ${t("days.unit")}` : ""} · ${t("ledger.choreTotal")} ${history.total}`
            : `${t("ledger.choreTotal")} ${history.total}`;
        summary.append(who, meta);

        list.replaceChildren();
        if (history.entries.length === 0) {
            const none = document.createElement("div");
            none.className = "ft__on-surface";
            none.style.cssText = "font-size:12px";
            none.textContent = t("ledger.choreEmpty");
            list.appendChild(none);
            return;
        }
        for (const e of history.entries) {
            const line = document.createElement("div");
            line.style.cssText = "display:flex;gap:6px;align-items:center;font-size:12.5px";
            const txt = document.createElement("span");
            const ptsTag = e.points ? ` <span class="lv-badge green">+${e.points}分</span>` : "";
            txt.innerHTML = `${e.date} · ${e.memberName}${ptsTag}${e.note ? ` —— ${e.note}` : ""}`;
            const del = document.createElement("button");
            del.className = "b3-button b3-button--text";
            del.style.cssText = "padding:0 4px;font-size:12px";
            del.textContent = t("delete");
            del.onclick = async () => {
                del.disabled = true;
                try {
                    logs = await rl.updateRowLogs(plugin as never, (cur) => rl.removeEntry(cur, avId, rowId, "chexecs", e as unknown as Record<string, unknown>));
                    render();
                } catch (err) {
                    del.disabled = false;
                    showMessageFn(t("ledger.logDeleteFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 5000, "error");
                }
            };
            line.append(txt, del);
            list.appendChild(line);
        }
    };

    addBtn.onclick = async () => {
        if (addBtn.disabled) return;
        if (!dateInp.value) {
            showMessageFn(t("ledger.logInvalid"), 3000, "error");
            return;
        }
        const pts = Number(pointsInp.value);
        addBtn.disabled = true;
        try {
            logs = await rl.updateRowLogs(plugin as never, (cur) => rl.appendEntry(cur, avId, rowId, "chexecs", {
                date: dateInp.value,
                memberId: whoSel.value || undefined,
                note: noteInp.value.trim() || undefined,
                ...(Number.isFinite(pts) && pts > 0 ? { points: pts } : {}),
                at: new Date().toISOString(),
            }));
            noteInp.value = "";
            pointsInp.value = "";
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

export type { AvCellLike };
