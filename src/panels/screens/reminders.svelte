<script lang="ts">
    let { plugin, t }: { plugin: any; t: (k: string) => string } = $props();

    const all = $derived(plugin.scan?.reminders ?? []);
    let filter = $state("all");
    const filtered = $derived(
        filter === "all" ? all : filter === "handled" ? [] : all.filter((r: any) => r.level === filter),
    );
    const levelBadge: Record<string, string> = { overdue: "red", soon: "orange", lead: "yellow" };

    async function renewPrompt(r: any) {
        const iso = window.prompt(t("act.renewPrompt"), r.dueDate);
        if (!iso) return;
        await plugin.renew(r, iso);
        await plugin.refreshHub();
    }
</script>

<div class="lv-hero"><h1>{t("hub.title")}</h1><p>{t("hub.subtitle")}</p></div>

<div class="filters" style="display:flex;gap:8px;margin:16px 0">
    <select class="b3-select" bind:value={filter}>
        <option value="all">{t("hub.filterAll")}</option>
        <option value="overdue">{t("hub.filterOverdue")}</option>
        <option value="soon">{t("hub.filterSoon")}</option>
        <option value="lead">{t("hub.filterLead")}</option>
        <option value="handled">{t("hub.filterHandled")}</option>
    </select>
    <span class="fn__flex-1"></span>
    <button class="b3-button b3-button--outline" onclick={() => plugin.refreshHub()}>{t("hub.rescan")}</button>
</div>

{#if filter === "handled"}
    <div class="lv-card"><div class="lv-empty"><div class="eic">✓</div><b>{t("hub.handledTitle")}</b><span>{t("hub.handledHint")}</span></div></div>
{:else if filtered.length === 0}
    <div class="lv-card"><div class="lv-empty"><div class="eic">🌤</div><b>{t("dash.allClear")}</b><span>{t("hub.emptyHint")}</span></div></div>
{:else}
    {@const groups = filter === "all"
        ? [
            { key: "overdue", label: t("hub.groupOverdue"), items: filtered.filter((r: any) => r.level === "overdue") },
            { key: "soon", label: t("hub.groupSoon"), items: filtered.filter((r: any) => r.level === "soon") },
            { key: "lead", label: t("hub.groupLead"), items: filtered.filter((r: any) => r.level === "lead") },
        ].filter((g) => g.items.length > 0)
        : [{ key: filter, label: "", items: filtered }]}
    {#each groups as g (g.key)}
        {#if g.label}<div class="lv-group-label">{g.label} · {g.items.length}</div>{/if}
        <div class="lv-card lv-rems">
            {#each g.items as r (r.id)}
                <div class="lv-rem {r.level}">
                    <div class="lv-rem-ic">{r.moduleId === "adhoc" ? "📝" : "🗂"}</div>
                    <div class="lv-rem-t"><b>{r.title}</b><span class="lv-num">{r.dueDate}</span></div>
                    <span class="lv-badge {levelBadge[r.level]}">
                        {r.level === "overdue" ? t("level.overdue") : r.level === "soon" ? t("level.soon") : t("level.lead")}
                    </span>
                    <div class="lv-rem-ops">
                        <button class="b3-button b3-button--text" onclick={() => plugin.complete(r)}>{t("act.done")}</button>
                        {#if r.moduleId === "certs"}
                            <button class="b3-button b3-button--text" onclick={() => renewPrompt(r)}>{t("act.renew")}</button>
                        {/if}
                        <button class="b3-button b3-button--text" onclick={() => plugin.snooze(r.id, 7)}>{t("act.snooze7")}</button>
                        <button class="b3-button b3-button--text" onclick={() => plugin.mute(r.id)}>{t("act.mute")}</button>
                    </div>
                </div>
            {/each}
        </div>
    {/each}
{/if}
