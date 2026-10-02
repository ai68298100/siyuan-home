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

    // D09：capture 驱动的快速表单——列集/类型/枚举全部来自 schema（不再写死字段）。
    // asset/mAsset/mSelect 列快速表单不支持，显式说明（不静默省略）。
    const captureCols = $derived.by(() => {
        const schema = plugin.schemaCatalog?.[active];
        if (!schema?.capture) return [] as { key: string; type: string; options?: string[] }[];
        const cols: any[] = schema.columns ?? [];
        const out: { key: string; type: string; options?: string[] }[] = [];
        for (const key of schema.capture as string[]) {
            const col = cols.find((c: any) => c.key === key);
            if (col) out.push({ key: col.key, type: col.type, options: col.options });
        }
        return out;
    });
    const UNSUPPORTED_TYPES = ["asset", "mAsset", "mSelect"];
    const supportableCols = $derived(captureCols.filter((e) => !UNSUPPORTED_TYPES.includes(e.type)));
    const unsupportedCount = $derived(captureCols.filter((e) => UNSUPPORTED_TYPES.includes(e.type)).length);
    // 表单值：列 key → 输入值（select/relation 为字符串值，checkbox 为布尔）
    let form: Record<string, any> = $state({});
    // D03：保存状态与恢复——saving 防双击；失败保留输入；已建行 itemID 保留，重试补写同一行
    let saving = $state(false);
    let saveError = $state("");
    let identityPending = $state(false); // 行已提交但身份未确认（D02）：禁止自动重试，防重复建行
    let pendingItemID: string | null = null;

    function cellValue(type: string, v: any): unknown | null {
        switch (type) {
            case "select": return { type: "select", select: { content: v } };
            case "relation": return { type: "relation", relation: { blockIDs: [v], contents: null } };
            case "date": return { type: "date", date: { content: new Date(`${v}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true } };
            case "number": return { type: "number", number: { content: Number(v), isNotEmpty: true } };
            case "url": return { type: "url", url: { content: v } };
            case "checkbox": return { type: "checkbox", checkbox: { checked: !!v } };
            default: return { type: "text", text: { content: String(v) } };
        }
    }
    const hasAnyInput = $derived(supportableCols.some((e) => {
        const v = form[e.key];
        return e.key === "name" ? !!(v && String(v).trim()) : v !== undefined && v !== "" && v !== false;
    }));

    function resetForm() {
        form = {};
        saveError = ""; identityPending = false; pendingItemID = null;
    }

    async function createRow() {
        if (!ref?.avId || saving || identityPending || !hasAnyInput) return;
        saving = true;
        saveError = "";
        try {
            // 重试路径：部分字段失败时复用已建行（补写同一行，不重复建行）
            const itemID = pendingItemID ?? await addDetachedRow(ref.avId, String(form.name ?? "").trim() || "（未命名）");
            pendingItemID = itemID;
            const cols = ref.columns ?? {};
            const failed: string[] = [];
            const tryCell = async (label: string, key: string | undefined, value: unknown) => {
                if (!key) return;
                try {
                    await setCell(ref.avId!, key, itemID, value);
                } catch {
                    failed.push(label); // D03：单字段失败不清空表单，逐字段保留现场
                }
            };
            for (const e of supportableCols) {
                const v = form[e.key];
                if (e.key !== "name" && (v === undefined || v === "" || v === false)) continue;
                if (e.key === "name" && !(v && String(v).trim()) && pendingItemID) continue; // 重试时不写空名
                if (e.type === "number" && (v === undefined || isNaN(Number(v)))) continue;
                await tryCell(t(`field.${e.key}`), cols[e.key], cellValue(e.type, e.key === "name" ? String(v ?? "").trim() : v));
            }
            // C6a 增量 3：自动写入默认状态（schema status 枚举第一个值，如 certs=valid / medicine=inuse）
            const statusCol = (plugin.schemaCatalog?.[active]?.columns ?? []).find((c: any) => c.key === "status");
            if (statusCol?.options?.length) await tryCell(t("field.status"), cols.status, { type: "select", select: { content: statusCol.options[0] } });
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
    {#each supportableCols as e (e.key)}
        {#if e.type === "select"}
            <select class="b3-select" bind:value={form[e.key]} title={t(`field.${e.key}`)}>
                <option value="">{t(`field.${e.key}`)}</option>
                {#each e.options ?? [] as opt (opt)}
                    <option value={opt}>{t(`field.${e.key}.opt.${opt}`) !== `field.${e.key}.opt.${opt}` ? t(`field.${e.key}.opt.${opt}`) : opt}</option>
                {/each}
            </select>
        {:else if e.type === "relation"}
            <select class="b3-select" bind:value={form[e.key]} title={t(`field.${e.key}`)}>
                <option value="">{t(`field.${e.key}`)}: {t("members.all")}</option>
                {#each plugin.settings.members ?? [] as m (m.avItemId ?? m.id)}
                    <option value={m.avItemId}>{m.name}</option>
                {/each}
            </select>
        {:else if e.type === "date"}
            <input class="b3-text-field" type="date" title={t(`field.${e.key}`)} bind:value={form[e.key]} />
        {:else if e.type === "number"}
            <input class="b3-text-field" type="number" style="width:90px" placeholder={t(`field.${e.key}`)} bind:value={form[e.key]} />
        {:else if e.type === "url"}
            <input class="b3-text-field" style="min-width:140px" type="url" placeholder={t(`field.${e.key}`)} bind:value={form[e.key]} />
        {:else if e.type === "checkbox"}
            <label style="display:flex;gap:5px;align-items:center;font-size:12.5px;cursor:pointer">
                <input type="checkbox" class="b3-switch" bind:checked={form[e.key]} />{t(`field.${e.key}`)}
            </label>
        {:else if e.key === "name"}
            <input class="b3-text-field fn__flex-1" style="min-width:160px" placeholder={t("ledger.newName")} bind:value={form[e.key]} />
        {:else}
            <input class="b3-text-field" style="min-width:140px" placeholder={t(`field.${e.key}`)} bind:value={form[e.key]} />
        {/if}
    {/each}
    {#if unsupportedCount > 0}
        <span class="lv-caption" title={t("ledger.unsupportedInForm")}>ⓘ {t("ledger.unsupportedInForm")}</span>
    {/if}
    {#if saveError}
        <div class="lv-caption" role="alert" style="color:var(--lv-danger);flex-basis:100%">⚠ {saveError}</div>
        <button class="b3-button b3-button--text" onclick={resetForm}>{t("ledger.reset")}</button>
    {/if}
    <button class="b3-button b3-button--text" onclick={createRow} disabled={!ref?.avId || saving || identityPending || !hasAnyInput}>
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
