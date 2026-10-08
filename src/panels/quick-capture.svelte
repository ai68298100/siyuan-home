<script lang="ts">
    // 267 波：快速记录弹层（原型 .sheet 生产化）——480px 中央弹层，schema.capture 列集驱动，
    // 未建库自动建库（triage 同链路）。常驻挂载：关闭仅收起弹层，草稿保留到下次打开（对齐原型）。
    import { showMessage } from "siyuan";
    import { tick } from "svelte";
    import { addDetachedRow, setCell } from "@/core/siyuan";
    import { saveRuntime } from "@/core/hub/runtime";
    import type { HomeSettings } from "@/types";

    interface ICapturePluginLike {
        i18n: Record<string, unknown>;
        settings: HomeSettings;
        schemaCatalog?: Record<string, { capture?: string[]; columns?: { key: string; type: string; options?: string[] }[] }>;
        runtime?: { hubQuickModule?: string };
        refreshHub?: (only?: string | string[], force?: boolean) => Promise<unknown>;
    }

    let { plugin, t, version, open = $bindable(false), onClose }: {
        plugin: ICapturePluginLike;
        t: (k: string) => string;
        version?: number;
        open?: boolean;
        onClose?: () => void;
    } = $props();

    const modLabel = (id: string) => (t(`module.${id}`) !== `module.${id}` ? t(`module.${id}`) : id);

    const modules = $derived.by(() => {
        void version;
        return (plugin.settings.enabledModules ?? []).filter((id) => id !== "members" && id !== "adhoc");
    });

    // 打开时恢复上次模块（失效回退首个）；values 保留草稿，仅切模块时清空
    let moduleId = $state("");
    $effect(() => {
        if (open) {
            const last = plugin.runtime?.hubQuickModule;
            moduleId = last && modules.includes(last) ? last : (modules[0] ?? "");
        }
    });

    const captureFields = $derived.by(() => {
        const schema = plugin.schemaCatalog?.[moduleId];
        const cols = schema?.columns ?? [];
        const UNSUPPORTED = new Set(["asset", "mAsset", "mSelect"]);
        const pick = (key: string) => cols.find((c: any) => c.key === key);
        const declared = (schema?.capture ?? []).map(pick).filter((c: any): c is any => !!c && !UNSUPPORTED.has(c.type));
        if (declared.length > 0) return declared;
        return cols.filter((c: any) => !UNSUPPORTED.has(c.type)).slice(0, 6);
    });

    let values: Record<string, any> = $state({});
    $effect(() => {
        void moduleId;
        values = {};
        saveError = "";
    });

    let saving = $state(false);
    let saveError = $state("");
    let nameEl: HTMLInputElement | undefined = $state();

    function close() {
        if (saving) return;
        open = false;
        onClose?.();
    }
    function onWindowKeydown(e: KeyboardEvent) {
        if (!open || saving) return;
        if (e.key === "Escape") { e.preventDefault(); close(); return; }
        // 268 波：焦点圈——Tab 循环限制在弹层内（背景虽 inert 不可点，键盘焦点路径仍需自锁）
        if (e.key === "Tab") {
            const sheet = document.querySelector(".lv-modal.open .lv-sheet");
            if (!sheet) return;
            const focusables = Array.from(sheet.querySelectorAll<HTMLElement>('button, input, select, [tabindex]:not([tabindex="-1"])'))
                .filter((el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0);
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    }
    // 弹层打开后首焦点落名称输入（33.4 弹层契约）
    function autofocus(node: HTMLElement) {
        if (open) requestAnimationFrame(() => node.focus());
        return {};
    }

    const modOptions = $derived(modules.map((id) => ({ id, label: modLabel(id) + (plugin.settings.dbRefs?.[id]?.avId ? "" : t("triage.needProvision")) })));

    async function save(continueAfter = false) {
        const title = String(values.name ?? "").trim();
        if (!title) { saveError = t("ledger.nameRequired"); return; }
        saving = true;
        saveError = "";
        // 268 波：连续录入的重聚焦必须在 saving=false 之后（disabled 输入框不可聚焦）
        let refocusName = false;
        try {
            let r = plugin.settings.dbRefs[moduleId];
            if (!r?.avId) {
                // 未建库自动建库（triage 同链路；provisionModule 幂等）
                await import("@/core/provisioner").then((m) => m.provisionModule(
                    plugin.settings, moduleId, plugin.schemaCatalog?.[moduleId] as any, modLabel(moduleId),
                    { resolveName: (k: string) => String(plugin.i18n[`field.${k}`] ?? k) },
                ));
                r = plugin.settings.dbRefs[moduleId];
                if (!r?.avId) throw new Error(t("triage.noTarget"));
            }
            const itemID = await addDetachedRow(r.avId, title);
            // 新建行身份确认存在延迟：setCell 失败受控重试（同格重写不会重复建行，triage 同款）
            const setCellSafe = async (key: string, value: unknown) => {
                const keyID = r!.columns?.[key];
                if (!keyID) return;
                for (let attempt = 0; ; attempt++) {
                    try { await setCell(r!.avId, keyID, itemID, value); return; }
                    catch (err) {
                        if (attempt >= 2) throw err;
                        await new Promise((res) => setTimeout(res, 400));
                    }
                }
            };
            await setCellSafe("name", { type: "text", text: { content: title } });
            for (const f of captureFields as { key: string; type: string }[]) {
                if (f.key === "name") continue;
                const v = values[f.key];
                if (v === undefined || v === null || v === "") continue;
                if (f.type === "relation") await setCellSafe(f.key, { type: "relation", relation: { blockIDs: [String(v)], contents: null } });
                else if (f.type === "date") await setCellSafe(f.key, { type: "date", date: { content: new Date(`${v}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true } });
                else if (f.type === "number") await setCellSafe(f.key, { type: "number", number: { content: Number(v), isNotEmpty: true } });
                else if (f.type === "url") await setCellSafe(f.key, { type: "url", url: { content: String(v) } });
                else if (f.type === "select") await setCellSafe(f.key, { type: "select", select: { content: String(v) } });
                else await setCellSafe(f.key, { type: "text", text: { content: String(v) } });
            }
            // 记住上次模块（跨会话）
            plugin.runtime!.hubQuickModule = moduleId;
            await saveRuntime(plugin as any, plugin.runtime as any);
            showMessage(t("capture.saved").replace("${module}", modLabel(moduleId)), 3000, "info");
            if (continueAfter) {
                // 268 波：连续录入——清空字段、保留模块（家庭录入常成批）
                values = {};
                refocusName = true;
            } else {
                open = false;
            }
            // 新行可能派生提醒：全量重扫让总览/提醒即时可见（triage 同款）
            await plugin.refreshHub?.();
        } catch (e) {
            saveError = t("capture.failed").replace("${msg}", e instanceof Error ? e.message : String(e));
        } finally {
            saving = false;
        }
        // saving=false 到 DOM 重新可聚焦之间隔着一个 Svelte 刷新（微任务）——tick 后再聚焦
        if (refocusName) await tick().then(() => nameEl?.focus());
    }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- 267 波：.lv-mask/.lv-modal（07 §10）首次投产；常驻挂载 + .open 切换保住出入场过渡与草稿 -->
<div class="lv-mask" class:open aria-hidden="true" onclick={close}></div>
<div class="lv-modal" class:open role="dialog" aria-modal="true" aria-label={t("capture.title")} inert={!open}>
    <div class="lv-sheet">
        <div class="lv-sheet-head">
            <b style="font-size:14px">⚡ {t("capture.title")}</b>
            <select class="b3-select" style="margin-left:auto;max-width:200px" bind:value={moduleId} aria-label={t("capture.title")} disabled={saving}>
                {#each modOptions as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
            </select>
            <button class="lv-iconbtn" aria-label={t("cancel")} onclick={close}>✕</button>
        </div>
        <div class="lv-sheet-body lv-cap-body">
            {#if modules.length === 0}
                <span class="lv-caption">{t("settings.modulesHint")}</span>
            {:else}
                {#each captureFields as f (f.key)}
                    <div class="lv-frow">
                        {#if f.key === "name"}
                            <label for="lv-cap-name">{t("ledger.newName")}</label>
                            <input bind:this={nameEl} id="lv-cap-name" class="b3-text-field" type="text" use:autofocus
                                placeholder={t("ledger.newName")} bind:value={values.name} disabled={saving}
                                onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter" && !e.isComposing) save(false); }} />
                        {:else if f.type === "select"}
                            <label for="lv-cap-{f.key}">{t(`field.${f.key}`) !== `field.${f.key}` ? t(`field.${f.key}`) : f.key}</label>
                            <select id="lv-cap-{f.key}" class="b3-select" bind:value={values[f.key]} disabled={saving}>
                                <option value=""></option>
                                {#each f.options ?? [] as opt (opt)}
                                    <option value={opt}>{t(`field.${f.key}.opt.${opt}`) !== `field.${f.key}.opt.${opt}` ? t(`field.${f.key}.opt.${opt}`) : opt}</option>
                                {/each}
                            </select>
                        {:else if f.type === "relation"}
                            <label for="lv-cap-{f.key}">{t(`field.${f.key}`) !== `field.${f.key}` ? t(`field.${f.key}`) : f.key}</label>
                            <select id="lv-cap-{f.key}" class="b3-select" bind:value={values[f.key]} disabled={saving}>
                                <option value=""></option>
                                {#each plugin.settings.members ?? [] as m (m.avItemId ?? m.id)}
                                    <option value={m.avItemId}>{m.name}</option>
                                {/each}
                            </select>
                        {:else if f.type === "date"}
                            <label for="lv-cap-{f.key}">{t(`field.${f.key}`) !== `field.${f.key}` ? t(`field.${f.key}`) : f.key}</label>
                            <input id="lv-cap-{f.key}" class="b3-text-field" type="date" bind:value={values[f.key]} disabled={saving} />
                        {:else if f.type === "number"}
                            <label for="lv-cap-{f.key}">{t(`field.${f.key}`) !== `field.${f.key}` ? t(`field.${f.key}`) : f.key}</label>
                            <input id="lv-cap-{f.key}" class="b3-text-field" type="number" step="any" bind:value={values[f.key]} disabled={saving} />
                        {:else}
                            <label for="lv-cap-{f.key}">{t(`field.${f.key}`) !== `field.${f.key}` ? t(`field.${f.key}`) : f.key}</label>
                            <input id="lv-cap-{f.key}" class="b3-text-field" type={f.type === "url" ? "url" : "text"} bind:value={values[f.key]} disabled={saving} />
                        {/if}
                    </div>
                {/each}
                {#if saveError}
                    <span class="lv-caption" role="alert" style="color:var(--lv-danger)">⚠ {saveError}</span>
                {/if}
            {/if}
        </div>
        <div class="lv-sheet-foot">
            <button class="lv-btn ghost" onclick={close} disabled={saving}>{t("cancel")}</button>
            <!-- 268 波：连续录入（家庭数据常成批）——保存后清空字段保留弹层，焦点回名称 -->
            <button class="lv-btn" onclick={() => save(true)} disabled={saving || modules.length === 0 || !String(values.name ?? "").trim()}>
                {t("capture.saveContinue")}
            </button>
            <button class="lv-btn primary" onclick={() => save(false)} disabled={saving || modules.length === 0 || !String(values.name ?? "").trim()}>
                {saving ? t("ledger.saving") : t("save")}
            </button>
        </div>
    </div>
</div>
