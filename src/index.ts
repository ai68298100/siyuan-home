import { Plugin, showMessage, openTab, Custom, Dialog, getFrontend } from "siyuan";
import { mount, unmount } from "svelte";
import "./index.scss";

import TabPanel from "@/panels/tab-panel.svelte";
import HomeSettingsPanel from "@/panels/settings.svelte";
import { svelteDialog } from "@/libs/dialog";
import { loadSettings, saveSettings } from "@/core/settings";
import { loadRuntime, saveRuntime, purgeHandled, listHandled, type HubRuntime } from "@/core/hub/runtime";
import { runScan, deriveVisible, type ScanResult } from "@/core/hub/scanner";
import { buildScanProviders } from "@/core/hub/registry";
import { dailyDigest, markNotified, inSilentHours, weeklyPreview, markWeeklyNotified } from "@/core/hub/notify";
import { complete, snooze, mute, unmute, renew, restore, addMemo, removeMemo, updateMemo } from "@/core/hub/actions";
import { provisionModule } from "@/core/provisioner";
import { addDetachedRow, setCell } from "@/core/siyuan";
import { mountLvHomeBridge } from "@/bridge/external-bridge";
import { SCHEMA_CATALOG, validateSchema } from "@/core/schema";
import type { HomeSettings } from "@/types";

const TAB_TYPE = "hub-tab";
/** 版本显示（诊断/关于）：构建时由 vite define 从 plugin.json 注入（REL-01 版本单源，勿写字面量） */
const PLUGIN_VERSION = __PLUGIN_VERSION__;

/**
 * 小驴管家（Lv Home）
 * 家庭与生活管家：成员档案 · 资产 · 育儿上学 · 病历社保 · 影音书库 · 出行旅行
 */
export default class LvHomePlugin extends Plugin {
    settings: HomeSettings;
    runtime: HubRuntime;
    scan: ScanResult;
    private heartbeat: number | undefined;
    /** 所有延迟回调统一登记，确保卸载时没有匿名计时器继续访问插件实例。 */
    private readonly timeoutIds = new Set<number>();
    /** moduleId → schema 目录（193 波收口为 SCHEMA_CATALOG 单源；UI 按需读取列定义/枚举，与 ensureCoreLedgers 同源） */
    schemaCatalog: Record<string, any> = SCHEMA_CATALOG;
    /** Tab 面板刷新回调（支持多实例，33.1：所有打开的管家面板同步刷新） */
    hubListeners = new Set<() => void>();
    /** 扫描序号（H11）：慢的旧扫描不得覆写新扫描结果或之后的手动动作 */
    private scanSeq = 0;
    /** EC03/v0.3：服务桥卸载函数 */
    private disposeLvHomeBridge?: () => void;
    /** EC21：lv-exam:stats 监听（window CustomEvent，非 eventBus） */
    private examStatsHandler?: (e: Event) => void;
    /** EC09/EC10：打卡集成事件监听（window CustomEvent） */
    private checkinEventHandler?: (e: Event) => void;
    /** 下次面板挂载的目标页签（状态栏/通知入口预选） */
    pendingScreen?: string;
    private statusbarEl?: HTMLElement;
    /** C6c 块菜单监听（onunload 精确解绑用） */
    private captureMenuHandler?: (...args: any[]) => void;
    /** PF06/18 组：他端台账变更（websocket）→ 节流补扫 [待实测] 事件名/频度以实例为准 */
    private wsHandler?: (...args: any[]) => void;
    private lastWsRescan = 0;
    private static WS_RESCAN_MIN_MS = 60 * 1000;
    /** EC09/EC10：打卡摘要节流 */
    private lastCheckinPull = 0;
    /** EC16：向雷切注册管家动作（disposer 收集；重试计时器上限 10 次） */
    private speedSwitchDisposers: Array<() => void> = [];
    private speedSwitchRetry?: number;
    /** EC17：家庭摘要模块 disposer */
    private homeModuleDisposer?: (() => void) | undefined;
    /** DEVICE-07（227 波）：移动前端标识与顶栏入口（petal addTopBar 在移动端不渲染，参照 checkin 直接注入 #mobileTopBar） */
    private isMobileFrontend = false;
    private mobileTopBarBtn?: HTMLElement;
    private mobileTopBarRetry?: number;
    private mobileDialog?: Dialog;
    private mobileDialogUnmount?: () => void;
    /** PF13/15 组：可见性恢复补扫（休眠错过心跳的场景）；10 分钟最小间隔合并重复触发 */
    private visibilityHandler?: () => void;
    private lastScanAt = 0;
    private static WAKE_RESCAN_MIN_MS = 10 * 60 * 1000;
    /** 20 组：全量扫描去抖——Tab/面板快速开关 30 秒内不重复全量（增量扫描与手动强制不受限） */
    private static FULL_SCAN_MIN_MS = 30 * 1000;
    /** 状态栏角标更新（28 组：今日到期 N） */
    private updateStatusbar(count: number) {
        if (!this.statusbarEl) return;
        this.statusbarEl.textContent = `⏰ ${count}`;
        this.statusbarEl.style.display = count > 0 ? "" : "none";
        this.statusbarEl.setAttribute("aria-label", this.i18nText("statusbar.tip").replace("${n}", String(count)));
        this.statusbarEl.title = this.i18nText("statusbar.tip").replace("${n}", String(count));
    }

