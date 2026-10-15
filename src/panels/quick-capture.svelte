<script lang="ts">
    // 267 波：快速记录弹层（原型 .sheet 生产化）——480px 中央弹层，schema.capture 列集驱动，
    // 未建库自动建库（triage 同链路）。常驻挂载：关闭仅收起弹层，草稿保留到下次打开（对齐原型）。
    import { confirm, showMessage } from "siyuan";
    import { tick } from "svelte";
    import { addDetachedRow, RowIdentityPendingError, setCell } from "@/core/siyuan";
    import { saveRuntime } from "@/core/hub/runtime";
    import { captureCellValue, getCaptureFields, validateCaptureInput } from "@/core/capture";
    import type { ColumnDef, ModuleSchema } from "@/core/schema";
    import type { HomeSettings } from "@/types";
    import UiIcon from "@/ui/icon.svelte";

    interface ICapturePluginLike {
        i18n: Record<string, unknown>;
        settings: HomeSettings;
        schemaCatalog?: Record<string, ModuleSchema>;
        runtime?: { hubQuickModule?: string };
        openSetting: () => void;
        refreshHub?: (only?: string | string[], force?: boolean) => Promise<unknown>;
        showTabDocs?: (docId?: string) => void;
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

    // 打开时恢复上次模块；后台模块列表刷新时只在当前模块失效后回退。
    let moduleId = $state("");
    let identityPending = $state(false);
    /** Stable per submission.  Retries after a timeout reuse the same key so
     * the kernel's idempotency cache cannot create a second detached row. */
    let saveOperationKey = $state<string | undefined>();

    function nextSaveOperationKey(): string {
        try { return `capture:${crypto.randomUUID()}`; }
        catch { return `capture:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`; }
    }
    let pendingModuleId = $state<string | undefined>();
    let pendingRowId = $state<string | undefined>();
    let wasOpen = false;
    $effect(() => {
        if (open && !wasOpen) {
            wasOpen = true;
            const last = identityPending || pendingRowId ? pendingModuleId : plugin.runtime?.hubQuickModule;
            moduleId = last && (modules.includes(last) || ((identityPending || pendingRowId) && last === pendingModuleId))
                ? last
                : (modules[0] ?? "");
        } else if (!open) {
            wasOpen = false;
        } else if (!identityPending && !pendingRowId && moduleId && !modules.includes(moduleId)) {
            const last = plugin.runtime?.hubQuickModule;
            moduleId = last && modules.includes(last) ? last : (modules[0] ?? "");
        }
    });

    const captureFields = $derived.by(() => {
        return getCaptureFields(plugin.schemaCatalog?.[moduleId]);
    });

    function fieldLabel(field: ColumnDef): string {
        const key = field.labelKey ?? `field.${field.key}`;
        return t(key) !== key ? t(key) : field.key;
    }
    function fieldPlaceholder(field: ColumnDef): string {
        if (field.placeholderKey) return t(field.placeholderKey);
        return field.key === "name" ? t("ledger.newName") : fieldLabel(field);
    }
    function fieldDetail(key: string | undefined): string {
        if (!key) return "";
        const value = t(key);
        return value === key ? "" : value;
    }
    function fieldRequired(field: ColumnDef): boolean {
        return field.required === true;
    }

    let values: Record<string, string | number | boolean | undefined> = $state({});
    // Keep one small draft per module. Switching the destination is common
    // during batch entry; silently clearing the previous form makes it easy
    // to lose a name or a date.
    let valuesByModule: Record<string, Record<string, string | number | boolean | undefined>> = $state({});
    let currentModuleId = "";
    $effect(() => {
        void moduleId;
        if (!moduleId) return;
        if (!currentModuleId) {
            currentModuleId = moduleId;
            values = { ...(valuesByModule[moduleId] ?? {}) };
            saveError = "";
            fieldErrors = {};
            return;
        }
        if (currentModuleId !== moduleId) {
            valuesByModule = { ...valuesByModule, [currentModuleId]: { ...values } };
            currentModuleId = moduleId;
            values = { ...(valuesByModule[moduleId] ?? {}) };
            saveError = "";
            fieldErrors = {};
        }
    });

    let saving = $state(false);
    let saveError = $state("");
    let fieldErrors: Record<string, string> = $state({});
    let identityChecked = $state(false);
    let nameEl: HTMLInputElement | undefined = $state();

    function close() {
        if (saving) return;
        open = false;
        onClose?.();
    }
    function onWindowKeydown(e: KeyboardEvent) {
        if (!open) return;
        if (e.key === "Tab" && saving) {
            // All form fields are disabled during save; retain focus in the modal.
            e.preventDefault();
            document.querySelector<HTMLElement>(".lv-modal.open[aria-labelledby='lv-capture-title']")?.focus();
            return;
        }
        if (saving) return;
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
    let focusWasOpen = false;
    $effect(() => {
        if (open && !focusWasOpen) {
            focusWasOpen = true;
            void tick().then(() => nameEl?.focus());
        } else if (!open) {
            focusWasOpen = false;
        }
    });

    const modOptions = $derived(modules.map((id) => ({ id, label: modLabel(id) + (plugin.settings.dbRefs?.[id]?.avId ? "" : t("triage.needProvision")) })));
    const activeTarget = $derived(plugin.settings.dbRefs?.[moduleId]);
    const filledCaptureCount = $derived.by(() => captureFields.filter((field: any) => {
        const value = values[field.key];
        return value !== undefined && value !== null && value !== "" && value !== false;
    }).length);

    function fieldDescriptionIds(field: ColumnDef): string | undefined {
        const ids = new Set<string>();
        if ((field.helpKey && fieldDetail(field.helpKey)) || (field.unitKey && fieldDetail(field.unitKey))) ids.add(`lv-cap-help-${field.key}`);
        if (fieldErrors[field.key]) ids.add(`lv-cap-error-${field.key}`);
        return ids.size ? [...ids].join(" ") : undefined;
    }

    function clearFieldError(key: string) {
        if (!fieldErrors[key]) return;
        const next = { ...fieldErrors };
        delete next[key];
        fieldErrors = next;
        saveError = "";
    }

    function validationMessage(field: ColumnDef, issue: string): string {
        const key = `capture.validation.${issue}`;
        return t(key)
            .replace("${field}", fieldLabel(field))
            .replace("${min}", String(field.min ?? ""))
            .replace("${max}", String(field.max ?? ""));
    }

    async function save(continueAfter = false) {
        if (saving || identityPending) return;
        const title = String(values.name ?? "").trim();
        saveError = "";
        fieldErrors = {};
        for (const field of captureFields) {
            const issue = validateCaptureInput(field, values[field.key]);
            const relationID = field.type === "relation" ? String(values[field.key] ?? "").trim() : "";
            const staleRelation = relationID && !(plugin.settings.members ?? []).some((m) => m.avItemId === relationID);
            if (!issue && !staleRelation) continue;
            const message = staleRelation ? t("members.notLinked") : validationMessage(field, issue!);
            fieldErrors = { [field.key]: message };
            saveError = message;
            await tick();
            document.getElementById(`lv-cap-${field.key}`)?.focus();
            return;
        }
        saving = true;
        saveError = "";
        if (!saveOperationKey) saveOperationKey = nextSaveOperationKey();
        // 268 波：连续录入的重聚焦必须在 saving=false 之后（disabled 输入框不可聚焦）
        let refocusName = false;
        try {
            let r = plugin.settings.dbRefs[moduleId];
            if (pendingRowId && pendingModuleId !== moduleId) {
                saveError = t("capture.pendingTarget");
                return;
            }
            if (!r?.avId) {
                // 未建库自动建库（triage 同链路；provisionModule 幂等）
                await import("@/core/provisioner").then((m) => m.provisionModule(
                    plugin.settings, moduleId, plugin.schemaCatalog?.[moduleId] as any, modLabel(moduleId),
                    { resolveName: (k: string) => String(plugin.i18n[`field.${k}`] ?? k) },
                ));
                r = plugin.settings.dbRefs[moduleId];
                if (!r?.avId) throw new Error(t("triage.noTarget"));
            }
            const missingColumn = captureFields.find((field) => {
                const value = values[field.key];
                const hasValue = field.key === "name" || (value !== undefined && value !== null && value !== "" && value !== false);
                return hasValue && !r!.columns?.[field.key];
            });
            if (missingColumn) throw new Error(t("capture.missingColumn").replace("${field}", fieldLabel(missingColumn)));
            // 禁用选项仍可能由旧草稿带入失效关系 ID；建行前做最终校验。
            for (const f of captureFields as { key: string; type: string }[]) {
                if (f.type !== "relation") continue;
                const relationID = String(values[f.key] ?? "").trim();
                if (relationID && !(plugin.settings.members ?? []).some((m) => m.avItemId === relationID)) {
                    saveError = t("members.notLinked");
                    fieldErrors = { [f.key]: saveError };
                    await tick();
                    document.getElementById(`lv-cap-${f.key}`)?.focus();
                    return;
                }
            }
            let itemID = pendingRowId;
            if (!itemID) {
                pendingModuleId = moduleId;
                try {
                    itemID = await addDetachedRow(r.avId, title, { idempotencyKey: `${saveOperationKey}:row` });
                    pendingRowId = itemID;
                } catch (e) {
                    if (e instanceof RowIdentityPendingError) {
                        identityPending = true;
                        saveError = t("capture.identityPending").replace("${module}", modLabel(moduleId));
                        return;
                    }
                    throw e;
                }
            }
            // 新建行身份确认存在延迟：setCell 失败受控重试（同格重写不会重复建行，triage 同款）
            const setCellSafe = async (key: string, value: unknown) => {
                const keyID = r!.columns?.[key];
                if (!keyID) throw new Error(t("capture.missingColumn").replace("${field}", fieldLabel(captureFields.find((field) => field.key === key) ?? { key, type: "text" })));
                for (let attempt = 0; ; attempt++) {
                    try { await setCell(r!.avId, keyID, itemID, value, { idempotencyKey: `${saveOperationKey}:cell:${key}` }); return; }
                    catch (err) {
                        if (attempt >= 2) throw err;
                        await new Promise((res) => setTimeout(res, 400));
                    }
                }
            };
            await setCellSafe("name", { type: "text", text: { content: title } });
            for (const f of captureFields) {
                if (f.key === "name") continue;
                const v = values[f.key];
                if (v === undefined || v === null || (v === "" && f.type !== "checkbox")) continue;
                const cell = captureCellValue(f, v);
                if (cell !== undefined) await setCellSafe(f.key, cell);
            }
            // A preference failure must not turn a committed row into a retryable save failure.
            const previousQuickModule = plugin.runtime?.hubQuickModule;
            try {
                if (plugin.runtime) {
                    plugin.runtime.hubQuickModule = moduleId;
                    await saveRuntime(plugin as any, plugin.runtime as any);
                }
            } catch (e) {
                if (plugin.runtime) plugin.runtime.hubQuickModule = previousQuickModule;
                showMessage(t("capture.preferenceSaveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
            }
            let refreshFailed = false;
            try {
                // A capture can create a new reminder row. Bypass the normal
                // full-scan debounce so overview/reminders reflect it now.
                await plugin.refreshHub?.(undefined, true);
            } catch (e) {
                refreshFailed = true;
                console.warn("[siyuan-home] quick capture saved but refresh failed:", e);
                showMessage(t("capture.savedRefreshFailed").replace("${module}", modLabel(moduleId)), 5000, "error");
            }
            if (!refreshFailed) showMessage(t("capture.saved").replace("${module}", modLabel(moduleId)), 3000, "info");
            if (continueAfter) {
                // 268 波：连续录入——清空字段、保留模块（家庭录入常成批）
                values = {};
                valuesByModule = { ...valuesByModule, [moduleId]: {} };
                refocusName = true;
            } else {
                values = {};
                valuesByModule = { ...valuesByModule, [moduleId]: {} };
                open = false;
            }
            pendingRowId = undefined;
            pendingModuleId = undefined;
            saveOperationKey = undefined;
        } catch (e) {
            const messageKey = pendingRowId ? "capture.partialFailed" : "capture.failed";
            saveError = t(messageKey).replace("${msg}", e instanceof Error ? e.message : String(e));
        } finally {
            saving = false;
        }
        // saving=false 到 DOM 重新可聚焦之间隔着一个 Svelte 刷新（微任务）——tick 后再聚焦
        if (refocusName) await tick().then(() => nameEl?.focus());
    }
    function openPendingLedger() {
        const targetModule = pendingModuleId ?? moduleId;
        const docId = plugin.settings.dbRefs[targetModule]?.docId;
        if (!docId || !plugin.showTabDocs) {
            showMessage(t("capture.ledgerUnavailable").replace("${module}", modLabel(targetModule)), 5000, "error");
            return;
        }
        identityChecked = true;
        close();
        plugin.showTabDocs(docId);
    }

    function discardUncertainDraft() {
        if (!identityChecked || saving) return;
        confirm(
            t("capture.discardUncertain"),
            t("capture.discardUncertainConfirm").replace("${module}", modLabel(pendingModuleId ?? moduleId)),
            () => {
                values = {};
                pendingRowId = undefined;
                pendingModuleId = undefined;
                saveOperationKey = undefined;
                identityPending = false;
                identityChecked = false;
                saveError = "";
                showMessage(t("capture.uncertainDraftDiscarded"), 6000, "info");
            },
        );
    }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- 267 波：.lv-mask/.lv-modal（07 §10）首次投产；常驻挂载 + .open 切换保住出入场过渡与草稿 -->
<div class="lv-mask" class:open aria-hidden="true" onclick={close}></div>
<div class="lv-modal" class:open role="dialog" aria-modal="true" aria-labelledby="lv-capture-title" aria-busy={saving} tabindex="-1" inert={!open}>
    <div class="lv-sheet">
        <div class="lv-sheet-head">
            <b id="lv-capture-title" style="font-size:14px;display:inline-flex;align-items:center;gap:6px"><UiIcon name="bolt" size={15} /> {t("capture.title")}</b>
            <select class="b3-select" style="margin-left:auto;max-width:200px" bind:value={moduleId} aria-label={t("capture.moduleSelect")} disabled={saving || identityPending || !!pendingRowId}>
                {#each modOptions as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
            </select>
            <button class="lv-iconbtn" aria-label={t("capture.closeKeepDraft")} title={t("capture.closeKeepDraft")} onclick={close} disabled={saving}><UiIcon name="close" size={16} /></button>
        </div>
        <div class="lv-sheet-body lv-cap-body">
            {#if modules.length === 0}
                <div class="lv-capture-empty">
                    <span class="lv-caption">{t("capture.noModules")}</span>
                    <button class="b3-button b3-button--outline" onclick={() => plugin.openSetting()}>{t("startGuide.openSettings")}</button>
                </div>
            {:else if captureFields.length === 0}
                <div class="lv-capture-empty">
                    <span class="lv-caption">{t("capture.noFields")}</span>
                    <button class="b3-button b3-button--outline" onclick={() => plugin.openSetting()}>{t("startGuide.openSettings")}</button>
                </div>
            {:else}
                <div class="lv-capture-context" role="status">
                    <div class="lv-capture-context__main">
                        <span class="lv-capture-context__eyebrow">{t("capture.contextTitle")}</span>
                        <strong>{modLabel(moduleId)}</strong>
                    </div>
                    <span class="lv-capture-context__count">{t("capture.fieldCount").replace("${filled}", String(filledCaptureCount)).replace("${total}", String(captureFields.length))}</span>
                    <span class="lv-capture-context__hint">
                        {activeTarget?.avId
                            ? t("capture.contextHint").replace("${module}", modLabel(moduleId))
                            : t("capture.noTarget").replace("${module}", modLabel(moduleId))}
                    </span>
                </div>
                {#each captureFields as f (f.key)}
                    <div class="lv-frow">
                        {#if f.key === "name"}
                            <label for="lv-cap-name">{fieldLabel(f)} <small class="lv-capture-required">{t("capture.required")}</small></label>
                            <input bind:this={nameEl} id="lv-cap-name" class="b3-text-field" type="text"
                                placeholder={fieldPlaceholder(f)} bind:value={values.name} disabled={saving} required={fieldRequired(f)}
                                aria-invalid={fieldErrors.name ? "true" : undefined}
                                aria-describedby={fieldDescriptionIds(f)}
                                oninput={() => clearFieldError(f.key)}
                                onkeydown={(e: KeyboardEvent) => { if (e.key === "Enter" && !e.isComposing) save(false); }} />
                        {:else}
                            <label for="lv-cap-{f.key}">{fieldLabel(f)}{#if fieldRequired(f)} <small class="lv-capture-required">{t("capture.required")}</small>{/if}</label>
                        {/if}
                        {#if f.key !== "name" && f.type === "select"}
                            <select id="lv-cap-{f.key}" class="b3-select" bind:value={values[f.key]} disabled={saving} required={fieldRequired(f)} aria-invalid={fieldErrors[f.key] ? "true" : undefined} aria-describedby={fieldDescriptionIds(f)} onchange={() => clearFieldError(f.key)}>
                                <option value="">{t("capture.selectOptional")}</option>
                                {#each f.options ?? [] as opt (opt)}
                                    <option value={opt}>{t(`field.${f.key}.opt.${opt}`) !== `field.${f.key}.opt.${opt}` ? t(`field.${f.key}.opt.${opt}`) : opt}</option>
                                {/each}
                            </select>
                        {:else if f.key !== "name" && f.type === "relation"}
                            <select id="lv-cap-{f.key}" class="b3-select" bind:value={values[f.key]} disabled={saving} required={fieldRequired(f)} aria-invalid={fieldErrors[f.key] ? "true" : undefined} aria-describedby={fieldDescriptionIds(f)} onchange={() => clearFieldError(f.key)}>
                                <option value="">{t("capture.selectOptional")}</option>
                                {#each plugin.settings.members ?? [] as m (m.avItemId ?? m.id)}
                                    <option value={m.avItemId ?? ""} disabled={!m.avItemId}>
                                        {m.name}{m.avItemId ? "" : ` · ${t("members.notLinked")}`}
                                    </option>
                                {/each}
                            </select>
                        {:else if f.key !== "name" && f.type === "date"}
                            <input id="lv-cap-{f.key}" class="b3-text-field" type="date" bind:value={values[f.key]} disabled={saving} required={fieldRequired(f)} aria-invalid={fieldErrors[f.key] ? "true" : undefined} aria-describedby={fieldDescriptionIds(f)} oninput={() => clearFieldError(f.key)} />
                        {:else if f.key !== "name" && f.type === "number"}
                            <input id="lv-cap-{f.key}" class="b3-text-field" type="number" min={f.min} max={f.max} step={f.step ?? "any"} placeholder={fieldPlaceholder(f)} bind:value={values[f.key]} disabled={saving} required={fieldRequired(f)} aria-invalid={fieldErrors[f.key] ? "true" : undefined} aria-describedby={fieldDescriptionIds(f)} oninput={() => clearFieldError(f.key)} />
                        {:else if f.key !== "name" && f.type === "checkbox"}
                            <input id="lv-cap-{f.key}" class="b3-switch" type="checkbox" checked={values[f.key] === true} disabled={saving} required={fieldRequired(f)} aria-invalid={fieldErrors[f.key] ? "true" : undefined} aria-describedby={fieldDescriptionIds(f)} onchange={(event) => { values[f.key] = event.currentTarget.checked; clearFieldError(f.key); }} />
                        {:else if f.key !== "name"}
                            <input id="lv-cap-{f.key}" class="b3-text-field" type={f.type === "url" ? "url" : "text"} placeholder={fieldPlaceholder(f)} bind:value={values[f.key]} disabled={saving} required={fieldRequired(f)} aria-invalid={fieldErrors[f.key] ? "true" : undefined} aria-describedby={fieldDescriptionIds(f)} oninput={() => clearFieldError(f.key)} />
                        {/if}
                        {#if f.key !== "name" && (fieldDetail(f.helpKey) || fieldDetail(f.unitKey))}
                            <small id="lv-cap-help-{f.key}" class="lv-capture-field-hint">
                                {fieldDetail(f.helpKey)}{#if fieldDetail(f.helpKey) && fieldDetail(f.unitKey)} · {/if}{#if fieldDetail(f.unitKey)}{t("capture.unitLabel")}：{fieldDetail(f.unitKey)}{/if}
                            </small>
                        {/if}
                        {#if fieldErrors[f.key]}<small id="lv-cap-error-{f.key}" class="lv-capture-field-error">{fieldErrors[f.key]}</small>{/if}
                    </div>
                {/each}
                {#if saving}<span class="lv-caption lv-capture-saving" role="status" aria-live="polite">{t("ledger.saving")}</span>{/if}
                {#if saveError}
                    <span class="lv-caption lv-capture-error-summary" role="alert" aria-live="assertive"><UiIcon name="alert" size={13} /> {saveError}</span>
                {/if}
            {/if}
        </div>
        <div class="lv-sheet-foot">
            <button class="b3-button b3-button--text" onclick={close} disabled={saving}>{t("cancel")}</button>
            <span class="fn__flex-1"></span>
            {#if identityPending}
                <button class="lv-btn ghost" onclick={openPendingLedger} disabled={saving}>{t("capture.checkLedger")}</button>
                {#if identityChecked}<button class="lv-btn ghost" onclick={discardUncertainDraft}>{t("capture.discardUncertain")}</button>{/if}
            {/if}
            <!-- 268 波：连续录入（家庭数据常成批）——保存后清空字段保留弹层，焦点回名称 -->
            <button class="lv-btn" onclick={() => save(true)} disabled={saving || identityPending || modules.length === 0 || captureFields.length === 0}>
                {saving ? t("ledger.saving") : pendingRowId ? t("capture.retryContinue") : t("capture.saveContinue")}
            </button>
            <button class="lv-btn primary" onclick={() => save(false)} disabled={saving || identityPending || modules.length === 0 || captureFields.length === 0}>
                {saving ? t("ledger.saving") : pendingRowId ? t("capture.retryClose") : t("capture.saveClose")}
            </button>
        </div>
    </div>
</div>
