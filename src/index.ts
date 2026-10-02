import { Plugin, showMessage, openTab, Custom } from "siyuan";
import { mount, unmount } from "svelte";
import "./index.scss";

import TabPanel from "@/panels/tab-panel.svelte";
import HomeSettingsPanel from "@/panels/settings.svelte";
import { svelteDialog } from "@/libs/dialog";
import { loadSettings, saveSettings } from "@/core/settings";
import { loadRuntime, saveRuntime, purgeHandled, listHandled, type HubRuntime } from "@/core/hub/runtime";
import { runScan, deriveVisible, type ScanResult } from "@/core/hub/scanner";
import { CertsProvider, MembersProvider, SchemaLedgerProvider, NumericRuleProvider } from "@/core/hub/providers";
import { dailyDigest, markNotified, inSilentHours } from "@/core/hub/notify";
import { complete, snooze, mute, unmute, renew, restore, addMemo, removeMemo } from "@/core/hub/actions";
import { provisionModule } from "@/core/provisioner";
import { addDetachedRow, setCell } from "@/core/siyuan";
import { CERTS_SCHEMA, MEMBERS_SCHEMA, MEDICINE_SCHEMA, MEMBERSHIPS_SCHEMA, INSURANCE_SCHEMA, SHOPPING_SCHEMA, CONTRACTS_SCHEMA, EXAMS_SCHEMA, ALLOWANCE_SCHEMA, FAVORS_SCHEMA, STOCK_SCHEMA, CHORES_SCHEMA, HOUSE_SCHEMA, MEDIA_SCHEMA, PETS_SCHEMA, VEHICLES_SCHEMA, TRANSIT_SCHEMA, TRAVEL_PLAN_SCHEMA, TRAVEL_BOOKING_SCHEMA, TRAVEL_PACKING_SCHEMA, TRAVEL_LOG_SCHEMA, ASSETS_VIRTUAL_SCHEMA, ASSETS_REAL_SCHEMA, HEALTH_SCHEMA, FOOD_SCHEMA, ADDRESS_SCHEMA, BOOKMARKS_SCHEMA, SNIPPETS_SCHEMA, PARENTING_SCHEMA, SCHOOLING_SCHEMA, SOCIAL_SCHEMA, validateSchema } from "@/core/schema";
import type { HomeSettings } from "@/types";

const TAB_TYPE = "hub-tab";
/** 版本显示（诊断/关于）；发布时与 package.json/plugin.json 同步（update-version script 覆盖 dist 元数据） */
const PLUGIN_VERSION = "0.2.0";

/**
 * 小驴管家（Lv Home）
 * 家庭与生活管家：成员档案 · 资产 · 育儿上学 · 病历社保 · 影音书库 · 出行旅行
 */
export default class LvHomePlugin extends Plugin {
    settings: HomeSettings;
    runtime: HubRuntime;
    scan: ScanResult;
    private heartbeat: number | undefined;
    /** moduleId → schema 目录（UI 按需读取列定义/枚举；与 ensureCoreLedgers 同源） */
    schemaCatalog: Record<string, any> = {
        members: MEMBERS_SCHEMA, certs: CERTS_SCHEMA,
        "assets-real": ASSETS_REAL_SCHEMA, health: HEALTH_SCHEMA,
        medicine: MEDICINE_SCHEMA, memberships: MEMBERSHIPS_SCHEMA, insurance: INSURANCE_SCHEMA,
        shopping: SHOPPING_SCHEMA, contracts: CONTRACTS_SCHEMA, exams: EXAMS_SCHEMA,
        allowance: ALLOWANCE_SCHEMA, favors: FAVORS_SCHEMA, stock: STOCK_SCHEMA,
        chores: CHORES_SCHEMA, house: HOUSE_SCHEMA,
        media: MEDIA_SCHEMA, pets: PETS_SCHEMA, vehicles: VEHICLES_SCHEMA, transit: TRANSIT_SCHEMA,
        "travel-plan": TRAVEL_PLAN_SCHEMA, "travel-booking": TRAVEL_BOOKING_SCHEMA,
        "travel-packing": TRAVEL_PACKING_SCHEMA, "travel-log": TRAVEL_LOG_SCHEMA,
        "assets-virtual": ASSETS_VIRTUAL_SCHEMA,
        food: FOOD_SCHEMA, address: ADDRESS_SCHEMA, bookmarks: BOOKMARKS_SCHEMA, snippets: SNIPPETS_SCHEMA,
        parenting: PARENTING_SCHEMA, schooling: SCHOOLING_SCHEMA, social: SOCIAL_SCHEMA,
    };
    /** Tab 面板刷新回调（支持多实例，33.1：所有打开的管家面板同步刷新） */
    hubListeners = new Set<() => void>();
    /** 扫描序号（H11）：慢的旧扫描不得覆写新扫描结果或之后的手动动作 */
    private scanSeq = 0;
    /** 下次面板挂载的目标页签（状态栏/通知入口预选） */
    pendingScreen?: string;
    private statusbarEl?: HTMLElement;
    /** C6c 块菜单监听（onunload 精确解绑用） */
    private captureMenuHandler?: (...args: any[]) => void;
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

