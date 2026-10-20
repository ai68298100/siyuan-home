/**
 * 家务积分与零花钱结算对话框（317 波，G8）：
 * 遍历 chores 台账所有行级流水（chexecs），汇总儿童与成员的劳动积分，
 * 支持查看各成员待结算明细、一键复制积分账本简报、以及一键结算写入 allowance 账本。
 * 独立模块，按需延迟加载以减轻主包负担。
 */

import * as rl from "./rowlog";
import {
    calculateMemberRewardPoints,
    formatRewardsSummaryText,
    mapPointsToAllowanceRow,
    type RewardRecordItem,
} from "./rewards-ledger";

export interface RewardsDialogOptions {
    t: (k: string) => string;
    plugin: {
        settings: {
            dbRefs: Record<string, { avId?: string; columns?: Record<string, string> }>;
            members?: Array<{ id: string; name: string }>;
        };
        saveData: (name: string, data: unknown) => Promise<unknown>;
    };
    DialogCls: new (options: { title: string; content: string; width?: string }) => {
        element: HTMLElement;
        destroy: () => void;
    };
    showMessageFn: (message: string, timeout?: number, type?: "info" | "error") => void;
    renderLedgerAllFn: (avId: string) => Promise<{ complete: boolean; rows: Array<{ itemID: string; cells: Record<string, any> }> }>;
    cellTextFn: (v: any) => string;
    addDetachedRowFn?: (avId: string, name: string) => Promise<string>;
    setCellFn?: (avId: string, colId: string, itemId: string, val: unknown) => Promise<unknown>;
}

