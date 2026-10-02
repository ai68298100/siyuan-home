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
    // C3a 成员/模块筛选（H16：成员删除后由成员页复位持久化值；本地 $state 驱动，runtime 只作持久化）
    // svelte-ignore state_referenced_locally
    let filterMember = $state<string | undefined>(plugin.runtime.hubMemberId);
    // svelte-ignore state_referenced_locally
    let filterModule = $state<string | undefined>(plugin.runtime.hubModuleId);
    // C3a 时间窗：all=不限 / 0=今天 / 7 / 30（含逾期）
    // svelte-ignore state_referenced_locally
    let dueWithin = $state<string>(plugin.runtime.hubDueWithin ?? "all");
    const memberOptions = $derived.by(() => {
        void version;
        return plugin.settings.members ?? [];
    });
    const moduleOptions = $derived.by(() => {
        void version;
        return [...new Set((plugin.scan?.reminders ?? []).map((r: any) => r.moduleId))];
    });
    async function persistFilter() {
        plugin.runtime.hubFilter = filter;
        plugin.runtime.hubMemberId = filterMember;
        plugin.runtime.hubModuleId = filterModule;
        plugin.runtime.hubDueWithin = dueWithin;
        const { saveRuntime } = await import("@/core/hub/runtime");
        await saveRuntime(plugin, plugin.runtime);
    }
    const filtered = $derived.by(() => {
        const level = filter;
        let list = level === "all" ? all : level === "handled" ? [] : all.filter((r: any) => r.level === level);
        if (filterMember) list = list.filter((r: any) => !r.memberId || r.memberId === filterMember);
        if (filterModule) list = list.filter((r: any) => r.moduleId === filterModule);
        if (dueWithin !== "all") {
            // 时间窗含逾期：dueDate ≤ 今天+N（yyyy-MM-dd 字符串比较安全；逾期恒在窗内）
            const today = new Date();
            const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Number(dueWithin));
            const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
            list = list.filter((r: any) => r.dueDate <= endKey);
        }
        return list;
    });
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

    // B4b 续期：思源 Dialog 小窗（H10：失败保留 Dialog 与输入、错误就地显示，不提前销毁）
    // 19 组安全：HTML 模板不插值任何用户内容——标题/条目名经 textContent 挂载，防台账文本注入
    function renewDialog(r: any) {
        const dlg = new Dialog({
            title: t("act.renew"),
            content: `<div class="b3-dialog__content"><div class="b3-dialog__content" id="lv-renew-sub" style="margin-bottom:8px"></div><input class="b3-text-field fn__block" id="lv-renew-date" type="date"><div class="lv-caption" id="lv-renew-err" role="alert" style="color:var(--b3-card-error-color);display:none"></div></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-renew-cancel">${t("cancel")}</button><button class="b3-button b3-button--text" id="lv-renew-ok">${t("save")}</button></div>`,
            width: "380px",
        });
        // 33.4 弹层契约：初始焦点落在日期输入
        const dateInput = dlg.element.querySelector("#lv-renew-date") as HTMLInputElement;
        dateInput.value = r.dueDate; // 内部格式 yyyy-MM-dd，属性赋值不走 HTML 解析
        const sub = dlg.element.querySelector("#lv-renew-sub") as HTMLElement;
        sub.textContent = r.title; // textContent：用户内容不经 HTML 解析
        dateInput?.focus();
        dlg.element.querySelector("#lv-renew-cancel")?.addEventListener("click", () => dlg.destroy());
        dlg.element.querySelector("#lv-renew-ok")?.addEventListener("click", async () => {
            const v = dateInput?.value;
            if (!v) return;
            const okBtn = dlg.element.querySelector("#lv-renew-ok") as HTMLButtonElement;
            const err = dlg.element.querySelector("#lv-renew-err") as HTMLElement;
            try {
                okBtn.disabled = true;
                // plugin.renew 内部写回后触发 refreshHub（行数据已变，不走 notifyHubChanged）
                await plugin.renew(r, v);
                dlg.destroy();
            } catch (e) {
                // 写回失败：保留 Dialog 与已填值，可重试
                err.textContent = t("ledger.saveFailed").replace("${msg}", e instanceof Error ? e.message : String(e));
                err.style.display = "block";
                okBtn.disabled = false;
            }
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

<div class="filters" style="display:flex;gap:8px;margin:16px 0;flex-wrap:wrap">
    <select class="b3-select" value={filter} onchange={(e) => { filter = (e.target as HTMLSelectElement).value; persistFilter(); }}>
        <option value="all">{t("hub.filterAll")}</option>
        <option value="overdue">{t("hub.filterOverdue")}</option>
        <option value="soon">{t("hub.filterSoon")}</option>
        <option value="lead">{t("hub.filterLead")}</option>
        <option value="handled">{t("hub.filterHandled")}</option>
    </select>
    <select class="b3-select" value={filterMember ?? ""} onchange={(e) => { filterMember = (e.target as HTMLSelectElement).value || undefined; persistFilter(); }}>
        <option value="">{t("field.member")}: {t("members.all")}</option>
        {#each memberOptions as m (m.id)}
            <option value={m.id}>{m.name}</option>
        {/each}
    </select>
    <select class="b3-select" value={filterModule ?? ""} onchange={(e) => { filterModule = (e.target as HTMLSelectElement).value || undefined; persistFilter(); }}>
        <option value="">{t("hub.filterAllModule")}</option>
        {#each moduleOptions as mid (mid)}
            <option value={mid}>{mid === "adhoc" ? t("adhoc.name") : (t(`module.${mid}`) !== `module.${mid}` ? t(`module.${mid}`) : mid)}</option>
        {/each}
    </select>
    <select class="b3-select" value={dueWithin} onchange={(e) => { dueWithin = (e.target as HTMLSelectElement).value; persistFilter(); }}>
        <option value="all">{t("hub.dueAll")}</option>
        <option value="0">{t("hub.dueToday")}</option>
        <option value="7">{t("hub.due7")}</option>
        <option value="30">{t("hub.due30")}</option>
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
