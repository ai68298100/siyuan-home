<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import { confirm } from "siyuan";
    import { saveSettings } from "@/core/settings";
    import { AVATAR_IMAGE_LIMIT, AVATAR_PRESETS, DEFAULT_AVATAR, normalizeAvatarImage, normalizeAvatarText } from "@/core/avatar";
    import type { HomeSettings } from "@/types";
    import type { HomePluginLike } from "@/types/plugin";

    type CropSession = {
        image: HTMLImageElement;
        url: string;
        zoom: number;
        centerX: number;
        centerY: number;
        pointer?: { id: number; x: number; y: number };
    };

    let { plugin, t }: { plugin: HomePluginLike; t: (key: string) => string } = $props();
    // Initial settings are a snapshot; subsequent avatar writes update both local state and plugin.settings.
    // svelte-ignore state_referenced_locally
    let avatarText = $state(normalizeAvatarText(plugin.settings.avatar));
    // svelte-ignore state_referenced_locally
    let avatarImage = $state(normalizeAvatarImage(plugin.settings.avatarImage));
    let avatarImageFailed = $state(false);
    let customText = $state("");
    let status = $state("");
    let saving = $state(false);
    let editingCrop = $state(false);
    let cropSession: CropSession | undefined;
    let dialog: HTMLDialogElement;
    let trigger: HTMLButtonElement;
    let fileInput = $state<HTMLInputElement>();
    let cropCanvas = $state<HTMLCanvasElement>();
    let previewCanvas = $state<HTMLCanvasElement>();
    let zoom = $state(1);

    onDestroy(() => {
        if (cropSession) URL.revokeObjectURL(cropSession.url);
        if (dialog?.open) dialog.close();
    });

    const presetLabels: Record<string, string> = {
        "我": "avatar.default",
        "★": "avatar.star",
        "🐴": "avatar.donkey",
        "🌿": "avatar.leaf",
        "☀": "avatar.sun",
        "🎯": "avatar.target",
    };

    onMount(() => {
        const onSettingsReplaced = (event: Event) => {
            const detail = (event as CustomEvent<{ plugin?: HomePluginLike; settings?: HomeSettings }>).detail;
            if (detail?.plugin !== plugin || !detail.settings) return;
            avatarText = normalizeAvatarText(detail.settings.avatar);
            avatarImage = normalizeAvatarImage(detail.settings.avatarImage);
            avatarImageFailed = false;
            customText = presetLabels[avatarText] ? "" : avatarText;
        };
        window.addEventListener("siyuan-home:settings-replaced", onSettingsReplaced);
        return () => window.removeEventListener("siyuan-home:settings-replaced", onSettingsReplaced);
    });

    function openSettings() {
        if (dialog.open) return;
        status = "";
        avatarText = normalizeAvatarText(plugin.settings.avatar);
        avatarImage = normalizeAvatarImage(plugin.settings.avatarImage);
        avatarImageFailed = false;
        customText = presetLabels[avatarText] ? "" : avatarText;
        dialog.showModal();
        requestAnimationFrame(() => dialog.querySelector<HTMLButtonElement>("[data-avatar-preset]")?.focus());
    }

    function closeSettings() {
        if (cropSession) clearCrop();
        if (dialog.open) dialog.close();
    }

    function closeFromEscape(event: Event) {
        event.preventDefault();
        if (editingCrop) cancelCrop();
        else closeSettings();
    }

    async function persist(text: string, image?: string): Promise<boolean> {
        if (saving) return false;
        saving = true;
        status = "";
        const next: HomeSettings = {
            ...plugin.settings,
            avatar: normalizeAvatarText(text),
            avatarImage: normalizeAvatarImage(image),
        };
        try {
            await saveSettings(plugin as any, next);
            plugin.settings = next;
            avatarText = next.avatar;
            avatarImage = next.avatarImage;
            avatarImageFailed = false;
            customText = presetLabels[next.avatar] ? "" : next.avatar;
            status = t("avatar.saved");
            return true;
        } catch {
            status = t("avatar.saveFailed");
            return false;
        } finally {
            saving = false;
        }
    }

    async function applyText() {
        const raw = customText.trim();
        if (!raw) {
            status = t("avatar.customRequired");
            dialog.querySelector<HTMLInputElement>("[data-avatar-text]")?.focus();
            return;
        }
        await persist(normalizeAvatarText(raw), avatarImageFailed ? undefined : normalizeAvatarImage(plugin.settings.avatarImage));
    }

    function handleAvatarImageError() {
        avatarImageFailed = true;
    }

    async function choosePhoto(event: Event) {
        const file = (event.currentTarget as HTMLInputElement).files?.[0];
        (event.currentTarget as HTMLInputElement).value = "";
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            status = t("avatar.tooLarge");
            return;
        }
        if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
            status = t("avatar.invalidImage");
            return;
        }
        let url: string | undefined;
        try {
            url = URL.createObjectURL(file);
            const image = new Image();
            image.src = url;
            await image.decode();
            if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("invalid-image");
            cropSession = { image, url, zoom: 1, centerX: 0.5, centerY: 0.5 };
            url = undefined;
            editingCrop = true;
            zoom = 1;
            status = "";
            await tick();
            paintCrop();
            requestAnimationFrame(() => cropCanvas?.focus());
        } catch {
            if (url) URL.revokeObjectURL(url);
            status = t("avatar.invalidImage");
        }
    }

    function cropRect() {
        if (!cropSession) return undefined;
        const { image } = cropSession;
        const size = Math.min(image.naturalWidth, image.naturalHeight) / Math.max(1, Math.min(4, cropSession.zoom));
        return {
            x: Math.max(0, Math.min(image.naturalWidth - size, cropSession.centerX * image.naturalWidth - size / 2)),
            y: Math.max(0, Math.min(image.naturalHeight - size, cropSession.centerY * image.naturalHeight - size / 2)),
            size,
        };
    }

    function paintCrop() {
        const crop = cropRect();
        if (!cropSession || !crop || !cropCanvas || !previewCanvas) return;
        cropSession.centerX = (crop.x + crop.size / 2) / cropSession.image.naturalWidth;
        cropSession.centerY = (crop.y + crop.size / 2) / cropSession.image.naturalHeight;
        for (const canvas of [cropCanvas, previewCanvas]) {
            const context = canvas.getContext("2d");
            if (!context) return;
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(cropSession.image, crop.x, crop.y, crop.size, crop.size, 0, 0, canvas.width, canvas.height);
        }
    }

    function moveCrop(dx: number, dy: number) {
        const crop = cropRect();
        if (!cropSession || !crop) return;
        cropSession.centerX -= dx * crop.size / Math.max(1, cropCanvas.getBoundingClientRect().width) / cropSession.image.naturalWidth;
        cropSession.centerY -= dy * crop.size / Math.max(1, cropCanvas.getBoundingClientRect().height) / cropSession.image.naturalHeight;
        paintCrop();
    }

    function onCropPointerDown(event: PointerEvent) {
        if (!cropSession || event.button !== 0) return;
        cropSession.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        cropCanvas.setPointerCapture(event.pointerId);
        cropCanvas.focus();
        event.preventDefault();
    }

    function onCropPointerMove(event: PointerEvent) {
        const pointer = cropSession?.pointer;
        if (!pointer || pointer.id !== event.pointerId) return;
        moveCrop(event.clientX - pointer.x, event.clientY - pointer.y);
        pointer.x = event.clientX;
        pointer.y = event.clientY;
    }

    function onCropKeydown(event: KeyboardEvent) {
        if (!cropSession) return;
        const distance = event.shiftKey ? 24 : 6;
        const delta: Record<string, [number, number]> = {
            ArrowLeft: [distance, 0], ArrowRight: [-distance, 0], ArrowUp: [0, distance], ArrowDown: [0, -distance],
        };
        const direction = delta[event.key];
        if (!direction) return;
        event.preventDefault();
        moveCrop(...direction);
    }

    function resetCrop() {
        if (!cropSession) return;
        cropSession.zoom = 1;
        cropSession.centerX = 0.5;
        cropSession.centerY = 0.5;
        zoom = 1;
        paintCrop();
    }

    function clearCrop() {
        if (cropSession) URL.revokeObjectURL(cropSession.url);
        cropSession = undefined;
        editingCrop = false;
    }

    function cancelCrop() {
        clearCrop();
        status = "";
        requestAnimationFrame(() => dialog.querySelector<HTMLButtonElement>("[data-avatar-photo]")?.focus());
    }

    async function saveCrop() {
        if (!cropSession || saving) return;
        try {
            const image = cropCanvas.toDataURL("image/png");
            if (image.length > AVATAR_IMAGE_LIMIT) {
                status = t("avatar.imageTooLarge");
                return;
            }
            if (await persist(normalizeAvatarText(plugin.settings.avatar), image)) clearCrop();
        } catch {
            status = t("avatar.saveFailed");
        }
    }

    async function clearPhoto() {
        if (!avatarImage || saving) return;
        confirm(t("avatar.clearPhoto"), t("avatar.clearPhotoConfirm"), () => {
            void persist(normalizeAvatarText(plugin.settings.avatar));
        });
    }

    async function resetAvatar() {
        if (saving) return;
        confirm(t("avatar.reset"), t("avatar.resetConfirm"), () => {
            void persist(DEFAULT_AVATAR).then((saved) => { if (saved) status = t("avatar.saved"); });
        });
    }

    function updateZoom(value: string) {
        if (!cropSession) return;
        cropSession.zoom = Number(value);
        zoom = cropSession.zoom;
        paintCrop();
    }
