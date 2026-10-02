<script lang="ts">
    import Overview from "./screens/overview.svelte";
    import Reminders from "./screens/reminders.svelte";
    import Ledger from "./screens/ledger.svelte";
    import Members from "./screens/members.svelte";
    import type { HomeSettings, Reminder } from "@/types";
    import type { HubRuntime } from "@/core/hub/runtime";
    import type { ScanResult } from "@/core/hub/scanner";

    interface IHomePluginLike {
        i18n: Record<string, unknown>;
        name: string;
        settings: HomeSettings;
        runtime: HubRuntime;
        scan: ScanResult | undefined;
        hubListeners: Set<() => void>;
        refreshHub: () => Promise<ScanResult>;
        openSetting: () => void;
        complete: (r: Reminder) => Promise<unknown>;
        snooze: (id: string, days: number) => Promise<unknown>;
        mute: (id: string) => Promise<unknown>;
        unmute: (id: string) => Promise<unknown>;
        showTabDocs: (docId?: string) => void;
    }

    let { plugin }: { plugin: IHomePluginLike } = $props();
    // i18n 取值统一转 string（1.2.8 起 JSONValue；screens 以 props 接收 string 返回的 t）
    const t = (key: string) => String(plugin.i18n[key] ?? key);

    type ScreenId = "overview" | "reminders" | "ledger" | "members";
    let screen: ScreenId = $state("overview");
    const screens: { id: ScreenId; key: string }[] = [
        { id: "overview", key: "tab.overview" },
        { id: "reminders", key: "tab.reminders" },
        { id: "ledger", key: "tab.ledger" },
        { id: "members", key: "tab.members" },
    ];

    // C1b：滑动胶囊（offsetLeft/width + spring，与原型一致）
    let navEl: HTMLElement;
    let pill = $state({ x: 0, w: 0 });
    function movePill(btn: HTMLElement | undefined) {
        if (!btn) return;
        pill = { x: btn.offsetLeft - 3, w: btn.offsetWidth };
    }
    $effect(() => {
        movePill(navEl?.querySelector(`[data-s="${screen}"]`) as HTMLElement | undefined);
    });

    // Tab 挂载即注册刷新回调（扫描完成 → 触发 rune 更新；多实例安全）
    let tick = $state(0);
    $effect(() => {
        const listener = () => { tick += 1; };
        (plugin.hubListeners as Set<() => void>).add(listener);
        void plugin.refreshHub();
        return () => { (plugin.hubListeners as Set<() => void>).delete(listener); };
    });
</script>

<div class="lv-home lv-tab">
    <header class="lv-tabbar">
        <b class="lv-tabbar__title">🏠 {t("butler")}</b>
        <nav class="lv-tabs" bind:this={navEl} style="position:relative">
            <span class="lv-nav-pill" style="transform:translateX({pill.x}px);width:{pill.w}px"></span>
            {#each screens as s (s.id)}
                <button data-s={s.id} class="lv-tabs__item" class:on={screen === s.id} onclick={() => (screen = s.id)}>
                    {t(s.key)}
                </button>
            {/each}
        </nav>
        <span class="fn__flex-1"></span>
        <span class="lv-tabbar__meta lv-caption">
            {t("hub.scannedAt")} {plugin.scan ? new Date(plugin.scan.scannedAt).toLocaleTimeString() : "—"}
            {#if plugin.scan?.stale}<span class="lv-badge orange" title={plugin.scan.errors.map((e) => e.moduleId).join(", ")}>{t("hub.stale")}</span>{/if}
        </span>
        <button class="b3-button b3-button--outline" onclick={() => plugin.openSetting()}>⚙</button>
    </header>

    {#key screen}
        <main class="lv-screen lv-anim">
            {#if screen === "overview"}
                <Overview {plugin} {t} onGoto={(s: ScreenId) => (screen = s)} />
            {:else if screen === "reminders"}
                <Reminders {plugin} {t} />
            {:else if screen === "ledger"}
                <Ledger {plugin} {t} />
            {:else}
                <Members {plugin} {t} />
            {/if}
        </main>
    {/key}
</div>
