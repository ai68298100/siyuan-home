import { Plugin, showMessage, openTab } from "siyuan";
import { mount, unmount } from "svelte";
import "./index.scss";

import TabPanel from "@/panels/tab-panel.svelte";
import HomeSettingsPanel from "@/panels/settings.svelte";
import { svelteDialog } from "@/libs/dialog";
import { loadSettings, saveSettings } from "@/core/settings";
import { loadRuntime, saveRuntime, type HubRuntime } from "@/core/hub/runtime";
import { runScan, type ScanResult } from "@/core/hub/scanner";
import { CertsProvider, MembersProvider, SchemaLedgerProvider } from "@/core/hub/providers";
import { dailyDigest, markNotified } from "@/core/hub/notify";
import { complete, snooze, mute, unmute, renew, addMemo } from "@/core/hub/actions";
import { provisionModule } from "@/core/provisioner";
import { CERTS_SCHEMA, MEMBERS_SCHEMA, MEDICINE_SCHEMA, MEMBERSHIPS_SCHEMA, INSURANCE_SCHEMA, SHOPPING_SCHEMA, CONTRACTS_SCHEMA, EXAMS_SCHEMA, ALLOWANCE_SCHEMA, FAVORS_SCHEMA, STOCK_SCHEMA, CHORES_SCHEMA, HOUSE_SCHEMA, validateSchema } from "@/core/schema";
import type { HomeSettings } from "@/types";

const TAB_TYPE = "hub-tab";

/**
 * 小驴管家（Lv Home）
 * 家庭与生活管家：成员档案 · 资产 · 育儿上学 · 病历社保 · 影音书库 · 出行旅行
 */
export default class LvHomePlugin extends Plugin {
    settings: HomeSettings;
    runtime: HubRuntime;
    scan: ScanResult;
    private heartbeat: number | undefined;
    /** Tab 面板刷新回调（支持多实例，33.1：所有打开的管家面板同步刷新） */
    hubListeners = new Set<() => void>();

    async onload() {
        const self = this;
        this.settings = await loadSettings(this);
        this.runtime = await loadRuntime(this);

        // Tab 面板：init 时挂载 Svelte，destroy 时卸载（同一 Tab 可多次打开）
        const unmounts = new WeakMap<Element, () => void>();
        this.addTab({
            type: TAB_TYPE,
            init(this: { element: HTMLElement }) {
                const um = mount(TabPanel, { target: this.element, props: { plugin: self } });
                unmounts.set(this.element, um as () => void);
            },
            destroy(this: { element: HTMLElement }) {
                const um = unmounts.get(this.element);
                if (um) unmount(um as any);
            },
        });

        this.addTopBar({
            icon: "iconEmoji",
            title: this.i18n.butler,
            callback: () => this.showTab(),
        });

        this.addCommand({
            langKey: "openButler",
            hotkey: "",
            callback: () => this.showTab(),
        });

        // schema 契约门禁（33.2）：开发期发现违规立即暴露
        const allSchemas: [string, any][] = [
            ["members", MEMBERS_SCHEMA], ["certs", CERTS_SCHEMA],
            ["medicine", MEDICINE_SCHEMA], ["memberships", MEMBERSHIPS_SCHEMA], ["insurance", INSURANCE_SCHEMA],
            ["shopping", SHOPPING_SCHEMA], ["contracts", CONTRACTS_SCHEMA], ["exams", EXAMS_SCHEMA],
            ["allowance", ALLOWANCE_SCHEMA], ["favors", FAVORS_SCHEMA], ["stock", STOCK_SCHEMA],
            ["chores", CHORES_SCHEMA], ["house", HOUSE_SCHEMA],
        ];
        for (const [id, schema] of allSchemas) {
            const errors = validateSchema(id, schema);
            if (errors.length) console.error("[siyuan-home] schema contract violations:", errors);
        }

        if (!this.settings.onboarded) {
            showMessage(this.i18n.firstRun, 6000, "info");
        }

        // B2d 降级定案（kernel.js 无定时器 API）：前端心跳 30min 驱动定时扫描
        this.heartbeat = window.setInterval(() => {
            this.refreshHub().catch((e) => console.warn("[siyuan-home] heartbeat scan failed:", e));
        }, 30 * 60 * 1000);
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
        const resolveName = (key: string) => this.i18n[`field.${key}`] ?? key;
        const enabled = new Set(this.settings.enabledModules);
        const plans: [string, any, string][] = [
            ["members", MEMBERS_SCHEMA, this.i18n["module.members"]],
            ["certs", CERTS_SCHEMA, this.i18n["module.certs"]],
            ["medicine", MEDICINE_SCHEMA, this.i18n["module.medicine"]],
            ["memberships", MEMBERSHIPS_SCHEMA, this.i18n["module.memberships"]],
            ["insurance", INSURANCE_SCHEMA, this.i18n["module.insurance"]],
            ["shopping", SHOPPING_SCHEMA, this.i18n["module.shopping"]],
            ["contracts", CONTRACTS_SCHEMA, this.i18n["module.contracts"]],
            ["exams", EXAMS_SCHEMA, this.i18n["module.exams"]],
            ["allowance", ALLOWANCE_SCHEMA, this.i18n["module.allowance"]],
            ["favors", FAVORS_SCHEMA, this.i18n["module.favors"]],
            ["stock", STOCK_SCHEMA, this.i18n["module.stock"]],
            ["chores", CHORES_SCHEMA, this.i18n["module.chores"]],
            ["house", HOUSE_SCHEMA, this.i18n["module.house"]],
        ];
        for (const [id, schema, title] of plans) {
            if (!enabled.has(id)) continue;
            await provisionModule(this.settings, id, schema, title, { resolveName });
        }
        await saveSettings(this, this.settings);
    }

