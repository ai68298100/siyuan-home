<script lang="ts">
    import type { Reminder } from "@/types";
    import Onboarding from "../onboarding.svelte";
    import type { HomePluginLike } from "@/types/plugin";
    import { saveRuntime } from "@/core/hub/runtime";
    import { localDateKey } from "@/core/hub/rule";
    import { parseNaturalDate } from "@/core/dateparse";
    import { memberHue } from "@/core/format";
    import { showMessage } from "siyuan";
    import { moduleIcon as icons, moduleTone } from "@/core/modules";

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
    // 218 波性能（176 波 alertsByMember 同款）：模块卡 pending 计数预分组——
    // 模板每卡 filter 全量提醒 O(模块×提醒)，预分组后单遍 O(提醒)。
    const pendingByModule = $derived.by(() => {
        const map = new Map<string, number>();
        for (const r of reminders) map.set(r.moduleId, (map.get(r.moduleId) ?? 0) + 1);
        return map;
    });
    // EC09（D20）：打卡绑定 × 强度摘要求交——只展示有数据的绑定（成员名·习惯名·强度）；derived 免模板双重求值
    const healthBound = $derived.by(() => {
        void version;
        const items = plugin.runtime?.lastCheckinSummary?.items ?? [];
        const byId = new Map(items.map((it: { itemId: string; score: number }) => [it.itemId, it.score]));
        const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "?";
        return (plugin.settings.checkinBindings ?? [])
            .filter((b) => byId.has(b.itemId))
            .map((b) => ({ label: `${memberName(b.memberId)} · ${b.itemName}`, score: byId.get(b.itemId)! }));
    });
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

    // 262 波（H02 语义补全）：模块卡列表此前直接遍历 plugin.settings.enabledModules——
    // 普通对象属性无响应性，且该模板块无任何 version 驱动依赖，导致「全部启用/保存」后
    // 总览模块卡不即时刷新（需切一次页签重挂载）；改 version 驱动 derived 修复
    const moduleCards = $derived.by(() => {
        void version;
        return plugin.settings.enabledModules.filter((id: string) => id !== "members");
    });

    // 266 波（模块卡趋势条）：近 5 日待办计数序列（数据源 moduleHistory，refreshHub 每日记录）。
    // 已知天数 ≥3 才出趋势条（新装不足两日无趋势语义）；条高按窗口内最大值归一（保底 15%）。
    const moduleHistory = $derived.by(() => {
        void version;
        return plugin.runtime?.moduleHistory ?? {};
    });
    function sparkOf(mid: string): number[] | null {
        const days: number[] = [];
        let known = 0;
        let max = 0;
        for (let i = 4; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86400000);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const v = moduleHistory[key]?.[mid];
            if (typeof v === "number") known++;
            days.push(typeof v === "number" ? v : 0);
            if (v > max) max = v;
        }
        if (known < 3) return null;
        return days.map((v) => (max > 0 ? Math.max(15, Math.round((v / max) * 100)) : 15));
    }

    // B2（94 波走查）：模块图标共享表移至 core/modules（95 波起与提醒行共用，覆盖测试钉住）
    const moduleIcon = (mid: string) => icons(mid);

    // 170/171 波（对齐原型质感，不低于）：context-strip 状态条 + focus-row 三重点卡
    const overdueCount = $derived.by(() => { void version; return allReminders.filter((r: Reminder) => r.level === "overdue").length; });
    const soon7Count = $derived.by(() => { void version; return allReminders.filter((r: Reminder) => r.daysLeft >= 0 && r.daysLeft <= 7).length; });
    const syncErrCount = $derived.by(() => { void version; return members.filter((m) => m.syncError).length; });
    const scanErrors = $derived.by(() => { void version; return plugin.scan?.errors ?? []; });
    const scanStale = $derived.by(() => { void version; return plugin.scan?.stale === true; });
    const snapshotLabel = $derived.by(() => {
        const at = plugin.runtime?.scannedAt;
        return at ? new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
    });
    const scopeLabel = $derived(memberFilter ? (members.find((m) => m.id === memberFilter)?.name ?? "?") : t("dash.scopeAll"));

    // 对齐原型 hero：按本地时段问候 + 日期·快照说明行（纯展示，随挂载取值）
    const greet = $derived.by(() => {
        const h = new Date().getHours();
        return h < 11 ? t("dash.greet.morning") : h < 18 ? t("dash.greet.afternoon") : t("dash.greet.evening");
    });
    const dateLine = $derived(`${new Date().toLocaleDateString([], { month: "long", day: "numeric", weekday: "long" })} · ${t("dash.stripSnapshot")} ${snapshotLabel}`);

    // 17 组/196 波：统计卡下钻——待办徽章点击 → 提醒页并预筛选该模块（runtime.hubModuleId 为提醒页筛选持久态）
    function drillReminders(mid: string) {
        plugin.runtime.hubModuleId = mid;
        onGoto("reminders");
    }

    async function setMemberFilter(id: string | undefined) {        memberFilter = id;
        plugin.runtime.filterMemberId = id;
                await saveRuntime(plugin, plugin.runtime);
    }

    let memoTitle = $state("");
    let memoDue = $state("");
    function addMemo() {
        if (!memoTitle.trim()) return;
        // 16 组/214 波：智能日期解析（滴答清单规格）——标题命中日期表达式则剥离进到期日；
        // 显式选择的日期优先于解析（用户选了日期选择器即为明确意图）。
        const parsed = parseNaturalDate(memoTitle);
        let title = memoTitle.trim();
        let due = memoDue;
        if (parsed && parsed.rest) {
            if (!due) due = parsed.date;
            title = parsed.rest;
            showMessage(t("memo.dateParsed").replace("${d}", parsed.date), 2500, "info");
        }
        if (!title) return;
        // 默认到期日走本地时区（33.3：禁 toISOString，UTC+8 夜间会偏一天）
        const d = due || localDateKey(new Date(Date.now() + 3 * 86400000));
        plugin.addMemo(title, d);
        memoTitle = ""; memoDue = "";
    }