    /** i18n 取值（1.2.8 起 i18n 为 JSONValue，字符串位置统一转 string） */
    i18nText(key: string): string {
        return String(this.i18n[key] ?? key);
    }

    private scheduleTimeout(callback: () => void, delay: number): number {
        let timer = 0;
        timer = window.setTimeout(() => {
            this.timeoutIds.delete(timer);
            callback();
        }, delay);
        this.timeoutIds.add(timer);
        return timer;
    }

    async onload() {
        const self = this;
        this.settings = await loadSettings(this);
        this.runtime = await loadRuntime(this);

        // DEVICE-07（227 波）：移动前端标识 + 顶栏入口注入（petal addTopBar 在移动端不渲染；
        // 参照 checkin ensureMobileTopBarButtonFor 的注入+重试方案，点击弹全屏 Dialog 面板）
        this.isMobileFrontend = getFrontend() === "mobile" || getFrontend() === "browser-mobile";
        if (this.isMobileFrontend) {
            this.addIcons(`<symbol id="iconLvHomeApp" viewBox="0 0 32 32">
                <path d="M5 14 16 4l11 10v13a1.5 1.5 0 0 1-1.5 1.5h-6V20h-7v8.5h-6A1.5 1.5 0 0 1 5 27V14Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
            </symbol>`);
            this.ensureMobileTopBarButton();
        }

        // Tab 面板：init 时挂载 Svelte，destroy 时卸载（同一 Tab 可多次打开）
        const unmounts = new WeakMap<Element, () => void>();
        this.addTab({
            type: TAB_TYPE,
            init(this: Custom) {
                const um = mount(TabPanel, { target: this.element, props: { plugin: self } });
                unmounts.set(this.element, um as () => void);
            },
            destroy(this: Custom) {
                const um = unmounts.get(this.element);
                if (um) unmount(um as any);
            },
        });

        this.addTopBar({
            icon: "iconEmoji",
            title: String(this.i18n.butler ?? "Lv Home"),
            callback: () => this.showTab(),
        });

        this.addCommand({
            langKey: "openButler",
            // 26.7 默认热键策略：Alt+H（H=Home，避开常见组合；用户可在设置-快捷键改）
            hotkey: "Ctrl+Alt+H",
            callback: () => this.showTab(),
        });

        // schema 契约门禁（33.2；193 波收口 SCHEMA_CATALOG 单源）：开发期发现违规立即暴露
        for (const [id, schema] of Object.entries(SCHEMA_CATALOG)) {
            const errors = validateSchema(id, schema);
            if (errors.length) console.error("[siyuan-home] schema contract violations:", errors);
        }

        if (!this.settings.onboarded) {
            showMessage(this.i18nText("firstRun"), 6000, "info");
        }

        // 15 组：settings.json 损坏已回退默认 → 明确警告（诊断区可见 settings.json.corrupted.json 标记）
        if (this.settings.corruptedSettings) {
            // 269 波：损坏原因就地显示（用户不必翻 marker 文件）；时长 8s→10s 给足阅读时间
            const reason = this.settings.corruptedSettings;
            const detail = typeof reason === "string" ? `（${reason}）` : "";
            showMessage(this.i18nText("settings.corrupted") + detail, 10000, "error");
        }

        // B2d 降级定案（kernel.js 无定时器 API）：前端心跳 30min 驱动定时扫描
        this.heartbeat = window.setInterval(() => {
            this.refreshHub().catch((e) => console.warn("[siyuan-home] heartbeat scan failed:", e));
        }, 30 * 60 * 1000);

        // C6c：块菜单入口——选中文字 → 存入（URL 命中二级菜单分流：存为网址/存为地址；其余进常用语）
        this.captureMenuHandler = ((event: { detail: { menu: { addItem: (item: unknown) => void } } }) => {
            const text = (window.getSelection()?.toString() ?? "").trim();
            if (!text) return;
            if (/^https?:\/\/\S+$/i.test(text)) {
                // C6c 收尾：URL 两入口可见（子项常显，未启用模块在 label 标注，点击给引导消息）
                event.detail.menu.addItem({
                    icon: "iconInbox",
                    label: this.i18nText("capture.menuUrl"),
                    submenu: ([
                        { id: "bookmarks", labelKey: "capture.toBookmarks" },
                        { id: "address", labelKey: "capture.toAddress" },
                    ] as const).map((t) => ({
                        label: this.settings.enabledModules.includes(t.id)
                            ? this.i18nText(t.labelKey)
                            : `${this.i18nText(t.labelKey)}（${this.i18nText(`module.${t.id}`)}${this.i18nText("capture.off")}）`,
                        click: () => this.captureTo(t.id, text),
                    })),
                });
                return;
            }
            event.detail.menu.addItem({
                icon: "iconInbox",
                label: this.i18nText("capture.menu"),
                click: () => this.quickCapture(text),
            });
        }) as any;
        this.eventBus.on("open-menu-content", this.captureMenuHandler);

        // 28 组：状态栏「今日到期 N」角标（点击打开管家并预选提醒页）
        const statusEl = document.createElement("div");
        statusEl.className = "lv-statusbar";
        statusEl.style.cssText = "cursor:pointer;padding:0 6px;font-size:12px;display:none";
        statusEl.onclick = () => { this.pendingScreen = "reminders"; this.showTab(); };
        this.addStatusBar({ element: statusEl });
        this.statusbarEl = statusEl;

        // PF13/15 组：休眠/切走后恢复可见 → 补扫（错过 30min 心跳的场景）；10 分钟最小间隔合并重复触发
        this.visibilityHandler = () => {
            if (document.visibilityState !== "visible") return;
            if (Date.now() - this.lastScanAt < LvHomePlugin.WAKE_RESCAN_MIN_MS) return;
            this.refreshHub(undefined, true).catch((e) => console.warn("[siyuan-home] wake rescan failed:", e));
        };
        document.addEventListener("visibilitychange", this.visibilityHandler);

        // PF06/18 组：他端台账变更（websocket 主通道消息）→ 60 秒节流补扫（多端同步信号）
        this.wsHandler = () => {
            if (Date.now() - this.lastWsRescan < LvHomePlugin.WS_RESCAN_MIN_MS) return;
            this.lastWsRescan = Date.now();
            this.refreshHub().catch((e) => console.warn("[siyuan-home] ws rescan failed:", e));
        };
        this.eventBus.on("ws-main", this.wsHandler);

        // EC16：向雷切注册管家动作（打卡同款已验证模式：app.plugins 探测 + 方法存在性 + 重试）
        this.ensureSpeedSwitchActions();

        // EC09/EC10：启动时初始打卡摘要拉取（打卡可能已先于管家加载）
        this.scheduleTimeout(() => this.pullCheckinSummary(), 3000);

        // EC03/v0.3 生态首批：管家服务桥 window.LvHome（对齐人脉 window.LvContacts 模式；卸载注销）
        this.disposeLvHomeBridge = mountLvHomeBridge({
            settings: this.settings,
            get scan() { return self.scan; },
            showTab: () => self.showTab(),
            openRemindersTab: () => { self.pendingScreen = "reminders"; self.showTab(); },
            addMemo: (title, due) => self.addMemo(title, due),
            onBridgeDisposed: () => { self.disposeLvHomeBridge = undefined; },
        });

        // EC21：消费 lv-exam:stats 聚合（脱敏 PublicStats v1，无题目内容）——仅缓存子集供考试模块卡展示
        this.examStatsHandler = (e: Event) => {
            const detail = (e as CustomEvent).detail as {streak?: unknown; accuracy?: unknown; attempts?: unknown; generatedAt?: unknown} | undefined;
            if (!detail || typeof detail !== "object") return;
            const streak = Number(detail.streak);
            const accuracy = Number(detail.accuracy);
            const attempts = Number(detail.attempts);
            const generatedAt = Number(detail.generatedAt);
            if (![streak, accuracy, attempts, generatedAt].every((n) => Number.isFinite(n))) return;
            this.runtime.lastExamStats = {streak, accuracy, attempts, generatedAt};
            import("@/core/hub/runtime").then((m) => m.saveRuntime(this, this.runtime)).catch(() => undefined);
            this.hubListeners.forEach((fn) => fn());
        };
        window.addEventListener("lv-exam:stats", this.examStatsHandler);

        // EC09/EC10：打卡集成事件（checkin:*）→ 节流刷新健康模块卡打卡摘要
        this.checkinEventHandler = () => {
            // checkin 事件频繁（每次打卡触发）；60 秒节流后拉取强度摘要
            if (Date.now() - this.lastCheckinPull < LvHomePlugin.WS_RESCAN_MIN_MS) return;
            this.lastCheckinPull = Date.now();
            this.pullCheckinSummary();
        };
        for (const evt of ["checkin:event-recorded", "checkin:event-deleted", "checkin:item-updated"]) {
            window.addEventListener(evt, this.checkinEventHandler);
        }
        // 启动时拉取一次（打卡可能先于管家加载；SPA 中 load 已触发，用延迟替代）
        this.scheduleTimeout(() => this.pullCheckinSummary(), 5000);
    }

