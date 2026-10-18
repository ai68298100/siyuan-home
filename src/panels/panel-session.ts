/** Ephemeral UI state scoped to a plugin instance; never persisted to notes or settings. */
export type PluginScreen = "overview" | "reminders" | "ledger" | "members";
export type TableDensity = "comfortable" | "compact";

export interface PanelSessionState {
    scrollTop: Partial<Record<PluginScreen, number>>;
    ledgerSearch: string;
    tableDensity?: TableDensity;
}

const sessions = new WeakMap<object, PanelSessionState>();

export function panelSession(plugin: object): PanelSessionState {
    let state = sessions.get(plugin);
    if (!state) {
        state = { scrollTop: {}, ledgerSearch: "" };
        sessions.set(plugin, state);
    }
    return state;
}
