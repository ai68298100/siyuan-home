<script lang="ts">
    import { Dialog, Menu, showMessage, confirm } from "siyuan";
    import type { HomePluginLike } from "@/types/plugin";
    import { saveRuntime } from "@/core/hub/runtime";
    import { moduleIcon } from "@/core/modules";
    import type { Reminder } from "@/types";
    let { plugin, t, version }: { plugin: HomePluginLike; t: (k: string) => string; version?: number } = $props();

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
        return [...new Set((plugin.scan?.reminders ?? []).map((r: Reminder) => r.moduleId))];
    });
    async function persistFilter() {
        plugin.runtime.hubFilter = filter;
        plugin.runtime.hubMemberId = filterMember;
        plugin.runtime.hubModuleId = filterModule;
        plugin.runtime.hubDueWithin = dueWithin;
                await saveRuntime(plugin, plugin.runtime);
    }
    const filtered = $derived.by(() => {
        const level = filter;
        let list = level === "all" ? all : level === "handled" ? [] : all.filter((r: Reminder) => r.level === level);
        if (filterMember) list = list.filter((r: Reminder) => !r.memberId || r.memberId === filterMember);
        if (filterModule) list = list.filter((r: Reminder) => r.moduleId === filterModule);
        if (dueWithin !== "all") {
            // 时间窗含逾期：dueDate ≤ 今天+N（yyyy-MM-dd 字符串比较安全；逾期恒在窗内）
            const today = new Date();
            const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Number(dueWithin));
            const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
            list = list.filter((r: Reminder) => r.dueDate <= endKey);
        }
        return list;
    });
    const levelBadge: Record<string, string> = { overdue: "red", soon: "orange", lead: "yellow" };

    // UG11 v1：提醒导出 .ics（当前筛选为范围；G1 同款——含高后果模块先点名确认）
    const HIGH_CONSEQUENCE_MODULES = new Set(["health", "parenting", "certs", "insurance", "assets-real", "assets-virtual", "contracts", "medicine", "schooling"]);
    function exportIcs() {
        const list = filtered;
        if (list.length === 0) { showMessage(t("hub.icsEmpty"), 3000, "error"); return; }
        const download = () => {
            import("@/core/ics").then(({ buildIcs }) => {
                const events = list.map((r: Reminder) => ({
                    uid: `${r.id}@lvhome.local`,
                    date: r.dueDate,
                    summary: r.title, // 用户确认后才导出；文件保管责任由确认框声明
                    description: r.moduleId === "adhoc" ? t("adhoc.name") : (t(`module.${r.moduleId}`) !== `module.${r.moduleId}` ? t(`module.${r.moduleId}`) : r.moduleId),
                }));
                const ics = buildIcs(t("hub.title"), events);
                const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `lvhome-reminders-${new Date().toISOString().slice(0, 10)}.ics`;
                a.click();
                URL.revokeObjectURL(a.href);
                showMessage(t("hub.icsDone").replace("${n}", String(list.length)), 3000, "info");
            });
        };
        if (list.some((r: Reminder) => HIGH_CONSEQUENCE_MODULES.has(r.moduleId))) {
            confirm(t("hub.icsTitle"), t("hub.icsBody").replace("${n}", String(list.length)), download);
            return;
        }
        download();
    }
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

    // H03：未处理备忘的显式删除（确认后物理删除；这是备忘唯一的物理删除路径）
    function confirmDeleteMemo(r: Reminder) {
        confirm(t("delete"), t("hub.memoDeleteBody").replace("${title}", r.title), async () => {
            await plugin.removeMemo(r.id);
            showMessage(t("hub.memoDeleted"), 2500, "info");
        });
    }

    // 17 组：批量操作——选择模式下逐条勾选，批量完成/延后 7 天/忽略（H01 串行队列逐条落盘）
    let batchMode = $state(false);
    let selected = $state<Set<string>>(new Set());
    let batchBusy = $state(false);
    const selectedCount = $derived(selected.size);
    function toggleSelect(id: string) {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        selected = next;
    }
    function selectAllFiltered() {
        selected = new Set(filtered.map((r: Reminder) => r.id));
    }
    function clearSelection() {
        selected = new Set();
        batchMode = false;
    }
    async function runBatch(kind: "done" | "snooze7" | "mute") {
        if (batchBusy || selected.size === 0) return;
        batchBusy = true;
        try {
            const byId = new Map<string, Reminder>(all.map((r: Reminder) => [r.id, r] as [string, Reminder]));
            let ok = 0;
            const failed: string[] = [];
            // 逐条容错：单项失败不中断批量（剩余项继续处理），失败清单在回执中报告
            for (const id of selected) {
                const r = byId.get(id);
                if (!r) continue;
                try {
                    if (kind === "done") await plugin.complete(r);
                    else if (kind === "snooze7") await plugin.snooze(id, 7);
                    else await plugin.mute(id);
                    ok++;
                } catch (e) {
                    failed.push((r as any).title || id);
                    console.warn("[siyuan-home] batch item failed:", e instanceof Error ? e.message : e);
                }
            }
            if (failed.length > 0) {
                showMessage(t("hub.batchPartial").replace("${ok}", String(ok)).replace("${failed}", failed.join("、")), 7000, "error");
            } else {
                showMessage(t("hub.batchDone").replace("${n}", String(ok)), 3000, "info");
            }
            selected = new Set();
        } finally {
            batchBusy = false;
        }
    }

    // B4b 续期：思源 Dialog 小窗（H10：失败保留 Dialog 与输入、错误就地显示，不提前销毁）
    // 19 组安全：HTML 模板不插值任何用户内容——标题/条目名经 textContent 挂载，防台账文本注入
    function renewDialog(r: Reminder) {
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
    function snoozeMenu(r: Reminder, ev: MouseEvent) {
        const menu = new Menu("lv-snooze");
        for (const d of [1, 3, 7, 30]) {
            menu.addItem({
                label: t("act.snoozeN").replace("${n}", String(d)),
                click: () => plugin.snooze(r.id, d),
            });
        }
        menu.open({ x: ev.clientX, y: ev.clientY });
    }

    // 29 组：同成员同日多条合并为一条可展开卡（"儿子的 3 件事"）；单条与无成员事项保持独立。
    // 175 波性能：先按键一次分组（原实现对每个合并组再做 items.filter，最坏 O(n²)）
    function buildDisplay(items: any[]): any[] {
        const groups = new Map<string, any[]>();
        for (const r of items) {
            if (!r.memberId) continue;
            const k = `${r.memberId}|${r.dueDate}`;
            let g = groups.get(k);
            if (!g) { g = []; groups.set(k, g); }
            g.push(r);
        }
        const used = new Set<string>();
        const out: any[] = [];
        for (const r of items) {
            if (!r.memberId) { out.push({ merged: false, row: r }); continue; }
            const k = `${r.memberId}|${r.dueDate}`;
            const g = groups.get(k);
            if (g && g.length > 1) {
                if (used.has(k)) continue; // 同键后续行并入合并条目
                used.add(k);
                out.push({ merged: true, key: k, memberId: r.memberId, dueDate: r.dueDate, items: g });
            } else {
                out.push({ merged: false, row: r });
            }
        }
        return out;
    }
    let expandedMerges = $state<Set<string>>(new Set());
    function toggleMerge(key: string) {
        const next = new Set(expandedMerges);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        expandedMerges = next;
    }
    function memberName(id: string): string {
        return (plugin.settings.members ?? []).find((m) => m.id === id)?.name ?? t("members.unassigned");
    }
</script>

{#snippet remRow(r: Reminder)}
    <div class="lv-rem {r.level}">
        {#if batchMode}
            <input type="checkbox" class="b3-checkbox" aria-label={t("hub.select")}
                checked={selected.has(r.id)} onchange={() => toggleSelect(r.id)} style="flex-shrink:0" />
        {/if}
        <div class="lv-rem-ic">{r.moduleId === "adhoc" ? "📝" : moduleIcon(r.moduleId)}</div>
        <div class="lv-rem-t" title={r.autoRenew ? t("hub.autoRenew") : undefined}><b>{r.title}</b><span class="lv-num">{r.dueDate}{r.lunar ? " 🌙" : ""}{r.autoRenew ? " 🔄" : ""}</span></div>
        <span class="lv-badge {levelBadge[r.level]}">
            {r.level === "overdue" ? t("level.overdue") : r.level === "soon" ? t("level.soon") : t("level.lead")}
        </span>
        <div class="lv-rem-ops">
            <button class="b3-button b3-button--text" onclick={() => plugin.complete(r)}>{t("act.done")}</button>
            {#if ["certs", "insurance", "contracts"].includes(r.moduleId)}
                <!-- 续保/换证/合同续约：新到期日写回规则 field 列（26.6 + 98 波：contracts 规则带 field=expiry 与
                     autoRenewField 升级路径，此前 🔄 决策提醒无"续"动作入口——漏项补齐） -->
                <button class="b3-button b3-button--text" onclick={() => renewDialog(r)}>{t("act.renew")}</button>
            {/if}
            {#if r.moduleId !== "adhoc" && plugin.settings.dbRefs[r.moduleId]?.docId}
                <button class="b3-button b3-button--text" title={t("act.locate")} onclick={() => plugin.showTabDocs(plugin.settings.dbRefs[r.moduleId].docId)}>{t("act.locate")}</button>
            {/if}
            <button class="b3-button b3-button--text" onclick={(e) => snoozeMenu(r, e)}>{t("act.snooze")} ▾</button>
            <button class="b3-button b3-button--text" onclick={() => plugin.mute(r.id)}>{t("act.mute")}</button>
            {#if r.moduleId === "adhoc"}
                <!-- H03：备忘的显式删除（唯一物理删除路径；未处理项不自动清理） -->
                <button class="b3-button b3-button--text" onclick={() => confirmDeleteMemo(r)}>{t("delete")}</button>
            {/if}
        </div>
    </div>
{/snippet}

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
    <button class="b3-button b3-button--outline" onclick={exportIcs}>{t("hub.icsExport")}</button>
    <span class="fn__flex-1"></span>
    <button class="b3-button b3-button--outline" class:b3-button--text={batchMode} onclick={() => (batchMode ? clearSelection() : (batchMode = true))}>{t("hub.batch")}</button>
    <button class="b3-button b3-button--outline" onclick={() => plugin.refreshHub(undefined, true)}>{t("hub.rescan")}</button>
</div>

{#if batchMode}
    <div class="lv-card" style="padding:8px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <b class="lv-caption">{t("hub.selectedN").replace("${n}", String(selectedCount))}</b>
        <button class="b3-button b3-button--text" onclick={selectAllFiltered}>{t("hub.selectAll")}</button>
        <span class="fn__flex-1"></span>
        <button class="b3-button b3-button--text" disabled={batchBusy || selectedCount === 0} onclick={() => runBatch("done")}>{t("act.done")}</button>
        <button class="b3-button b3-button--text" disabled={batchBusy || selectedCount === 0} onclick={() => runBatch("snooze7")}>{t("act.snooze7")}</button>
        <button class="b3-button b3-button--text" disabled={batchBusy || selectedCount === 0} onclick={() => runBatch("mute")}>{t("act.mute")}</button>
        <button class="b3-button b3-button--outline" onclick={clearSelection}>{t("cancel")}</button>
    </div>
{/if}

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
            { key: "overdue", label: t("hub.groupOverdue"), items: filtered.filter((r: Reminder) => r.level === "overdue") },
            { key: "soon", label: t("hub.groupSoon"), items: filtered.filter((r: Reminder) => r.level === "soon") },
            { key: "lead", label: t("hub.groupLead"), items: filtered.filter((r: Reminder) => r.level === "lead") },
        ].filter((g) => g.items.length > 0)
        : [{ key: filter, label: "", items: filtered }]}
    {#each groups as g (g.key)}
        {#if g.label}<div class="lv-group-label">{g.label} · {g.items.length}</div>{/if}
        <div class="lv-card lv-rems">
            {#each buildDisplay(g.items) as entry (entry.merged ? entry.key : entry.row.id)}
                {#if entry.merged}
                    <!-- 29 组：同成员同日合并卡 -->
                    <div class="lv-rem lead" role="button" tabindex="0"
                        onkeydown={(e: KeyboardEvent) => e.key === "Enter" && toggleMerge(entry.key)}
                        onclick={() => toggleMerge(entry.key)}>
                        <div class="lv-rem-ic">👪</div>
                        <div class="lv-rem-t"><b>{memberName(entry.memberId)} · {entry.dueDate}</b><span class="lv-caption">{t("hub.mergeHint")}</span></div>
                        <span class="lv-badge orange">{entry.items.length}</span>
                        <div class="lv-rem-ops"><span class="lv-caption">{expandedMerges.has(entry.key) ? "▾" : "▸"}</span></div>
                    </div>
                    {#if expandedMerges.has(entry.key)}
                        {#each entry.items as sub (sub.id)}
                            {@render remRow(sub)}
                        {/each}
                    {/if}
                {:else}
                    {@render remRow(entry.row)}
                {/if}
            {/each}
        </div>
    {/each}
{/if}
