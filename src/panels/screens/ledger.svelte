<script lang="ts">
    import { renderLedger, addDetachedRow, setCell, newSiYuanId } from "@/core/siyuan";

    let { plugin, t }: { plugin: any; t: (k: string) => string } = $props();

    const ledgers = $derived(
        Object.entries(plugin.settings.dbRefs).filter(([id, ref]: [string, any]) => ref?.avId && id !== "members"),
    );
    // svelte-ignore state_referenced_locally
    let active = $state(plugin.activeLedger ?? "certs");
    let rows: any[] = $state([]);
    let loading = $state(false);

    const ref = $derived(plugin.settings.dbRefs[active]);
    const schemaKeys = $derived<string[]>(ref?.columns ? Object.keys(ref.columns) : []);

    async function load() {
        if (!ref?.avId) { rows = []; return; }
        loading = true;
        try {
            const res = await renderLedger(ref.avId);
            rows = res.rows;
        } finally {
            loading = false;
        }
    }
    $effect(() => { void active; void plugin.scan?.scannedAt; load(); });

    // capture 快速表单：name + member + expiry（v0.2 精简；capture 列集见 02 §4.1）
    let newName = $state("");
    let newExpiry = $state("");
    let newMember = $state(""); // members av itemID
    const memberOptions = $derived(plugin.settings.members ?? []);
    const memberAvId = $derived(plugin.settings.dbRefs.members?.avId);

    async function createRow() {
        if (!ref?.avId || !newName.trim()) return;
        const itemID = await addDetachedRow(ref.avId, newName.trim());
        const cols = ref.columns ?? {};
        if (newExpiry && cols.expiry) {
            await setCell(ref.avId, cols.expiry, itemID, {
                type: "date", date: { content: new Date(`${newExpiry}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true },
            });
        }
        if (newMember && cols.member && memberAvId) {
            await setCell(ref.avId, cols.member, itemID, {
                type: "relation", relation: { blockIDs: [newMember], contents: null },
            });
        }
        void newSiYuanId;
        newName = ""; newExpiry = ""; newMember = "";
        await load();
        await plugin.refreshHub();
    }
</script>

<div class="lv-hero"><h1>{t("ledger.title")}</h1><p>{t("ledger.subtitle")}</p></div>

<div style="display:flex;gap:10px;align-items:center;margin:14px 0;flex-wrap:wrap">
    <select class="b3-select" bind:value={active} onchange={() => (plugin.activeLedger = active)}>
        {#each ledgers as [id] (id)}
            <option value={id}>{t(`module.${id}`)}</option>
        {/each}
    </select>
    <span class="fn__flex-1"></span>
    <button class="b3-button b3-button--outline" onclick={() => plugin.showTabDocs(ref?.docId)}>{t("ledger.openDoc")} ↗</button>
</div>

<div class="lv-card" style="padding:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    <input class="b3-text-field fn__flex-1" style="min-width:160px" placeholder={t("ledger.newName")} bind:value={newName} />
    <select class="b3-select" bind:value={newMember}>
        <option value="">{t("field.member")}: {t("members.all")}</option>
        {#each memberOptions as m (m.avItemId ?? m.id)}
            <option value={m.avItemId}>{m.name}</option>
        {/each}
    </select>
    <input class="b3-text-field" type="date" title={t("field.expiry")} bind:value={newExpiry} />
    <button class="b3-button b3-button--text" onclick={createRow} disabled={!ref?.avId}>＋ {t("ledger.add")}</button>
</div>

{#if loading}
    <div class="lv-card" style="padding:20px"><div class="lv-skel" style="height:16px;width:60%"></div></div>
{:else if rows.length === 0}
    <div class="lv-card"><div class="lv-empty"><div class="eic">🗂</div><b>{t("ledger.empty")}</b><span>{t("ledger.emptyHint")}</span></div></div>
{:else}
    <div class="lv-card lv-table-wrap lv-table" style="margin-top:12px">
        <table>
            <thead><tr>
                {#each schemaKeys.filter((k) => ["name", "status", "expiry", "due"].includes(k)) as k (k)}
                    <th>{t(`field.${k}`)}</th>
                {/each}
            </tr></thead>
            <tbody>
                {#each rows as r (r.itemID)}
                    <tr>
                        {#each schemaKeys.filter((k) => ["name", "status", "expiry", "due"].includes(k)) as k (k)}
                            {@const v = r.cells[ref.columns[k]]}
                            <td class="lv-num">
                                {v?.type === "text" ? (v.text?.content ?? "—")
                                    : v?.type === "date" ? (v.date?.isNotEmpty ? new Date(v.date.content).toISOString().slice(0, 10) : "—")
                                    : v?.type === "select" ? (v.select?.content ?? "—")
                                    : v?.type === "block" ? (v.block?.content ?? "—")
                                    : "—"}
                            </td>
                        {/each}
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
{/if}
