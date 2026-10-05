<script lang="ts">
    import Overview from "./screens/overview.svelte";
    import Reminders from "./screens/reminders.svelte";
    import Ledger from "./screens/ledger.svelte";
    import Members from "./screens/members.svelte";
    import ErrorBoundary from "./error-boundary.svelte";
    import type { HomePluginLike } from "@/types/plugin";

    let { plugin }: { plugin: HomePluginLike } = $props();
    // i18n 取值统一转 string（1.2.8 起 JSONValue；screens 以 props 接收 string 返回的 t）
    const t = (key: string) => String(plugin.i18n[key] ?? key);

    type ScreenId = "overview" | "reminders" | "ledger" | "members";
    // 状态栏/通知入口可预选页签（plugin.pendingScreen，消费后清空）——初始快照为设计意图
    // svelte-ignore state_referenced_locally
    const initialScreen = (plugin.pendingScreen as ScreenId | undefined) ?? "overview";
    if (plugin.pendingScreen) plugin.pendingScreen = undefined;
    let screen: ScreenId = $state(initialScreen);
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

    // Tab 挂载即注册刷新回调（扫描完成 → version 递增驱动各屏 $derived 重算，H02：
    // 动作/扫描后留在当前页即时更新，不靠切页重挂载；多实例安全）
    let version = $state(0);
    $effect(() => {
        const listener = () => { version += 1; };
        (plugin.hubListeners as Set<() => void>).add(listener);
        // 225 波修复：refreshHub 必须延后到 effect 同步作用域之外——其缓存路径会在本次 flush 内
        // 同步触发 hubListeners（version++），在 effect 依赖跟踪未定型时形成
        // effect_update_depth_exceeded 无限循环（真机首启即崩、页签全冻结）
        const timer = window.setTimeout(() => { void plugin.refreshHub(); }, 0);
        return () => {
            window.clearTimeout(timer);
            (plugin.hubListeners as Set<() => void>).delete(listener);
        };
    });
</script>

<div class="lv-home lv-tab">
    <header class="lv-tabbar">
        <b class="lv-tabbar__title">🏠 {t("butler")}</b>
        <nav class="lv-tabs" bind:this={navEl} style="position:relative">
            <span class="lv-nav-pill" style="transform:translateX({pill.x}px);width:{pill.w}px"></span>
            {#each screens as s (s.id)}
                <button data-s={s.id} class="lv-tabs__item" class:on={screen === s.id} aria-current={screen === s.id ? "page" : undefined} onclick={() => (screen = s.id)}>
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
            <ErrorBoundary onretry={() => { /* screen switch resets naturally via {#key} */ }}>
                {#if screen === "overview"}
                    <Overview {plugin} {t} {version} onGoto={(s: ScreenId) => (screen = s)} />
                {:else if screen === "reminders"}
                    <Reminders {plugin} {t} {version} />
                {:else if screen === "ledger"}
                    <Ledger {plugin} {t} {version} />
                {:else}
                    <Members {plugin} {t} {version} />
                {/if}
            </ErrorBoundary>
        </main>
    {/key}
</div>
