<script lang="ts">
    // 32 组：Svelte 错误边界——单屏崩溃不拖垮管家面板，提供重试按钮
    import type { Snippet } from "svelte";
    type Props = {
        children: Snippet;
        /** 重试回调（可选：切换页签时自动重置） */
        onretry?: () => void;
        t?: (key: string) => string;
    };
    let { children, onretry, t }: Props = $props();

    let error: Error | null = $state(null);

    function reset() {
        error = null;
        onretry?.();
    }
</script>

<svelte:boundary onerror={(e: Error) => { error = e; }}>
    {#if error}
        <div class="lv-card" style="padding:24px;text-align:center" role="alert" aria-live="assertive">
            <div style="font-size:1.5rem;margin-bottom:8px">⚠️</div>
            <b>{error.message || t?.("error.unknown") || "An unexpected error occurred"}</b>
            <p class="lv-caption" style="margin:8px 0">{error.stack?.split("\n")[1]?.trim() ?? ""}</p>
            <button class="b3-button b3-button--outline" style="margin-top:8px" onclick={reset}>
                {t?.("error.retry") || "Retry"}
            </button>
        </div>
    {:else}
        {@render children()}
    {/if}
</svelte:boundary>
