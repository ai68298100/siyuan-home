<script lang="ts">
    import { renderLedger, addDetachedRow, setCell, RowIdentityPendingError } from "@/core/siyuan";
    import { localDateKey } from "@/core/hub/rule";
    import { showMessage, Dialog, confirm } from "siyuan";

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
    // 17 组：台账内搜索（标题/备注 contains，与成员过滤不叠加——本页无成员过滤）
    let searchText = $state("");
    const filteredRows = $derived.by(() => {
        const q = searchText.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) => {
            const nameCol = ref?.columns?.name ? (r.cells[ref.columns.name]?.text?.content ?? r.cells[ref.columns.name]?.block?.content ?? "") : "";
            const noteCol = ref?.columns?.note ? (r.cells[ref.columns.note]?.text?.content ?? "") : "";
            return nameCol.toLowerCase().includes(q) || noteCol.toLowerCase().includes(q);
        });
    });

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
    let savedModule = $state(""); // C6b：保存成功回执（"保存并查看"入口，8 秒自动消失）
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

    /** 单元格值 → 显示文本（详情抽屉/表格共用；日期走本地时区） */
    function cellText(v: any): string {
        if (!v) return "—";
        switch (v.type) {
            case "text": return v.text?.content ?? "—";
            case "date": return v.date?.isNotEmpty ? localDateKey(new Date(v.date.content)) : "—";
            case "select": return v.select?.content ?? "—";
            case "mSelect": return v.mSelect?.length ? v.mSelect.map((o: any) => o.content).join("、") : "—";
            case "number": return v.number?.isNotEmpty ? String(v.number.content) : "—";
            case "url": return v.url?.content ?? "—";
            case "checkbox": return v.checkbox?.checked ? "✓" : "—";
            case "block": return v.block?.content ?? "—";
            case "relation": return (v.relation?.contents ?? []).map((c: any) => c.block?.content ?? "").join("、") || "—";
            default: return "—";
        }
    }

    // C4b：行点击 → 详情抽屉（全列 kv；DOM 构建用户内容，不走 HTML 模板——19 组安全）
    function openDetail(row: any) {
        if (!ref?.columns) return;
        const dlg = new Dialog({
            title: t("ledger.detail"),
            content: `<div class="b3-dialog__content b3-dialog__content--wrap" id="lv-detail-body" style="max-height:60vh;overflow:auto"></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-detail-del">${t("delete")}</button><span style="flex:1"></span><button class="b3-button b3-button--cancel" id="lv-detail-close">${t("cancel")}</button><button class="b3-button b3-button--text" id="lv-detail-open">${t("ledger.openDoc")} ↗</button></div>`,
            width: "520px",
        });
        const body = dlg.element.querySelector("#lv-detail-body") as HTMLElement;
        const schemaCols: any[] = plugin.schemaCatalog?.[active]?.columns ?? [];
        for (const col of schemaCols) {
            const keyID = ref.columns[col.key];
            if (!keyID) continue;
            const line = document.createElement("div");
            line.className = "fn__flex";
            line.style.cssText = "gap:10px;padding:4px 0;font-size:13px";
            const k = document.createElement("span");
            k.className = "ft__on-surface";
            k.style.cssText = "min-width:96px;flex-shrink:0";
            k.textContent = t(`field.${col.key}`) !== `field.${col.key}` ? t(`field.${col.key}`) : col.key;
            const v = document.createElement("span");
            v.style.cssText = "word-break:break-all";
            v.textContent = cellText(row.cells[keyID]);
            line.append(k, v);
            body.appendChild(line);
        }
        // 续期/换证历史（29 组：runtime.renewHistory 留痕；无记录不显示该段）
        const history = (plugin.runtime?.renewHistory?.[row.itemID] ?? []) as { from: string; to: string; at: string }[];
        if (history.length > 0) {
            const head = document.createElement("div");
            head.className = "ft__on-surface";
            head.style.cssText = "margin-top:10px;padding-top:8px;border-top:1px solid var(--b3-border-color);font-size:12px";
            head.textContent = t("ledger.renewHistory");
            body.appendChild(head);
            for (const h of history) {
                const line = document.createElement("div");
                line.style.cssText = "padding:2px 0;font-size:12.5px";
                line.textContent = `${h.from} → ${h.to} · ${h.at.slice(0, 10)}`;
                body.appendChild(line);
            }
        }
        (dlg.element.querySelector("#lv-detail-close") as HTMLButtonElement).onclick = () => dlg.destroy();
        (dlg.element.querySelector("#lv-detail-open") as HTMLButtonElement).onclick = () => { dlg.destroy(); plugin.showTabDocs(ref?.docId); };
        // 17 组：行删除（detached 行走内核 av 删除端点 [待实测]；删除是显式用户动作，双确认说明影响范围）
        (dlg.element.querySelector("#lv-detail-del") as HTMLButtonElement).onclick = () => {
            confirm(t("ledger.delTitle"), t("ledger.delBody").replace("${name}", cellText(row.cells[ref.columns.name])), async () => {
                try {
                    const { removeLedgerRows } = await import("@/core/siyuan");
                    await removeLedgerRows(ref!.avId!, [row.itemID]);
                    // 行删除后清理其续期流水（孤儿运行态数据）
                    if (plugin.runtime?.renewHistory?.[row.itemID]) {
                        delete plugin.runtime.renewHistory[row.itemID];
                        const { saveRuntime } = await import("@/core/hub/runtime");
                        await saveRuntime(plugin, plugin.runtime);
                    }
                    showMessage(t("ledger.delDone"), 2500, "info");
                    dlg.destroy();
                    await load();
                    await plugin.refreshHub();
                } catch (e) {
                    // 端点不可用等失败：给出人工路径，不静默假删
                    showMessage(t("ledger.delFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                }
            });
        };
    }

    async function createRow() {
        if (!ref?.avId || saving || identityPending || !hasAnyInput) return;
        saving = true;
        saveError = "";
        try {
            // 重试路径：部分字段失败时复用已建行（补写同一行，不重复建行）
            const itemID = pendingItemID ?? await addDetachedRow(ref.avId, String(form.name ?? "").trim() || t("ledger.unnamed"));
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
                // C6b 保存回执：模块去向 + "保存并查看"入口（短暂展示，不打断录入）
                savedModule = active;
                setTimeout(() => { savedModule = ""; }, 8000);
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
        <input class="b3-text-field" style="width:150px" type="search" placeholder={t("ledger.search")}
            bind:value={searchText} title={t("ledger.search")} />
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
    {#if savedModule}
        <div class="lv-caption" role="status" style="color:var(--lv-accent);flex-basis:100%">
            ✓ {t("ledger.savedTo").replace("${module}", t(`module.${savedModule}`) !== `module.${savedModule}` ? t(`module.${savedModule}`) : savedModule)}
            <button class="b3-button b3-button--text" style="padding:0 4px" onclick={() => plugin.showTabDocs(ref?.docId)}>{t("ledger.openDoc")} ↗</button>
        </div>
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
{:else if filteredRows.length === 0}
    {#if !ref?.avId}
        <div class="lv-card"><div class="lv-empty" role="status"><div class="eic">🚧</div><b>{t("ledger.notProvisioned")}</b><span>{t("ledger.notProvisionedHint")}</span></div></div>
    {:else if rows.length > 0}
        <!-- 搜索无命中 ≠ 台账为空（UI16/34 组空态语义） -->
        <div class="lv-card"><div class="lv-empty" role="status"><div class="eic">🔍</div><b>{t("ledger.searchEmpty")}</b><span>{t("ledger.searchEmptyHint").replace("${q}", searchText.trim())}</span></div></div>
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
                {#each filteredRows as r (r.itemID)}
                    <tr class="lv-row-link" role="button" tabindex="0"
                        onkeydown={(e: KeyboardEvent) => e.key === "Enter" && openDetail(r)}
                        onclick={() => openDetail(r)} title={t("ledger.detail")}>
                        {#each schemaKeys.filter((k) => ["name", "status", "expiry", "due"].includes(k)) as k (k)}
                            {@const v = r.cells[ref.columns[k]]}
                            <td class="lv-num">
                                {cellText(v)}
                            </td>
                        {/each}
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
{/if}
