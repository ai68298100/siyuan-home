/**
 * 家庭急救与应急卡弹窗（318波）：
 * 聚合全家血型、已知过敏源、慢病用药、医保卡号、急救箱存放处与应急联络方式，
 * 在突发急救或访客只读模式下提供一键可达的生命支持卡片。
 * 独立模块，按需延迟加载以减轻主包负担。
 */

import { buildFamilyEmergencyCard, formatEmergencyCardText, type HealthRowLike, type CertRowLike, type StockRowLike } from "./emergency-card";
import type { AvRow } from "./siyuan";
import type { AvCellLike } from "./avcell";

export interface EmergencyCardDialogOptions {
    t: (k: string) => string;
    plugin: {
        settings: {
            members?: Array<{ id: string; name: string; role?: string; notes?: string; contactSnapshot?: string; avItemId?: string }>;
            dbRefs: Record<string, { avId?: string; columns?: Record<string, string> }>;
        };
        runtime?: { guestModeActive?: boolean };
    };
    DialogCls: new (options: { title: string; content: string; width?: string }) => {
        element: HTMLElement;
        destroy: () => void;
    };
    showMessageFn: (message: string, timeout?: number, type?: "info" | "error") => void;
    renderLedgerAllFn: (avId: string) => Promise<{ complete: boolean; rows: AvRow[] }>;
    cellTextFn: (v: AvCellLike | null | undefined, k?: string) => string;
}