    /** EC09/EC10：拉取打卡强度摘要（只读；写入 runtime 供模块卡展示）[待实测] */
    private async pullCheckinSummary(): Promise<void> {
        try {
            const checkin = (window as {siyuanCheckin?: {whenReady: () => Promise<boolean>; getStrengthSummary: (o?: {windowDays?: number}) => {items: {itemId: string; name: string; score: number}[]; windowDays: number}}}).siyuanCheckin;
            if (!checkin?.whenReady || !checkin.getStrengthSummary) return;
            const ready = await checkin.whenReady();
            if (!ready) return;
            const summary = checkin.getStrengthSummary({windowDays: 30});
            if (!summary?.items?.length) return;
            this.runtime.lastCheckinSummary = {
                items: summary.items.slice(0, 5), // 有界：top 5
                windowDays: summary.windowDays,
                pulledAt: Date.now(),
            };
            const { saveRuntime } = await import("@/core/hub/runtime");
            await saveRuntime(this, this.runtime);
            this.hubListeners.forEach((fn) => fn());
        } catch (e) {
            console.warn("[siyuan-home] checkin summary pull failed:", e instanceof Error ? e.message : e);
        }
    }

    /**
     * EC17：家庭摘要快照（只读，计数有界——默认不共享标题/日期/生日/金额，EC17 边界）。
     * 形态按雷切 normalizeSnapshot 协议 v2.1：stat 英雄区 + items 行 + sourceHealth 三态。
     */
    private buildHomeSummarySnapshot(): Record<string, unknown> {
        try {
            const rems = this.scan?.reminders ?? [];
            const overdue = rems.filter((r) => r.level === "overdue").length;
            const soon = rems.filter((r) => r.level === "soon").length;
            const today = rems.filter((r) => r.daysLeft <= 0).length;
            const stale = this.scan?.stale ?? false;
            return {
                title: this.i18nText("butler"),
                stat: {value: String(today), label: this.i18nText("hub.groupOverdue")},
                items: [
                    {label: this.i18nText("hub.groupOverdue"), value: String(overdue), command: "siyuan-home::openButler"},
                    {label: this.i18nText("hub.groupSoon"), value: String(soon), command: "siyuan-home::openButler"},
                ],
                updatedAt: Date.now(),
                sourceHealth: stale ? "stale" : "fresh",
                emptyHint: rems.length === 0 ? this.i18nText("dash.allClear") : undefined,
            };
        } catch (e) {
            // 雷切约定：错误降级为空态快照 + 重试提示，不抛（见摘录 §4.1）
            console.warn("[siyuan-home] summary snapshot failed:", e instanceof Error ? e.message : e);
            return {title: this.i18nText("butler"), items: [], emptyHint: this.i18nText("hub.stale")};
        }
    }

