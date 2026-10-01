import { Plugin, showMessage } from "siyuan";
import "./index.scss";

import Dashboard from "@/panels/dashboard.svelte";
import HomeSettingsPanel from "@/panels/settings.svelte";
import { svelteDialog } from "@/libs/dialog";
import { loadSettings, saveSettings } from "@/core/settings";
import type { HomeSettings } from "@/types";

/**
 * 小驴管家（Lv Home）
 * 家庭与生活管家：成员档案 · 资产 · 育儿上学 · 病历社保 · 影音书库 · 出行旅行
 */
export default class LvHomePlugin extends Plugin {
    settings: HomeSettings;

    async onload() {
        this.settings = await loadSettings(this);

        this.addTopBar({
            icon: "iconEmoji",
            title: this.i18n.butler,
            callback: () => this.showDashboard(),
        });

        this.addCommand({
            langKey: "openButler",
            hotkey: "",
            callback: () => this.showDashboard(),
        });

        if (!this.settings.onboarded) {
            showMessage(this.i18n.firstRun, 6000, "info");
            this.settings.onboarded = true;
            await saveSettings(this, this.settings);
        }
    }

    showDashboard() {
        svelteDialog({
            title: `${this.i18n.butler} · ${this.i18n["dashboard.title"]}`,
            component: Dashboard,
            props: {
                plugin: this,
                settings: this.settings,
            },
            width: "760px",
        });
    }

    openSetting() {
        svelteDialog({
            title: this.i18n.settingsTitle,
            component: HomeSettingsPanel,
            props: {
                plugin: this,
                settings: this.settings,
            },
            width: "860px",
        });
    }

    onunload() {
        // v0.1 无常驻资源
    }
}
