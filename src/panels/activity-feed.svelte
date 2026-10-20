<script lang="ts">
    import { showMessage } from "siyuan";
    import { Dialog } from "siyuan";
    import { onDestroy } from "svelte";
    import type { ActivityRecord, ActivitySnapshot } from "@/core/activity";
    import { loadActivitySnapshot } from "@/core/activity";
    import type { HomePluginLike } from "@/types/plugin";
    import UiIcon from "@/ui/icon.svelte";

    let {
        plugin, t, version, memberId, compact = false,
    }: {
        plugin: HomePluginLike;
        t: (key: string) => string;
        version?: number;
        memberId?: string;
        compact?: boolean;
    } = $props();

    let snapshot = $state<ActivitySnapshot | undefined>();
    let loading = $state(false);
    let loadError = $state("");
    let progress = $state({ done: 0, total: 0 });
    let query = $state("");
    let moduleFilter = $state("all");
    let page = $state(1);
    let collapsed = $state(false);
    let loadedVersion = $state<number | undefined>();
    let activeController: AbortController | undefined;
    onDestroy(() => {
        activeController?.abort();
        activeController = undefined;
    });
    const pageSize = $derived(compact ? 5 : 8);

    const records = $derived.by(() => {
        void version;
        const source = snapshot?.records ?? [];
        const needle = query.trim().toLocaleLowerCase();
        return source.filter((record) => {
            if (memberId && record.memberId !== memberId) return false;
            if (moduleFilter !== "all" && record.moduleId !== moduleFilter) return false;
            if (!needle) return true;
            const details = record.details.map((item) => `${t(`field.${item.key}`)} ${translated(item.valueKey, item.value)}`).join(" ");
            return `${record.title} ${t(`module.${record.moduleId}`)} ${details} ${memberName(record.memberId)}`.toLocaleLowerCase().includes(needle);
        });
    });
    const pageCount = $derived(Math.max(1, Math.ceil(records.length / pageSize)));
    const pageRecords = $derived(records.slice((page - 1) * pageSize, page * pageSize));
    const moduleOptions = $derived.by(() => {
        const found = new Set((snapshot?.records ?? []).filter((r) => !memberId || r.memberId === memberId).map((r) => r.moduleId));
        return [...found].sort((a, b) => t(`module.${a}`).localeCompare(t(`module.${b}`), undefined, { numeric: true }));
    });

    function translated(key: string | undefined, fallback: string): string {
        if (!key) return fallback;
        const value = t(key);
        return value === key ? fallback : value;
    }

    function memberName(id: string | undefined): string {
        if (!id) return t("members.unassigned");
        return plugin.settings.members.find((member) => member.id === id)?.name ?? t("members.unassigned");
    }

    // 307 波：时间轴活跃度洞察（模块/成员热度 + 长期空窗预警）
    let insightBusy = $state(false);
    async function openInsightDialog() {
        if (insightBusy) return;
        insightBusy = true;
        try {
            const { buildTimelineInsight, formatTimelineInsight } = await import("@/core/timeline-insight");
            const input = (snapshot?.records ?? []).map((r) => ({
                id: r.id,
                moduleId: r.moduleId,
                memberId: r.memberId,
                date: r.recordedAt ?? r.eventDate,
            }));
            const knownModules = [...new Set((snapshot?.records ?? []).map((r) => r.moduleId))].slice(0, 40);
            const insight = buildTimelineInsight(input, { knownModules, windowDays: 180, gapDays: 60 });
            const text = formatTimelineInsight(insight, (id) =>
                t(`module.${id}`) !== `module.${id}` ? t(`module.${id}`) : memberName(id));

            const dlg = new Dialog({
                title: t("activity.insightTitle"),
                content: `<div class="b3-dialog__content lv-dialog-scroll-body"><pre class="lv-caption" style="white-space:pre-wrap;line-height:1.7;margin:0"></pre></div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel">${t("close")}</button>
  <button class="b3-button" id="lv-insight-copy">${t("activity.insightCopy")}</button>
</div>`,
                width: "600px",
            });
            const pre = dlg.element.querySelector("pre");
            if (pre) pre.textContent = text;
            (dlg.element.querySelector(".b3-button--cancel") as HTMLButtonElement).onclick = () => dlg.destroy();
            (dlg.element.querySelector("#lv-insight-copy") as HTMLButtonElement).onclick = async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    showMessage(t("overview.lifeIndexCopied"), 2500, "info");
                } catch {
                    showMessage(t("activity.insightCopyFailed"), 4000, "error");
                }
            };
        } catch (e) {
            showMessage(t("activity.insightFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        } finally {
            insightBusy = false;
        }
    }

    async function refresh(force = false) {
        if (loading) return;
        const requestedVersion = version ?? 0;
        loading = true;
        loadError = "";
        activeController?.abort();
        const controller = new AbortController();
        activeController = controller;
        try {
            snapshot = await loadActivitySnapshot(plugin, {
                force,
                revision: requestedVersion,
                signal: controller.signal,
                onProgress: (done, total) => { progress = { done, total }; },
            });
            if (snapshot.records.length === 0 && snapshot.errors.length > 0 && snapshot.coveredModules.length === 0) {
                loadError = snapshot.errors.map((error) => `${error.moduleId}: ${error.message}`).join("；");
            }
        } catch (error) {
            if (!controller.signal.aborted && !(error instanceof Error && (error.name === "RequestSupersededError" || error.name === "RequestAbortedError"))) {
                loadError = error instanceof Error ? error.message : String(error);
            }
        } finally {
            // Record the revision actually requested. If the hub advanced while
            // this read was in flight, the effect below will immediately fetch it.
            loadedVersion = requestedVersion;
            if (activeController === controller) {
                activeController = undefined;
                loading = false;
            }
        }
    }

    $effect(() => {
        const currentVersion = version;
        void memberId;
        if (loadedVersion === undefined && !loading) void refresh();
        else if (loadedVersion !== undefined && loadedVersion !== currentVersion && !loading) void refresh(true);
    });

    function open(record: ActivityRecord) {
        if (!plugin.openActivityTarget) {
            showMessage(t("activity.navigationUnavailable"), 4000, "error");
            return;
        }
        plugin.openActivityTarget({
            moduleId: record.moduleId,
            rowId: record.rowId,
            source: record.source,
            logKind: record.logKind,
            entryAt: record.recordedAt,
            eventDate: record.eventDate,
            activityId: record.source === "rowlog" ? record.id : undefined,
        });
    }

    function clearFilters() {
        query = "";
        moduleFilter = "all";
        page = 1;
    }

    function recordTime(record: ActivityRecord): string {
        if (record.recordedAt) {
            const date = new Date(record.recordedAt);
            return Number.isNaN(date.getTime()) ? record.recordedAt.slice(0, 16) : date.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
        }
        return record.eventDate ?? t("activity.dateUnknown");
    }

    function timeBasis(record: ActivityRecord): string {
        if (record.recordedAt && record.eventDate && record.recordedAt.slice(0, 10) !== record.eventDate) {
            return `${t("activity.recordedAt")} · ${t("activity.eventDate")} ${record.eventDate}`;
        }
        return record.recordedAt ? t("activity.recordedAt") : t("activity.eventDate");
    }

    function detailValue(record: ActivityRecord, valueKey: string | undefined, value: string): string {
        if (record.moduleId === "vehicles" && valueKey) {
            const parts = valueKey.split(".");
            const selected = parts[parts.length - 1];
            const candidates = [`fuel.option.${selected}`, `field.energy_type.opt.${selected}`, `activity.detail.${selected}`];
            for (const candidate of candidates) { const result = t(candidate); if (result !== candidate) return result; }
        }
        return translated(valueKey, value);
    }

    function detailLabel(key: string): string {
        const keys: Record<string, string> = {
            fuelGrade: "fuel.field.fuelGrade", chargingMode: "fuel.field.chargingMode",
            quantity: "fuel.field.quantity", odometer: "fuel.field.odometer", totalCost: "fuel.field.totalCost",
            cost: "fuel.field.totalCost", unitPrice: "fuel.field.unitPrice", station: "fuel.field.station",
            value: "activity.detail.value", from: "activity.detail.from", to: "activity.detail.to",
            result: "activity.detail.result", back: "activity.detail.back",
        };
        const lookup = keys[key] ?? `field.${key}`;
        const value = t(lookup);
        return value === lookup ? key : value;
    }

    function goToLedger() {
        const target = memberId ? (snapshot?.records.find((record) => record.memberId === memberId) ?? snapshot?.records[0]) : snapshot?.records[0];
        const moduleId = target?.moduleId ?? moduleOptions[0];
        if (!moduleId) return;
        plugin.setActiveLedger(moduleId);
        plugin.panelScreenSwitch?.("ledger");
    }
</script>

    <section class="lv-activity" aria-labelledby={memberId ? `lv-activity-${memberId}` : "lv-activity-title"}>
    <div class="lv-activity-head">
        <div class="lv-activity-heading">
            <h2 id={memberId ? `lv-activity-${memberId}` : "lv-activity-title"} class="lv-title-sec">{memberId ? t("activity.memberTimeline") : t("activity.title")}</h2>
            <span class="lv-sub">{t("activity.scopeHint")}</span>
        </div>
        <div class="lv-activity-actions">
            {#if !collapsed}
                <button type="button" class="b3-button b3-button--text" onclick={() => void refresh(true)} disabled={loading} aria-busy={loading}>
                    {#if loading}<span class="lv-activity-spinner lv-activity-spinner--small" aria-hidden="true"></span>{:else}<UiIcon name="history" size={14} />{/if}{t("activity.refresh")}
                </button>
                <!-- 307 波：时间轴活跃度洞察（模块/成员热度 + 长期空窗预警） -->
                <button type="button" class="b3-button b3-button--text" disabled={!snapshot?.records.length || insightBusy} onclick={openInsightDialog}>{t("activity.insight")}</button>
            {/if}
            <button type="button" class="lv-iconbtn" aria-expanded={!collapsed} aria-controls={memberId ? `lv-activity-body-${memberId}` : "lv-activity-body"}
                aria-label={collapsed ? t("activity.expand") : t("activity.collapse")} onclick={(event) => { collapsed = !collapsed; if (collapsed && event.currentTarget instanceof HTMLElement) event.currentTarget.focus(); }}>
                {collapsed ? "⌄" : "⌃"}
            </button>
        </div>
    </div>

        <div id={memberId ? `lv-activity-body-${memberId}` : "lv-activity-body"} class="lv-activity-body" hidden={collapsed}>
            {#if snapshot?.records.length || loading || loadError}
                <div class="lv-activity-tools">
                    <label class="lv-activity-search">
                        <UiIcon name="search" size={15} />
                        <input type="search" value={query} oninput={(event) => { query = event.currentTarget.value; page = 1; }} placeholder={t("activity.search")} aria-label={t("activity.search")} />
                    </label>
                    <select class="b3-select lv-activity-filter" value={moduleFilter} onchange={(event) => { moduleFilter = event.currentTarget.value; page = 1; }} aria-label={t("activity.moduleFilter")}>
                        <option value="all">{t("activity.allModules")}</option>
                        {#each moduleOptions as moduleId (moduleId)}<option value={moduleId}>{t(`module.${moduleId}`)}</option>{/each}
                    </select>
                </div>
            {/if}

            {#if loading && !snapshot}
                <div class="lv-card lv-activity-state" role="status" aria-busy="true">
                    <span class="lv-activity-spinner" aria-hidden="true"></span>
                    <b>{t("activity.loading")}</b>
                    <span>{progress.total > 0 ? t("activity.progress").replace("${done}", String(progress.done)).replace("${total}", String(progress.total)) : t("activity.readingLedgers")}</span>
                </div>
            {:else if loadError && !snapshot?.records.length}
                <div class="lv-card lv-empty" role="alert">
                    <div class="eic"><UiIcon name="alert" size={22} /></div>
                    <b>{t("activity.failed")}</b><span>{loadError}</span>
                    <button class="b3-button b3-button--outline" style="margin-top:8px" disabled={loading} onclick={() => void refresh(true)}>{loading ? t("activity.loading") : t("activity.retry")}</button>
                </div>
            {:else if records.length === 0}
                {#if snapshot?.errors.length}
                    <div class="lv-activity-partial" role="status">
                        <UiIcon name="alert" size={14} />
                        {t("activity.partial").replace("${n}", String(snapshot.errors.length))}
                        <button type="button" class="b3-button b3-button--text" disabled={loading} onclick={() => void refresh(true)}>{t("activity.retry")}</button>
                    </div>
                {/if}
                <div class="lv-card {compact ? 'lv-empty-compact' : 'lv-empty'}" role="status">
                    <div class={compact ? "eic-sm" : "eic"}><UiIcon name="calendar" size={compact ? 18 : 22} /></div>
                    {#if compact}
                        <div class="lv-empty-compact__text">
                            <b>{query || moduleFilter !== "all" ? t("activity.noMatch") : t("activity.empty")}</b>
                            <span>{snapshot?.errors.length ? t("activity.incompleteEmptyHint") : query || moduleFilter !== "all" ? t("activity.noMatchHint") : t("activity.emptyHint")}</span>
                        </div>
                        {#if query || moduleFilter !== "all"}<button type="button" class="b3-button b3-button--outline" onclick={clearFilters}>{t("activity.clearFilters")}</button>{/if}
                        {#if snapshot?.eligibleModules === 0}<button class="b3-button b3-button--outline" onclick={() => plugin.openSetting()}>{t("activity.configure")}</button>{/if}
                    {:else}
                        <b>{query || moduleFilter !== "all" ? t("activity.noMatch") : t("activity.empty")}</b>
                        <span>{snapshot?.errors.length ? t("activity.incompleteEmptyHint") : query || moduleFilter !== "all" ? t("activity.noMatchHint") : t("activity.emptyHint")}</span>
                        {#if query || moduleFilter !== "all"}<button type="button" class="b3-button b3-button--outline" style="margin-top:8px" onclick={clearFilters}>{t("activity.clearFilters")}</button>{/if}
                        {#if snapshot?.eligibleModules === 0}<button class="b3-button b3-button--outline" style="margin-top:8px" onclick={() => plugin.openSetting()}>{t("activity.configure")}</button>{/if}
                    {/if}
                </div>
            {:else}
                {#if snapshot?.errors.length}
                    <div class="lv-activity-partial" role="status">
                        <UiIcon name="alert" size={14} />
                        {t("activity.partial").replace("${n}", String(snapshot.errors.length))}
                        <button type="button" class="b3-button b3-button--text" disabled={loading} onclick={() => void refresh(true)}>{t("activity.retry")}</button>
                    </div>
                {/if}
                {#if loadError}
                    <div class="lv-activity-partial" role="alert"><UiIcon name="alert" size={14} />{t("activity.failed")}：{loadError}<button type="button" class="b3-button b3-button--text" disabled={loading} onclick={() => void refresh(true)}>{t("activity.retry")}</button></div>
                {/if}
                <div class="lv-card lv-activity-list">
                    {#each pageRecords as record (record.id)}
                        <article class="lv-activity-row">
                            <span class="lv-activity-mark" aria-hidden="true"><UiIcon name={record.logKind === "fuelings" ? "fuel" : record.logKind === "chargings" ? "bolt" : record.logKind === "maintenance" ? "wrench" : "note"} size={16} /></span>
                            <div class="lv-activity-main">
                                <button class="lv-activity-open" type="button" onclick={() => open(record)} title={t("activity.openRecord")}>
                                    <b>{record.title || t("ledger.unnamed")}</b>
                                    <span class="lv-activity-module">{t(`module.${record.moduleId}`)}{record.memberId ? ` · ${memberName(record.memberId)}` : ` · ${t("members.unassigned")}`}</span>
                                </button>
                                <div class="lv-activity-details">
                                    {#if record.logKind}
                                        <span class="lv-badge gray">{t(`activity.log.${record.logKind}`)}</span>
                                    {/if}
                                    {#each record.details as detail (detail.key)}
                                        <span>{detailLabel(detail.key)}：{detailValue(record, detail.valueKey, detail.value)}</span>
                                    {/each}
                                </div>
                            </div>
                            <div class="lv-activity-time"><b class="lv-num">{recordTime(record)}</b><span>{timeBasis(record)}</span></div>
                        </article>
                    {/each}
                    {#if snapshot?.orphanedRowLogs}
                        <div class="lv-activity-orphan" role="note">{t("activity.orphaned").replace("${n}", String(snapshot.orphanedRowLogs))}</div>
                    {/if}
                </div>
                <div class="lv-activity-footer">
                    <span role="status" aria-live="polite" aria-atomic="true">{t("activity.count").replace("${start}", String((page - 1) * pageSize + 1)).replace("${end}", String(Math.min(page * pageSize, records.length))).replace("${total}", String(records.length))}</span>
                    <div>
                        <button type="button" class="lv-iconbtn" aria-label={t("activity.previous")} disabled={page <= 1} onclick={() => page = Math.max(1, page - 1)}>←</button>
                        <span class="lv-num">{page} / {pageCount}</span>
                        <button type="button" class="lv-iconbtn" aria-label={t("activity.next")} disabled={page >= pageCount} onclick={() => page = Math.min(pageCount, page + 1)}>→</button>
                    </div>
                    <button type="button" class="b3-button b3-button--text" onclick={goToLedger}>{t("activity.goToLedger")} →</button>
                </div>
            {/if}
        </div>
</section>

<style>
    .lv-activity { display:flex; flex-direction:column; gap:10px; min-width:0; margin-block:18px; }
    .lv-activity-head { display:flex; align-items:center; justify-content:space-between; gap:12px; min-width:0; }
    .lv-activity-heading { display:flex; align-items:baseline; gap:9px; min-width:0; flex-wrap:wrap; }
    .lv-activity-heading h2 { margin:0; }
    .lv-activity-actions { display:flex; align-items:center; gap:5px; flex:none; }
    .lv-activity-body { display:flex; flex-direction:column; gap:8px; min-width:0; }
    .lv-activity-body[hidden] { display:none; }
    .lv-activity-tools { display:flex; align-items:center; gap:8px; min-width:0; }
    .lv-activity-search { display:flex; align-items:center; gap:7px; min-width:0; flex:1; padding:0 10px; border:1px solid var(--lv-line); border-radius:var(--lv-r-2); background:var(--lv-surface); color:var(--lv-tx-3); }
    .lv-activity-search:focus-within { border-color:var(--lv-accent); box-shadow:0 0 0 3px var(--lv-accent-soft); }
    .lv-activity-search input { width:100%; min-width:0; height:36px; border:0; outline:0; background:transparent; color:var(--lv-tx); font:inherit; }
    .lv-activity-filter { width:auto; min-width:140px; max-width:220px; }
    .lv-activity-list { overflow:hidden; padding:0 14px; }
    .lv-activity-row { display:grid; grid-template-columns:34px minmax(0,1fr) auto; align-items:center; gap:11px; min-width:0; padding:12px 0; border-bottom:1px solid var(--lv-line); }
    .lv-activity-row:last-of-type { border-bottom:0; }
    .lv-activity-mark { display:grid; place-items:center; width:32px; height:32px; border-radius:10px; color:var(--lv-accent); background:var(--lv-accent-soft); }
    .lv-activity-main { display:flex; flex-direction:column; gap:5px; min-width:0; }
    .lv-activity-open { display:flex; align-items:baseline; gap:8px; min-width:0; width:fit-content; max-width:100%; padding:0; border:0; background:none; color:inherit; text-align:left; cursor:pointer; font:inherit; }
    .lv-activity-open b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }
    .lv-activity-open:hover b { color:var(--lv-accent); }
    .lv-activity-open:focus-visible { outline:2px solid var(--lv-accent); outline-offset:3px; border-radius:3px; }
    .lv-activity-actions button:focus-visible,.lv-activity-footer button:focus-visible { outline:2px solid var(--lv-accent); outline-offset:2px; }
    .lv-activity-module { overflow:hidden; color:var(--lv-tx-3); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
    .lv-activity-details { display:flex; align-items:center; gap:5px 10px; flex-wrap:wrap; color:var(--lv-tx-2); font-size:11px; }
    .lv-activity-details > span:not(.lv-badge) { max-width:min(100%, 300px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .lv-activity-time { display:flex; flex-direction:column; align-items:flex-end; gap:3px; white-space:nowrap; }
    .lv-activity-time b { color:var(--lv-tx-2); font-size:11px; font-weight:550; }
    .lv-activity-time span { color:var(--lv-tx-3); font-size:10px; }
    .lv-activity-footer { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; color:var(--lv-tx-3); font-size:11px; }
    .lv-activity-footer > div { display:flex; align-items:center; gap:7px; }
    .lv-activity-footer .lv-iconbtn { width:30px; height:30px; }
    .lv-activity-footer .lv-iconbtn:disabled { opacity:.42; cursor:not-allowed; }
    .lv-activity-state { display:flex; align-items:center; gap:8px; min-height:66px; padding:16px; color:var(--lv-tx-2); }
    .lv-activity-state > span:last-child { margin-left:auto; color:var(--lv-tx-3); }
    .lv-activity-spinner { width:15px; height:15px; border:2px solid var(--lv-line); border-top-color:var(--lv-accent); border-radius:50%; animation:lv-activity-spin .8s linear infinite; }
    .lv-activity-spinner--small { display:inline-block; width:12px; height:12px; vertical-align:middle; }
    .lv-activity-partial,.lv-activity-orphan { display:flex; align-items:center; gap:7px; padding:7px 10px; border-radius:var(--lv-r-2); color:var(--lv-tx-2); background:var(--lv-surface-2); font-size:11px; }
    .lv-activity-partial button { margin-left:auto; }
    .lv-activity-orphan { display:block; margin:8px 0; color:var(--lv-tx-3); }
    @keyframes lv-activity-spin { to { transform:rotate(360deg); } }
    @container lv-home (max-width:600px) {
        .lv-activity-heading { gap:5px 8px; }
        .lv-activity-row { grid-template-columns:30px minmax(0,1fr) auto; gap:8px; }
        .lv-activity-mark { width:28px; height:28px; }
        .lv-activity-time { grid-column:3; grid-row:1; }
        .lv-activity-module { display:none; }
    }
    @container lv-home (max-width:420px) {
        .lv-activity-tools { align-items:stretch; flex-direction:column; }
        .lv-activity-filter { max-width:none; width:100%; }
        .lv-activity-time span { max-width:120px; overflow:hidden; text-overflow:ellipsis; }
        .lv-activity-footer { justify-content:center; }
        .lv-activity-footer > span { width:100%; text-align:center; }
        .lv-activity-footer > button { width:100%; justify-content:center; }
    }
    @media (prefers-reduced-motion: reduce) { .lv-activity-spinner { animation:none; } }
</style>