    /** 探测雷切（manifest name = siyuan-speed-switch）并注册管家动作；未安装时限次重试后静默放弃 */
    private ensureSpeedSwitchActions(attempt = 0): void {
        if (this.speedSwitchDisposers.length > 0) return; // 已注册
        const plugins = (this.app as {plugins?: unknown} | undefined)?.plugins;
        const candidates = Array.isArray(plugins)
            ? plugins
            : plugins && typeof plugins === "object" ? Object.values(plugins as Record<string, unknown>) : [];
        const speedSwitch = candidates.find((candidate) => {
            if (!candidate || typeof candidate !== "object") return false;
            const p = candidate as {name?: unknown; registerQuickAction?: unknown};
            return typeof p.registerQuickAction === "function"
                && (p.name === "siyuan-speed-switch" || p.name === "小驴速切" || p.name === "siyuanSpeedSwitch");
        }) as {registerQuickAction?: (options: unknown) => (() => void) | void} | undefined;
        if (!speedSwitch?.registerQuickAction) {
            // 未加载（或加载顺序靠后）：1200ms 重试，上限 10 次（约 12s）后放弃——雷切本会话内再启用则下次启动生效
            if (attempt < 10 && this.speedSwitchRetry === undefined) {
                this.speedSwitchRetry = this.scheduleTimeout(() => {
                    this.speedSwitchRetry = undefined;
                    this.ensureSpeedSwitchActions(attempt + 1);
                }, 1200);
            }
            return;
        }
        const register = speedSwitch.registerQuickAction.bind(speedSwitch);
        const actions: {id: string; label: string; handler: () => void}[] = [
            {id: "lvhome.open-overview", label: this.i18nText("butler"), handler: () => this.showTab()},
            {id: "lvhome.open-reminders", label: this.i18nText("tab.reminders"), handler: () => { this.pendingScreen = "reminders"; this.showTab(); }},
        ];
        for (const action of actions) {
            const dispose = register({
                id: action.id,
                label: action.label,
                icon: "iconHome",
                value: "open",
                targets: ["desktop", "sidebar", "mobile"],
                handler: () => action.handler(),
            });
            if (typeof dispose === "function") this.speedSwitchDisposers.push(dispose);
        }
        // EC17：家庭摘要模块（只读；read 返回计数快照；clickCommand 落管家总览）
        const homeCapable = speedSwitch as {registerHomeModule?: (options: unknown) => (() => void) | void};
        if (typeof homeCapable.registerHomeModule === "function" && !this.homeModuleDisposer) {
            const dispose = homeCapable.registerHomeModule({
                moduleId: "lvhome.summary",
                title: this.i18nText("butler"),
                icon: "iconHome",
                supportedDevices: ["desktop", "sidebar", "mobile"],
                sizes: ["xs", "small", "medium"],
                protocolVersion: 1,
                readOnly: true,
                clickCommand: "siyuan-home::openButler",
                read: () => this.buildHomeSummarySnapshot(),
            });
            if (typeof dispose === "function") this.homeModuleDisposer = dispose;
        }
    }

    /** 布局就绪后：首次引导数据准备 + 建库 + 扫描（不阻塞启动） */
    async onLayoutReady() {
        try {
            await this.ensureCoreLedgers();
            await this.refreshHub(undefined, true);
        } catch (e) {
            console.warn("[siyuan-home] initial provision/scan deferred:", e instanceof Error ? e.message : e);
        }
    }

    /** members 先建（relation 目标），其余按需；幂等。启用模块才建库（P4）。
     * 12 轮修复：遍历 schemaCatalog（members 声明序居首），删除第二份手工清单防漂移 */
    async ensureCoreLedgers(): Promise<void> {
        const resolveName = (key: string) => String(this.i18n[`field.${key}`] ?? key);
        const enabled = new Set(this.settings.enabledModules);
        for (const [id, schema] of Object.entries(this.schemaCatalog)) {
            if (!enabled.has(id)) continue;
            await provisionModule(this.settings, id, schema, this.i18nText("module." + id), { resolveName });
        }
        await saveSettings(this, this.settings);
    }

