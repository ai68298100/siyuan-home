<script lang="ts">
    import Onboarding from "../onboarding.svelte";

    let { plugin, t, onGoto }: { plugin: any; t: (k: string) => string; onGoto: (s: string) => void } = $props();

    const reminders = $derived(plugin.scan?.reminders ?? []);
    const top = $derived(reminders.slice(0, 4));

    let memoTitle = $state("");
    let memoDue = $state("");
    function addMemo() {
        if (!memoTitle.trim()) return;
        const d = memoDue || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
        plugin.addMemo(memoTitle.trim(), d);
        memoTitle = ""; memoDue = "";
    }
</script>

{#if !plugin.settings.onboarded}
    <Onboarding {plugin} {t} />
{/if}

<div class="lv-hero">
    <div><h1>{t("dash.hello")}</h1><p>{t("dash.sub")}</p></div>
    <div class="lv-hero-count"><b class="lv-num">{reminders.length}</b><span>{t("dash.needAttention")}</span></div>
</div>

<div class="lv-sec"><h2 class="lv-title-sec">{t("dash.upcoming")}</h2>
    <button class="b3-button b3-button--text" onclick={() => onGoto("reminders")}>{t("dash.viewAll")} →</button>
</div>
{#if top.length === 0}
    <div class="lv-card"><div class="lv-empty"><div class="eic">✓</div><b>{t("dash.allClear")}</b><span>{t("hub.emptyHint")}</span></div></div>
{:else}
    <div class="lv-card lv-rems">
        {#each top as r (r.id)}
            <div class="lv-rem {r.level}">
                <div class="lv-rem-ic">{r.moduleId === "adhoc" ? "📝" : "🪪"}</div>
                <div class="lv-rem-t"><b>{r.title}</b><span>{t(`module.${r.moduleId}`) !== `module.${r.moduleId}` ? t(`module.${r.moduleId}`) : t("adhoc.name")}</span></div>
                <div class="lv-rem-when"><b class="lv-num" style="color:var(--lv-{r.level === 'overdue' ? 'danger' : r.level === 'soon' ? 'warn' : 'amber'})">
                    {r.daysLeft < 0 ? t("days.overdue").replace("${n}", String(-r.daysLeft)) : r.daysLeft === 0 ? t("days.today") : t("days.after").replace("${n}", String(r.daysLeft))}
                </b><span class="lv-num">{r.dueDate}</span></div>
                <div class="lv-rem-ops">
                    <button class="b3-button b3-button--text" onclick={() => plugin.complete(r)}>{t("act.done")}</button>
                    <button class="b3-button b3-button--text" onclick={() => plugin.snooze(r.id, 7)}>{t("act.snooze7")}</button>
                </div>
            </div>
        {/each}
    </div>
{/if}

<div class="lv-sec"><h2 class="lv-title-sec">{t("memo.quick")}</h2></div>
<div class="lv-card" style="padding:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <input class="b3-text-field fn__flex-1" style="min-width:180px" placeholder={t("memo.placeholder")} bind:value={memoTitle} />
    <input class="b3-text-field" type="date" bind:value={memoDue} />
    <button class="b3-button b3-button--text" onclick={addMemo}>＋ {t("memo.add")}</button>
</div>

<div class="lv-sec"><h2 class="lv-title-sec">{t("dash.myModules")}</h2>
    <button class="b3-button b3-button--text" onclick={() => plugin.openSetting()}>{t("dash.enableMore")} →</button>
</div>
<div class="lv-mods">
    {#each plugin.settings.enabledModules.filter((id: string) => id !== "members") as mid (mid)}
        <div
            class="lv-card lv-card--hover lv-mod"
            role="button"
            tabindex="0"
            onkeydown={(e: KeyboardEvent) => e.key === "Enter" && onGoto("ledger")}
            onclick={() => onGoto("ledger")}
        >
            <div class="lv-mi t-blue">🗂</div><b>{t(`module.${mid}`)}</b>
            <div class="lv-stat"><span>{t("mod.inLedger")}</span></div>
        </div>
    {/each}
</div>
