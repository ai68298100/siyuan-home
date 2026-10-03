<script lang="ts">
    import type { Reminder } from "@/types";
    import Onboarding from "../onboarding.svelte";
    import type { HomePluginLike } from "@/types/plugin";
    import { saveRuntime } from "@/core/hub/runtime";
    import { localDateKey } from "@/core/hub/rule";

    let { plugin, t, onGoto, version }: { plugin: HomePluginLike; t: (k: string) => string; onGoto: (s: string) => void; version?: number } = $props();

    // version（H02）：hubListeners 触发时递增，驱动以下 $derived 重算（plugin.* 为普通对象引用，本身不追踪）
    const allReminders = $derived.by(() => {
        void version;
        return plugin.scan?.reminders ?? [];
    });
    const members = $derived.by(() => {
        void version;
        return plugin.settings.members ?? [];
    });
    // C2e：成员过滤——本地 $state 驱动（runtime.filterMemberId 只作持久化；普通对象属性读不追踪）
    // svelte-ignore state_referenced_locally
    let memberFilter = $state<string | undefined>(plugin.runtime.filterMemberId);
    // C2e：成员过滤（持久化 runtime.filterMemberId；成员行 memberId 在 v0.2 由行创建顺序关联，未关联时显示全部）
    const reminders = $derived(
        memberFilter
            ? allReminders.filter((r: Reminder) => !r.memberId || r.memberId === memberFilter)
            : allReminders,
    );
    const top = $derived(reminders.slice(0, 4));
    // EC09（D20）：打卡绑定 × 强度摘要求交——只展示有数据的绑定（成员名·习惯名·强度）
    function boundCheckins(): { label: string; score: number }[] {
        void version;
        const items = plugin.runtime?.lastCheckinSummary?.items ?? [];
        const byId = new Map(items.map((it: { itemId: string; score: number }) => [it.itemId, it.score]));
        const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "?";
        return (plugin.settings.checkinBindings ?? [])
            .filter((b) => byId.has(b.itemId))
            .map((b) => ({ label: `${memberName(b.memberId)} · ${b.itemName}`, score: byId.get(b.itemId)! }));
    }
    // 29 组月度完成率：当月完成数 / 当月应到基数（从 runtime.monthlyCompletions / monthlyDueTotals 读取）
    const monthlyDone = $derived.by(() => {
        const now = new Date();
        const monthKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
        return plugin.runtime?.monthlyCompletions?.[monthKey] ?? 0;
    });
    const monthlyDueTotal = $derived.by(() => {
        const now = new Date();
        const monthKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
        return plugin.runtime?.monthlyDueTotals?.[monthKey] ?? 0;
    });

    // B2（94 波走查）：模块图标——提醒行与模块卡共用；未映射回退 🗂
    const MODULE_ICONS: Record<string, string> = {
        certs: "🪪", health: "🩺", insurance: "🛡️", exams: "📝", pets: "🐾", social: "👥",
        "assets-real": "🏠", "assets-virtual": "🏦", shopping: "🛒", memberships: "🔁", contracts: "📄",
        medicine: "💊", stock: "📦", favors: "🧧", chores: "🧹", food: "🍚", address: "📍",
        snippets: "📎", house: "🏡", parenting: "🧸", schooling: "🎒", allowance: "💰",
        vehicles: "🚗", transit: "🚌", "travel-plan": "✈️", "travel-booking": "🎫",
        "travel-packing": "🧳", "travel-log": "📷", media: "🎬",
    };
    const moduleIcon = (mid: string) => MODULE_ICONS[mid] ?? "🗂";

    async function setMemberFilter(id: string | undefined) {
        memberFilter = id;
        plugin.runtime.filterMemberId = id;
                await saveRuntime(plugin, plugin.runtime);
    }

    let memoTitle = $state("");
    let memoDue = $state("");
    function addMemo() {
        if (!memoTitle.trim()) return;
        // 默认到期日走本地时区（33.3：禁 toISOString，UTC+8 夜间会偏一天）
        const d = memoDue || localDateKey(new Date(Date.now() + 3 * 86400000));
        plugin.addMemo(memoTitle.trim(), d);
        memoTitle = ""; memoDue = "";
    }