    /** 扫描 → 运行态合并 → 缓存 → 每日摘要 → 通知面板。
     * PF06：传入模块范围则只实扫这些模块（写行后的增量刷新），其余沿用上次快照；
     * 20 组：非强制全量扫描 30 秒内去抖（Tab 快速开关不重复全量），force 用于手动重扫/设置变更 */
    async refreshHub(only?: string | string[], force = false): Promise<ScanResult> {
        const seq = ++this.scanSeq;
        // PF01/PF02：性能标记（PerformanceObserver / DevTools 可读取）
        const perfMark = `lvhome-scan-${seq}`;
        performance.mark(`${perfMark}-start`);
        const onlySet = only ? new Set(Array.isArray(only) ? only : [only]) : undefined;
        if (!onlySet && !force && this.lastScanAt && Date.now() - this.lastScanAt < LvHomePlugin.FULL_SCAN_MIN_MS) {
            const cached = this.scan;
            if (cached) {
                this.hubListeners.forEach((fn) => fn());
                return cached;
            }
        }
        // 264 波：行数口径收集器——providers 经 deps.onStats 上报，runScan 并入 byModule 快照
        const moduleStats = new Map<string, { rowCount: number; memberCounts: Record<string, number> }>();
        const deps = {
            settings: this.settings,
            getDbRef: (id: string) => this.settings.dbRefs[id],
            onStats: (id: string, stats: { rowCount: number; memberCounts: Record<string, number> }) => moduleStats.set(id, stats),
        };
        // 12 轮修复：provider 由 schemaCatalog 程序化派生（手工清单曾漏掉 parenting/schooling，
        // 两模块提醒从未生效）；覆盖契约见 registry.providerCoverage
        const providers = buildScanProviders(this.schemaCatalog, deps);
        const scan = await runScan(providers, this.settings, this.runtime, new Date(), onlySet, moduleStats);
        // H11：扫描期间已有更新的扫描启动（或手动动作已改运行态）→ 旧结果丢弃，不落盘不广播
        if (seq !== this.scanSeq) return scan;
        this.scan = scan;
        this.runtime.cache = {
            reminders: scan.reminders,
            counts: scan.counts,
            errors: scan.errors,
            derived: scan.derived,
            byModule: scan.byModule,
        };
        this.runtime.scannedAt = scan.scannedAt;
        // 摘要与逾期提示只在全量扫描时评估（PF06 增量扫描的数据是部分的，少报会压制当天真实提醒）
        if (!onlySet) {
            const digest = dailyDigest(scan, this.settings, this.runtime);
            if (digest.shouldNotify) {
                markNotified(this.runtime);
                const text = this.i18nText("notify.digest")
                    .replace("${overdue}", String(digest.overdue))
                    .replace("${soon}", String(digest.soon));
                showMessage(text, 6000, "info");
            }
            // B3b：逾期事项每日首次发现立即提示（H12：与摘要共用静默判断）
            const { localDateKey } = await import("@/core/hub/rule");
            const today = localDateKey(new Date());
            let pushedOverdueAlert = false;
            if (scan.counts.overdue > 0 && !inSilentHours(this.settings, this.runtime) && this.runtime.lastOverdueAlertDate !== today) {
                this.runtime.lastOverdueAlertDate = today;
                showMessage(this.i18nText("notify.overdue").replace("${n}", String(scan.counts.overdue)), 6000, "error");
                pushedOverdueAlert = true;
            }
            // 229 波：Webhook 推送（路线图"下一阶段"）——随摘要/逾期首报两个既定时点外发一次；
            // 用户显式配置才启用；失败静默（sendWebhook 内部吞错），绝不阻断本地提醒
            if (digest.shouldNotify || pushedOverdueAlert) {
                const { sendWebhook, buildDigestBody } = await import("@/core/webhook");
                const topTitles = scan.reminders
                    .filter((r) => r.level === "overdue" || (r.level === "soon" && r.daysLeft <= 7))
                    .sort((a, b) => a.daysLeft - b.daysLeft)
                    .slice(0, 3)
                    .map((r) => r.title);
                await sendWebhook(this.settings, buildDigestBody(scan.counts, topTitles));
            }
            // 29 组：每周预告（周日一次，未来 7 天清单计数；ISO 周去重）
            const weekly = weeklyPreview(scan, this.settings, this.runtime);
            if (weekly.shouldNotify) {
                markWeeklyNotified(this.runtime);
                showMessage(this.i18nText("notify.weekly").replace("${n}", String(weekly.upcoming)), 6000, "info");
            }
        }
        // H03：显式清理已完成运行态记录（未处理项永不自动删），清理结果随本次落盘
        purgeHandled(this.runtime, new Date());
        // 29 组月度应到基数：全量扫描时统计当月去重后到期提醒总数（增量扫描不更新，避免少报）
        if (!onlySet) {
            const now = new Date();
            const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            const dueIds = new Set(scan.reminders.filter((r) => r.daysLeft <= 0).map((r) => r.id));
            this.runtime.monthlyDueTotals = { ...(this.runtime.monthlyDueTotals ?? {}), [monthKey]: dueIds.size };
            // 266 波模块趋势条：记录当日各模块待办计数（滚动 14 天，同日覆盖），供总览模块卡 spark 渲染
            const { recordModuleHistory } = await import("@/core/hub/runtime");
            recordModuleHistory(this.runtime, scan.reminders, now);
        }
        await saveRuntime(this, this.runtime);
        this.lastScanAt = Date.now();
        performance.mark(`${perfMark}-end`);
        try { performance.measure(perfMark, `${perfMark}-start`, `${perfMark}-end`); } catch { /* PF01 测量标记 */ }
        const todayDue = scan.reminders.filter((r) => r.daysLeft <= 0).length;
        this.updateStatusbar(todayDue);
        this.hubListeners.forEach((fn) => fn());
        return scan;
    }

