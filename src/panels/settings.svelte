<script lang="ts">
    import { showMessage, confirm } from "siyuan";
    import { MODULE_GROUPS, modulesByGroup } from "@/core/modules";
    import { newMember, saveSettings } from "@/core/settings";
    import type { HomeSettings, MemberRole } from "@/types";

    interface IHomePluginLike {
        i18n: Record<string, string>;
        settings: HomeSettings;
        getDiagnostics?: () => any;
    }

    let { plugin, settings }: {
        plugin: IHomePluginLike;
        settings: HomeSettings;
    } = $props();

    const t = (key: string) => plugin.i18n[key] ?? key;

    let tab: "modules" | "members" | "about" = $state("modules");
    let saving = $state(false);
    // 33.4 编辑事务：draft 副本，保存才落盘（取消/关闭不污染 settings）。
    // 此处捕获初始快照是设计意图，抑制 svelte 的 locally-referenced 提示。
    // svelte-ignore state_referenced_locally
    let draftEnabled: string[] = $state([...settings.enabledModules]);
    // svelte-ignore state_referenced_locally
    let draftMembers: any[] = $state(settings.members.map((m: any) => ({ ...m })));

    const ROLES: MemberRole[] = ["self", "spouse", "partner", "child", "elder", "kin", "other"];
    const enabledIds = $derived(new Set(draftEnabled));

    function toggleModule(id: string, alwaysOn?: boolean) {
        if (alwaysOn) return;
        if (enabledIds.has(id)) {
            draftEnabled = draftEnabled.filter((x) => x !== id);
        } else {
            draftEnabled = [...draftEnabled, id];
            const mod = modulesByGroup("kids").find((m) => m.id === id);
            if (mod?.suggestRoles?.length) {
                const has = draftMembers.some((m) => mod.suggestRoles!.includes(m.role));
                if (!has) showMessage(t("members.suggestOn"), 3200, "info");
            }
        }
    }

    function enableAll() {
        draftEnabled = MODULE_GROUPS.flatMap((g) => modulesByGroup(g).map((m) => m.id));
    }

    function coreOnly() {
        draftEnabled = MODULE_GROUPS.flatMap((g) => modulesByGroup(g))
            .filter((m) => m.defaultEnabled || m.alwaysOn)
            .map((m) => m.id);
    }

    function addMember() {
        draftMembers = [...draftMembers, newMember(" ", "other")];
    }

    function removeMember(id: string) {
        confirm(t("delete"), t("delete") + "?", () => {
            draftMembers = draftMembers.filter((m) => m.id !== id);
        });
    }

    async function save() {
        saving = true;
        try {
            plugin.settings.enabledModules = [...draftEnabled];
            plugin.settings.members = draftMembers.map((m) => ({ ...m, name: m.name.trim() || "?" }));
            await saveSettings(plugin as any, plugin.settings);
            showMessage(t("saved"), 2000, "info");
        } finally {
            saving = false;
        }
    }
</script>

