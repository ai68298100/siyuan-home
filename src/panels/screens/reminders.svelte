<script lang="ts">
    import { Dialog, Menu, showMessage } from "siyuan";
    let { plugin, t, version }: { plugin: any; t: (k: string) => string; version?: number } = $props();

    // version（H02）：hub 变更时递增，驱动派生重算（plugin.* 为普通对象引用）
    const all = $derived.by(() => {
        void version;
        return plugin.scan?.reminders ?? [];
    });
    // C3d：筛选持久化（runtime.hubFilter）——初始快照为设计意图
    // svelte-ignore state_referenced_locally
    let filter = $state(plugin.runtime.hubFilter ?? "all");
    async function setFilter(v: string) {
        filter = v;
        plugin.runtime.hubFilter = v;
        const { saveRuntime } = await import("@/core/hub/runtime");
        await saveRuntime(plugin, plugin.runtime);
    }
    const filtered = $derived(
        filter === "all" ? all : filter === "handled" ? [] : all.filter((r: any) => r.level === filter),
    );
    const levelBadge: Record<string, string> = { overdue: "red", soon: "orange", lead: "yellow" };
    // H07：已处理视图真实数据源（runtime 留痕 + 缓存派生列表回查标题）
    const handledEntries = $derived.by(() => {
        void version;
        return plugin.listHandled?.() ?? [];
    });
    const kindLabel: Record<string, string> = {
        done: "hub.handledDone", muted: "hub.handledMuted",
        year: "hub.handledYear", period: "hub.handledPeriod", memo: "hub.handledMemo",
    };
    async function restoreEntry(id: string) {
        await plugin.restore(id);
        showMessage(t("hub.restoreDone"), 3000, "info");
    }

    // B4b 续期：思源 Dialog 小窗（B4e 正规化，替换 window.prompt）
    function renewDialog(r: any) {
        const dlg = new Dialog({
            title: `${t("act.renew")} · ${r.title}`,
            content: `<div class="b3-dialog__content"><input class="b3-text-field fn__block" id="lv-renew-date" type="date" value="${r.dueDate}"></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-renew-cancel">${t("cancel")}</button><button class="b3-button b3-button--text" id="lv-renew-ok">${t("save")}</button></div>`,
            width: "380px",
        });
        // 33.4 弹层契约：初始焦点落在日期输入
        (dlg.element.querySelector("#lv-renew-date") as HTMLInputElement)?.focus();
        dlg.element.querySelector("#lv-renew-cancel")?.addEventListener("click", () => dlg.destroy());
        dlg.element.querySelector("#lv-renew-ok")?.addEventListener("click", async () => {
            const v = (dlg.element.querySelector("#lv-renew-date") as HTMLInputElement)?.value;
            dlg.destroy();
            if (!v) return;
            // plugin.renew 内部写回后触发 refreshHub（行数据已变，不走 notifyHubChanged）
            await plugin.renew(r, v);
        });
    }

    // C3c 延后天数菜单（1/3/7/30）
    function snoozeMenu(r: any, ev: MouseEvent) {
        const menu = new Menu("lv-snooze");
        for (const d of [1, 3, 7, 30]) {
            menu.addItem({
                label: t("act.snoozeN").replace("${n}", String(d)),
                click: () => plugin.snooze(r.id, d),
            });
        }
        menu.open({ x: ev.clientX, y: ev.clientY });
    }
</script>

<div class="lv-hero"><h1>{t("hub.title")}</h1><p>{t("hub.subtitle")}</p></div>

<div class="filters" style="display:flex;gap:8px;margin:16px 0">
    <select class="b3-select" value={filter} onchange={(e) => setFilter((e.target as HTMLSelectElement).value)}>
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
    {#if handledEntries.length === 0}
        <div class="lv-card"><div class="lv-empty"><div class="eic">✓</div><b>{t("hub.handledTitle")}</b><span>{t("hub.handledHint")}</span></div></div>
    {:else}
        <div class="lv-card lv-rems">
            {#each handledEntries as h (h.id + h.kind)}
                <div class="lv-rem lead">
                    <div class="lv-rem-ic">{h.kind === "memo" ? "📝" : h.kind === "muted" ? "🔇" : "✓"}</div>
                    <div class="lv-rem-t">
                        <b>{h.title || t("hub.handledUnknown")}</b>
                        <span class="lv-caption">{t(kindLabel[h.kind] ?? "hub.handledDone")}{h.dueDate ? ` · ${h.dueDate}` : ""}{h.moduleId && h.moduleId !== "adhoc" ? ` · ${t(`module.${h.moduleId}`)}` : ""}</span>
                    </div>
                    <div class="lv-rem-ops">
                        <button class="b3-button b3-button--text" onclick={() => restoreEntry(h.id)}>{t("hub.restore")}</button>
                        {#if h.kind === "memo"}
                            <button class="b3-button b3-button--text" onclick={() => plugin.removeMemo(h.id)}>{t("delete")}</button>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
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
                        {#if ["certs", "insurance"].includes(r.moduleId)}
                            <!-- 续保/换证：新到期日写回台账行 expiry（26.6：insurance 续保决策的"续"动作；比价/放弃选项留 UI 细化） -->
                            <button class="b3-button b3-button--text" onclick={() => renewDialog(r)}>{t("act.renew")}</button>
                        {/if}
                        {#if r.moduleId !== "adhoc" && plugin.settings.dbRefs[r.moduleId]?.docId}
                            <button class="b3-button b3-button--text" title={t("act.locate")} onclick={() => plugin.showTabDocs(plugin.settings.dbRefs[r.moduleId].docId)}>{t("act.locate")}</button>
                        {/if}
                        <button class="b3-button b3-button--text" onclick={(e) => snoozeMenu(r, e)}>{t("act.snooze")} ▾</button>
                        <button class="b3-button b3-button--text" onclick={() => plugin.mute(r.id)}>{t("act.mute")}</button>
                    </div>
                </div>
            {/each}
        </div>
    {/each}
{/if}
