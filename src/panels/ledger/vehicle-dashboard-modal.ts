import { Dialog } from "siyuan";
import { renderLedgerAll } from "@/core/siyuan";
import { loadRowLogs, getEntries } from "@/core/rowlog";
import { calculateEnergyStats, type EnergyRecord } from "@/core/fuel";
import { selectCellContent } from "@/core/avcell";
import { formatAmount } from "@/core/format";
import { uiIcon } from "@/ui/icons";

interface VehicleDashboardOptions {
    ref?: { avId?: string; columns?: Record<string, string> };
    active: string;
    plugin: any;
    t: (key: string) => string;
    cellText: (cell: any, key?: string) => string;
    openDetail: (row: any) => void;
    openNewRecord: () => void;
}

export async function openEnergyDashboardModal({
    ref,
    active,
    plugin,
    t,
    cellText,
    openDetail,
    openNewRecord,
}: VehicleDashboardOptions): Promise<void> {
    const sourceRef = ref;
    if (!sourceRef?.avId || active !== "vehicles") return;
    const dlg = new Dialog({
        title: t("fuel.dashboardTitle"),
        content: `<div class="b3-dialog__content b3-dialog__content--wrap" id="lv-fuel-dashboard" style="max-height:68vh;overflow:auto"></div>`,
        width: "620px",
    });
    dlg.element.classList.add("lv-energy-dialog");
    const body = dlg.element.querySelector("#lv-fuel-dashboard") as HTMLElement;
    const loading = document.createElement("div");
    loading.className = "ft__on-surface";
    loading.textContent = t("fuel.loading");
    body.appendChild(loading);
    try {
        const result = await renderLedgerAll(sourceRef.avId);
        if (!result.complete) throw new Error(t("ledger.loadIncomplete"));
        if (ref?.avId !== sourceRef.avId) { dlg.destroy(); return; }
        const cols = sourceRef.columns ?? {};
        const vehicles = result.rows;
        body.replaceChildren();
        const intro = document.createElement("p");
        intro.className = "ft__on-surface";
        intro.style.cssText = "font-size:12px;line-height:1.65;margin:0 0 10px";
        intro.textContent = t("fuel.dashboardHint");
        body.appendChild(intro);
        if (vehicles.length === 0) {
            const empty = document.createElement("div");
            empty.className = "lv-empty";
            const icon = document.createElement("div"); icon.className = "eic"; icon.innerHTML = uiIcon("car");
            const title = document.createElement("b"); title.textContent = t("fuel.noVehicles");
            const hint = document.createElement("span"); hint.textContent = t("fuel.noVehiclesHint");
            const add = document.createElement("button"); add.className = "b3-button"; add.textContent = `+ ${t("fuel.addVehicle")}`;
            add.onclick = () => { dlg.destroy(); openNewRecord(); };
            empty.append(icon, title, hint, add);
            body.appendChild(empty);
            return;
        }
        const logs = await loadRowLogs(plugin);
        const vehicleType = (row: any) => selectCellContent(row.cells?.[cols.energy_type ?? ""]) ?? "gasoline";
        const miniStat = (label: string, value: string) => {
            const item = document.createElement("div");
            item.style.cssText = "min-width:0;padding:8px 10px;border-radius:8px;background:var(--b3-theme-background-light);display:flex;flex-direction:column;gap:3px";
            const name = document.createElement("span"); name.className = "ft__on-surface"; name.style.fontSize = "11px"; name.textContent = label;
            const val = document.createElement("b"); val.style.cssText = "font-size:14px;overflow-wrap:anywhere"; val.textContent = value;
            item.append(name, val);
            return item;
        };
        for (const vehicle of vehicles) {
            const card = document.createElement("section");
            card.className = "lv-card";
            card.style.cssText = "padding:12px;margin-bottom:10px";
            const head = document.createElement("div");
            head.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px";
            const title = document.createElement("b");
            title.style.fontSize = "14px";
            title.textContent = cellText(vehicle.cells?.[cols.name ?? ""], "name") || t("ledger.unnamed");
            const plate = document.createElement("span");
            plate.className = "ft__on-surface";
            plate.style.fontSize = "12px";
            plate.textContent = cellText(vehicle.cells?.[cols.plate ?? ""]);
            head.append(title, plate);
            const records = getEntries<EnergyRecord>(logs, sourceRef.avId, vehicle.itemID, "fuelings")
                .concat(getEntries<EnergyRecord>(logs, sourceRef.avId, vehicle.itemID, "chargings"));
            const fuel = calculateEnergyStats(records, "fuel");
            const charge = calculateEnergyStats(records, "charging");
            const hybrid = vehicleType(vehicle) === "hybrid";
            const grid = document.createElement("div");
            grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(126px,1fr));gap:6px";
            const consumption = (stats: ReturnType<typeof calculateEnergyStats>, suffix: string) =>
                stats.consumptionPer100Km !== undefined ? `${stats.consumptionPer100Km.toFixed(2)} ${suffix}/100km${stats.method === "estimated" ? ` · ${t("fuel.estimated")}` : ""}` : "—";
            const cost = (stats: ReturnType<typeof calculateEnergyStats>) => stats.costPer100Km !== undefined
                ? `${formatAmount(stats.costPer100Km / 100)} ${t("fuel.currencyPerKm")}` : "—";
            grid.append(
                miniStat(t("fuel.fuelConsumption"), fuel.recordCount ? hybrid ? `${fuel.totalQuantity.toFixed(1)} L · ${t("fuel.totalRecorded")}` : consumption(fuel, "L") : "—"),
                miniStat(t("fuel.fuelCostPerKm"), fuel.recordCount ? hybrid ? t("fuel.hybridNoRate") : cost(fuel) : "—"),
                miniStat(t("fuel.chargeConsumption"), charge.recordCount ? hybrid ? `${charge.totalQuantity.toFixed(1)} kWh · ${t("fuel.totalRecorded")}` : consumption(charge, "kWh") : "—"),
                miniStat(t("fuel.chargeCostPerKm"), charge.recordCount ? hybrid ? t("fuel.hybridNoRate") : cost(charge) : "—"),
                miniStat(t("fuel.fuelRecordedSpending"), fuel.costRecordCount === 0 ? t("fuel.costUnknown") : `${formatAmount(fuel.totalCost)} ${t("fuel.currency")}${fuel.costRecordCount < fuel.recordCount ? ` · ${t("fuel.subtotal")}` : ""}`),
                miniStat(t("fuel.chargeRecordedSpending"), charge.costRecordCount === 0 ? t("fuel.costUnknown") : `${formatAmount(charge.totalCost)} ${t("fuel.currency")}${charge.costRecordCount < charge.recordCount ? ` · ${t("fuel.subtotal")}` : ""}`),
            );
            const action = document.createElement("button");
            action.className = "b3-button b3-button--text";
            action.style.cssText = "margin-top:6px;padding:4px 0";
            action.textContent = `${t("fuel.openVehicle")} →`;
            action.onclick = () => { dlg.destroy(); openDetail(vehicle); };
            card.append(head, grid, action);
            body.appendChild(card);
        }
    } catch (error) {
        body.replaceChildren();
        const message = document.createElement("div");
        message.className = "lv-record-error";
        message.textContent = t("ledger.readFailed").replace("${msg}", error instanceof Error ? error.message : String(error));
        body.appendChild(message);
    }
}
