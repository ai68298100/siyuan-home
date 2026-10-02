<script lang="ts">
    import { renderLedger, addDetachedRow, setCell, RowIdentityPendingError } from "@/core/siyuan";
    import { localDateKey } from "@/core/hub/rule";
    import { showMessage } from "siyuan";

    let { plugin, t, version }: { plugin: any; t: (k: string) => string; version?: number } = $props();

    // 台账页模块下拉：已建库 + 已启用但未建库的模块（26.7：后者可从页面直接触发重建）
    const ledgers = $derived(
        plugin.settings.enabledModules
            .filter((id: string) => id !== "members")
            .map((id: string) => ({ id, ref: plugin.settings.dbRefs[id] })),
    );
    // 初始快照为设计意图（activeLedger 由模块卡/快速记录预选）
    // svelte-ignore state_referenced_locally
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
    $effect(() => { void version; void active; void plugin.scan?.scannedAt; load(); });

    // capture 快速表单：name + category + member + expiry + amount（capture 列集驱动，枚举从 schema 读）
    let newName = $state("");
    let newCategory = $state("");
    let newExpiry = $state("");
    let newMember = $state(""); // members av itemID
    let newAmount: number | undefined = $state();
    let newUrl = $state("");
    let newNote = $state("");
    // D03：保存状态与恢复——saving 防双击；失败保留输入；已建行 itemID 保留，重试补写同一行
    let saving = $state(false);
    let saveError = $state("");
    let identityPending = $state(false); // 行已提交但身份未确认（D02）：禁止自动重试，防重复建行
    let pendingItemID: string | null = null;
    const memberOptions = $derived(plugin.settings.members ?? []);
    const memberAvId = $derived(plugin.settings.dbRefs.members?.avId);
    const categoryOptions = $derived<string[]>(
        (plugin.schemaCatalog?.[active]?.columns ?? []).find((c: any) => c.key === "category")?.options ?? [],
    );

    function resetForm() {
        newName = ""; newCategory = ""; newExpiry = ""; newMember = ""; newAmount = undefined; newUrl = ""; newNote = "";
        saveError = ""; identityPending = false; pendingItemID = null;
    }

    async function createRow() {
        if (!ref?.avId || !newName.trim() || saving || identityPending) return;
        saving = true;
        saveError = "";
        try {
            // 重试路径：部分字段失败时复用已建行（补写同一行，不重复建行）
            const itemID = pendingItemID ?? await addDetachedRow(ref.avId, newName.trim());
            pendingItemID = itemID;
            const cols = ref.columns ?? {};
            const failed: string[] = [];
            const tryCell = async (label: string, key: string, value: unknown) => {
                if (!key) return;
                try {
                    await setCell(ref.avId!, key, itemID, value);
                } catch {
                    failed.push(label); // D03：单字段失败不清空表单，逐字段保留现场
                }
            };
            if (newCategory) await tryCell(t("field.category"), cols.category, { type: "select", select: { content: newCategory } });
            // C6a 增量 3：自动写入默认状态（schema status 枚举第一个值，如 certs=valid / medicine=inuse）
            const statusCol = (plugin.schemaCatalog?.[active]?.columns ?? []).find((c: any) => c.key === "status");
            if (statusCol?.options?.length) await tryCell(t("field.status"), cols.status, { type: "select", select: { content: statusCol.options[0] } });
            if (newExpiry) await tryCell(t("field.expiry"), cols.expiry, { type: "date", date: { content: new Date(`${newExpiry}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true } });
            if (newMember && memberAvId) await tryCell(t("field.member"), cols.member, { type: "relation", relation: { blockIDs: [newMember], contents: null } });
            // C6a 增量 5/4：note 备注列与 URL 列（多数模块 capture 通用）
            if (newNote) await tryCell(t("field.note"), cols.note, { type: "text", text: { content: newNote } });
            if (newUrl) await tryCell(t("field.url"), cols.url, { type: "url", url: { content: newUrl } });
            if (typeof newAmount === "number" && !isNaN(newAmount)) await tryCell(t("field.amount"), cols.amount, { type: "number", number: { content: newAmount, isNotEmpty: true } });
            if (failed.length > 0) {
                // 输入与 itemID 均保留：再次保存补写同一行
                saveError = t("ledger.savePartial").replace("${fields}", failed.join("、"));
                showMessage(saveError, 6000, "error");
            } else {
                resetForm();
            }
            await load();
            await plugin.refreshHub();
        } catch (e) {
            if (e instanceof RowIdentityPendingError) {
                // D02：行已提交但身份未确认——不自动重试（会重复建行），提示人工核对
                identityPending = true;
                saveError = t("ledger.savePending");
            } else {
                saveError = t("ledger.saveFailed").replace("${msg}", e instanceof Error ? e.message : String(e));
            }
            showMessage(saveError, 6000, "error");
        } finally {
            saving = false;
        }
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
    {#if ref?.columns?.member}
        <select class="b3-select" bind:value={newMember}>
            <option value="">{t("field.member")}: {t("members.all")}</option>
            {#each memberOptions as m (m.avItemId ?? m.id)}
                <option value={m.avItemId}>{m.name}</option>
            {/each}
        </select>
    {/if}
    {#if ref?.columns?.expiry}
        <input class="b3-text-field" type="date" title={t("field.expiry")} bind:value={newExpiry} />
    {/if}
    {#if ref?.columns?.amount}
        <input class="b3-text-field" type="number" style="width:90px" placeholder={t("field.amount")} bind:value={newAmount} />
    {/if}
    <input class="b3-text-field" style="min-width:140px" placeholder={t("field.url")} bind:value={newUrl} />
    {#if ref?.columns?.note}
        <input class="b3-text-field fn__flex-1" style="min-width:140px" placeholder={t("field.note")} bind:value={newNote} />
    {/if}
    {#if saveError}
        <div class="lv-caption" role="alert" style="color:var(--lv-danger);flex-basis:100%">⚠ {saveError}</div>
        <button class="b3-button b3-button--text" onclick={resetForm}>{t("ledger.reset")}</button>
    {/if}
    <button class="b3-button b3-button--text" onclick={createRow} disabled={!ref?.avId || saving || identityPending || !newName.trim()}>
        {saving ? t("ledger.saving") : `＋ ${t("ledger.add")}`}
    </button>
</div>

{#if loading}
    <div class="lv-card" style="padding:20px"><div class="lv-skel" style="height:16px;width:60%"></div></div>
{:else if rows.length === 0}
    {#if !ref?.avId}
        <div class="lv-card"><div class="lv-empty" role="status"><div class="eic">🚧</div><b>{t("ledger.notProvisioned")}</b><span>{t("ledger.notProvisionedHint")}</span></div></div>
    {:else}
        <div class="lv-card"><div class="lv-empty" role="status"><div class="eic">🗂</div><b>{t("ledger.empty")}</b><span>{t("ledger.emptyHint")}</span></div></div>
    {/if}
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
                                    : v?.type === "date" ? (v.date?.isNotEmpty ? localDateKey(new Date(v.date.content)) : "—")
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
