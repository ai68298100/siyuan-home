<script lang="ts">
    import { Dialog, Menu, showMessage, confirm } from "siyuan";
    import type { HomePluginLike } from "@/types/plugin";
    import { saveRuntime } from "@/core/hub/runtime";
    import { buildDisplay as display } from "@/core/hub/display";
    import { relativeDue, weekdayKey } from "@/core/hub/rule";
    import { addDetachedRow, setCell } from "@/core/siyuan";
    import Calendar from "@/panels/screens/calendar.svelte";
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
    // 225 波：行级级别徽章撤除（级别由色轨+右侧相对时间大字承载，避免重复）——levelBadge 随之移除

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
    // 230 波：原生日历视图切换（列表 ⇄ 日历；批量模式仅在列表生效）
    let viewMode = $state<"list" | "calendar">("list");
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

    // 29 组：同成员同日多条合并为一条可展开卡；175 波 O(n) 分组、179 波抽纯函数（core/hub/display，带单测）
    // 181 波：DisplayEntry 平铺化（key/row/items 恒有值），模板无需联合收窄。
    const buildDisplay = (items: Reminder[]) => display(items);

    // 236 波（收件箱分诊）：备忘 → 正式台账行。目标限已建库的非成员模块；
    // 名称带入备忘标题、日期带入目标模块首个日期列；创建后完成备忘（可在"已处理"恢复）。
    async function toLedgerDialog(r: Reminder) {
        const targets = (plugin.settings.enabledModules ?? [])
            .filter((id) => id !== "adhoc" && id !== "members")
            .map((id) => ({ id, ref: plugin.settings.dbRefs[id] }))
            .filter((x) => x.ref?.avId);
        if (!targets.length) { showMessage(t("triage.noTarget"), 3500, "error"); return; }
        const modLabel = (id: string) => (t(`module.${id}`) !== `module.${id}` ? t(`module.${id}`) : id);
        const dlg = new Dialog({ title: t("triage.title"), content: `<div id="lv-triage" style="display:flex;flex-direction:column;gap:10px"></div>`, width: "460px" });
        const box = dlg.element.querySelector("#lv-triage") as HTMLElement;
        const row1 = document.createElement("div");
        row1.style.cssText = "display:flex;gap:8px;align-items:center";
        const l1 = document.createElement("span"); l1.className = "ft__on-surface"; l1.style.minWidth = "72px"; l1.textContent = t("triage.module");
        const sel = document.createElement("select"); sel.className = "b3-select"; sel.style.flex = "1";
        for (const x of targets) { const o = document.createElement("option"); o.value = x.id; o.textContent = modLabel(x.id); sel.append(o); }
        row1.append(l1, sel);
        const row2 = document.createElement("div");
        row2.style.cssText = "display:flex;gap:8px;align-items:center";
        const l2 = document.createElement("span"); l2.className = "ft__on-surface"; l2.style.minWidth = "72px"; l2.textContent = t("triage.name");
        const nameInput = document.createElement("input"); nameInput.className = "b3-text-field"; nameInput.style.flex = "1"; nameInput.value = r.title;
        row2.append(l2, nameInput);
        const row3 = document.createElement("div");
        row3.style.cssText = "display:flex;gap:8px;align-items:center";
        const l3 = document.createElement("span"); l3.className = "ft__on-surface"; l3.style.minWidth = "72px"; l3.textContent = t("triage.due");
        const dateInput = document.createElement("input"); dateInput.className = "b3-text-field"; dateInput.type = "date"; dateInput.value = r.dueDate;
        row3.append(l3, dateInput);
        const ok = document.createElement("button"); ok.className = "b3-button b3-button--text"; ok.textContent = t("triage.create");
        const doCreate = async () => {
            const title = nameInput.value.trim();
            if (!title) return;
            const mod = sel.value;
            const ref = plugin.settings.dbRefs[mod];
            if (!ref?.avId) { showMessage(t("triage.noTarget"), 3000, "error"); return; }
            const itemID = await addDetachedRow(ref.avId, title);
            // 新建行身份确认存在延迟：setCell 失败受控重试（同格重写不会重复建行）
            const setCellSafe = async (key: string, value: unknown) => {
                const keyID = ref.columns?.[key];
                if (!keyID) return;
                for (let attempt = 0; ; attempt++) {
                    try { await setCell(ref.avId, keyID, itemID, value); return; }
                    catch (e) {
                        if (attempt >= 2) throw e;
                        await new Promise((r2) => setTimeout(r2, 400));
                    }
                }
            };
            await setCellSafe("name", { type: "text", text: { content: title } });
            // 日期写入提醒规则所用字段（如 certs→expiry）——写入无关日期列会导致转行后不派生提醒；
            // 无规则字段的模块回退首个 date 列（行仍有到期日信息）
            const schemaCols = plugin.schemaCatalog?.[mod]?.columns ?? [];
            const ruleFields = (plugin.schemaCatalog?.[mod]?.reminders ?? []).map((x: any) => x.field);
            const dateCol = schemaCols.find((c: any) => c.type === "date" && ruleFields.includes(c.key))
                ?? schemaCols.find((c: any) => c.type === "date");
            if (dateCol && r.dueDate) await setCellSafe(dateCol.key, { type: "date", date: { content: new Date(`${r.dueDate}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true } });
            dlg.destroy();
            showMessage(t("triage.done").replace("${mod}", modLabel(mod)), 4000, "info");
            await plugin.complete(r);
            // 转行改变了台账数据：全量重扫让新行立即派生提醒（缓存派生不含新行）
            await plugin.refreshHub();
        };
        ok.addEventListener("click", () => { ok.disabled = true; doCreate().finally(() => { ok.disabled = false; }); });
        box.append(row1, row2, row3, ok);
        nameInput.focus();
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
    // 17 组/186 波：相对到期短语（今天/明天/N 天后/逾期 N 天）；完整日期走 title 悬浮 + 标题下方 meta 行
    function relDue(daysLeft: number, fallback: string): string {
        const rel = relativeDue(daysLeft);
        if (!rel) {
            // 225 波对齐原型：提醒中枢右侧 30 天内一律相对短语（扫描工作台视角）；
            // 星期几仍只对 ≤6 天附注（205 波）；>30 天沿用 ISO（行下方已带完整日期）
            if (daysLeft >= 7 && daysLeft <= 30) return t("days.after").replace("${n}", String(Math.floor(daysLeft)));
            return fallback;
        }
        const base = rel.n === undefined ? t(rel.key) : t(rel.key).replace("${n}", String(rel.n));
        if (rel.key === "days.after" && daysLeft <= 6) {
            const wk = weekdayKey(fallback);
            if (wk) return `${base} · ${t(wk)}`; // 205 波：N 天后附星期几（原待办「下周三」半边的补齐）
        }
        return base;
    }
</script>

{#snippet remRow(r: Reminder)}
    <div class="lv-rem {r.level}">
        {#if batchMode}
            <input type="checkbox" class="b3-checkbox" aria-label={t("hub.select")}
                checked={selected.has(r.id)} onchange={() => toggleSelect(r.id)} style="flex-shrink:0" />
        {/if}
        <div class="lv-rem-ic">{r.moduleId === "adhoc" ? "📝" : moduleIcon(r.moduleId)}</div>
        <div class="lv-rem-t" title={(r.autoRenew ? `${t("hub.autoRenew")} · ` : "") + r.dueDate}>
            <b>{r.title}{r.ruleKey === "reciprocate" ? ` · ${t("rule.reciprocate")}` : ""}</b>
            <span class="lv-num">{r.dueDate}{r.lunar ? " 🌙" : ""}{r.autoRenew ? " 🔄" : ""}</span>
        </div>
        <!-- 对齐原型：相对到期大字居右（颜色随级别；文字本身已承载逾期/N天后语义，级别徽章不再重复） -->
        <div class="lv-rem-when">
            <b class="lv-num" style="color:var(--lv-{r.level === 'overdue' ? 'danger' : r.level === 'soon' ? 'warn' : 'amber'})">{relDue(r.daysLeft, r.dueDate)}</b>
        </div>
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
                <!-- 240 波（收件箱分诊）：备忘 → 正式台账行 -->
                <button class="b3-button b3-button--text" onclick={() => toLedgerDialog(r)}>{t("triage.title")}</button>
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
    <span class="lv-tabs" style="padding:2px" role="group" aria-label={t("view.list") + "/" + t("view.calendar")}>
        <button class="lv-tabs__item" class:on={viewMode === "list"} style="min-height:28px;padding:4px 12px"
            aria-pressed={viewMode === "list"} onclick={() => (viewMode = "list")}>{t("view.list")}</button>
        <button class="lv-tabs__item" class:on={viewMode === "calendar"} style="min-height:28px;padding:4px 12px"
            aria-pressed={viewMode === "calendar"} onclick={() => (viewMode = "calendar")}>{t("view.calendar")}</button>
    </span>
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
{:else if viewMode === "calendar"}
    <!-- 230 波：原生日历视图（数据同列表筛选口径；动作仅"完成"，其余回列表） -->
    <Calendar items={filtered} {t} {version} onComplete={(r: Reminder) => plugin.complete(r)}
        onAddMemo={(title: string, due: string) => plugin.addMemo(title, due)}
        onConvert={(r: Reminder) => toLedgerDialog(r)} />
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
            {#each buildDisplay(g.items) as entry (entry.key)}
                {#if entry.merged}
                    <!-- 29 组：同成员同日合并卡；PL13：Enter/Space 等价 + aria-expanded -->
                    <div class="lv-rem lead" role="button" tabindex="0"
                        aria-expanded={expandedMerges.has(entry.key)}
                        onkeydown={(e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggleMerge(entry.key))}
                        onclick={() => toggleMerge(entry.key)}>
                        <div class="lv-rem-ic" aria-hidden="true">👪</div>
                        <div class="lv-rem-t" title={`${memberName(entry.memberId)} · ${entry.dueDate}`}><b>{memberName(entry.memberId)} · {relDue(entry.row.daysLeft, entry.dueDate)}</b><span class="lv-caption">{t("hub.mergeHint")}</span></div>
                        <span class="lv-badge orange">{entry.items.length}</span>
                        <div class="lv-rem-ops"><span class="lv-caption" aria-hidden="true">{expandedMerges.has(entry.key) ? "▾" : "▸"}</span></div>
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
