<script lang="ts">
    import type { Reminder } from "@/types";
    import Onboarding from "../onboarding.svelte";
    import type { HomePluginLike } from "@/types/plugin";
    import { saveRuntime } from "@/core/hub/runtime";
    import { fade } from "svelte/transition";
    import { localDateKey } from "@/core/hub/rule";
    import { parseNaturalDate } from "@/core/dateparse";
    import { formatLocalDate, formatLocalTime } from "@/core/date-display";
    import { formatAmount, memberHue } from "@/core/format";
    import { showMessage } from "siyuan";
    import { MODULE_GROUPS, getModule, moduleTone } from "@/core/modules";
    import UiIcon from "@/ui/icon.svelte";
    import ActivityFeed from "../activity-feed.svelte";
    import { moduleUiIcon } from "@/ui/icons";
    import type { ModuleGroupId } from "@/types";

    let { plugin, t, onGoto, onCapture, version, initialScanError = "", onRetryScan }: {
        plugin: HomePluginLike;
        t: (k: string) => string;
        onGoto: (s: string) => void;
        onCapture?: (moduleId?: string) => void;
        version?: number;
        initialScanError?: string;
        onRetryScan?: () => Promise<void>;
    } = $props();

    function openQuickCapture(moduleId: string) {
        plugin.setActiveLedger(moduleId);
        // The capture sheet is mounted once at tab-panel level. Set the target
        // before opening it so the shortcut always opens the module the user
        // just chose, even when a previous capture used another module.
        if (plugin.runtime) plugin.runtime.hubQuickModule = moduleId;
        if (onCapture) onCapture(moduleId);
        else onGoto("ledger");
    }

    const onboarded = $derived.by(() => {
        void version;
        return !!plugin.settings.onboarded;
    });

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
    const paymentSummary = $derived.by(() => {
        void version;
        return plugin.scan?.paymentSummary;
    });
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

    // 269 波：模块较多时按功能分组，并提供本地搜索，避免首页变成难以扫读的长卡片墙。
    // 筛选只影响当前页面展示，不改变设置中的启用状态。
    let moduleGroupFilter = $state<ModuleGroupId | "all">("all");
    let moduleQuery = $state("");
    // 模块较多时默认只展开首个分组和有待办的分组；用户展开状态独立保存，
    // 筛选结果自动展开匹配组，避免在长页面中反复寻找命中的模块。
    let moduleGroupOpen = $state<Partial<Record<ModuleGroupId, boolean>>>({});
    const moduleGroupStats = $derived.by(() => {
        void version;
        return MODULE_GROUPS
            .map((id) => ({ id, count: moduleCards.filter((mid) => getModule(mid)?.group === id).length }))
            .filter((group) => group.count > 0);
    });
    const moduleSections = $derived.by(() => {
        void version;
        const query = moduleQuery.trim().toLocaleLowerCase();
        return moduleGroupStats
            .filter((group) => moduleGroupFilter === "all" || group.id === moduleGroupFilter)
            .map((group) => ({
                ...group,
                ids: moduleCards.filter((mid) => {
                    if (getModule(mid)?.group !== group.id) return false;
                    if (!query) return true;
                    return t(`module.${mid}`).toLocaleLowerCase().includes(query);
                }),
            }))
            .filter((group) => group.ids.length > 0);
    });

    function isModuleGroupOpen(id: ModuleGroupId, index: number, ids: string[]): boolean {
        const query = moduleQuery.trim();
        if (query || moduleGroupFilter !== "all") return ids.length > 0;
        const explicit = moduleGroupOpen[id];
        if (explicit !== undefined) return explicit;
        const hasPending = ids.some((mid) => (pendingByModule.get(mid) ?? 0) > 0);
        return index === 0 || hasPending;
    }

    function toggleModuleGroup(id: ModuleGroupId, open: boolean) {
        moduleGroupOpen = { ...moduleGroupOpen, [id]: open };
    }

    // 快捷录入只展示当前已启用的模块。固定展示未启用模块会把用户带到
    // 不存在的台账页，随后点击“重建”也不会真正创建该模块。
    const quickModuleIds = ["vehicles", "certs", "medicine", "memberships", "favors", "media", "health", "insurance", "stock", "parenting", "members"];
    const quickModules = $derived.by(() => {
        void version;
        const enabled = new Set(plugin.settings.enabledModules);
        const prioritized = quickModuleIds.filter((id) => enabled.has(id));
        const additional = plugin.settings.enabledModules.filter((id) => enabled.has(id) && !quickModuleIds.includes(id) && id !== "adhoc");
        return [...prioritized, ...additional].filter((id) => id === "members" || !!plugin.schemaCatalog?.[id]?.capture?.length);
    });
    let quickExpanded = $state(false);
    const quickVisibleModules = $derived(quickExpanded ? quickModules : quickModules.slice(0, 6));
    // A user may have disabled every optional module. Keep the first-record
    // guide actionable in that state instead of routing to a non-existent
    // `certs` ledger. The CTA then opens module settings where one can be
    // enabled and provisioned.
    const starterModule = $derived(
        quickModules.find((id) => id !== "members")
        ?? plugin.settings.enabledModules.find((id) => id !== "members" && id !== "adhoc")
        ?? undefined,
    );

    function openStarterRecord() {
        if (starterModule) openLedgerFor(starterModule);
        else plugin.openSetting();
    }

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

    // 170/171 波（对齐原型质感，不低于）：context-strip 状态条 + focus-row 三重点卡
    const overdueCount = $derived.by(() => { void version; return allReminders.filter((r: Reminder) => r.level === "overdue").length; });
    const soon7Count = $derived.by(() => { void version; return allReminders.filter((r: Reminder) => r.daysLeft >= 0 && r.daysLeft <= 7).length; });
    const syncErrCount = $derived.by(() => { void version; return members.filter((m) => m.syncError).length; });
    const scanErrors = $derived.by(() => { void version; return plugin.scan?.errors ?? []; });
    const permissionDenied = $derived(scanErrors.some((error) => error.moduleId === "permission"));
    const scanStale = $derived.by(() => { void version; return plugin.scan?.stale === true; });
    const snapshotLabel = $derived.by(() => {
        const at = plugin.runtime?.scannedAt;
        return formatLocalTime(at, { hour: "2-digit", minute: "2-digit" }) ?? "—";
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
    const hasLedgerRows = $derived.by(() => Object.values(statsByModule).some((stats: any) => typeof stats?.rowCount === "number" && stats.rowCount > 0));
    const showStartGuide = $derived(onboarded && (members.length === 0 || !hasLedgerRows));

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

    function openLedgerFor(moduleId: string) {
        plugin.setActiveLedger(moduleId);
        onGoto("ledger");
    }

    function openPaymentSource(item: { moduleId: string; rowId: string }) {
        if (plugin.openActivityTarget) {
            plugin.openActivityTarget({ moduleId: item.moduleId, rowId: item.rowId, source: "ledger" });
            return;
        }
        openLedgerFor(item.moduleId);
    }

    function paymentDueLabel(daysUntil: number): string {
        if (daysUntil === 0) return t("payment.today");
        if (daysUntil === 1) return t("payment.tomorrow");
        return t("payment.daysAfter").replace("${days}", String(daysUntil));
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
            else await plugin.refreshHub(undefined, true);
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
    // 每条提醒独立锁定写操作，避免双击把同一条完成/延后写入两次。
    let overviewBusy = $state<Set<string>>(new Set());
    async function runOverviewAction(key: string, action: () => Promise<void>) {
        if (overviewBusy.has(key)) return;
        overviewBusy = new Set([...overviewBusy, key]);
        try { await action(); }
        catch (e) { showMessage(t("hub.actionFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error"); }
        finally {
            const next = new Set(overviewBusy);
            next.delete(key);
            overviewBusy = next;
        }
    }
    async function completeItem(r: Reminder) {
        await runOverviewAction(r.id, async () => {
            await plugin.complete(r);
            plugin.showUndo?.({
                message: t("act.completed").replace("${title}", r.title),
                action: async () => {
                    await plugin.restore(r.id);
                },
            });
        });
    }
    async function snoozeItem(r: Reminder) {
        await runOverviewAction(r.id, async () => {
            await plugin.snooze(r.id, 7);
            plugin.showUndo?.({
                message: t("act.snoozed").replace("${title}", r.title),
                action: async () => {
                    await plugin.restore(r.id);
                },
            });
        });
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

    // MOD-20 / §13 家庭年度生活报告生成器
    async function openAnnualReportModal() {
        const curYear = new Date().getFullYear();
        let favorsStat: { totalIn: number; totalOut: number; netAmount: number; countIn: number; countOut: number } | undefined;
        let mediaStat: { doneThisYearCount: number; consumingCount: number; averageRating: number } | undefined;
        let assetStat: { totalValuation: number; activeItemCount: number } | undefined;

        try {
            const { renderLedgerAll } = await import("@/core/siyuan");
            // 1. 尝试读取 favors
            const favorsRef = plugin.settings.dbRefs?.["favors"];
            if (favorsRef?.avId && favorsRef.columns) {
                try {
                    const l = await renderLedgerAll(favorsRef.avId);
                    const { calculateFavorsSummary } = await import("@/core/favors");
                    const dirCol = favorsRef.columns.direction;
                    const amtCol = favorsRef.columns.amount;
                    const personCol = favorsRef.columns.person;
                    const dateCol = favorsRef.columns.date;
                    const fRows = l.rows.map((r) => ({
                        direction: r.cells[dirCol]?.select?.content ?? r.cells[dirCol]?.mSelect?.[0]?.content ?? r.cells[dirCol]?.text?.content,
                        amount: r.cells[amtCol]?.number?.content,
                        person: r.cells[personCol]?.text?.content,
                        date: r.cells[dateCol]?.date?.content ? new Date(r.cells[dateCol].date.content).toISOString().slice(0, 10) : undefined,
                    }));
                    favorsStat = calculateFavorsSummary(fRows, curYear);
                } catch { /* ignored */ }
            }

            // 2. 尝试读取 media
            const mediaRef = plugin.settings.dbRefs?.["media"];
            if (mediaRef?.avId && mediaRef.columns) {
                try {
                    const l = await renderLedgerAll(mediaRef.avId);
                    const { calculateMediaSummary } = await import("@/core/media");
                    const stCol = mediaRef.columns.status;
                    const rtCol = mediaRef.columns.rating;
                    const dateCol = mediaRef.columns.date;
                    const mRows = l.rows.map((r) => ({
                        name: r.cells[mediaRef.columns!.name]?.text?.content ?? "作品",
                        status: r.cells[stCol]?.select?.content ?? r.cells[stCol]?.mSelect?.[0]?.content ?? r.cells[stCol]?.text?.content,
                        rating: r.cells[rtCol]?.number?.content,
                        date: r.cells[dateCol]?.date?.content ? new Date(r.cells[dateCol].date.content).toISOString().slice(0, 10) : undefined,
                    }));
                    mediaStat = calculateMediaSummary(mRows, curYear);
                } catch { /* ignored */ }
            }

            // 3. 尝试读取 assets-real
            const assetRef = plugin.settings.dbRefs?.["assets-real"];
            if (assetRef?.avId && assetRef.columns) {
                try {
                    const l = await renderLedgerAll(assetRef.avId);
                    const { calculateAssetValuation } = await import("@/core/assets-valuation");
                    const amtCol = assetRef.columns.amount;
                    const stCol = assetRef.columns.status;
                    const aRows = l.rows.map((r) => ({
                        id: r.itemID,
                        amount: r.cells[amtCol]?.number?.content,
                        status: r.cells[stCol]?.select?.content ?? r.cells[stCol]?.mSelect?.[0]?.content ?? r.cells[stCol]?.text?.content ?? "inuse",
                    }));
                    assetStat = calculateAssetValuation(aRows);
                } catch { /* ignored */ }
            }
        } catch { /* fallback to defaults */ }

        const { generateAnnualReport, formatAnnualReportText } = await import("@/core/annual-report");
        const { formatAmount } = await import("@/core/format");
        const report = generateAnnualReport({
            year: curYear,
            membersCount: members.length,
            monthlyCompletions: plugin.runtime?.monthlyCompletions,
            handledRecords: Object.values(plugin.runtime?.handled ?? {}),
            favorsSummary: favorsStat,
            mediaSummary: mediaStat,
            assetValuation: assetStat,
        });

        const { Dialog } = await import("siyuan");
        const dlg = new Dialog({
            title: t("annualReport.title").replace("${year}", String(report.year)),
            content: `
                <div class="b3-dialog__content fn__flex" style="flex-direction:column;gap:14px;max-height:70vh;overflow:auto;padding:18px 22px">
                    <div style="font-size:13px;color:var(--lv-tx-2);line-height:1.5">
                        🏠 <b>小驴管家 · ${report.year} 年度家庭生活总结报告</b>
                        <div class="lv-caption" style="margin-top:2px">共有 ${report.membersCount} 位家庭成员共同打理家底档案</div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:10px">
                        <div style="padding:12px;border-radius:var(--lv-r-2);background:var(--lv-surface-2);border:1px solid var(--lv-line)">
                            <div class="lv-caption" style="font-size:11.5px">✅ ${t("annualReport.completedTasks")}</div>
                            <div style="font-size:22px;font-weight:700;color:var(--lv-ok);margin-top:4px">${report.totalRemindersCompleted} <span style="font-size:12px;font-weight:normal;color:var(--lv-tx-3)">件完成</span></div>
                        </div>
                        <div style="padding:12px;border-radius:var(--lv-r-2);background:var(--lv-surface-2);border:1px solid var(--lv-line)">
                            <div class="lv-caption" style="font-size:11.5px">🎁 ${t("annualReport.favorsNet")}</div>
                            <div style="font-size:20px;font-weight:700;color:var(--lv-tx);margin-top:4px">¥ ${formatAmount(report.favors.netAmount)}</div>
                            <div class="lv-caption" style="font-size:11px;margin-top:2px">收 ¥${formatAmount(report.favors.totalIn)} · 送 ¥${formatAmount(report.favors.totalOut)}</div>
                        </div>
                        <div style="padding:12px;border-radius:var(--lv-r-2);background:var(--lv-surface-2);border:1px solid var(--lv-line)">
                            <div class="lv-caption" style="font-size:11.5px">🎬 ${t("annualReport.mediaDone")}</div>
                            <div style="font-size:20px;font-weight:700;color:var(--lv-tx);margin-top:4px">${report.media.doneCount} <span style="font-size:12px;font-weight:normal;color:var(--lv-tx-3)">部完成</span></div>
                            <div class="lv-caption" style="font-size:11px;margin-top:2px">在追 ${report.media.consumingCount} 部 · 均分 ★ ${report.media.averageRating}</div>
                        </div>
                        <div style="padding:12px;border-radius:var(--lv-r-2);background:var(--lv-surface-2);border:1px solid var(--lv-line)">
                            <div class="lv-caption" style="font-size:11.5px">💎 ${t("annualReport.assetsTotal")}</div>
                            <div style="font-size:20px;font-weight:700;color:var(--lv-tx);margin-top:4px">¥ ${formatAmount(report.assets.totalValuation)}</div>
                            <div class="lv-caption" style="font-size:11px;margin-top:2px">在用保有 ${report.assets.itemCount} 件</div>
                        </div>
                    </div>
                    <div style="font-size:12px;color:var(--lv-tx-3);line-height:1.5;padding:10px 12px;border-radius:var(--lv-r-1);background:var(--lv-surface);border:1px solid var(--lv-line)">
                        ✨ 愿新的一年，日子清朗，家和安康。
                    </div>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel" id="lv-annual-copy">${t("annualReport.copy")}</button>
                    <button class="b3-button" id="lv-annual-close">${t("close")}</button>
                </div>
            `,
            width: "500px",
        });

        const copyBtn = dlg.element.querySelector("#lv-annual-copy") as HTMLButtonElement;
        const closeBtn = dlg.element.querySelector("#lv-annual-close") as HTMLButtonElement;
        closeBtn.onclick = () => dlg.destroy();
        copyBtn.onclick = async () => {
            try {
                const text = formatAnnualReportText(report, formatAmount);
                await navigator.clipboard.writeText(text);
                showMessage(t("annualReport.copyDone"), 2500, "info");
            } catch (err) {
                showMessage(String(err), 4000, "error");
            }
        };
    }
</script>

{#if !onboarded}
    <Onboarding {plugin} {t} onGoto={onGoto} {onCapture} />
{/if}

<div class="lv-hero">
    <div class="lv-hero-copy">
        <div class="lv-hero-meta" role="status" aria-label={t("dash.stripLabel")}>
            <span>{dateLine}{scanStale ? ` · ${t("dash.stale")}` : ""}</span>
            <span><strong>{t("dash.stripScope")}</strong> {scopeLabel}</span>
            <span><strong>{t("dash.stripErrors")}</strong> {scanErrors.length}</span>
        </div>
        <h1>{greet}，{t("dash.heroTitle")}</h1>
        <p class="lv-hero-lead">
            {#if reminders.length > 0}
                {reminders.length} {reminders.length === 1 ? t("dash.needAttentionOne") : t("dash.needAttention")} · {t("dash.focusTodayBody").replace("${od}", String(overdueCount)).replace("${s}", String(soon7Count))}
            {:else}
                {t("dash.heroLead")}
            {/if}
        </p>
        <div class="lv-hero-actions">
            <button class="b3-button lv-hero-open" onclick={() => onGoto("reminders")}><UiIcon name="clock" size={17} />{t("dash.heroOpen")}</button>
            {#if onCapture}<button class="b3-button b3-button--outline lv-hero-capture" onclick={() => onCapture()}><UiIcon name="add" size={16} />{t("dash.quickRecord")}</button>{/if}
            <button class="b3-button b3-button--outline" onclick={openAnnualReportModal} title={t("annualReport.button")}><UiIcon name="sparkle" size={16} />{t("annualReport.button")}</button>
        </div>
        {#if monthlyDone > 0}<p><span class="lv-badge green">✓ {t("dash.monthlyDone").replace("${n}", monthlyDueTotal > 0 ? `${monthlyDone}/${monthlyDueTotal}` : String(monthlyDone))}</span></p>{/if}
    </div>
    <div class="lv-hero-tools">
        <div class="lv-hero-count" title={t("dash.statScope").replace("${t}", snapshotLabel)}>
            <b class="lv-num" use:countUp={reminders.length}>{reminders.length}</b><span>{reminders.length === 1 ? t("dash.needAttentionOne") : t("dash.needAttention")}</span>
        </div>
        <svg class="lv-hero-art" viewBox="0 0 184 130" aria-hidden="true"><rect x="9" y="12" width="166" height="106" rx="28" fill="currentColor" opacity=".08"/><rect x="24" y="25" width="76" height="88" rx="12" fill="var(--lv-surface)" stroke="currentColor" stroke-opacity=".25"/><path d="M40 48h43M40 61h32M40 76h20M40 91h29" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".25"/><rect x="94" y="42" width="64" height="65" rx="14" fill="var(--lv-surface)" stroke="currentColor" stroke-opacity=".25"/><path d="m107 67 19-16 19 16M113 63v24h26V63M122 87V74h8v13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="153" cy="33" r="14" fill="var(--lv-amber-soft)"/><path d="m147 33 4 4 8-8" fill="none" stroke="var(--lv-amber)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
</div>

{#if permissionDenied}
    <div class="lv-card" role="alert" style="display:flex;align-items:center;gap:12px;padding:12px 16px">
        <UiIcon name="alert" size={18} />
        <span style="flex:1;min-width:0;overflow-wrap:anywhere">{t("permission.body")}</span>
        <button class="b3-button b3-button--outline" disabled={retryingScan} aria-busy={retryingScan} onclick={retryScan}>
            {retryingScan ? t("ledger.saving") : t("hub.rescan")}
        </button>
    </div>
{/if}

{#if showStartGuide}
    <details class="lv-start-guide" aria-labelledby="lv-start-guide-title">
        <summary class="lv-start-guide__summary">
            <span class="lv-start-guide__copy">
                <span class="lv-kicker">{t("startGuide.kicker")}</span>
                <span id="lv-start-guide-title" class="lv-start-guide__title">{t("startGuide.title")}</span>
                <span class="lv-start-guide__intro">{t("startGuide.intro")}</span>
            </span>
            <span class="lv-start-guide__mark" aria-hidden="true">⌄</span>
        </summary>
        <div class="lv-start-guide__steps">
            <div class="lv-start-guide__step">
                <span class="lv-start-guide__num">1</span>
                <div><b>{t("startGuide.stepMembers")}</b><span>{t("startGuide.stepMembersHint")}</span></div>
                <button class="b3-button b3-button--outline" onclick={() => onGoto("members")}>{t("startGuide.openMembers")}</button>
            </div>
            <div class="lv-start-guide__step">
                <span class="lv-start-guide__num">2</span>
                <div><b>{t("startGuide.stepRecord")}</b><span>{starterModule ? t("startGuide.stepRecordHint") : t("startGuide.stepRecordNoModule")}</span></div>
                <button class="b3-button b3-button--outline" onclick={openStarterRecord}>{starterModule ? t("startGuide.openLedger") : t("startGuide.openSettings")}</button>
            </div>
            <div class="lv-start-guide__step">
                <span class="lv-start-guide__num">3</span>
                <div><b>{t("startGuide.stepModules")}</b><span>{t("startGuide.stepModulesHint")}</span></div>
                <button class="b3-button b3-button--outline" onclick={() => plugin.openSetting()}>{t("startGuide.openSettings")}</button>
            </div>
            <div class="lv-start-guide__step">
                <span class="lv-start-guide__num">4</span>
                <div><b>{t("startGuide.stepReminders")}</b><span>{t("startGuide.stepRemindersHint")}</span></div>
                <button class="b3-button b3-button--outline" onclick={() => onGoto("reminders")}>{t("startGuide.openReminders")}</button>
            </div>
        </div>
    </details>
{/if}

<div class="lv-focus" aria-label={t("dash.focusLabel")}>
    <button type="button" class="lv-focus-card" onclick={() => onGoto("reminders")} aria-label={`${t("dash.focusToday")}：${overdueCount + soon7Count}`}>
        <div class="lv-focus-copy">
            <span class="lv-focus-label">{t("dash.focusToday")}</span>
            <strong class="lv-focus-num lv-num">{overdueCount + soon7Count}</strong>
            <span class="lv-focus-sub">{t("dash.focusTodayBody").replace("${od}", String(overdueCount)).replace("${s}", String(soon7Count))}</span>
        </div>
        <span class="lv-focus-icon" aria-hidden="true"><UiIcon name="clock" size={18} /></span>
    </button>
    <button type="button" class="lv-focus-card" onclick={() => onGoto("members")} aria-label={`${t("dash.focusReview")}：${syncErrCount}`}>
        <div class="lv-focus-copy">
            <span class="lv-focus-label">{t("dash.focusReview")}</span>
            <strong class="lv-focus-num lv-num" style={syncErrCount > 0 ? "color:var(--lv-warn)" : ""}>{syncErrCount}</strong>
            <span class="lv-focus-sub">{syncErrCount > 0 ? t("dash.focusReviewBody").replace("${n}", String(syncErrCount)) : t("dash.focusReviewOk")}</span>
        </div>
        <span class="lv-focus-icon" aria-hidden="true"><UiIcon name="users" size={18} /></span>
    </button>
    <button type="button" class="lv-focus-card" onclick={() => plugin.openSetting()} aria-label={`${t("dash.focusData")}`}>
        <div class="lv-focus-copy">
            <span class="lv-focus-label">{t("dash.focusData")}</span>
            <strong class="lv-focus-num" style={scanStale || scanErrors.length ? "color:var(--lv-warn);font-size:20px" : "color:var(--lv-ok);font-size:20px"}>
                {scanStale || scanErrors.length ? t("dash.stale") : t("diag.ok")}
            </strong>
            <span class="lv-focus-sub">{scanStale ? t("dash.focusStale") : scanErrors.length > 0 ? t("dash.focusDataErr").replace("${t}", snapshotLabel).replace("${n}", String(scanErrors.length)) : t("dash.focusDataOk").replace("${t}", snapshotLabel)}</span>
        </div>
        <span class="lv-focus-icon" style={scanStale || scanErrors.length ? "color:var(--lv-warn);background:var(--lv-warn-soft)" : "color:var(--lv-ok);background:var(--lv-ok-soft)"} aria-hidden="true">
            <UiIcon name={scanStale || scanErrors.length ? "alert" : "check"} size={18} />
        </span>
    </button>
</div>

{#if !memberFilter && paymentSummary && paymentSummary.sourceCount > 0}
    <section class="lv-payment-banner lv-card lv-payment-overview" aria-label={t("payment.summaryTitle")}>
        <div class="lv-payment-hero">
            <div class="lv-payment-metric">
                <span class="lv-payment-label">{t("payment.summaryTitle")}</span>
                <b class="lv-payment-amount lv-num">¥ {formatAmount(paymentSummary.next30Total, plugin.settings.hideAmounts)}</b>
                <span class="lv-payment-sub">{t("payment.next30")}{#if paymentSummary.upcoming.length > 0} · {paymentSummary.upcoming.length} {t("payment.items")}{/if}</span>
            </div>
            <div class="lv-payment-stats">
                <div class="lv-payment-chip"><span><b>¥ {formatAmount(paymentSummary.next7Total, plugin.settings.hideAmounts)}</b> {t("payment.next7")}</span></div>
                <div class="lv-payment-chip highlight"><span><b>¥ {formatAmount(paymentSummary.monthlyTotal, plugin.settings.hideAmounts)}</b> {t("payment.monthlyEquivalent")}</span></div>
            </div>
        </div>
        {#if paymentSummary.upcoming.length > 0}
            <div class="lv-payment-top">
                <span class="lv-payment-top__title">{t("payment.upcoming")}：</span>
                {#each paymentSummary.upcoming.slice(0, 3) as item (item.moduleId + item.rowId)}
                    <button type="button" class="lv-payment-top__tag" title={item.title} aria-label={item.title}
                        onclick={() => openPaymentSource(item)}>
                        {t(`module.${item.moduleId}`)} · {item.title} · {paymentDueLabel(item.daysUntil)} · {item.dueDate} · ¥{formatAmount(item.amount, plugin.settings.hideAmounts)}
                    </button>
                {/each}
            </div>
        {:else}
            <div class="lv-payment-empty">{t("payment.noUpcoming")}</div>
        {/if}
        {#if paymentSummary.byModule.memberships?.sourceCount || paymentSummary.byModule.insurance?.sourceCount}
            <div class="lv-payment-breakdown" aria-label={t("payment.breakdown")}>
                <span class="lv-payment-top__title">{t("payment.breakdown")}：</span>
                {#if paymentSummary.byModule.memberships?.sourceCount}
                    <span class="lv-payment-breakdown__item">{t("module.memberships")} · ¥{formatAmount(paymentSummary.byModule.memberships.monthlyTotal, plugin.settings.hideAmounts)}{t("payment.perMonth")}</span>
                {/if}
                {#if paymentSummary.byModule.insurance?.sourceCount}
                    <span class="lv-payment-breakdown__item">{t("module.insurance")} · ¥{formatAmount(paymentSummary.byModule.insurance.monthlyTotal, plugin.settings.hideAmounts)}{t("payment.perMonth")}</span>
                {/if}
            </div>
        {/if}
    </section>
{/if}

<div class="lv-members" style="margin-bottom:4px">
    <button class="lv-chip {!memberFilter ? 'on' : ''}" aria-pressed={!memberFilter} onclick={() => setMemberFilter(undefined)}>{t("members.all")}</button>
    {#each members as m (m.id)}
        <button class="lv-chip {memberFilter === m.id ? 'on' : ''}" aria-pressed={memberFilter === m.id} onclick={() => setMemberFilter(m.id)}>
            <span class="lv-avatar" aria-hidden="true" style="background:linear-gradient(135deg, hsl({memberHue(m.id)} 62% 52%), hsl({(memberHue(m.id) + 42) % 360} 62% 40%))">{m.name.slice(0, 1)}</span>{m.name}
        </button>
    {/each}
    <button class="lv-chip" aria-label={t("add")} title={t("add")} onclick={() => onGoto("members")}><UiIcon name="add" size={15} /></button>
</div>

<div class="lv-sec"><h2 class="lv-title-sec">{t("dash.upcoming")}</h2><span class="lv-sub">{t("dash.upcomingSub")}</span>
    <button class="b3-button b3-button--text" onclick={viewAllReminders}>{t("dash.viewAll")} →</button>
</div>
{#if reminders.length === 0 && (initialScanError || scanErrors.length > 0)}
    <div class="lv-card"><div class="lv-empty" role="alert">
        <div class="eic"><UiIcon name="alert" size={22} /></div><b>{t("dash.scanUnavailable")}</b>
        <span>{initialScanError || t("dash.focusDataErr").replace("${t}", snapshotLabel).replace("${n}", String(scanErrors.length))}</span>
        <button class="b3-button b3-button--outline" style="margin-top:8px" disabled={retryingScan} aria-busy={retryingScan} onclick={retryScan}>
            {retryingScan ? t("ledger.saving") : t("hub.rescan")}
        </button>
    </div></div>
{:else if reminders.length === 0 && memberFilter}
    <!-- 174 波（对齐原型空态解释）：筛选导致的空 ≠ 无资料，说明并给清除出口 -->
    <div class="lv-card"><div class="lv-empty" role="status"><div class="eic"><UiIcon name="search" size={22} /></div><b>{t("dash.filteredEmpty")}</b><span>{t("dash.filteredEmptyHint")}</span>
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
        <div class="lv-card lv-empty-compact" role="status">
            <div class="eic-sm"><UiIcon name="check" size={18} /></div>
            <div class="lv-empty-compact__text">
                <b>{t("dash.allClear")}</b>
                <span>{t("hub.emptyHint")}</span>
            </div>
            {#if starterModule}
                <button class="b3-button b3-button--outline" onclick={openStarterRecord}>
                    ＋ {t("ledger.newRecord")}
                </button>
            {/if}
        </div>
    {/if}
{:else}
    <div class="lv-card lv-rems">
        {#each top as r (r.id)}
            <!-- 261 波：离场淡出（对齐提醒页；完成/延后不再瞬消失） -->
            <div class="lv-rem {r.level}" out:fade={{ duration: 150 }}>
                <!-- 259 波：图标砖收回中性（对齐原型 .rem .ic = surface-2）——级别语义由色轨+
                     右侧相对时间大字承载，彩色砖让整列提醒过度用色 -->
                <div class="lv-rem-ic" aria-hidden="true"><UiIcon name={moduleUiIcon(r.moduleId)} size={18} /></div>
                <div class="lv-rem-t"><b>{r.title}</b><span>{#if memberOf(r.memberId)}{@const member = memberOf(r.memberId)}<span class="lv-miniava" style="background:linear-gradient(135deg, hsl({memberHue(member.id)} 62% 52%), hsl({(memberHue(member.id) + 42) % 360} 62% 40%))" aria-hidden="true">{member.name.slice(0, 1)}</span>{/if}{t(`module.${r.moduleId}`) !== `module.${r.moduleId}` ? t(`module.${r.moduleId}`) : t("adhoc.name")}{#if !r.memberId} · {t("members.unassigned")}{/if}{r.lunar ? " 🌙" : ""}{r.autoRenew ? " 🔄" : ""}</span></div>
                <div class="lv-rem-when"><b class="lv-num" style="color:var(--lv-{r.level === 'overdue' ? 'danger' : r.level === 'soon' ? 'warn' : 'amber'})">
                    {r.daysLeft < 0 ? t("days.overdue").replace("${n}", String(-r.daysLeft)) : r.daysLeft === 0 ? t("days.today") : t("days.after").replace("${n}", String(r.daysLeft))}
                </b><span class="lv-num">{r.dueDate}</span></div>
                <div class="lv-rem-ops">
                    <button class="b3-button b3-button--text" disabled={overviewBusy.has(r.id)} aria-busy={overviewBusy.has(r.id)} onclick={() => void completeItem(r)}>{overviewBusy.has(r.id) ? t("ledger.saving") : t("act.done")}</button>
                    <button class="b3-button b3-button--text" disabled={overviewBusy.has(r.id)} aria-busy={overviewBusy.has(r.id)} onclick={() => void snoozeItem(r)}>{overviewBusy.has(r.id) ? t("ledger.saving") : t("act.snooze7")}</button>
                </div>
            </div>
        {/each}
    </div>
{/if}

<ActivityFeed {plugin} {t} {version} compact={true} />

<div class="lv-sec"><h2 class="lv-title-sec">{t("dash.quickRecord")}</h2><span class="lv-sub">{t("dash.quickRecordSub")}</span>
    {#if onCapture}<button class="b3-button b3-button--text" onclick={() => onCapture()}>{t("capture.openFull")}</button>{/if}
</div>
<div id="lv-quick-modules" class="lv-quick" style="margin-bottom:8px">
    {#each quickVisibleModules as mid (mid)}
        {@const tone = moduleTone(mid)}
        <button class="lv-qbtn {tone}" onclick={() => mid === "members" ? onGoto("members") : openQuickCapture(mid)}>
            <span class="qi"><UiIcon name={moduleUiIcon(mid)} size={18} /></span>
            <span class="ql">{mid === "members" ? t("tab.members") : t(`module.${mid}`)}</span>
        </button>
    {/each}
    {#if quickModules.length > 6}
        <button class="lv-qbtn lv-qbtn--toggle" aria-expanded={quickExpanded}
            onclick={() => (quickExpanded = !quickExpanded)}>
            <span class="qi" aria-hidden="true" style="font-size:15px;font-weight:600">{quickExpanded ? "⌃" : "⌄"}</span>
            <span class="ql">{quickExpanded ? t("dash.quickModulesLess") : t("dash.quickModulesMore").replace("${n}", String(quickModules.length - 6))}</span>
        </button>
    {/if}
</div>
<div class="lv-sec"><h2 class="lv-title-sec">{t("memo.quick")}</h2><span class="lv-sub">{t("memo.quickSub")}</span></div>
<div class="lv-card lv-memo" style="margin-top:0">
    <!-- 261 波：回车提交（isComposing 守卫——中文输入法选词的 Enter 不算提交） -->
    <input bind:this={memoInput} class="b3-text-field fn__flex-1" style="min-width:180px" placeholder={t("memo.placeholder")} bind:value={memoTitle}
        disabled={savingMemo} onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter" && !e.isComposing) void addMemo(); }} />
    <!-- 262 波（Todoist 式即时预览）：解析命中即亮 chip，提交前就知道日期去哪了 -->
    {#if memoParsed}
        <span class="lv-parsechip" role="status"><UiIcon name="calendar" size={13} /> <span class="lv-num">{memoParsed.date}</span></span>
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
    <div class="lv-module-tools" aria-label={t("dash.moduleFilterLabel")}>
        <div class="lv-module-filters" role="group" aria-label={t("dash.moduleFilterLabel")}>
            <button type="button" class="lv-module-filter" class:on={moduleGroupFilter === "all"} aria-pressed={moduleGroupFilter === "all"}
                onclick={() => (moduleGroupFilter = "all")}>{t("dash.moduleAll")}</button>
            {#each moduleGroupStats as group (group.id)}
                <button type="button" class="lv-module-filter" class:on={moduleGroupFilter === group.id} aria-pressed={moduleGroupFilter === group.id}
                    onclick={() => (moduleGroupFilter = group.id)}>{t(`group.${group.id}`)} <span>{group.count}</span></button>
            {/each}
        </div>
        <label class="lv-module-search">
            <UiIcon name="search" size={15} />
            <input class="b3-text-field" type="search" bind:value={moduleQuery} placeholder={t("dash.moduleSearch")} aria-label={t("dash.moduleSearch")} />
        </label>
        <span class="lv-module-total"><b class="lv-num">{moduleCards.length}</b> {t("dash.moduleCount")}</span>
    </div>
    {#if moduleSections.length === 0}
        <div class="lv-card lv-module-empty" role="status">
            <UiIcon name="search" size={17} /><span>{t("dash.moduleEmpty")}</span>
            <button class="b3-button b3-button--text" onclick={() => { moduleQuery = ""; moduleGroupFilter = "all"; }}>{t("dash.moduleClear")}</button>
        </div>
    {:else}
    {#each moduleSections as section, sectionIndex (section.id)}
    {@const expanded = isModuleGroupOpen(section.id, sectionIndex, section.ids)}
    {@const sectionPending = section.ids.reduce((total, id) => total + (pendingByModule.get(id) ?? 0), 0)}
    {@const sectionRows = section.ids.reduce((total, id) => total + (rowCountOf(id) ?? 0), 0)}
    {@const sectionRowsKnown = section.ids.every((id) => rowCountOf(id) !== undefined)}
    <section class="lv-module-section" aria-labelledby={`lv-module-group-${section.id}`}>
        <h3 class="lv-module-section__heading">
            <button class="lv-module-section__head" aria-expanded={expanded} aria-controls={expanded ? `lv-module-items-${section.id}` : undefined}
                onclick={() => toggleModuleGroup(section.id, !expanded)}>
                <span class="lv-module-section__chevron" aria-hidden="true">{expanded ? "⌄" : "›"}</span>
                <span class="lv-module-section__title" id={`lv-module-group-${section.id}`}>{t(`group.${section.id}`)}</span>
                <span class="lv-caption">{(sectionRowsKnown ? t("dash.moduleGroupSummary") : t("dash.moduleGroupSummaryUnknown")).replace("${m}", String(section.ids.length)).replace("${r}", String(sectionRows)).replace("${p}", String(sectionPending))}</span>
                {#if sectionPending > 0}<span class="lv-badge red lv-num">{sectionPending} <UiIcon name="alert" size={12} /></span>{/if}
            </button>
        </h3>
        {#if expanded}
        <div id={`lv-module-items-${section.id}`} class="lv-module-section__body">
        <div class="lv-mods">
    {#each section.ids as mid (mid)}
        {@const pending = pendingByModule.get(mid) ?? 0}
        <div class="lv-card lv-mod" aria-label={t(`module.${mid}`)}
            role="button" tabindex="0"
            onclick={() => { plugin.setActiveLedger(mid); onGoto("ledger"); }}
            onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); plugin.setActiveLedger(mid); onGoto("ledger"); } }}>
            <div class="lv-module-open">
                <span class="lv-mi" class:tone-blue={moduleTone(mid) === "t-blue"} class:tone-green={moduleTone(mid) === "t-green"}
                    class:tone-rose={moduleTone(mid) === "t-rose"} class:tone-amber={moduleTone(mid) === "t-amber"}
                    aria-hidden="true"><UiIcon name={moduleUiIcon(mid)} size={20} /></span><b>{t(`module.${mid}`)}</b>
            </div>
            <div class="lv-stat" title={t("dash.statScope").replace("${t}", snapshotLabel)}>
            {#if rowCountOf(mid) !== undefined}
                <!-- 264 波：主数字=台账行数（原型 "12 条 · 1 待办" 层次）；265 波零值弱色降噪——
                     空台账的"0"是已知事实但不必与活跃数字同权重；待办徽章右置可下钻 -->
                <b class="lv-num" class:zero={rowCountOf(mid) === 0}>{rowCountOf(mid)}</b><span>{t("mod.records")}</span>
                {#if pending > 0}
                    <button type="button" class="lv-module-pending up"
                        title={t("mod.pendingDrill")}
                        onclick={(e: MouseEvent) => { e.stopPropagation(); drillReminders(mid); }}
                    ><span class="lv-badge red lv-num">{pending} <UiIcon name="alert" size={12} /></span></button>
                {/if}
            {:else if pending > 0}
                <!-- 17 组/196 波：徽章=独立下钻目标（stopPropagation，卡片本体仍进台账） -->
                <button type="button" class="lv-num lv-module-pending"
                    title={t("mod.pendingDrill")}
                    onclick={(e: MouseEvent) => { e.stopPropagation(); drillReminders(mid); }}
                ><b>{pending}</b><span style="color:var(--lv-warn)">{t("mod.pending")}</span></button>
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
                <div class="lv-caption" title={t("mod.examStatsTip").replace("${d}", formatLocalDate(plugin.runtime.lastExamStats.generatedAt) ?? "—")}>
                    <UiIcon name="note" size={13} /> {t("mod.examStreak").replace("${n}", String(plugin.runtime.lastExamStats.streak)).replace("${p}", String(plugin.runtime.lastExamStats.accuracy))}
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
        </div>
        {/if}
    </section>
    {/each}
    {/if}
{/if}
