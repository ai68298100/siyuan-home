<script lang="ts">
    import { showMessage } from "siyuan";
    import { MODULE_GROUPS, modulesByGroup } from "@/core/modules";
    import type { HomeSettings } from "@/types";

    interface IHomePluginLike {
        i18n: Record<string, string>;
        settings: HomeSettings;
        openSetting: () => void;
    }

    let { plugin, settings }: {
        plugin: IHomePluginLike;
        settings: HomeSettings;
    } = $props();

    const t = (key: string) => plugin.i18n[key] ?? key;

    const enabledIds = $derived(new Set(settings.enabledModules));
    const isEnabled = (id: string) => enabledIds.has(id);

    const roleLabel = (role: string) => t(`role.${role}`);

    function onModuleClick(mod: { id: string; devStatus: string; alwaysOn?: boolean }) {
        if (mod.devStatus === "planned") {
            showMessage(t("status.planned"), 2800, "info");
        } else {
            showMessage(t("status.skeleton"), 2800, "info");
        }
    }
</script>

<div class="lv-home">
    <div class="lv-home__header">
        <div class="lv-home__title">
            <span class="fn__space"></span>
            <span class="b3-card__info-title">{t("dashboard.title")}</span>
        </div>
        <div class="fn__flex-1"></div>
        <button class="b3-button b3-button--outline fn__size200" onclick={() => plugin.openSetting()}>
            {t("dashboard.settings")}
        </button>
    </div>

    <div class="lv-home__section">
        <div class="lv-home__section-title">{t("dashboard.members")}</div>
        <div class="fn__flex fn__flex-wrap">
            {#if settings.members.length === 0}
                <button type="button" class="b3-chip b3-chip--middle" onclick={() => plugin.openSetting()}>
                    ＋ {t("dashboard.addMember")}
                </button>
            {:else}
                {#each settings.members as m (m.id)}
                    <span class="b3-chip b3-chip--middle" role="button" tabindex="0">
                        {m.name} · {roleLabel(m.role)}{m.lunarBirthday ? " 🌙" : ""}
                    </span>
                {/each}
                <button type="button" class="b3-chip b3-chip--middle" onclick={() => plugin.openSetting()}>
                    ＋
                </button>
            {/if}
        </div>
    </div>

    <div class="lv-home__section">
        <div class="lv-home__section-title">{t("dashboard.reminders")}</div>
        <div class="b3-card lv-home__empty-card">
            <div class="b3-card__info">{t("dashboard.remindersEmpty")}</div>
        </div>
    </div>

    <div class="lv-home__section">
        <div class="lv-home__section-title">
            {t("dashboard.enabledModules")} · {settings.enabledModules.length}
        </div>
        {#each MODULE_GROUPS as gid (gid)}
            {@const mods = modulesByGroup(gid).filter((m) => isEnabled(m.id))}
            {#if mods.length > 0}
                <div class="lv-home__group">
                    <div class="lv-home__group-title">{t(`group.${gid}`)}</div>
                    <div class="lv-home__grid">
                        {#each mods as mod (mod.id)}
                            <div
                                class="b3-card lv-home__card"
                                onclick={() => onModuleClick(mod)}
                                onkeydown={(e: KeyboardEvent) => e.key === "Enter" && onModuleClick(mod)}
                                role="button"
                                tabindex="0"
                            >
                                <div class="b3-card__info">
                                    <div class="fn__flex">
                                        <span class="b3-card__info-title">{t(`module.${mod.id}`)}</span>
                                        <span class="fn__flex-1"></span>
                                        {#if mod.alwaysOn}
                                            <span class="b3-chip b3-chip--secondary b3-chip--small">{t("alwaysOn")}</span>
                                        {:else if mod.devStatus === "skeleton"}
                                            <span class="b3-chip b3-chip--primary b3-chip--small">{t("skeleton")}</span>
                                        {/if}
                                    </div>
                                    <div class="b3-card__info-meta">{t(`module.${mod.id}.desc`)}</div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        {/each}
    </div>
</div>
