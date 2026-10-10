<script lang="ts">
    import type { Reminder } from "@/types";
    import Onboarding from "../onboarding.svelte";
    import type { HomePluginLike } from "@/types/plugin";
    import { saveRuntime } from "@/core/hub/runtime";
    import { fade } from "svelte/transition";
    import { localDateKey } from "@/core/hub/rule";
    import { parseNaturalDate } from "@/core/dateparse";
    import { memberHue } from "@/core/format";
    import { showMessage } from "siyuan";
    import { moduleIcon as icons, moduleTone } from "@/core/modules";

    let { plugin, t, onGoto, version, initialScanError = "", onRetryScan }: {
        plugin: HomePluginLike;
        t: (k: string) => string;
        onGoto: (s: string) => void;
        version?: number;
        initialScanError?: string;
        onRetryScan?: () => Promise<void>;
    } = $props();

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
    // 260 波：首扫 loading 态——runtime 无快照时间且无错误时，"最近没有要紧事"是撒谎
    // （未知 ≠ 0，13 §3.4）；骨架屏表达"正在读取"
    const firstScanPending = $derived.by(() => {
        void version;
        return !initialScanError && !plugin.runtime?.scannedAt && !(plugin.scan?.errors?.length) && allReminders.length === 0;
    });
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

    // 快捷录入只展示当前已启用的模块。固定展示未启用模块会把用户带到
    // 不存在的台账页，随后点击“重建”也不会真正创建该模块。
    const quickModuleIds = ["certs", "medicine", "memberships", "media", "favors", "members"];
    const quickModules = $derived.by(() => {
        void version;
        const enabled = new Set(plugin.settings.enabledModules);
        return quickModuleIds.filter((id) => enabled.has(id));
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

    // 262 波（Todoist quick add 灵感）：自然语言日期即时预览——输入即解析，
    // 命中且未显式选日期时在输入行内亮出 chip，比"提交后才 toast"早一步反馈
    const memoParsed = $derived.by(() => {
        const raw = memoTitle.trim();
        if (!raw || memoDue) return null;
        return parseNaturalDate(raw);
    });

    // 264 波：行数口径（cache.byModule 随扫描快照；version 驱动重算）——模块卡主数字与成员卡统计格
    const statsByModule = $derived.by(() => {
        void version;
        return plugin.runtime?.cache?.byModule ?? {};
    });
    const rowCountOf = (mid: string): number | undefined => statsByModule[mid]?.rowCount;

    // 262 波（Todoist/Linear assignee avatar 语言）：行级成员微头像——"这是谁的事"一眼可辨
    const memberOf = (id: string | undefined) => (id ? members.find((m) => m.id === id) : undefined);
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

    // 261 波：「查看全部」= 新意图——清掉上次会话遗留的筛选（逾期/某成员/某模块）再进入；
    // 与模块卡下钻（预筛该模块）语义相反，各自成立
    async function viewAllReminders() {
        plugin.runtime.hubFilter = "all";
        plugin.runtime.hubMemberId = undefined;
        plugin.runtime.hubModuleId = undefined;
        plugin.runtime.hubDueWithin = "all";
        onGoto("reminders");
        try {
            await saveRuntime(plugin, plugin.runtime);
        } catch (e) {
            showMessage(t("dash.preferenceSaveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        }
    }

    async function setMemberFilter(id: string | undefined) {
        memberFilter = id;
        plugin.runtime.filterMemberId = id;
        try {
            await saveRuntime(plugin, plugin.runtime);
        } catch (e) {
            showMessage(t("dash.preferenceSaveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        }
    }

    let retryingScan = $state(false);
    async function retryScan() {
        if (retryingScan) return;
        retryingScan = true;
        try {
            if (onRetryScan) await onRetryScan();
            else await plugin.refreshHub();
        } catch (e) {
            showMessage(t("hub.rescanFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        } finally {
            retryingScan = false;
        }
    }

    let memoTitle = $state("");
    let memoDue = $state("");
    let memoInput: HTMLInputElement | undefined = $state();
    let savingMemo = $state(false);
    async function runOverviewAction(action: () => Promise<void>) {
        try { await action(); }
        catch (e) { showMessage(t("hub.actionFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error"); }
    }
    async function addMemo() {
        if (savingMemo) return;
        if (!memoTitle.trim()) {
            memoInput?.focus();
            showMessage(t("memo.titleRequired"), 4000, "info");
            return;
        }
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
        savingMemo = true;
        try {
            await plugin.addMemo(title, d);
            memoTitle = ""; memoDue = "";
        } catch (e) {
            showMessage(t("ledger.saveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        } finally {
            savingMemo = false;
        }
    }

    // 259 波（对齐原型动效 #6）：总览计数 0→N 数字滚动（560ms ease-out-cubic，仅此一处）。
    // action 形式挂载，target 变化时重跑；prefers-reduced-motion 直接落终值
    function countUp(node: HTMLElement, target: number) {
        let raf = 0;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const render = (v: number) => { node.textContent = String(Math.round(v)); };
        const run = (to: number) => {
            cancelAnimationFrame(raf);
            if (reduced) { render(to); return; }
            const from = Number(node.textContent) || 0;
            if (from === to) return;
            const t0 = performance.now();
            const tick = (now: number) => {
                const p = Math.min(1, (now - t0) / 560);
                render(from + (to - from) * (1 - Math.pow(1 - p, 3)));
                if (p < 1) raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
        };
        run(target);
        return { update: run, destroy: () => cancelAnimationFrame(raf) };
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
    <div><h1>{greet}</h1><p>{dateLine}{#if monthlyDone > 0}&nbsp;&nbsp;<span class="lv-badge green">✓ {t("dash.monthlyDone").replace("${n}", monthlyDueTotal > 0 ? `${monthlyDone}/${monthlyDueTotal}` : String(monthlyDone))}</span>{/if}</p></div>
    <div class="lv-hero-count" title={t("dash.statScope").replace("${t}", snapshotLabel)}>
        <b class="lv-num" use:countUp={reminders.length}>{reminders.length}</b><span>{reminders.length === 1 ? t("dash.needAttentionOne") : t("dash.needAttention")}</span>
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

<div class="lv-sec"><h2 class="lv-title-sec">{t("dash.upcoming")}</h2><span class="lv-sub">{t("dash.upcomingSub")}</span>
    <button class="b3-button b3-button--text" onclick={viewAllReminders}>{t("dash.viewAll")} →</button>
</div>
{#if reminders.length === 0 && (initialScanError || scanErrors.length > 0)}
    <div class="lv-card"><div class="lv-empty" role="alert">
        <div class="eic">⚠</div><b>{t("dash.scanUnavailable")}</b>
        <span>{initialScanError || t("dash.focusDataErr").replace("${t}", snapshotLabel).replace("${n}", String(scanErrors.length))}</span>
        <button class="b3-button b3-button--outline" style="margin-top:8px" disabled={retryingScan} aria-busy={retryingScan} onclick={retryScan}>
            {retryingScan ? t("ledger.saving") : t("hub.rescan")}
        </button>
    </div></div>
{:else if reminders.length === 0 && memberFilter}
    <!-- 174 波（对齐原型空态解释）：筛选导致的空 ≠ 无资料，说明并给清除出口 -->
    <div class="lv-card"><div class="lv-empty" role="status"><div class="eic">🔍</div><b>{t("dash.filteredEmpty")}</b><span>{t("dash.filteredEmptyHint")}</span>
        <button class="b3-button b3-button--outline" style="margin-top:8px" onclick={() => setMemberFilter(undefined)}>{t("dash.clearFilter")}</button>
    </div></div>
{:else if reminders.length === 0}
    {#if firstScanPending}
        <!-- 260 波：首扫骨架（未知 ≠ 全部完成） -->
        <div class="lv-card lv-rems" aria-busy="true" role="status">
            {#each [0, 1, 2] as i (i)}
                <div class="lv-rem">
                    <div class="lv-skel" style="width:38px;height:38px;border-radius:11px;flex:none"></div>
                    <div style="flex:1;display:flex;flex-direction:column;gap:7px;min-width:0">
                        <div class="lv-skel" style="height:13px;width:42%"></div>
                        <div class="lv-skel" style="height:11px;width:26%"></div>
                    </div>
                </div>
            {/each}
        </div>
        <p class="lv-caption" style="margin:8px 2px">{t("hub.firstScan")}</p>
    {:else}
        <div class="lv-card"><div class="lv-empty" role="status"><div class="eic">✓</div><b>{t("dash.allClear")}</b><span>{t("hub.emptyHint")}</span></div></div>
    {/if}
{:else}
    <div class="lv-card lv-rems">
        {#each top as r (r.id)}
            <!-- 261 波：离场淡出（对齐提醒页；完成/延后不再瞬消失） -->
            <div class="lv-rem {r.level}" out:fade={{ duration: 150 }}>
                <!-- 259 波：图标砖收回中性（对齐原型 .rem .ic = surface-2）——级别语义由色轨+
                     右侧相对时间大字承载，彩色砖让整列提醒过度用色 -->
                <div class="lv-rem-ic" aria-hidden="true">{r.moduleId === "adhoc" ? "📝" : moduleIcon(r.moduleId)}</div>
                <div class="lv-rem-t"><b>{r.title}</b><span>{#if memberOf(r.memberId)}{@const member = memberOf(r.memberId)}<span class="lv-miniava" style="background:linear-gradient(135deg, hsl({memberHue(member.id)} 62% 52%), hsl({(memberHue(member.id) + 42) % 360} 62% 40%))" aria-hidden="true">{member.name.slice(0, 1)}</span>{/if}{t(`module.${r.moduleId}`) !== `module.${r.moduleId}` ? t(`module.${r.moduleId}`) : t("adhoc.name")}{r.lunar ? " 🌙" : ""}{r.autoRenew ? " 🔄" : ""}</span></div>
                <div class="lv-rem-when"><b class="lv-num" style="color:var(--lv-{r.level === 'overdue' ? 'danger' : r.level === 'soon' ? 'warn' : 'amber'})">
                    {r.daysLeft < 0 ? t("days.overdue").replace("${n}", String(-r.daysLeft)) : r.daysLeft === 0 ? t("days.today") : t("days.after").replace("${n}", String(r.daysLeft))}
                </b><span class="lv-num">{r.dueDate}</span></div>
                <div class="lv-rem-ops">
                    <button class="b3-button b3-button--text" onclick={() => void runOverviewAction(() => plugin.complete(r))}>{t("act.done")}</button>
                    <button class="b3-button b3-button--text" onclick={() => void runOverviewAction(() => plugin.snooze(r.id, 7))}>{t("act.snooze7")}</button>
                </div>
            </div>
        {/each}
    </div>
{/if}

<div class="lv-sec"><h2 class="lv-title-sec">{t("dash.quickRecord")}</h2><span class="lv-sub">{t("dash.quickRecordSub")}</span></div>
<div class="lv-quick" style="margin-bottom:4px">
    {#each quickModules as mid (mid)}
        <button class="lv-qbtn" onclick={() => { plugin.setActiveLedger(mid); onGoto(mid === "members" ? "members" : "ledger"); }}>
            <span class="qi">{moduleIcon(mid)}</span>{mid === "members" ? t("tab.members") : t(`module.${mid}`)}
        </button>
    {/each}
</div>
<div class="lv-sec"><h2 class="lv-title-sec">{t("memo.quick")}</h2><span class="lv-sub">{t("memo.quickSub")}</span></div>
<div class="lv-card lv-memo" style="margin-top:0">
    <!-- 261 波：回车提交（isComposing 守卫——中文输入法选词的 Enter 不算提交） -->
    <input bind:this={memoInput} class="b3-text-field fn__flex-1" style="min-width:180px" placeholder={t("memo.placeholder")} bind:value={memoTitle}
        disabled={savingMemo} onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter" && !e.isComposing) void addMemo(); }} />
    <!-- 262 波（Todoist 式即时预览）：解析命中即亮 chip，提交前就知道日期去哪了 -->
    {#if memoParsed}
        <span class="lv-parsechip" role="status">📅 <span class="lv-num">{memoParsed.date}</span></span>
    {/if}
    <input class="b3-text-field" type="date" bind:value={memoDue} />
    <button class="b3-button b3-button--text" disabled={savingMemo} aria-busy={savingMemo} onclick={addMemo} title={t("memo.add")}>{savingMemo ? t("ledger.saving") : `＋ ${t("memo.add")}`}</button>
</div>

<div class="lv-sec"><h2 class="lv-title-sec">{t("dash.myModules")}</h2>
    <button class="b3-button b3-button--text" onclick={() => plugin.openSetting()}>{t("dash.enableMore")} →</button>
</div>
{#if firstScanPending}
    <!-- 262 波：首扫骨架补全模块网格（与提醒骨架同一 loading 故事） -->
    <div class="lv-mods" aria-hidden="true">
        {#each [0, 1, 2, 3] as i (i)}
            <div class="lv-card lv-mod">
                <div class="lv-skel" style="width:38px;height:38px;border-radius:11px"></div>
                <div class="lv-skel" style="height:13px;width:56%"></div>
                <div class="lv-skel" style="height:11px;width:38%"></div>
            </div>
        {/each}
    </div>
{:else}
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
            {#if rowCountOf(mid) !== undefined}
                <!-- 264 波：主数字=台账行数（原型 "12 条 · 1 待办" 层次）；265 波零值弱色降噪——
                     空台账的"0"是已知事实但不必与活跃数字同权重；待办徽章右置可下钻 -->
                <b class="lv-num" class:zero={rowCountOf(mid) === 0}>{rowCountOf(mid)}</b><span>{t("mod.records")}</span>
                {#if pending > 0}
                    <span class="up" role="button" tabindex="0" style="cursor:pointer;display:inline-flex"
                        title={t("mod.pendingDrill")}
                        onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); drillReminders(mid); } }}
                        onclick={(e: MouseEvent) => { e.stopPropagation(); drillReminders(mid); }}
                    ><span class="lv-badge red lv-num">{pending} ⚠</span></span>
                {/if}
            {:else if pending > 0}
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
                    <!-- 259 波：fallback 从灰字改为导航出口（卡面视觉重心；箭头 hover 位移） -->
                    <span class="lv-go">{t("mod.inLedger")}<i aria-hidden="true">&nbsp;→</i></span>
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
{/if}
