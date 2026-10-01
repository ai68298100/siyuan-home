<script lang="ts">
    import Overview from "./screens/overview.svelte";
    import Reminders from "./screens/reminders.svelte";
    import Ledger from "./screens/ledger.svelte";
    import Members from "./screens/members.svelte";

    interface IHomePluginLike {
        i18n: Record<string, string>;
        name: string;
        settings: any;
        runtime: any;
        scan: any;
        onHubUpdate: (() => void) | null;
        refreshHub: () => Promise<any>;
        openSetting: () => void;
        complete: (r: any) => Promise<unknown>;
        snooze: (id: string, days: number) => Promise<unknown>;
        mute: (id: string) => Promise<unknown>;
        unmute: (id: string) => Promise<unknown>;
        showTabDocs: (docId?: string) => void;
    }

    let { plugin }: { plugin: IHomePluginLike } = $props();
    const t = (key: string) => plugin.i18n[key] ?? key;

    type ScreenId = "overview" | "reminders" | "ledger" | "members";
    let screen: ScreenId = $state("overview");
    const screens: { id: ScreenId; key: string }[] = [
        { id: "overview", key: "tab.overview" },
        { id: "reminders", key: "tab.reminders" },
        { id: "ledger", key: "tab.ledger" },
        { id: "members", key: "tab.members" },
    ];

    // Tab 挂载即注册刷新回调（扫描完成 → 触发 rune 更新）
    let tick = $state(0);
    $effect(() => {
        plugin.onHubUpdate = () => { tick += 1; };
        return () => { plugin.onHubUpdate = null; };
    });
    // 打开时刷新一次扫描（B2b：Tab 打开触发）
    $effect(() => {
        void tick;
        void plugin.refreshHub();
    });
</script>

<div class="lv-home lv-tab">
    <header class="lv-tabbar">
        <b class="lv-tabbar__title">🏠 {t("butler")}</b>
        <nav class="lv-tabs">
            {#each screens as s (s.id)}
                <button class="lv-tabs__item" class:on={screen === s.id} onclick={() => (screen = s.id)}>
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