export async function openRewardsDialog(opts: RewardsDialogOptions): Promise<void> {
    const { t, plugin, DialogCls, showMessageFn, renderLedgerAllFn, cellTextFn, addDetachedRowFn, setCellFn } = opts;

    const choresRef = plugin.settings.dbRefs?.chores;
    if (!choresRef?.avId || !choresRef.columns?.name) {
        showMessageFn(t("ledger.choresNotProvisioned"), 4000, "info");
        return;
    }

    let choresRes: { complete: boolean; rows: Array<{ itemID: string; cells: Record<string, any> }> };
    try {
        choresRes = await renderLedgerAllFn(choresRef.avId);
    } catch (e) {
        showMessageFn(t("ledger.logReadFailed") + " (" + (e instanceof Error ? e.message : String(e)) + ")", 5000, "error");
        return;
    }

    if (!choresRes.complete) {
        showMessageFn(t("ledger.loadIncomplete"), 5000, "error");
        return;
    }

    const memberMap = new Map((plugin.settings.members ?? []).map((m) => [m.id, m.name]));
    const logs = await rl.loadRowLogs(plugin as never);

    // 收集全部家务行的完成流水
    const allRecords: RewardRecordItem[] = [];
    const recordPointers: Array<{ avId: string; rowId: string; entry: Record<string, unknown> }> = [];

    for (const r of choresRes.rows) {
        const choreName = cellTextFn(r.cells[choresRef.columns.name]) || "未命名家务";
        const entries = rl.getEntries<Record<string, unknown>>(logs, choresRef.avId, r.itemID, "chexecs");
        for (const e of entries) {
            const pts = Number(e.points);
            if (Number.isFinite(pts) && pts > 0) {
                allRecords.push({
                    choreName,
                    memberId: typeof e.memberId === "string" ? e.memberId : undefined,
                    date: String(e.date || ""),
                    points: pts,
                    settled: Boolean(e.settled),
                    note: typeof e.note === "string" ? e.note : undefined,
                });
                recordPointers.push({ avId: choresRef.avId, rowId: r.itemID, entry: e });
            }
        }
    }

    const memberIds = Array.from(memberMap.keys());
    const report = calculateMemberRewardPoints(allRecords, memberIds);
    const memberNameOf = (id: string) => memberMap.get(id) || t("members.unassigned");

    const dlg = new DialogCls({
        title: t("ledger.rewardsTitle"),
        content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-rewards-body">
  <div class="lv-card" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--lv-surface-2);margin-bottom:10px">
    <div style="display:flex;flex-direction:column;gap:4px">
      <span class="lv-caption">${t("ledger.rewardsUnsettledAll")}</span>
      <div style="display:flex;align-items:baseline;gap:6px">
        <b class="lv-num" style="font-size:24px;color:var(--lv-accent)">${report.unsettledPointsAll}</b>
        <span class="lv-caption" style="font-size:12px">${t("ledger.rewardsPointsUnit")}（≈ ¥${report.settleableAmountAll}）</span>
      </div>
    </div>
    <div style="text-align:right">
      <span class="lv-caption">${t("ledger.rewardsTotalEarned")}: ${report.totalPointsAll}</span>
      <div class="lv-caption" style="font-size:11.5px;color:var(--lv-tx-2)">${report.pointsPerYuan} 积分 = 1 元</div>
    </div>
  </div>
  <div id="lv-rewards-list" style="display:flex;flex-direction:column;gap:8px"></div>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" id="lv-rewards-close">${t("close")}</button>
  <button class="b3-button b3-button--outline" id="lv-rewards-copy">${t("ledger.emergencyKitCopy")}</button>
  <button class="b3-button" id="lv-rewards-settle" ${report.unsettledPointsAll === 0 ? "disabled" : ""}>${t("ledger.rewardsSettleBtn")}</button>
</div>`,
        width: "580px",
    });

    const listEl = dlg.element.querySelector("#lv-rewards-list") as HTMLElement;
    (dlg.element.querySelector("#lv-rewards-close") as HTMLButtonElement).onclick = () => dlg.destroy();

    if (report.members.length === 0 || report.totalPointsAll === 0) {
        const empty = document.createElement("div");
        empty.className = "ft__on-surface";
        empty.style.cssText = "font-size:12.5px;padding:16px 0;text-align:center";
        empty.textContent = t("ledger.rewardsEmpty");
        listEl.appendChild(empty);
    } else {
        for (const m of report.members) {
            const row = document.createElement("div");
            row.className = "lv-metric-item";
            row.style.cssText = "flex-direction:row;align-items:center;justify-content:space-between;padding:10px 12px;font-size:12.5px";

            const left = document.createElement("div");
            left.style.cssText = "display:flex;flex-direction:column;gap:3px;min-width:0;flex:1";

            const title = document.createElement("b");
            title.textContent = memberNameOf(m.memberId);

            const sub = document.createElement("span");
            sub.className = "lv-caption";
            sub.textContent = m.unsettledChores.length > 0
                ? `${t("ledger.rewardsChoresPending")}: ${m.unsettledChores.join("、")}`
                : t("ledger.rewardsAllSettled");

            left.append(title, sub);

            const right = document.createElement("div");
            right.style.cssText = "text-align:right;flex-shrink:0";
            right.innerHTML = `<b class="lv-num" style="font-size:15px;color:var(--lv-accent)">${m.unsettledPoints}</b> <span class="lv-caption">分 (¥${m.settleableAmount})</span><div class="lv-caption">${t("ledger.rewardsTotalEarned")}: ${m.totalEarned}</div>`;

            row.append(left, right);
            listEl.appendChild(row);
        }
    }

    (dlg.element.querySelector("#lv-rewards-copy") as HTMLButtonElement).onclick = async () => {
        const text = formatRewardsSummaryText(report, memberNameOf);
        try {
            await navigator.clipboard.writeText(text);
            showMessageFn(t("overview.lifeIndexCopied"), 2500, "info");
        } catch {
            showMessageFn(t("ledger.copyAsImageFail"), 4000, "error");
        }
    };

    // 一键结算入 allowance 账本
    const settleBtn = dlg.element.querySelector("#lv-rewards-settle") as HTMLButtonElement;
    settleBtn.onclick = async () => {
        if (report.unsettledPointsAll === 0) return;
        const allowRef = plugin.settings.dbRefs?.allowance;
        if (!allowRef?.avId || !addDetachedRowFn || !setCellFn) {
            showMessageFn(t("ledger.rewardsAllowanceMissing"), 4000, "info");
            return;
        }

        settleBtn.disabled = true;
        let settledMembers = 0;
        try {
            const today = new Date().toISOString().slice(0, 10);
            const { selectCellValue } = await import("./avcell");

            for (const m of report.members) {
                if (m.unsettledPoints <= 0) continue;
                const mName = memberNameOf(m.memberId);
                const payload = mapPointsToAllowanceRow(m, mName, { date: today, pointsPerYuan: report.pointsPerYuan });
                if (!payload) continue;

                // 在 allowance 台账新建行
                const rowId = await addDetachedRowFn(allowRef.avId, payload.name);
                if (!rowId) continue;

                if (allowRef.columns?.amount) await setCellFn(allowRef.avId, allowRef.columns.amount, rowId, payload.amount);
                if (allowRef.columns?.category) await setCellFn(allowRef.avId, allowRef.columns.category, rowId, selectCellValue(payload.category));
                if (allowRef.columns?.direction) await setCellFn(allowRef.avId, allowRef.columns.direction, rowId, selectCellValue(payload.direction));
                if (allowRef.columns?.date) await setCellFn(allowRef.avId, allowRef.columns.date, rowId, payload.date);
                if (payload.memberId && allowRef.columns?.member) {
                    await setCellFn(allowRef.avId, allowRef.columns.member, rowId, { type: "relation", relation: { blockIDs: [payload.memberId], contents: null } });
                }
                if (payload.note && allowRef.columns?.note) await setCellFn(allowRef.avId, allowRef.columns.note, rowId, payload.note);
                if (payload.source && allowRef.columns?.source) await setCellFn(allowRef.avId, allowRef.columns.source, rowId, payload.source);

                settledMembers++;
            }

            // 更新已结算标记到 chexecs 日志中
            await rl.updateRowLogs(plugin as never, (current) => {
                for (const ptr of recordPointers) {
                    const key = rl.logKey(ptr.avId, ptr.rowId);
                    const log = current[key];
                    const list = (log?.chexecs as Array<Record<string, unknown>>) ?? [];
                    const found = list.find((e) => e.date === ptr.entry.date && e.at === ptr.entry.at && e.points === ptr.entry.points);
                    if (found) found.settled = true;
                }
                return current;
            });

            showMessageFn(t("ledger.rewardsSettleSuccess").replace("${n}", String(settledMembers)), 4000, "info");
            dlg.destroy();
        } catch (e) {
            showMessageFn(t("capture.failed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        } finally {
            settleBtn.disabled = false;
        }
    };
}