</script>

{#if !plugin.settings.onboarded}
    <Onboarding {plugin} {t} onGoto={onGoto} />
{/if}

<div class="lv-strip" role="status" aria-label={t("dash.stripLabel")}>
    <span><strong>{t("dash.stripScope")}</strong> {scopeLabel}</span>
    <span><strong>{t("dash.stripSnapshot")}</strong> <span class="lv-num">{snapshotLabel}</span>{scanStale ? ` · ${t("dash.stale")}` : ""}</span>
    <span><strong>{t("dash.stripErrors")}</strong> {scanErrors.length}</span>
</div>

<div class="lv-hero">
    <div><h1>{greet}</h1><p>{dateLine}</p></div>
    <div class="lv-hero-count" title={t("dash.statScope").replace("${t}", snapshotLabel)}>
        <b class="lv-num">{reminders.length}</b><span>{reminders.length === 1 ? t("dash.needAttentionOne") : t("dash.needAttention")}</span>
        {#if monthlyDone > 0}
            <span class="lv-caption" style="display:block;margin-top:2px">✓ {t("dash.monthlyDone").replace("${n}", monthlyDueTotal > 0 ? `${monthlyDone}/${monthlyDueTotal}` : String(monthlyDone))}</span>
        {/if}
    </div>
</div>

<div class="lv-focus" aria-label={t("dash.focusLabel")}>
    <div class="lv-focus-card">
        <span class="lv-focus-icon">◷</span>
        <div><b>{t("dash.focusToday")}</b><span>{t("dash.focusTodayBody").replace("${od}", String(overdueCount)).replace("${s}", String(soon7Count))}</span></div>
        <button class="b3-button b3-button--text" onclick={() => onGoto("reminders")}>{t("dash.focusOpen")}</button>
    </div>
    <div class="lv-focus-card">
        <span class="lv-focus-icon">⌁</span>
        <div><b>{t("dash.focusReview")}</b><span>{syncErrCount > 0 ? t("dash.focusReviewBody").replace("${n}", String(syncErrCount)) : t("dash.focusReviewOk")}</span></div>
        <button class="b3-button b3-button--text" onclick={() => onGoto("members")}>{t("dash.focusView")}</button>
    </div>
    <div class="lv-focus-card">
        <span class="lv-focus-icon" style={scanStale || scanErrors.length ? "color:var(--lv-warn)" : "color:var(--lv-ok)"}>✓</span>
        <div><b>{t("dash.focusData")}</b><span>{scanStale ? t("dash.focusStale") : scanErrors.length > 0 ? t("dash.focusDataErr").replace("${t}", snapshotLabel).replace("${n}", String(scanErrors.length)) : t("dash.focusDataOk").replace("${t}", snapshotLabel)}</span></div>
        <button class="b3-button b3-button--text" onclick={() => plugin.openSetting()}>{t("dash.focusView")}</button>
    </div>
</div>

<div class="lv-members" style="margin-bottom:4px">
    <button class="lv-chip {!memberFilter ? 'on' : ''}" aria-pressed={!memberFilter} onclick={() => setMemberFilter(undefined)}>{t("members.all")}</button>
    {#each members as m (m.id)}
        <button class="lv-chip {memberFilter === m.id ? 'on' : ''}" aria-pressed={memberFilter === m.id} onclick={() => setMemberFilter(m.id)}>
            <span class="lv-avatar" aria-hidden="true" style="background:linear-gradient(135deg, hsl({memberHue(m.id)} 62% 52%), hsl({(memberHue(m.id) + 42) % 360} 62% 40%))">{m.name.slice(0, 1)}</span>{m.name}
        </button>
    {/each}
    <button class="lv-chip" onclick={() => onGoto("members")}>＋</button>
</div>

<div class="lv-sec"><h2 class="lv-title-sec">{t("dash.upcoming")}</h2>
    <button class="b3-button b3-button--text" onclick={() => onGoto("reminders")}>{t("dash.viewAll")} →</button>
</div>
{#if reminders.length === 0 && memberFilter}
    <!-- 174 波（对齐原型空态解释）：筛选导致的空 ≠ 无资料，说明并给清除出口 -->
    <div class="lv-card"><div class="lv-empty" role="status"><div class="eic">🔍</div><b>{t("dash.filteredEmpty")}</b><span>{t("dash.filteredEmptyHint")}</span>
        <button class="b3-button b3-button--outline" style="margin-top:8px" onclick={() => setMemberFilter(undefined)}>{t("dash.clearFilter")}</button>
    </div></div>
{:else if reminders.length === 0}
    <div class="lv-card"><div class="lv-empty" role="status"><div class="eic">✓</div><b>{t("dash.allClear")}</b><span>{t("hub.emptyHint")}</span></div></div>
{:else}
    <div class="lv-card lv-rems">
        {#each top as r (r.id)}
            <div class="lv-rem {r.level}">
                <div class="lv-rem-ic" class:tone-blue={r.moduleId !== "adhoc" && moduleTone(r.moduleId) === "t-blue"}
                    class:tone-green={r.moduleId !== "adhoc" && moduleTone(r.moduleId) === "t-green"}
                    class:tone-rose={r.moduleId !== "adhoc" && moduleTone(r.moduleId) === "t-rose"}
                    class:tone-amber={r.moduleId !== "adhoc" && moduleTone(r.moduleId) === "t-amber"}
                >{r.moduleId === "adhoc" ? "📝" : moduleIcon(r.moduleId)}</div>
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
<div class="lv-card lv-memo" style="margin-top:8px">
    <input class="b3-text-field fn__flex-1" style="min-width:180px" placeholder={t("memo.placeholder")} bind:value={memoTitle} />
    <input class="b3-text-field" type="date" bind:value={memoDue} />
    <button class="b3-button b3-button--text" onclick={addMemo}>＋ {t("memo.add")}</button>
</div>

<div class="lv-sec"><h2 class="lv-title-sec">{t("dash.myModules")}</h2>
    <button class="b3-button b3-button--text" onclick={() => plugin.openSetting()}>{t("dash.enableMore")} →</button>
</div>
<div class="lv-mods">
    {#each moduleCards as mid (mid)}
        {@const pending = pendingByModule.get(mid) ?? 0}
        <div
            class="lv-card lv-card--hover lv-mod"
            role="button"
            tabindex="0"
            aria-label={t(`module.${mid}`)}
            onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); plugin.setActiveLedger(mid); onGoto("ledger"); } }}
            onclick={() => { plugin.setActiveLedger(mid); onGoto("ledger"); }}
        >
            <div class="lv-mi" class:tone-blue={moduleTone(mid) === "t-blue"} class:tone-green={moduleTone(mid) === "t-green"}
                class:tone-rose={moduleTone(mid) === "t-rose"} class:tone-amber={moduleTone(mid) === "t-amber"}
                aria-hidden="true">{moduleIcon(mid)}</div><b>{t(`module.${mid}`)}</b>
            <div class="lv-stat" title={t("dash.statScope").replace("${t}", snapshotLabel)}>
            {#if pending > 0}
                <!-- 17 组/196 波：徽章=独立下钻目标（stopPropagation，卡片本体仍进台账） -->
                <span class="lv-num" role="button" tabindex="0" style="cursor:pointer"
                    title={t("mod.pendingDrill")}
                    onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); drillReminders(mid); } }}
                    onclick={(e: MouseEvent) => { e.stopPropagation(); drillReminders(mid); }}
                ><b>{pending}</b><span style="color:var(--lv-warn)">{t("mod.pending")}</span></span>
            {:else if plugin.settings.dbRefs?.[mid] && !plugin.settings.dbRefs[mid].docId}
                    <span style="color:var(--lv-warn)">{t("diag.missing")}</span>
            {:else if plugin.settings.dbRefs?.[mid]?.provisional}
                    <span>{t("diag.provisional")}</span>
            {:else}
                    <span>{t("mod.inLedger")}</span>
            {/if}
            {#if sparkOf(mid)}
                <!-- 266 波：近 5 日待办趋势（数据源 moduleHistory；末条高亮=原型 .spark hi） -->
                <span class="lv-spark" aria-hidden="true" title={t("dash.sparkTip")}>
                    {#each sparkOf(mid) as h, i (i)}
                        <i class:hi={i === 4} style="height:{h}%"></i>
                    {/each}
                </span>
            {/if}
            </div>
            {#if mid === "exams" && plugin.runtime?.lastExamStats?.generatedAt}
                <!-- EC21：lv-exam:stats 聚合展示（只读子集，标注更新日期；不读题目内容） -->
                <div class="lv-caption" title={t("mod.examStatsTip").replace("${d}", new Date(plugin.runtime.lastExamStats.generatedAt).toLocaleDateString())}>
                    📝 {t("mod.examStreak").replace("${n}", String(plugin.runtime.lastExamStats.streak)).replace("${p}", String(plugin.runtime.lastExamStats.accuracy))}
                </div>
            {/if}
            {#if mid === "health" && healthBound.length > 0}
                <!-- EC09（D20）：打卡绑定摘要（只读；只统计有强度数据的绑定项） -->
                <div class="lv-caption" title={healthBound.map((b) => `${b.label} · ${b.score}`).join("\n")}>
                    ⏱ {t("mod.checkinBound").replace("${n}", String(healthBound.length))}
                </div>
            {/if}
        </div>
    {/each}
</div>
