<script lang="ts">
    // 原生日历视图（路线图"下一阶段"，230 波；233 波周视图 + 当日快捷新增）：
    // 月/周双模式——月历网格看全月分布，周视图按标题细看；数据只读自扫描结果，动作仅"完成"。
    import type { Reminder } from "@/types";
    import { monthGrid, weekGrid } from "@/core/calendar";
    import { localDateKey } from "@/core/hub/rule";
    import { moduleIcon } from "@/core/modules";
    import { showMessage } from "siyuan";

    let { items, t, version, onComplete, onAddMemo, onConvert, initialMode, onModeChange }: {
        items: Reminder[];
        t: (k: string) => string;
        version?: number;
        onComplete: (r: Reminder) => void;
        onAddMemo: (title: string, due: string) => void | Promise<void>;
        onConvert: (r: Reminder) => void;
        /** 263 波：会历模式偏好（runtime 持久化，由父组件读写） */
        initialMode?: "month" | "week";
        onModeChange?: (m: "month" | "week") => void;
    } = $props();

    const now = new Date();
    // svelte-ignore state_referenced_locally
    let mode = $state<"month" | "week">(initialMode === "week" ? "week" : "month");
    function setMode(m: "month" | "week") {
        if (mode === m) return;
        mode = m;
        const selectedDate = keyToDate(selected);
        if (m === "week") weekAnchor = selected;
        else { viewYear = selectedDate.getFullYear(); viewMonth = selectedDate.getMonth(); }
        onModeChange?.(m);
    }
    let viewYear = $state(now.getFullYear());
    let viewMonth = $state(now.getMonth());
    let weekAnchor = $state(localDateKey(now));
    let selected = $state(localDateKey(now));
    const todayKey = localDateKey(new Date());

    const keyToDate = (k: string) => {
        const [y, m, d] = k.split("-").map(Number);
        return new Date(y, m - 1, d);
    };

    const cells = $derived.by(() => {
        void version;
        return mode === "week" ? weekGrid(keyToDate(weekAnchor)) : monthGrid(viewYear, viewMonth);
    });
    const byDate = $derived.by(() => {
        void version;
        const m = new Map<string, Reminder[]>();
        for (const r of items) {
            if (!m.has(r.dueDate)) m.set(r.dueDate, []);
            m.get(r.dueDate)!.push(r);
        }
        return m;
    });
    const dayItems = $derived(byDate.get(selected) ?? []);
    const monthLabel = $derived(`${viewYear} · ${String(viewMonth + 1).padStart(2, "0")}`);
    const weekLabel = $derived.by(() => {
        const cs = cells;
        return cs.length ? `${cs[0].key.slice(5)} ~ ${cs[cs.length - 1].key.slice(5)}` : "";
    });
    const headLabel = $derived(mode === "month" ? monthLabel : weekLabel);

    function shiftMonth(delta: number) {
        const d = new Date(viewYear, viewMonth + delta, 1);
        viewYear = d.getFullYear();
        viewMonth = d.getMonth();
        selected = localDateKey(d);
    }
    function shiftWeek(deltaDays: number) {
        const d = keyToDate(weekAnchor);
        d.setDate(d.getDate() + deltaDays);
        weekAnchor = localDateKey(d);
        selected = weekAnchor;
    }
    function goToday() {
        const d = new Date();
        viewYear = d.getFullYear();
        viewMonth = d.getMonth();
        weekAnchor = localDateKey(d);
        selected = localDateKey(d);
    }
    function nav(delta: number) {
        if (mode === "week") shiftWeek(delta * 7);
        else shiftMonth(delta);
    }
    function dotCls(r: Reminder): string {
        return r.level === "overdue" ? "danger" : r.level === "soon" ? "warn" : "amber";
    }
    const weekdays = ["cal.wk.mo", "cal.wk.tu", "cal.wk.we", "cal.wk.th", "cal.wk.fr", "cal.wk.sa", "cal.wk.su"];
    // 233 波：当日面板快捷新增备忘（预设选中日；回车或按钮提交后清空）
    let memoTitle = $state("");
    let memoInput: HTMLInputElement | undefined = $state();
    let savingMemo = $state(false);
    async function addMemoForDay() {
        if (savingMemo) return;
        const title = memoTitle.trim();
        if (!title) {
            memoInput?.focus();
            showMessage(t("memo.titleRequired"), 4000, "info");
            return;
        }
        savingMemo = true;
        try {
            await onAddMemo(title, selected);
            memoTitle = "";
        } catch (e) {
            showMessage(t("ledger.saveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        } finally {
            savingMemo = false;
        }
    }
    function moveDayFocus(event: KeyboardEvent, index: number) {
        const key = event.key;
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) return;
        event.preventDefault();
        const cols = 7;
        const next = key === "Home" ? 0 : key === "End" ? cells.length - 1
            : key === "ArrowLeft" ? Math.max(0, index - 1) : key === "ArrowRight" ? Math.min(cells.length - 1, index + 1)
                : key === "ArrowUp" ? Math.max(0, index - cols) : Math.min(cells.length - 1, index + cols);
        selected = cells[next].key;
        requestAnimationFrame(() => (document.querySelector(`[data-cal-day="${cells[next].key}"]`) as HTMLButtonElement | undefined)?.focus());
    }
</script>

<div class="lv-cal">
    <div class="lv-cal-head">
        <b>{headLabel}</b>
        <span class="fn__flex-1"></span>
        <span class="lv-tabs" style="padding:2px" role="group" aria-label={t("cal.title")}>
            <button class="lv-tabs__item" class:on={mode === "month"} style="min-height:28px;padding:3px 12px"
                aria-pressed={mode === "month"} onclick={() => setMode("month")}>{t("view.month")}</button>
            <button class="lv-tabs__item" class:on={mode === "week"} style="min-height:28px;padding:3px 12px"
                aria-pressed={mode === "week"} onclick={() => setMode("week")}>{t("view.week")}</button>
        </span>
        <button class="lv-iconbtn" aria-label={t("cal.prev")} title={t("cal.prev")} onclick={() => nav(-1)}>‹</button>
        <button class="b3-button b3-button--outline" style="padding:4px 12px;min-height:32px" onclick={goToday}>{t("cal.today")}</button>
        <button class="lv-iconbtn" aria-label={t("cal.next")} title={t("cal.next")} onclick={() => nav(1)}>›</button>
    </div>
    <div class="lv-cal-grid" class:wk={mode === "week"} role="grid" aria-label={t("cal.title")}>
        {#each weekdays as wk (wk)}
            <div class="lv-cal-wk" role="columnheader">{t(wk)}</div>
        {/each}
        {#each cells as c, i (c.key)}
            <button class="lv-cal-cell" class:out={mode === "month" && !c.inMonth} class:sel={c.key === selected}
                data-cal-day={c.key} role="gridcell" aria-selected={c.key === selected} aria-label={c.key}
                tabindex={c.key === selected ? 0 : -1} onkeydown={(e) => moveDayFocus(e, i)}
                onclick={() => (selected = c.key)}>
                <span class="d" class:today={c.key === todayKey}>{c.day}</span>
                <span class="dots">
                    {#each byDate.get(c.key) ?? [] as r (r.id)}
                        <i class={dotCls(r)} title={r.title}></i>
                    {/each}
                </span>
                {#if mode === "week"}
                    <span class="tt">
                        {#each (byDate.get(c.key) ?? []).slice(0, 3) as r (r.id)}
                            <span class="tt-line {r.level}">{r.title}</span>
                        {/each}
                        {#if (byDate.get(c.key) ?? []).length > 3}
                            <span class="tt-line">+{byDate.get(c.key)!.length - 3}</span>
                        {/if}
                    </span>
                {/if}
            </button>
        {/each}
    </div>
    <div class="lv-card lv-cal-day-panel" role="status">
        <b class="lv-title-sec">{selected} · {dayItems.length} {t("cal.itemsUnit")}</b>
        {#if dayItems.length === 0}
            <div class="lv-caption" style="margin-top:6px">{t("cal.emptyDay")}</div>
        {:else}
            <div class="lv-cal-items">
                {#each dayItems as r (r.id)}
                    <div class="lv-cal-item">
                        <span class="lv-rem-ic" aria-hidden="true">{r.moduleId === "adhoc" ? "📝" : moduleIcon(r.moduleId)}</span>
                        <div style="min-width:0;flex:1">
                            <b style="font-size:13px">{r.title}</b>
                            <span class="lv-caption" style="display:block">{t(`module.${r.moduleId}`) !== `module.${r.moduleId}` ? t(`module.${r.moduleId}`) : r.moduleId}</span>
                        </div>
                        <span class="lv-badge {r.level === "overdue" ? "red" : r.level === "soon" ? "orange" : "yellow"}">{r.level === "overdue" ? t("level.overdue") : r.level === "soon" ? t("level.soon") : t("level.lead")}</span>
                        {#if r.moduleId === "adhoc"}
                            <!-- 241 波：备忘项同步提供分诊入口（与提醒中枢一致） -->
                            <button class="b3-button b3-button--text" title={t("triage.title")} onclick={() => onConvert(r)}>{t("triage.title")}</button>
                        {/if}
                        <button class="b3-button b3-button--text" onclick={() => onComplete(r)}>{t("act.done")}</button>
                    </div>
                {/each}
            </div>
        {/if}
        <!-- 233 波：当日快捷新增备忘（日期预设为选中日） -->
        <div style="display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--lv-line)">
            <input bind:this={memoInput} class="b3-text-field fn__flex-1" style="min-width:0" placeholder={t("cal.memoPlaceholder")} disabled={savingMemo}
                bind:value={memoTitle}
                onkeydown={(e: KeyboardEvent) => e.key === "Enter" && !e.isComposing && void addMemoForDay()} />
            <button class="b3-button b3-button--outline" style="flex:none" disabled={savingMemo} aria-busy={savingMemo} onclick={addMemoForDay}>{savingMemo ? t("ledger.saving") : `＋ ${t("memo.add")}`}</button>
        </div>
    </div>
</div>
