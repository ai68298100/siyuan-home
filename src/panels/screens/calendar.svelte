<script lang="ts">
    // 原生日历视图（路线图"下一阶段"，230 波）：月历网格 + 提醒按日分布 + 点击选日看当日清单。
    // 数据只读自扫描结果（items 已按筛选器过滤）；动作仅"完成"（其余操作回列表页）。
    import type { Reminder } from "@/types";
    import { monthGrid } from "@/core/calendar";
    import { localDateKey } from "@/core/hub/rule";
    import { moduleIcon } from "@/core/modules";

    let { items, t, version, onComplete, onAddMemo }: {
        items: Reminder[];
        t: (k: string) => string;
        version?: number;
        onComplete: (r: Reminder) => void;
        onAddMemo: (title: string, due: string) => void;
    } = $props();

    const now = new Date();
    let viewYear = $state(now.getFullYear());
    let viewMonth = $state(now.getMonth());
    let selected = $state(localDateKey(now));
    const todayKey = localDateKey(new Date());

    const cells = $derived.by(() => {
        void version;
        return monthGrid(viewYear, viewMonth);
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

    function shiftMonth(delta: number) {
        const d = new Date(viewYear, viewMonth + delta, 1);
        viewYear = d.getFullYear();
        viewMonth = d.getMonth();
    }
    function goToday() {
        const d = new Date();
        viewYear = d.getFullYear();
        viewMonth = d.getMonth();
        selected = localDateKey(d);
    }
    function dotCls(r: Reminder): string {
        return r.level === "overdue" ? "danger" : r.level === "soon" ? "warn" : "amber";
    }
    const weekdays = ["cal.wk.mo", "cal.wk.tu", "cal.wk.we", "cal.wk.th", "cal.wk.fr", "cal.wk.sa", "cal.wk.su"];
    // 233 波：当日面板快捷新增备忘（预设选中日；回车或按钮提交后清空）
    let memoTitle = $state("");
    function addMemoForDay() {
        const title = memoTitle.trim();
        if (!title) return;
        onAddMemo(title, selected);
        memoTitle = "";
    }
</script>

<div class="lv-cal">
    <div class="lv-cal-head">
        <b>{monthLabel}</b>
        <span class="fn__flex-1"></span>
        <button class="lv-iconbtn" aria-label={t("cal.prev")} title={t("cal.prev")} onclick={() => shiftMonth(-1)}>‹</button>
        <button class="b3-button b3-button--outline" style="padding:4px 12px;min-height:32px" onclick={goToday}>{t("cal.today")}</button>
        <button class="lv-iconbtn" aria-label={t("cal.next")} title={t("cal.next")} onclick={() => shiftMonth(1)}>›</button>
    </div>
    <div class="lv-cal-grid" role="grid" aria-label={t("cal.title")}>
        {#each weekdays as wk (wk)}
            <div class="lv-cal-wk">{t(wk)}</div>
        {/each}
        {#each cells as c, i (c.key ?? `pad-${i}`)}
            <button class="lv-cal-cell" class:out={!c.inMonth} class:sel={c.key === selected}
                aria-label={c.key}
                onclick={() => (selected = c.key)}>
                <span class="d" class:today={c.key === todayKey}>{c.day}</span>
                <span class="dots">
                    {#each (c.key ? byDate.get(c.key) ?? [] : []) as r (r.id)}
                        <i class={dotCls(r)} title={r.title}></i>
                    {/each}
                </span>
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
                        <button class="b3-button b3-button--text" onclick={() => onComplete(r)}>{t("act.done")}</button>
                    </div>
                {/each}
            </div>
        {/if}
        <!-- 233 波：当日快捷新增备忘（日期预设为选中日） -->
        <div style="display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--lv-line)">
            <input class="b3-text-field fn__flex-1" style="min-width:0" placeholder={t("cal.memoPlaceholder")}
                bind:value={memoTitle}
                onkeydown={(e: KeyboardEvent) => e.key === "Enter" && addMemoForDay()} />
            <button class="b3-button b3-button--outline" style="flex:none" disabled={!memoTitle.trim()} onclick={addMemoForDay}>＋ {t("memo.add")}</button>
        </div>
    </div>
</div>
