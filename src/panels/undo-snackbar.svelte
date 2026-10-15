<script lang="ts">
    import { onDestroy } from "svelte";
    import { fly } from "svelte/transition";
    import UiIcon from "@/ui/icon.svelte";

    let { t }: { t: (key: string) => string } = $props();

    interface UndoToast {
        message: string;
        action: () => Promise<void> | void;
        onDone?: () => void;
    }

    let current = $state<UndoToast | null>(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let undoing = $state(false);

    export function show(toast: UndoToast) {
        if (timer) clearTimeout(timer);
        undoing = false;
        current = toast;
        timer = setTimeout(() => {
            current = null;
            timer = undefined;
        }, 5000);
    }

    async function handleUndo() {
        if (!current || undoing) return;
        undoing = true;
        try {
            await current.action();
            current.onDone?.();
        } finally {
            if (timer) clearTimeout(timer);
            undoing = false;
            current = null;
        }
    }

    function onKeydown(e: KeyboardEvent) {
        if (!current) return;
        if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
            e.preventDefault();
            void handleUndo();
        }
    }

    onDestroy(() => {
        if (timer) clearTimeout(timer);
    });
</script>

<svelte:window onkeydown={onKeydown} />

{#if current}
    <div class="lv-undo-snackbar" transition:fly={{ y: 20, duration: 220 }} role="status" aria-live="polite">
        <div class="lv-undo-snackbar__content">
            <span class="lv-undo-snackbar__icon" aria-hidden="true"><UiIcon name="checkCircle" size={15} /></span>
            <span class="lv-undo-snackbar__msg">{current.message}</span>
        </div>
        <button class="b3-button b3-button--text lv-undo-snackbar__btn" disabled={undoing} onclick={handleUndo}>
            {undoing ? t("ledger.saving") : t("act.undo")}
        </button>
        <div class="lv-undo-snackbar__track" aria-hidden="true">
            <div class="lv-undo-snackbar__progress"></div>
        </div>
    </div>
{/if}

<style lang="scss">
    .lv-undo-snackbar {
        position: fixed;
        bottom: 32px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 280px;
        max-width: min(520px, calc(100vw - 32px));
        padding: 10px 16px 12px 14px;
        border-radius: 14px;
        background: rgba(15, 23, 42, 0.9);
        color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.35), 0 16px 36px -4px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(16px) saturate(180%);
        -webkit-backdrop-filter: blur(16px) saturate(180%);
        overflow: hidden;
    }
    .lv-undo-snackbar__content {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 0;
    }
    .lv-undo-snackbar__icon {
        color: #38bdf8;
        display: grid;
        place-items: center;
        flex: none;
    }
    .lv-undo-snackbar__msg {
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #f1f5f9;
    }
    .lv-undo-snackbar__btn {
        flex: none;
        padding: 4px 10px;
        min-height: 28px;
        font-size: 12.5px;
        font-weight: 600;
        color: #38bdf8;
        border-radius: 6px;
        background: rgba(56, 189, 248, 0.12);
        border: 1px solid rgba(56, 189, 248, 0.28);
        cursor: pointer;
        transition: all 0.14s ease;
        &:hover {
            background: rgba(56, 189, 248, 0.22);
            color: #7dd3fc;
        }
    }
    .lv-undo-snackbar__track {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: rgba(255, 255, 255, 0.1);
    }
    .lv-undo-snackbar__progress {
        height: 100%;
        background: #38bdf8;
        animation: lv-undo-progress 5s linear forwards;
    }
    @keyframes lv-undo-progress {
        from { width: 100%; }
        to { width: 0%; }
    }
    @media (max-width: 480px) {
        .lv-undo-snackbar {
            bottom: 20px;
            width: calc(100vw - 24px);
            padding: 9px 12px 11px;
            gap: 10px;
        }
    }
</style>