</script>

{#if !plugin.settings.onboarded}
    <Onboarding {plugin} {t} onGoto={onGoto} />
{/if}

<div class="lv-hero">
    <div><h1>{t("dash.hello")}</h1><p>{t("dash.sub")}</p></div>
    <div class="lv-hero-count">
        <b class="lv-num">{reminders.length}</b><span>{t("dash.needAttention")}</span>
        {#if monthlyDone > 0}
            <span class="lv-caption" style="display:block;margin-top:2px">✓ {t("dash.monthlyDone").replace("${n}", monthlyDueTotal > 0 ? `${monthlyDone}/${monthlyDueTotal}` : String(monthlyDone))}</span>
        {/if}
    </div>
</div>

<div class="lv-members" style="margin-bottom:4px">
    <button class="lv-chip {!memberFilter ? 'on' : ''}" onclick={() => setMemberFilter(undefined)}>{t("members.all")}</button>
    {#each members as m (m.id)}
        <button class="lv-chip {memberFilter === m.id ? 'on' : ''}" onclick={() => setMemberFilter(m.id)}>
            <span class="lv-avatar" style="background:linear-gradient(135deg,var(--lv-accent),var(--lv-accent-2))">{m.name.slice(0, 1)}</span>{m.name}
        </button>
    {/each}
    <button class="lv-chip" onclick={() => onGoto("members")}>＋</button>
</div>

<div class="lv-sec"><h2 class="lv-title-sec">{t("dash.upcoming")}</h2>
    <button class="b3-button b3-button--text" onclick={() => onGoto("reminders")}>{t("dash.viewAll")} →</button>
</div>
{#if top.length === 0}
    <div class="lv-card"><div class="lv-empty" role="status"><div class="eic">✓</div><b>{t("dash.allClear")}</b><span>{t("hub.emptyHint")}</span></div></div>
{:else}
    <div class="lv-card lv-rems">
        {#each top as r (r.id)}
            <div class="lv-rem {r.level}">
                <div class="lv-rem-ic">{r.moduleId === "adhoc" ? "📝" : moduleIcon(r.moduleId)}</div>
                <div class="lv-rem-t"><b>{r.title}</b><span>{t(`module.${r.moduleId}`) !== `module.${r.moduleId}` ? t(`module.${r.moduleId}`) : t("adhoc.name")}{r.lunar ? " 🌙" : ""}{r.autoRenew ? " 🔄" : ""}</span></div>
                <div class="lv-rem-when"><b class="lv-num" style="color:var(--lv-{r.level === 'overdue' ? 'danger' : r.level === 'soon' ? 'warn' : 'amber'})">
                    {r.daysLeft < 0 ? t("days.overdue").replace("${n}", String(-r.daysLeft)) : r.daysLeft === 0 ? t("days.today") : t("days.after").replace("${n}", String(r.daysLeft))}
                </b><span class="lv-num">{r.dueDate}</span></div>
                <div class="lv-rem-ops">
                    <button class="b3-button b3-button--text" onclick={() => plugin.complete(r)}>{t("act.done")}</button>
                    <button class="b3-button b3-button--text" onclick={() => plugin.snooze(r.id, 7)}>{t("act.snooze7")}</button>
                </div>
            </div>
        {/each}
    </div>
{/if}

<div class="lv-sec"><h2 class="lv-title-sec">{t("memo.quick")}</h2></div>
<div class="lv-quick" style="margin-bottom:4px">
    <button class="lv-qbtn" onclick={() => { plugin.setActiveLedger("certs"); onGoto("ledger"); }}><span class="qi">🪪</span>{t("module.certs")}</button>
    <button class="lv-qbtn" onclick={() => { plugin.setActiveLedger("medicine"); onGoto("ledger"); }}><span class="qi">💊</span>{t("module.medicine")}</button>
    <button class="lv-qbtn" onclick={() => { plugin.setActiveLedger("memberships"); onGoto("ledger"); }}><span class="qi">🔁</span>{t("module.memberships")}</button>
    <button class="lv-qbtn" onclick={() => { plugin.setActiveLedger("media"); onGoto("ledger"); }}><span class="qi">🎬</span>{t("module.media")}</button>
    <button class="lv-qbtn" onclick={() => { plugin.setActiveLedger("favors"); onGoto("ledger"); }}><span class="qi">🧧</span>{t("module.favors")}</button>
    <button class="lv-qbtn" onclick={() => { plugin.setActiveLedger("members"); onGoto("members"); }}><span class="qi">👪</span>{t("tab.members")}</button>
</div>
<div class="lv-card" style="padding:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
    <input class="b3-text-field fn__flex-1" style="min-width:180px" placeholder={t("memo.placeholder")} bind:value={memoTitle} />
    <input class="b3-text-field" type="date" bind:value={memoDue} />
    <button class="b3-button b3-button--text" onclick={addMemo}>＋ {t("memo.add")}</button>
</div>

<div class="lv-sec"><h2 class="lv-title-sec">{t("dash.myModules")}</h2>
    <button class="b3-button b3-button--text" onclick={() => plugin.openSetting()}>{t("dash.enableMore")} →</button>
</div>
<div class="lv-mods">
    {#each plugin.settings.enabledModules.filter((id: string) => id !== "members") as mid (mid)}
        {@const pending = reminders.filter((r: Reminder) => r.moduleId === mid).length}
        <div
            class="lv-card lv-card--hover lv-mod"
            role="button"
            tabindex="0"
            onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter") { plugin.setActiveLedger(mid); onGoto("ledger"); } }}
            onclick={() => { plugin.setActiveLedger(mid); onGoto("ledger"); }}
        >
            <div class="lv-mi t-blue">{moduleIcon(mid)}</div><b>{t(`module.${mid}`)}</b>
            <div class="lv-stat">
                {#if pending > 0}
                    <b class="lv-num">{pending}</b><span style="color:var(--lv-warn)">{t("mod.pending")}</span>
                {:else if plugin.settings.dbRefs?.[mid] && !plugin.settings.dbRefs[mid].docId}
                    <span style="color:var(--lv-warn)">{t("diag.missing")}</span>
                {:else if plugin.settings.dbRefs?.[mid]?.provisional}
                    <span>{t("diag.provisional")}</span>
                {:else}
                    <span>{t("mod.inLedger")}</span>
                {/if}
            </div>
            {#if mid === "exams" && plugin.runtime?.lastExamStats?.generatedAt}
                <!-- EC21：lv-exam:stats 聚合展示（只读子集，标注更新日期；不读题目内容） -->
                <div class="lv-caption" title={t("mod.examStatsTip").replace("${d}", new Date(plugin.runtime.lastExamStats.generatedAt).toLocaleDateString())}>
                    📝 {t("mod.examStreak").replace("${n}", String(plugin.runtime.lastExamStats.streak)).replace("${p}", String(plugin.runtime.lastExamStats.accuracy))}
                </div>
            {/if}
            {#if mid === "health" && boundCheckins().length > 0}
                <!-- EC09（D20）：打卡绑定摘要（只读；只统计有强度数据的绑定项） -->
                {@const bound = boundCheckins()}
                <div class="lv-caption" title={bound.map((b) => `${b.label} · ${b.score}`).join("\n")}>
                    ⏱ {t("mod.checkinBound").replace("${n}", String(bound.length))}
                </div>
            {/if}
        </div>
    {/each}
</div>