</script>

<button class="lv-avatar-trigger" bind:this={trigger} type="button" aria-label={t("avatar.settings")} title={t("avatar.settings")} onclick={openSettings}>
    {#if avatarImage && !avatarImageFailed}
        <img src={avatarImage} alt="" width="34" height="34" decoding="async" onerror={handleAvatarImageError} />
    {:else}
        <span>{avatarText}</span>
    {/if}
</button>

<dialog class="lv-avatar-dialog" bind:this={dialog} aria-labelledby="lv-avatar-title" oncancel={closeFromEscape} onclose={() => { if (trigger?.isConnected) trigger.focus(); }} onclick={(event) => { if (event.target === dialog) closeSettings(); }}>
    {#if editingCrop}
        <h2 id="lv-avatar-title">{t("avatar.cropTitle")}</h2>
        <p>{t("avatar.cropHint")}</p>
        <div class="lv-avatar-crop-stage">
            <canvas class="lv-avatar-crop-canvas" bind:this={cropCanvas} width="256" height="256" tabindex="0" aria-label={t("avatar.cropArea")}
                onpointerdown={onCropPointerDown} onpointermove={onCropPointerMove} onpointerup={() => { if (cropSession) cropSession.pointer = undefined; }}
                onpointercancel={() => { if (cropSession) cropSession.pointer = undefined; }} onkeydown={onCropKeydown}></canvas>
            <canvas class="lv-avatar-preview" bind:this={previewCanvas} width="64" height="64" aria-label={t("avatar.preview")}></canvas>
        </div>
        <div class="lv-avatar-crop-tools">
            <label for="lv-avatar-zoom">{t("avatar.zoom")} <output>{Math.round(zoom * 100)}%</output></label>
            <button class="b3-button b3-button--outline" type="button" onclick={resetCrop}>{t("avatar.cropReset")}</button>
            <input id="lv-avatar-zoom" type="range" min="1" max="4" step="0.01" value={zoom} oninput={(event) => updateZoom(event.currentTarget.value)} />
        </div>
        <p class="lv-avatar-status" role="status" aria-live="polite">{status}</p>
        <div class="lv-avatar-actions">
            <button class="b3-button b3-button--outline" type="button" disabled={saving} onclick={cancelCrop}>{t("avatar.cancel")}</button>
            <button class="lv-btn primary" type="button" disabled={saving} onclick={saveCrop}>{saving ? t("ledger.saving") : t("avatar.usePhoto")}</button>
        </div>
    {:else}
        <div class="lv-avatar-head">
            <div><h2 id="lv-avatar-title">{t("avatar.title")}</h2><p>{t("avatar.hint")}</p></div>
            <button class="lv-avatar-close" type="button" aria-label={t("avatar.close")} title={t("avatar.close")} onclick={closeSettings}>×</button>
        </div>
        <div class="lv-avatar-current">
            {#if avatarImage && !avatarImageFailed}<img src={avatarImage} alt="" width="42" height="42" decoding="async" onerror={handleAvatarImageError} />{:else}<span>{avatarText}</span>{/if}
            <b>{avatarImage && !avatarImageFailed ? t("avatar.photo") : presetLabels[avatarText] ? t(presetLabels[avatarText]) : avatarText}</b>
        </div>
        <div class="lv-avatar-presets" role="group" aria-label={t("avatar.title")}>
            {#each AVATAR_PRESETS as preset (preset)}
                <button type="button" data-avatar-preset aria-pressed={avatarText === preset} disabled={saving}
                    onclick={() => { void persist(preset); }}>
                    <span>{preset}</span><small>{t(presetLabels[preset])}</small>
                </button>
            {/each}
        </div>
        <div class="lv-avatar-custom">
            <label for="lv-avatar-text">{t("avatar.custom")}</label>
            <div><input id="lv-avatar-text" data-avatar-text class="b3-text-field" maxlength="4" bind:value={customText} placeholder={t("avatar.customPlaceholder")} disabled={saving} />
                <button class="b3-button b3-button--outline" type="button" disabled={saving} onclick={applyText}>{t("avatar.apply")}</button></div>
            <small>{t("avatar.customHint")}</small>
        </div>
        <input bind:this={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onchange={choosePhoto} />
        <div class="lv-avatar-actions">
            <button class="lv-btn primary" type="button" data-avatar-photo disabled={saving} onclick={() => fileInput.click()}>{avatarImage ? t("avatar.editPhoto") : t("avatar.photo")}</button>
            {#if avatarImage}<button class="b3-button b3-button--outline" type="button" disabled={saving} onclick={clearPhoto}>{t("avatar.clearPhoto")}</button>{/if}
            <button class="b3-button b3-button--text" type="button" disabled={saving} onclick={resetAvatar}>{t("avatar.reset")}</button>
        </div>
        <p class="lv-avatar-status" role="status" aria-live="polite">{status}</p>
    {/if}
</dialog>

<style>
    .lv-avatar-trigger { width: 34px; height: 34px; flex: none; display: grid; place-items: center; padding: 2px; overflow: hidden;
        border: 1px solid var(--lv-line); border-radius: 50%; background: var(--lv-surface-2); color: var(--lv-accent);
        font-size: 12px; font-weight: 650; cursor: pointer; transition: border-color var(--lv-t-med) var(--lv-ease), transform var(--lv-t-med) var(--lv-ease); }
    .lv-avatar-trigger:hover { border-color: var(--lv-accent); transform: translateY(-1px); }
    .lv-avatar-trigger img { width: 100%; height: 100%; border-radius: inherit; object-fit: cover; }
    .lv-avatar-trigger span { display: grid; place-items: center; width: 100%; height: 100%; border-radius: inherit; background: var(--lv-accent-soft); }
    .lv-avatar-dialog { width: min(460px, calc(100vw - 28px)); max-height: min(680px, calc(100dvh - 28px)); overflow: auto; padding: 20px;
        border: 1px solid var(--lv-line-strong); border-radius: var(--lv-r-3); background: var(--lv-surface); color: var(--lv-tx);
        box-shadow: var(--lv-shadow-3); }
    .lv-avatar-dialog::backdrop { background: rgba(15, 20, 26, .52); backdrop-filter: blur(4px); }
    .lv-avatar-head { display: flex; align-items: flex-start; gap: 12px; }
    .lv-avatar-head h2, .lv-avatar-dialog > h2 { margin: 0; font-size: 16px; font-weight: 650; }
    .lv-avatar-head p, .lv-avatar-dialog > p { margin: 5px 0 0; color: var(--lv-tx-3); font-size: 12px; line-height: 1.5; }
    .lv-avatar-close { width: 32px; height: 32px; flex: none; margin-left: auto; border: 0; border-radius: 8px; background: transparent; color: var(--lv-tx-2); font-size: 20px; cursor: pointer; }
    .lv-avatar-close:hover { background: var(--lv-surface-2); }
    .lv-avatar-current { display: flex; align-items: center; gap: 10px; margin-top: 18px; padding: 12px; border: 1px solid var(--lv-line); border-radius: var(--lv-r-2); background: var(--lv-surface); font-size: 12px; }
    .lv-avatar-current img, .lv-avatar-current > span { width: 42px; height: 42px; flex: none; display: grid; place-items: center; border-radius: 50%; object-fit: cover; background: var(--lv-accent-soft); color: var(--lv-accent); font-size: 16px; }
    .lv-avatar-presets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
    .lv-avatar-presets button { min-height: 68px; display: grid; justify-items: center; align-content: center; gap: 4px; border: 1px solid var(--lv-line); border-radius: var(--lv-r-2); background: var(--lv-surface); color: var(--lv-tx-2); cursor: pointer; }
    .lv-avatar-presets button:hover, .lv-avatar-presets button[aria-pressed="true"] { border-color: var(--lv-accent); background: var(--lv-surface); color: var(--lv-tx); }
    .lv-avatar-presets button > span { font-size: 18px; line-height: 1.1; }
    .lv-avatar-presets small, .lv-avatar-custom small { color: var(--lv-tx-3); font-size: 10.5px; }
    .lv-avatar-custom { display: grid; gap: 6px; margin-top: 16px; }
    .lv-avatar-custom label { font-size: 12px; font-weight: 600; }
    .lv-avatar-custom > div { display: flex; gap: 8px; }
    .lv-avatar-custom input { flex: 1; min-width: 0; }
    .lv-avatar-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .lv-avatar-actions > :first-child { margin-right: auto; }
    .lv-avatar-status { min-height: 18px; }
    .lv-avatar-crop-stage { display: grid; grid-template-columns: minmax(0, 1fr) 64px; align-items: center; justify-items: center; gap: 12px; margin-top: 16px; padding: 12px; border: 1px solid var(--lv-line); border-radius: var(--lv-r-2); background: var(--lv-surface); }
    .lv-avatar-crop-canvas { width: min(100%, 300px); aspect-ratio: 1; touch-action: none; border-radius: 8px; background: #e8edf3; cursor: grab; outline-offset: 3px; }
    .lv-avatar-crop-canvas:active { cursor: grabbing; }
    .lv-avatar-preview { width: 60px; height: 60px; border: 1px solid var(--lv-line); border-radius: 50%; background: var(--lv-surface); }
    .lv-avatar-crop-tools { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px 12px; margin-top: 14px; }
    .lv-avatar-crop-tools label { color: var(--lv-tx-2); font-size: 12px; }
    .lv-avatar-crop-tools output { margin-left: 5px; color: var(--lv-tx); font-variant-numeric: tabular-nums; }
    .lv-avatar-crop-tools input { grid-column: 1 / -1; width: 100%; accent-color: var(--lv-accent); }
    .lv-avatar-dialog .lv-avatar-status { margin: 9px 0 0; color: var(--lv-tx-3); font-size: 11px; }
    @media (max-width: 460px) { .lv-avatar-dialog { padding: 16px; } .lv-avatar-trigger { width: 30px; height: 30px; } }
</style>