    /**
     * 动作后即时刷新（H02）：免重扫，从缓存派生列表重算可见集合并广播全部面板。
     * 动作只改运行态，不回写台账（renew 除外——走 refreshHub 全量扫描）。
     */
    async notifyHubChanged(): Promise<void> {
        const { reminders, counts } = deriveVisible(
            this.runtime.cache?.derived ?? [],
            this.settings,
            this.runtime,
        );
        this.scan = {
            ...(this.scan ?? {
                reminders, counts, scannedAt: this.runtime.scannedAt ?? new Date().toISOString(),
                errors: [], stale: false, derived: this.runtime.cache?.derived ?? [], byModule: this.runtime.cache?.byModule ?? {},
            }),
            reminders,
            counts,
        };
        this.runtime.cache = {
            reminders,
            counts,
            errors: this.runtime.cache?.errors ?? [],
            derived: this.runtime.cache?.derived ?? [],
            byModule: this.runtime.cache?.byModule ?? {},
        };
        try {
            await saveRuntime(this, this.runtime);
        } catch (e) {
            console.warn("[siyuan-home] runtime save after action failed:", e instanceof Error ? e.message : e);
        }
        this.updateStatusbar(reminders.filter((r) => r.daysLeft <= 0).length);
        this.hubListeners.forEach((fn) => fn());
    }

    /**
     * C6c：选中文字快速存入（非 URL → snippets.content）。
     */
    async quickCapture(text: string) {
        if (/^https?:\/\/\S+$/i.test(text)) return; // URL 走块菜单二级分流（capture.menuUrl 子项）
        await this.captureTo("snippets", text);
    }