<div class="lv-home lv-settings">
    <div class="fn__flex b3-tab-bar">
        <button class="b3-button {tab === 'modules' ? 'b3-button--text' : ''}" onclick={() => (tab = "modules")}>{t("tabModules")}</button>
        <button class="b3-button {tab === 'members' ? 'b3-button--text' : ''}" onclick={() => (tab = "members")}>{t("tabMembers")}</button>
        <button class="b3-button {tab === 'about' ? 'b3-button--text' : ''}" onclick={() => (tab = "about")}>{t("tabAbout")}</button>
    </div>

    {#if tab === "modules"}
        <div class="lv-settings__hint">{t("settings.modulesHint")}</div>
        {#each MODULE_GROUPS as gid (gid)}
            <div class="lv-home__group">
                <div class="lv-home__group-title">{t(`group.${gid}`)}</div>
                {#each modulesByGroup(gid) as mod (mod.id)}
                    <div class="fn__flex lv-settings__row">
                        <input
                            type="checkbox"
                            class="b3-switch"
                            checked={enabledIds.has(mod.id)}
                            disabled={mod.alwaysOn}
                            onchange={() => toggleModule(mod.id, mod.alwaysOn)}
                        />
                        <div class="fn__flex-1 fn__flex-column">
                            <span>
                                {t(`module.${mod.id}`)}
                                {#if mod.alwaysOn}<span class="b3-chip b3-chip--secondary b3-chip--small">{t("alwaysOn")}</span>{/if}
                                {#if mod.devStatus === "skeleton"}<span class="b3-chip b3-chip--primary b3-chip--small">{t("skeleton")}</span>{/if}
                            </span>
                            <span class="b3-card__info-meta">{t(`module.${mod.id}.desc`)}</span>
                            {#if mod.suggestRoles?.length && !enabledIds.has(mod.id)}
                                <span class="ft__smaller ft__on-surface">
                                    {t("settings.suggestRoles")}
                                    {mod.suggestRoles.map((r) => t(`role.${r}`)).join(" / ")}
                                </span>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        {/each}
    {:else if tab === "members"}
        <div class="lv-settings__hint">{t("settings.membersHint")}</div>
        {#if draftMembers.length === 0}
            <div class="lv-settings__hint ft__on-surface">{t("members.empty")}</div>
        {/if}
        {#each draftMembers as m, i (m.id)}
            <div class="fn__flex lv-settings__row lv-settings__member">
                <input class="b3-text-field fn__size200" placeholder={t("members.name")} bind:value={draftMembers[i].name} />
                <select class="b3-select" bind:value={draftMembers[i].role}>
                    {#each ROLES as r (r)}
                        <option value={r}>{t(`role.${r}`)}</option>
                    {/each}
                </select>
                <input class="b3-text-field" type="date" bind:value={draftMembers[i].birthday} title={t("members.birthday")} />
                <label class="fn__flex">
                    <input type="checkbox" class="b3-switch" bind:checked={draftMembers[i].lunarBirthday} />
                    <span>{t("members.lunar")}</span>
                </label>
                <span class="fn__flex-1"></span>
                <button class="b3-button b3-button--outline" onclick={() => removeMember(m.id)}>{t("delete")}</button>
            </div>
        {/each}
        <button class="b3-button b3-button--outline" onclick={addMember}>＋ {t("add")}</button>
    {:else}
        <div class="lv-settings__about">
            <p>{t("about.line1")}</p>
            <p>{t("about.tagline")}</p>
            <p class="ft__on-surface">{t("about.principles")}</p>
            <button class="b3-button b3-button--outline" style="margin-top:8px"
                onclick={async () => {
                    plugin.settings.onboarded = false;
                    await import("@/core/settings").then((m) => m.saveSettings(plugin as any, plugin.settings));
                    showMessage(t("wiz.rerunHint"), 3000, "info");
                }}>{t("wiz.rerun")}</button>
            {#if tab === "about"}
                {@const diag = plugin.getDiagnostics?.()}
                {#if diag}
                    <div style="margin-top:14px;border-top:1px solid var(--b3-border-color);padding-top:10px">
                        <p class="lv-caption">{t("diag.title")} · v{diag.version} · {t("hub.scannedAt")} {diag.scannedAt ? new Date(diag.scannedAt).toLocaleString() : "—"}</p>
                        {#each diag.ledgers as l (l.id)}
                            <p class="lv-caption">
                                {t(`module.${l.id}`)}：
                                {l.provisioned ? (l.provisional ? t("diag.provisional") : t("diag.ok")) : t("diag.missing")}
                                · {t("diag.columns")} {l.columns}
                            </p>
                        {/each}
                        {#if diag.errors.length > 0}
                            {#each diag.errors as e (e.moduleId)}
                                <p class="lv-caption" style="color:var(--lv-danger)">{e.moduleId}: {e.message}</p>
                            {/each}
                        {/if}
                        {#if diag.contracts.length > 0}
                            {#each diag.contracts as c (c)}
                                <p class="lv-caption" style="color:var(--lv-danger)">{c}</p>
                            {/each}
                        {/if}
                        {#if (plugin.settings.members ?? []).some((m: any) => !m.avItemId)}
                            <button class="b3-button b3-button--outline" style="margin-top:6px"
                                onclick={async () => {
                                    const { backfillMemberLinks } = await import("@/core/members");
                                    const res = await backfillMemberLinks(plugin as any, plugin.settings);
                                    showMessage(t("diag.backfillDone").replace("${n}", String(res.linked.length)), 3000, "info");
                                }}>{t("diag.backfill")}</button>
                        {/if}
                    </div>
                {/if}
            {/if}
        </div>
    {/if}

    <div class="fn__flex lv-settings__footer">
        {#if tab === "modules"}
            <button class="b3-button b3-button--text" onclick={enableAll}>{t("enableAll")}</button>
            <button class="b3-button b3-button--text" onclick={coreOnly}>{t("coreOnly")}</button>
        {/if}
        <span class="fn__flex-1"></span>
        <button class="b3-button b3-button--outline" disabled={saving} onclick={save}>{t("save")}</button>
    </div>
</div>
