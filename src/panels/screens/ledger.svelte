<script lang="ts">
    import { renderLedger, addDetachedRow, setCell } from "@/core/siyuan";

    let { plugin, t }: { plugin: any; t: (k: string) => string } = $props();

    // 台账页模块下拉：已建库 + 已启用但未建库的模块（26.7：后者可从页面直接触发重建）
    const ledgers = $derived(
        plugin.settings.enabledModules
            .filter((id: string) => id !== "members")
            .map((id: string) => ({ id, ref: plugin.settings.dbRefs[id] })),
    );
    let active = $state(plugin.activeLedger ?? "certs");
    let rows: any[] = $state([]);
    let loading = $state(false);
    let rebuilding = $state(false);

    const ref = $derived(plugin.settings.dbRefs[active]);
    const schemaKeys = $derived<string[]>(ref?.columns ? Object.keys(ref.columns) : []);

    async function rebuildLedger() {
        rebuilding = true;
        try {
            await plugin.ensureCoreLedgers();
            await plugin.refreshHub();
        } finally {
            rebuilding = false;
        }
    }

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

    // capture 快速表单：name + category + member + expiry + amount（capture 列集驱动，枚举从 schema 读）
    let newName = $state("");
    let newCategory = $state("");
    let newExpiry = $state("");
    let newMember = $state(""); // members av itemID
    let newAmount: number | undefined = $state();
    let newUrl = $state("");
    const memberOptions = $derived(plugin.settings.members ?? []);
    const memberAvId = $derived(plugin.settings.dbRefs.members?.avId);
    const categoryOptions = $derived<string[]>(
        (plugin.schemaCatalog?.[active]?.columns ?? []).find((c: any) => c.key === "category")?.options ?? [],
    );

    async function createRow() {
        if (!ref?.avId || !newName.trim()) return;
        const itemID = await addDetachedRow(ref.avId, newName.trim());
        const cols = ref.columns ?? {};
        if (newCategory && cols.category) {
            await setCell(ref.avId, cols.category, itemID, {
                type: "select", select: { content: newCategory },
            });
        }
        // C6a 增量 3：自动写入默认状态（schema status 枚举第一个值，如 certs=valid / medicine=inuse）
        const statusCol = (plugin.schemaCatalog?.[active]?.columns ?? []).find((c: any) => c.key === "status");
        if (statusCol?.options?.length && cols.status) {
            await setCell(ref.avId, cols.status, itemID, {
                type: "select", select: { content: statusCol.options[0] },
            });
        }
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
        // C6a 增量 4：URL 列（shopping/bookmarks/media 等 capture 常见列）
        if (newUrl && cols.url) {
            await setCell(ref.avId, cols.url, itemID, {
                type: "url", url: { content: newUrl },
            });
        }
        if (typeof newAmount === "number" && !isNaN(newAmount) && cols.amount) {
            await setCell(ref.avId, cols.amount, itemID, {
                type: "number", number: { content: newAmount, isNotEmpty: true },
            });
        }
        newName = ""; newCategory = ""; newExpiry = ""; newMember = ""; newAmount = undefined; newUrl = "";
        await load();
        await plugin.refreshHub();
    }
</script>

<div class="lv-hero"><h1>{t("ledger.title")}</h1><p>{t("ledger.subtitle")}</p></div>

<div style="display:flex;gap:10px;align-items:center;margin:14px 0;flex-wrap:wrap">
    <select class="b3-select" bind:value={active} onchange={() => (plugin.activeLedger = active)}>
        {#each ledgers as l (l.id)}
            <option value={l.id}>{t(`module.${l.id}`)}{l.ref?.avId ? "" : `（${t("diag.missing")}）`}</option>
        {/each}
    </select>
    <span class="fn__flex-1"></span>
    {#if rebuilding}
        <span class="lv-caption">{t("diag.rebuilding")}</span>
    {:else if !ref?.avId}
        <button class="b3-button" onclick={rebuildLedger}>{t("ledger.rebuild")}</button>
    {:else}
        <button class="b3-button b3-button--outline" onclick={() => plugin.showTabDocs(ref?.docId)}>{t("ledger.openDoc")} ↗</button>
    {/if}
</div>

<div class="lv-card" style="padding:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    <input class="b3-text-field fn__flex-1" style="min-width:160px" placeholder={t("ledger.newName")} bind:value={newName} />
    {#if categoryOptions.length > 0}
        <select class="b3-select" bind:value={newCategory}>
            <option value="">{t("field.category")}</option>
            {#each categoryOptions as opt (opt)}
                <option value={opt}>{t(`field.category.opt.${opt}`) !== `field.category.opt.${opt}` ? t(`field.category.opt.${opt}`) : opt}</option>
            {/each}
        </select>
    {/if}
    <select class="b3-select" bind:value={newMember}>
        <option value="">{t("field.member")}: {t("members.all")}</option>
        {#each memberOptions as m (m.avItemId ?? m.id)}
            <option value={m.avItemId}>{m.name}</option>
        {/each}
    </select>
    <input class="b3-text-field" type="date" title={t("field.expiry")} bind:value={newExpiry} />
    <input class="b3-text-field" type="number" style="width:90px" placeholder={t("field.amount")} bind:value={newAmount} />
    <input class="b3-text-field" style="min-width:140px" placeholder={t("field.url")} bind:value={newUrl} />
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