    /**
     * C6c 收尾：按目标模块写入——bookmarks.url / address.address_full / snippets.content
     * （存入字段与各模块 capture 一致；address 场景=收货/登记地址，全文入 address_full）。
     * 模块未启用给引导；失败保留原文（文本本就在原文档中，不丢数据）。
     */
    async captureTo(moduleId: "bookmarks" | "address" | "snippets", text: string) {
        if (!this.settings.enabledModules.includes(moduleId)) {
            showMessage(this.i18nText("capture.moduleOff").replace("${module}", this.i18nText(`module.${moduleId}`)), 5000, "info");
            return;
        }
        try {
            await this.ensureCoreLedgers();
            const ref = this.settings.dbRefs[moduleId];
            if (!ref?.avId || !ref.columns) throw new Error("ledger not provisioned");
            const targetCol = moduleId === "bookmarks" ? ref.columns.url
                : moduleId === "address" ? ref.columns.address_full
                : ref.columns.content;
            // 目标列缺失时必须在建行前失败，避免留下无法写入正文的空行并误报成功。
            if (!targetCol) throw new Error(`target column unavailable: ${moduleId}`);
            // 码点安全截断（Array.from 按 Unicode 码点切，emoji/生僻字不被劈成乱码）
            const name = Array.from(text).length > 40 ? `${Array.from(text).slice(0, 40).join("")}…` : text;
            const itemID = await addDetachedRow(ref.avId, name);
            await setCell(ref.avId, targetCol, itemID, moduleId === "bookmarks"
                ? { type: "url", url: { content: text } }
                : { type: "text", text: { content: text } });
            showMessage(this.i18nText("capture.saved").replace("${module}", this.i18nText(`module.${moduleId}`)), 3000, "info");
            // 常用语/书签/地址无提醒规则——写入不触发扫描（PF06：无相关变更不重扫）
        } catch (e) {
            const { coalescedNotify } = await import("@/libs/notify-queue");
            coalescedNotify("capture-failed", () =>
                showMessage(this.i18nText("capture.failed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error"));
        }
    }

    showTab() {
        // 已有管家页签时聚焦而非新开（重复点顶栏/命令不再堆叠页签，225 波真机发现）。
        // 前端无公开的"聚焦已开自定义页签"API——走页签头 DOM 事件（与用户点击同源行为）；
        // 多开的旧页签逐个点其关闭钮回收（对象全部是本插件的页签）。
        const title = this.i18nText("butler");
        const heads = Array.from(document.querySelectorAll<HTMLElement>(".layout-tab-bar .item"));
        const mine = heads.filter((h) => h.querySelector(".item__text")?.textContent?.trim() === title);
        if (mine.length) {
            for (const h of mine.slice(0, -1)) h.querySelector(".item__close")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            mine[mine.length - 1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
            return;
        }
        openTab({
            app: this.app,
            custom: {
                id: `${this.name}${TAB_TYPE}`,
                title,
                icon: "iconHome",
            },
        });
    }

    /** 移动前端顶栏入口（DEVICE-07）：petal addTopBar 在移动端不渲染，直接注入 #mobileTopBar；
     *  顶栏未就绪时 800ms 重试（参照 checkin ensureMobileTopBarButtonFor）。
     *  227 波实测两处坑：① 移动工具栏在插件 onload 之后异步重建，会吞掉先注入的按钮 → 启动后
     *  30s 内轻量自查重挂；② 不得回退挂 #toolbar（桌面元素，移动端隐藏且先于 mobileTopBar 出现）。 */
    private ensureMobileTopBarButton() {
        if (!this.isMobileFrontend) return;
        const topBar = document.getElementById("mobileTopBar");
        if (!topBar) {
            this.mobileTopBarRetry = this.scheduleTimeout(() => {
                this.mobileTopBarRetry = undefined;
                this.ensureMobileTopBarButton();
            }, 800);
            return;
        }
        if (this.mobileTopBarBtn?.isConnected || topBar.querySelector("#lvHomeMobileTopBarButton")) return;
        const button = document.createElement("button");
        button.type = "button";
        button.id = "lvHomeMobileTopBarButton";
        button.className = "toolbar__button";
        const label = this.i18nText("entry.mobile");
        button.setAttribute("aria-label", label);
        button.setAttribute("title", label);
        button.innerHTML = `<svg aria-hidden="true"><use xlink:href="#iconLvHomeApp"></use></svg>`;
        button.addEventListener("click", () => this.openMobilePanel());
        topBar.appendChild(button);
        this.mobileTopBarBtn = button;
        for (const delay of [1500, 4000, 10000, 20000, 30000]) {
            this.scheduleTimeout(() => this.ensureMobileTopBarButton(), delay);
        }
    }

    /** 移动端面板：全屏 Dialog 承载同一 TabPanel（移动端自定义页签不可达，fail-closed 走弹层）。 */
    private openMobilePanel() {
        if (this.mobileDialog) {
            this.mobileDialog.destroy();
            return;
        }
        const self = this;
        const dialog = new Dialog({
            title: this.i18nText("butler"),
            content: `<div class="lv-mobile-host"></div>`,
            width: "100vw",
            height: "100dvh",
            destroyCallback: () => {
                if (self.mobileDialogUnmount) {
                    try { self.mobileDialogUnmount(); } catch { /* 已卸载 */ }
                    self.mobileDialogUnmount = undefined;
                }
                if (self.mobileDialog === dialog) self.mobileDialog = undefined;
            },
        });
        const host = dialog.element.querySelector(".lv-mobile-host") as HTMLElement;
        if (!host) {
            dialog.destroy();
            return;
        }
        // 全屏化样式钩子（100vw/100dvh、无圆角、内容滚动）
        dialog.element.classList.add("b3-dialog--lvmobile");
        this.mobileDialogUnmount = mount(TabPanel, { target: host, props: { plugin: self } }) as () => void;
        this.mobileDialog = dialog;
    }

    /** 打开台账文档（R5 降级定位） */
    showTabDocs(docId?: string) {
        const docId0 = docId ?? this.settings.dbRefs[this.activeLedger]?.docId;
        if (!docId0) return;
        openTab({ app: this.app, doc: { id: docId0 } });
    }

    activeLedger = "certs";
    setActiveLedger(id: string) { this.activeLedger = id; }

    /** 诊断数据（33.5/A6）：台账落点状态、最近扫描、扫描错误、schema 契约 */
    getDiagnostics() {
        return {
            version: PLUGIN_VERSION,
            scannedAt: this.runtime?.scannedAt,
            errors: this.scan?.errors ?? [],
            ledgers: Object.entries(this.settings.dbRefs).map(([id, ref]: [string, any]) => ({
                id,
                provisioned: !!ref?.docId,
                provisional: !!ref?.provisional,
                columns: Object.keys(ref?.columns ?? {}).length,
                error: ref?.provisionError,
            })),
            contracts: [
                validateSchema("members", SCHEMA_CATALOG.members),
                validateSchema("certs", SCHEMA_CATALOG.certs),
            ].flat(),
        };
    }

    // ── 提醒动作（B4 + H05/H07，转发 actions.ts；动作后 notifyHubChanged 即时刷新）──
    async complete(r: any) { await complete(this, r); await this.notifyHubChanged(); }
    async snooze(id: string, days: number) { await snooze(this, id, days); await this.notifyHubChanged(); }
    async mute(id: string) { await mute(this, id); await this.notifyHubChanged(); }
    async unmute(id: string) { await unmute(this, id); await this.notifyHubChanged(); }
    /** 恢复已处理/忽略项（H07） */
    async restore(id: string) { await restore(this, id); await this.notifyHubChanged(); }
    /** 续期写回台账行（H10：按规则自己的 field 列，缴费不改保障到期日）→ 增量重扫该模块 */
    renew(r: any, iso: string) {
        const rule = (this.schemaCatalog[r.moduleId]?.reminders ?? []).find((x: any) => x.key === r.ruleKey);
        return renew(this, r, iso, this.settings.dbRefs[r.moduleId] ?? {}, rule?.field ?? "expiry")
            .then(() => this.refreshHub(r.moduleId));
    }
    async addMemo(title: string, due: string) { await addMemo(this, title, due); await this.notifyHubChanged(); }
    async updateMemo(id: string, patch: { title?: string; dueDate?: string }) { await updateMemo(this, id, patch); await this.notifyHubChanged(); }
    /** 删除备忘（显式动作，H03：未处理备忘只经此删除） */
    async removeMemo(id: string) { await removeMemo(this, id); await this.notifyHubChanged(); }
    /** 已处理视图数据（H07） */
    listHandled() { return listHandled(this.runtime, this.runtime.cache?.derived ?? []); }
    async finishOnboarding(household: { roles: string[]; children: number }, moduleIds: string[]) {
        this.settings.household = household as any;
        this.settings.enabledModules = Array.from(new Set([...this.settings.enabledModules, ...moduleIds]));
        this.settings.onboarded = true;
        // C7c：建库批处理进度提示（31 模块串行需数秒；起止均有反馈，失败落 dbRefs.provisionError 诊断可见）
        showMessage(this.i18nText("wiz.provisioning").replace("${n}", String(moduleIds.length)), 4000, "info");
        await this.ensureCoreLedgers();
        await saveSettings(this, this.settings);
        // C7c 收尾：建库失败浮出（此前只进诊断区，向导完成后用户无感）
        const failed = Object.entries(this.settings.dbRefs)
            .filter(([id, ref]) => this.settings.enabledModules.includes(id) && (ref as any)?.provisionError)
            .map(([id]) => this.i18nText(`module.${id}`));
        if (failed.length > 0) {
            showMessage(this.i18nText("wiz.provisionIssues")
                .replace("${n}", String(failed.length))
                .replace("${modules}", failed.join("、")), 8000, "error");
        } else {
            showMessage(this.i18nText("wiz.provisioned").replace("${n}", String(moduleIds.length)), 3000, "info");
        }
        await this.refreshHub();
    }

    /** Tab 面板挂载入口（tab callback 由框架调 addTab 注册的 destroy 之外回调） */
    mountPanel(element: HTMLElement) {
        const unmount = mount(TabPanel, {
            target: element,
            props: { plugin: this },
        });
        return unmount;
    }

    openSetting() {
        svelteDialog({
            title: this.i18nText("settingsTitle"),
            component: HomeSettingsPanel,
            props: { plugin: this, settings: this.settings },
            width: "860px",
        });
    }

    onunload() {
        if (this.heartbeat) window.clearInterval(this.heartbeat);
        this.heartbeat = undefined;
        for (const timer of this.timeoutIds) window.clearTimeout(timer);
        this.timeoutIds.clear();
        // DEVICE-07：移动顶栏按钮/重试计时器/全屏面板清理
        if (this.mobileTopBarRetry !== undefined) {
            window.clearTimeout(this.mobileTopBarRetry);
            this.mobileTopBarRetry = undefined;
        }
        this.mobileTopBarBtn?.remove();
        this.mobileTopBarBtn = undefined;
        if (this.mobileDialog) {
            try { this.mobileDialog.destroy(); } catch { /* 已销毁 */ }
            this.mobileDialog = undefined;
        }
        // 18 组清理审计：面板 destroy 时自行移除 listener，此处兜底清空；
        // scanSeq 自增使在途扫描结果失效（H11：卸载后不落盘/不通知/不更新 UI）；
        // 块菜单监听与状态栏角标解绑/移除；可见性补扫解绑；ws 补扫解绑
        if (this.captureMenuHandler) this.eventBus.off("open-menu-content", this.captureMenuHandler);
        this.captureMenuHandler = undefined;
        if (this.visibilityHandler) document.removeEventListener("visibilitychange", this.visibilityHandler);
        this.visibilityHandler = undefined;
        if (this.wsHandler) this.eventBus.off("ws-main", this.wsHandler);
        this.wsHandler = undefined;
        // EC21：lv-exam:stats 监听移除
        if (this.examStatsHandler) window.removeEventListener("lv-exam:stats", this.examStatsHandler);
        this.examStatsHandler = undefined;
        // EC09/EC10：打卡集成事件移除
        if (this.checkinEventHandler) {
            for (const evt of ["checkin:event-recorded", "checkin:event-deleted", "checkin:item-updated"]) {
                window.removeEventListener(evt, this.checkinEventHandler);
            }
            this.checkinEventHandler = undefined;
        }
        // EC03/v0.3：服务桥卸载（delete window.LvHome）
        if (this.disposeLvHomeBridge) this.disposeLvHomeBridge();
        this.disposeLvHomeBridge = undefined;
        // EC16：雷切动作注销 + 重试计时器清理
        if (this.speedSwitchRetry !== undefined) {
            window.clearTimeout(this.speedSwitchRetry);
            this.speedSwitchRetry = undefined;
        }
        for (const dispose of this.speedSwitchDisposers) {
            try { dispose(); } catch { /* 雷切可能已卸载——注销失败即无需注销 */ }
        }
        this.speedSwitchDisposers = [];
        // EC17：家庭摘要模块注销
        if (this.homeModuleDisposer) {
            try { this.homeModuleDisposer(); } catch { /* 雷切可能已卸载 */ }
            this.homeModuleDisposer = undefined;
        }
        this.statusbarEl?.remove();
        this.statusbarEl = undefined;
        this.hubListeners.clear();
        this.scanSeq++;
    }
}