    /** 扫描 → 运行态合并 → 缓存 → 每日摘要 → 通知面板 */
    async refreshHub(): Promise<ScanResult> {
        const deps = { settings: this.settings, getDbRef: (id: string) => this.settings.dbRefs[id] };
        const providers = [
            new CertsProvider(deps),
            new MembersProvider(deps),
            new SchemaLedgerProvider("medicine", MEDICINE_SCHEMA, deps),
            new SchemaLedgerProvider("memberships", MEMBERSHIPS_SCHEMA, deps),
            new SchemaLedgerProvider("insurance", INSURANCE_SCHEMA, deps),
            new SchemaLedgerProvider("contracts", CONTRACTS_SCHEMA, deps),
            new SchemaLedgerProvider("exams", EXAMS_SCHEMA, deps),
            new SchemaLedgerProvider("stock", STOCK_SCHEMA, deps),
            new SchemaLedgerProvider("chores", CHORES_SCHEMA, deps),
            new SchemaLedgerProvider("house", HOUSE_SCHEMA, deps),
        ];
        const scan = await runScan(providers, this.settings, this.runtime);
        this.scan = scan;
        this.runtime.cache = {
            reminders: scan.reminders,
            counts: scan.counts,
            errors: scan.errors,
        };
        this.runtime.scannedAt = scan.scannedAt;
        const digest = dailyDigest(scan, this.settings, this.runtime);
        if (digest.shouldNotify) {
            markNotified(this.runtime);
            const text = this.i18n["notify.digest"]
                .replace("${overdue}", String(digest.overdue))
                .replace("${soon}", String(digest.soon));
            showMessage(text, 6000, "info");
        }
        await saveRuntime(this, this.runtime);
        this.hubListeners.forEach((fn) => fn());
        return scan;
    }

    showTab() {
        openTab({
            app: this.app,
            custom: {
                id: `${this.name}${TAB_TYPE}`,
                title: this.i18n.butler,
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
            version: "0.2.0",
            scannedAt: this.runtime?.scannedAt,
            errors: this.scan?.errors ?? [],
            ledgers: Object.entries(this.settings.dbRefs).map(([id, ref]: [string, any]) => ({
                id,
                provisioned: !!ref?.docId,
                provisional: !!ref?.provisional,
                columns: Object.keys(ref?.columns ?? {}).length,
            })),
            contracts: [
                validateSchema("members", MEMBERS_SCHEMA),
                validateSchema("certs", CERTS_SCHEMA),
            ].flat(),
        };
    }

    // ── 提醒动作（B4，转发 actions.ts）──
    complete(r: any) { return complete(this, r); }
    snooze(id: string, days: number) { return snooze(this, id, days); }
    mute(id: string) { return mute(this, id); }
    unmute(id: string) { return unmute(this, id); }
    renew(r: any, iso: string) { return renew(this, r, iso, this.settings.dbRefs[r.moduleId] ?? {}); }
    addMemo(title: string, due: string) { return addMemo(this, title, due); }
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
            title: this.i18n.settingsTitle,
            component: HomeSettingsPanel,
            props: { plugin: this, settings: this.settings },
            width: "860px",
        });
    }

    onunload() {
        if (this.heartbeat) window.clearInterval(this.heartbeat);
        this.heartbeat = undefined;
    }
}
