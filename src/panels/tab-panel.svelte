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
    // 状态栏/通知入口可预选页签（plugin.pendingScreen，消费后清空）——初始快照为设计意图。
    // 单次读取落局部量：快照语义不变，且消除同逻辑两处 state_referenced_locally 警告
    // svelte-ignore state_referenced_locally
    const pendingScreen = plugin.pendingScreen as ScreenId | undefined;
    // svelte-ignore state_referenced_locally
    plugin.pendingScreen = undefined;
    let screen: ScreenId = $state(pendingScreen ?? "overview");
    // 提醒页签待办红点（version 驱动重算，随扫描更新）
    const pendingTotal = $derived.by(() => {
        void version;
        return plugin.scan?.reminders?.length ?? plugin.runtime?.cache?.reminders?.length ?? 0;
    });
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
        pill = { x: btn.offsetLeft - 4, w: btn.offsetWidth };
    }
    function onTabKeydown(event: KeyboardEvent, index: number) {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? screens.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + screens.length) % screens.length;
        screen = screens[next].id;
        requestAnimationFrame(() => (navEl?.querySelector(`[data-s="${screens[next].id}"]`) as HTMLButtonElement | undefined)?.focus());
    }
    $effect(() => {
        movePill(navEl?.querySelector(`[data-s="${screen}"]`) as HTMLElement | undefined);
        // 254 波：窗口 resize 后重新测量（对齐原型的 resize 监听）——否则胶囊停在旧坐标、
        // 与当前页签错位
        const onResize = () => movePill(navEl?.querySelector(`[data-s="${screen}"]`) as HTMLElement | undefined);
        window.addEventListener("resize", onResize, { passive: true });
        return () => window.removeEventListener("resize", onResize);
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
        <div class="lv-appbrand">
            <span class="lv-logo" aria-hidden="true">🏠</span>
            <div class="lv-appbrand-t">
                <b>{t("butler")}</b>
                <span>LV HOME</span>
            </div>
        </div>
        <div class="lv-tabs" bind:this={navEl} style="position:relative" role="tablist" aria-label={t("tab.title")}>
            <!-- 252 波：首次定位不带过渡（pill.w===0 时挂 init），避免挂载瞬间胶囊从左滑入 -->
            <span class="lv-nav-pill" class:init={pill.w === 0} style="transform:translateX({pill.x}px);width:{pill.w}px"></span>
            {#each screens as s, i (s.id)}
                <button id={`lv-tab-${s.id}`} data-s={s.id} class="lv-tabs__item" class:on={screen === s.id}
                    role="tab" aria-selected={screen === s.id} aria-current={screen === s.id ? "page" : undefined} aria-controls={`lv-panel-${s.id}`}
                    tabindex={screen === s.id ? 0 : -1} onkeydown={(e) => onTabKeydown(e, i)} onclick={() => (screen = s.id)}>
                    {t(s.key)}
                    {#if s.id === "reminders" && pendingTotal > 0}<i class="lv-dot" aria-hidden="true"></i>{/if}
                </button>
            {/each}
        </div>
        <span class="fn__flex-1"></span>
        <span class="lv-tabbar__meta lv-caption">
            {t("hub.scannedAt")} {plugin.scan ? new Date(plugin.scan.scannedAt).toLocaleTimeString() : "—"}
            {#if plugin.scan?.stale}<span class="lv-badge orange" title={plugin.scan.errors.map((e) => e.moduleId).join(", ")}>{t("hub.stale")}</span>{/if}
        </span>
        <button class="lv-iconbtn" aria-label={t("tab.settings")} title={t("tab.settings")} style="font-size:15px" onclick={() => plugin.openSetting()}>⚙</button>
    </header>

    {#key screen}
        <div id={`lv-panel-${screen}`} class="lv-screen lv-anim" role="tabpanel" tabindex="0" aria-labelledby={`lv-tab-${screen}`}>
            <ErrorBoundary {t} onretry={() => { /* screen switch resets naturally via {#key} */ }}>
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
        </div>
    {/key}
</div>