export async function openEmergencyCardDialog(opts: EmergencyCardDialogOptions): Promise<void> {
    const { t, plugin, DialogCls, showMessageFn, renderLedgerAllFn, cellTextFn } = opts;

    const members = plugin.settings.members ?? [];
    const memberMap = new Map(members.map((m) => [m.avItemId ?? m.id, m.id]));

    const healthRef = plugin.settings.dbRefs?.health;
    const certsRef = plugin.settings.dbRefs?.certs;
    const stockRef = plugin.settings.dbRefs?.stock;

    const healthRows: HealthRowLike[] = [];
    const certRows: CertRowLike[] = [];
    const stockRows: StockRowLike[] = [];

    // 并行拉取各模块真实台账行
    await Promise.all([
        (async () => {
            if (!healthRef?.avId || !healthRef.columns) return;
            try {
                const res = await renderLedgerAllFn(healthRef.avId);
                if (!res.complete) return;
                for (const r of res.rows) {
                    const memId = memberMap.get(String(r.cells[healthRef.columns.member ?? ""]?.relation?.blockIDs?.[0] ?? ""));
                    const cat = cellTextFn(r.cells[healthRef.columns.category ?? ""]);
                    const diag = healthRef.columns.diagnosis ? cellTextFn(r.cells[healthRef.columns.diagnosis]) : undefined;
                    const name = healthRef.columns.name ? cellTextFn(r.cells[healthRef.columns.name]) : undefined;
                    const note = healthRef.columns.note ? cellTextFn(r.cells[healthRef.columns.note]) : undefined;
                    healthRows.push({ memberId: memId, category: cat, diagnosis: diag, name, note });
                }
            } catch { /* ignore read failure */ }
        })(),
        (async () => {
            if (!certsRef?.avId || !certsRef.columns) return;
            try {
                const res = await renderLedgerAllFn(certsRef.avId);
                if (!res.complete) return;
                for (const r of res.rows) {
                    const memId = memberMap.get(String(r.cells[certsRef.columns.member ?? ""]?.relation?.blockIDs?.[0] ?? ""));
                    const cat = cellTextFn(r.cells[certsRef.columns.category ?? ""]);
                    const no = certsRef.columns.number ? cellTextFn(r.cells[certsRef.columns.number]) : undefined;
                    const name = certsRef.columns.name ? cellTextFn(r.cells[certsRef.columns.name]) : undefined;
                    certRows.push({ memberId: memId, category: cat, number: no, name });
                }
            } catch { /* ignore read failure */ }
        })(),
        (async () => {
            if (!stockRef?.avId || !stockRef.columns) return;
            try {
                const res = await renderLedgerAllFn(stockRef.avId);
                if (!res.complete) return;
                for (const r of res.rows) {
                    const cat = cellTextFn(r.cells[stockRef.columns.category ?? ""]);
                    const name = stockRef.columns.name ? cellTextFn(r.cells[stockRef.columns.name]) : undefined;
                    const loc = stockRef.columns.location ? cellTextFn(r.cells[stockRef.columns.location]) : undefined;
                    stockRows.push({ category: cat, name, location: loc });
                }
            } catch { /* ignore read failure */ }
        })(),
    ]);

    const card = buildFamilyEmergencyCard({
        members,
        healthRows,
        certRows,
        stockRows,
    });

    const isGuest = Boolean(plugin.runtime?.guestModeActive);
    const cardText = formatEmergencyCardText(card, { maskSensitive: isGuest });

    const dlg = new DialogCls({
        title: t("overview.emergencyCardTitle"),
        content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-ecard-body">
  ${card.emergencyKitLocation ? `<div class="lv-card" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--lv-surface-2);margin-bottom:8px"><span>📦 ${t("overview.emergencyKitLocation")}: <b>${card.emergencyKitLocation}</b></span></div>` : ""}
  <div id="lv-ecard-members" style="display:flex;flex-direction:column;gap:8px"></div>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel">${t("close")}</button>
  <button class="b3-button" id="lv-ecard-copy">${t("ledger.emergencyKitCopy")}</button>
</div>`,
        width: "600px",
    });

    const membersEl = dlg.element.querySelector("#lv-ecard-members") as HTMLElement;
    (dlg.element.querySelector(".b3-button--cancel") as HTMLButtonElement).onclick = () => dlg.destroy();

    for (const m of card.members) {
        const item = document.createElement("div");
        item.className = "lv-metric-item";
        item.style.cssText = "flex-direction:column;align-items:stretch;padding:10px 14px;gap:6px";

        const head = document.createElement("div");
        head.style.cssText = "display:flex;justify-content:space-between;align-items:center";

        const nameLine = document.createElement("div");
        nameLine.style.cssText = "display:flex;align-items:center;gap:6px";
        const roleLabel = t(`role.${m.role}`) !== `role.${m.role}` ? t(`role.${m.role}`) : m.role;
        nameLine.innerHTML = `<b style="font-size:14px">${m.name}</b><span class="lv-badge gray">${roleLabel}</span>`;
        if (m.bloodType) {
            nameLine.innerHTML += `<span class="lv-badge orange" style="font-weight:600">🩸 ${m.bloodType}</span>`;
        }

        const contact = document.createElement("span");
        contact.className = "lv-caption";
        if (m.emergencyContact) {
            contact.textContent = `📞 ${m.emergencyContact}`;
        }
        head.append(nameLine, contact);
        item.appendChild(head);

        if (m.allergies.length > 0) {
            const allSec = document.createElement("div");
            allSec.style.cssText = "display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:12px";
            allSec.innerHTML = `<span class="lv-badge red" style="font-weight:600">⚠️ ${t("overview.emergencyAllergies")}</span>`;
            for (const a of m.allergies) {
                const b = document.createElement("span");
                b.className = "lv-badge red";
                b.textContent = a;
                allSec.appendChild(b);
            }
            item.appendChild(allSec);
        }

        if (m.chronicConditions.length > 0) {
            const condSec = document.createElement("div");
            condSec.className = "lv-caption";
            condSec.textContent = `🩺 ${t("overview.emergencyConditions")}: ${m.chronicConditions.join("、")}`;
            item.appendChild(condSec);
        }

        if (m.medicalInsuranceNo) {
            const insSec = document.createElement("div");
            insSec.className = "lv-caption";
            let no = m.medicalInsuranceNo;
            if (isGuest && no.length > 8) no = no.slice(0, 4) + " **** **** " + no.slice(-4);
            insSec.textContent = `💳 ${t("overview.emergencyInsurance")}: ${no}`;
            item.appendChild(insSec);
        }

        membersEl.appendChild(item);
    }

    (dlg.element.querySelector("#lv-ecard-copy") as HTMLButtonElement).onclick = async () => {
        try {
            await navigator.clipboard.writeText(cardText);
            showMessageFn(t("overview.lifeIndexCopied"), 2500, "info");
        } catch {
            showMessageFn(t("ledger.copyAsImageFail"), 4000, "error");
        }
    };
}