    async onload() {
        const self = this;
        this.settings = await loadSettings(this);
        this.runtime = await loadRuntime(this);

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

        // schema 契约门禁（33.2）：开发期发现违规立即暴露
        const allSchemas: [string, any][] = [
            ["members", MEMBERS_SCHEMA], ["certs", CERTS_SCHEMA],
            ["assets-real", ASSETS_REAL_SCHEMA], ["health", HEALTH_SCHEMA],
            ["medicine", MEDICINE_SCHEMA], ["memberships", MEMBERSHIPS_SCHEMA], ["insurance", INSURANCE_SCHEMA],
            ["shopping", SHOPPING_SCHEMA], ["contracts", CONTRACTS_SCHEMA], ["exams", EXAMS_SCHEMA],
            ["allowance", ALLOWANCE_SCHEMA], ["favors", FAVORS_SCHEMA], ["stock", STOCK_SCHEMA],
            ["chores", CHORES_SCHEMA], ["house", HOUSE_SCHEMA],
            ["media", MEDIA_SCHEMA], ["pets", PETS_SCHEMA], ["vehicles", VEHICLES_SCHEMA], ["transit", TRANSIT_SCHEMA],
            ["travel-plan", TRAVEL_PLAN_SCHEMA], ["travel-booking", TRAVEL_BOOKING_SCHEMA],
            ["travel-packing", TRAVEL_PACKING_SCHEMA], ["travel-log", TRAVEL_LOG_SCHEMA],
            ["assets-virtual", ASSETS_VIRTUAL_SCHEMA],
            ["food", FOOD_SCHEMA], ["address", ADDRESS_SCHEMA], ["bookmarks", BOOKMARKS_SCHEMA],
            ["snippets", SNIPPETS_SCHEMA], ["parenting", PARENTING_SCHEMA], ["schooling", SCHOOLING_SCHEMA],
            ["social", SOCIAL_SCHEMA],
        ];
        for (const [id, schema] of allSchemas) {
            const errors = validateSchema(id, schema);
            if (errors.length) console.error("[siyuan-home] schema contract violations:", errors);
        }

        if (!this.settings.onboarded) {
            showMessage(this.i18nText("firstRun"), 6000, "info");
        }

        // B2d 降级定案（kernel.js 无定时器 API）：前端心跳 30min 驱动定时扫描
        this.heartbeat = window.setInterval(() => {
            this.refreshHub().catch((e) => console.warn("[siyuan-home] heartbeat scan failed:", e));
        }, 30 * 60 * 1000);

        // C6c：块菜单入口——选中文字 → 存为常用语/网址（URL 形态分流到 bookmarks，其余进 snippets）
        this.captureMenuHandler = ((event: { detail: { menu: { addItem: (item: unknown) => void } } }) => {
            const text = (window.getSelection()?.toString() ?? "").trim();
            if (!text) return;
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
    }

    /** 布局就绪后：首次引导数据准备 + 建库 + 扫描（不阻塞启动） */
    async onLayoutReady() {
        try {
            await this.ensureCoreLedgers();
            await this.refreshHub();
        } catch (e) {
            console.warn("[siyuan-home] initial provision/scan deferred:", e instanceof Error ? e.message : e);
        }
    }

    /** members 先建（relation 目标），其余按需；幂等。启用模块才建库（P4） */
    async ensureCoreLedgers(): Promise<void> {
        const resolveName = (key: string) => String(this.i18n[`field.${key}`] ?? key);
        const enabled = new Set(this.settings.enabledModules);
        const plans: [string, any, string][] = [
            ["members", MEMBERS_SCHEMA, this.i18nText("module.members")],
            ["certs", CERTS_SCHEMA, this.i18nText("module.certs")],
            ["assets-real", ASSETS_REAL_SCHEMA, this.i18nText("module.assets-real")],
            ["health", HEALTH_SCHEMA, this.i18nText("module.health")],
            ["medicine", MEDICINE_SCHEMA, this.i18nText("module.medicine")],
            ["memberships", MEMBERSHIPS_SCHEMA, this.i18nText("module.memberships")],
            ["insurance", INSURANCE_SCHEMA, this.i18nText("module.insurance")],
            ["shopping", SHOPPING_SCHEMA, this.i18nText("module.shopping")],
            ["contracts", CONTRACTS_SCHEMA, this.i18nText("module.contracts")],
            ["exams", EXAMS_SCHEMA, this.i18nText("module.exams")],
            ["allowance", ALLOWANCE_SCHEMA, this.i18nText("module.allowance")],
            ["favors", FAVORS_SCHEMA, this.i18nText("module.favors")],
            ["stock", STOCK_SCHEMA, this.i18nText("module.stock")],
            ["chores", CHORES_SCHEMA, this.i18nText("module.chores")],
            ["house", HOUSE_SCHEMA, this.i18nText("module.house")],
            ["media", MEDIA_SCHEMA, this.i18nText("module.media")],
            ["pets", PETS_SCHEMA, this.i18nText("module.pets")],
            ["vehicles", VEHICLES_SCHEMA, this.i18nText("module.vehicles")],
            ["transit", TRANSIT_SCHEMA, this.i18nText("module.transit")],
            ["travel-plan", TRAVEL_PLAN_SCHEMA, this.i18nText("module.travel-plan")],
            ["travel-booking", TRAVEL_BOOKING_SCHEMA, this.i18nText("module.travel-booking")],
            ["travel-packing", TRAVEL_PACKING_SCHEMA, this.i18nText("module.travel-packing")],
            ["travel-log", TRAVEL_LOG_SCHEMA, this.i18nText("module.travel-log")],
            ["assets-virtual", ASSETS_VIRTUAL_SCHEMA, this.i18nText("module.assets-virtual")],
            ["food", FOOD_SCHEMA, this.i18nText("module.food")],
            ["address", ADDRESS_SCHEMA, this.i18nText("module.address")],
            ["bookmarks", BOOKMARKS_SCHEMA, this.i18nText("module.bookmarks")],
            ["snippets", SNIPPETS_SCHEMA, this.i18nText("module.snippets")],
            ["parenting", PARENTING_SCHEMA, this.i18nText("module.parenting")],
            ["schooling", SCHOOLING_SCHEMA, this.i18nText("module.schooling")],
            ["social", SOCIAL_SCHEMA, this.i18nText("module.social")],
        ];
        for (const [id, schema] of plans) {
            if (!enabled.has(id)) continue;
            await provisionModule(this.settings, id, schema, this.i18nText("module." + id), { resolveName });
        }
        await saveSettings(this, this.settings);
    }

    /** 扫描 → 运行态合并 → 缓存 → 每日摘要 → 通知面板 */
    async refreshHub(): Promise<ScanResult> {
        const seq = ++this.scanSeq;
        const deps = { settings: this.settings, getDbRef: (id: string) => this.settings.dbRefs[id] };
        const providers = [
            new CertsProvider(deps),
            new MembersProvider(deps),
            new SchemaLedgerProvider("assets-real", ASSETS_REAL_SCHEMA, deps),
            new SchemaLedgerProvider("health", HEALTH_SCHEMA, deps),
            new SchemaLedgerProvider("medicine", MEDICINE_SCHEMA, deps),
            new NumericRuleProvider("medicine", MEDICINE_SCHEMA, deps), // H15 低库存（数值侧）
            new SchemaLedgerProvider("memberships", MEMBERSHIPS_SCHEMA, deps),
            new SchemaLedgerProvider("insurance", INSURANCE_SCHEMA, deps),
            new SchemaLedgerProvider("contracts", CONTRACTS_SCHEMA, deps),
            new SchemaLedgerProvider("exams", EXAMS_SCHEMA, deps),
            new SchemaLedgerProvider("stock", STOCK_SCHEMA, deps),
            new NumericRuleProvider("stock", STOCK_SCHEMA, deps), // H15 囤货低库存
            new SchemaLedgerProvider("chores", CHORES_SCHEMA, deps),
            new SchemaLedgerProvider("house", HOUSE_SCHEMA, deps),
            new SchemaLedgerProvider("pets", PETS_SCHEMA, deps),
            new SchemaLedgerProvider("vehicles", VEHICLES_SCHEMA, deps),
            new SchemaLedgerProvider("transit", TRANSIT_SCHEMA, deps),
            new SchemaLedgerProvider("travel-plan", TRAVEL_PLAN_SCHEMA, deps),
            new SchemaLedgerProvider("assets-virtual", ASSETS_VIRTUAL_SCHEMA, deps),
        ];
        const scan = await runScan(providers, this.settings, this.runtime);
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
        if (scan.counts.overdue > 0 && !inSilentHours(this.settings) && this.runtime.lastOverdueAlertDate !== today) {
            this.runtime.lastOverdueAlertDate = today;
            showMessage(this.i18nText("notify.overdue").replace("${n}", String(scan.counts.overdue)), 6000, "error");
        }
        // H03：显式清理已完成运行态记录（未处理项永不自动删），清理结果随本次落盘
        purgeHandled(this.runtime, new Date());
        await saveRuntime(this, this.runtime);
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
     * C6c：选中文字快速存入（URL 形态 → bookmarks.url；其余 → snippets.content）。
     * 模块未启用给引导；失败保留原文在剪贴板（文本本就在原文档中，不丢数据）。
     */
    async quickCapture(text: string) {
        const looksUrl = /^https?:\/\/\S+$/i.test(text);
        const moduleId = looksUrl ? "bookmarks" : "snippets";
        if (!this.settings.enabledModules.includes(moduleId)) {
            showMessage(this.i18nText("capture.moduleOff").replace("${module}", this.i18nText(`module.${moduleId}`)), 5000, "info");
            return;
        }
        try {
            await this.ensureCoreLedgers();
            const ref = this.settings.dbRefs[moduleId];
            if (!ref?.avId || !ref.columns) throw new Error("ledger not provisioned");
            const name = text.length > 40 ? `${text.slice(0, 40)}…` : text;
            const itemID = await addDetachedRow(ref.avId, name);
            const targetCol = looksUrl ? ref.columns.url : ref.columns.content;
            if (targetCol) {
                await setCell(ref.avId, targetCol, itemID, looksUrl
                    ? { type: "url", url: { content: text } }
                    : { type: "text", text: { content: text } });
            }
            showMessage(this.i18nText("capture.saved").replace("${module}", this.i18nText(`module.${moduleId}`)), 3000, "info");
            await this.refreshHub();
        } catch (e) {
            showMessage(this.i18nText("capture.failed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        }
    }

    showTab() {
        openTab({
            app: this.app,
            custom: {
                id: `${this.name}${TAB_TYPE}`,
                title: this.i18nText("butler"),
                icon: "iconHome",
            },
        });
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
                validateSchema("members", MEMBERS_SCHEMA),
                validateSchema("certs", CERTS_SCHEMA),
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
    /** 续期写回台账行（H10：按规则自己的 field 列，缴费不改保障到期日）→ 全量扫描重算 due */
    renew(r: any, iso: string) {
        const rule = (this.schemaCatalog[r.moduleId]?.reminders ?? []).find((x: any) => x.key === r.ruleKey);
        return renew(this, r, iso, this.settings.dbRefs[r.moduleId] ?? {}, rule?.field ?? "expiry")
            .then(() => this.refreshHub());
    }
    async addMemo(title: string, due: string) { await addMemo(this, title, due); await this.notifyHubChanged(); }
    /** 删除备忘（显式动作，H03：未处理备忘只经此删除） */
    async removeMemo(id: string) { await removeMemo(this, id); await this.notifyHubChanged(); }
    /** 已处理视图数据（H07） */
    listHandled() { return listHandled(this.runtime, this.runtime.cache?.derived ?? []); }
    async finishOnboarding(household: { roles: string[]; children: number }, moduleIds: string[]) {
        this.settings.household = household as any;
        this.settings.enabledModules = Array.from(new Set([...this.settings.enabledModules, ...moduleIds]));
        this.settings.onboarded = true;
        await this.ensureCoreLedgers();
        await saveSettings(this, this.settings);
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
        // 18 组清理审计：面板 destroy 时自行移除 listener，此处兜底清空；
        // scanSeq 自增使在途扫描结果失效（H11：卸载后不落盘/不通知/不更新 UI）；
        // 块菜单监听与状态栏角标解绑/移除
        if (this.captureMenuHandler) this.eventBus.off("open-menu-content", this.captureMenuHandler);
        this.captureMenuHandler = undefined;
        this.statusbarEl?.remove();
        this.statusbarEl = undefined;
        this.hubListeners.clear();
        this.scanSeq++;
    }
}
