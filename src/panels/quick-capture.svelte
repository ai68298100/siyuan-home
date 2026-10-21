<script lang="ts">
    // 267 波：快速记录弹层（原型 .sheet 生产化）——480px 中央弹层，schema.capture 列集驱动，
    // 未建库自动建库（triage 同链路）。常驻挂载：关闭仅收起弹层，草稿保留到下次打开（对齐原型）。
    import { confirm, showMessage } from "siyuan";
    import { tick } from "svelte";
    import { addDetachedRow, RowIdentityPendingError, setCell, renderLedgerAll } from "@/core/siyuan";
    import { saveRuntime } from "@/core/hub/runtime";
    import { captureCellValue, getCaptureFields, validateCaptureInput } from "@/core/capture";
    import { getGroupedModules, moduleIcon } from "@/core/modules";
    import { localDateKey } from "@/core/hub/rule";
    import { getQuickTemplates, type QuickRecordTemplate } from "@/core/quick-templates";
    import { buildFuelingLog, buildVitalLog } from "@/core/quick-actions";
    import { updateRowLogs, appendEntry } from "@/core/rowlog";
    import type { ColumnDef, ModuleSchema } from "@/core/schema";
    import type { HomeSettings } from "@/types";
    import UiIcon from "@/ui/icon.svelte";
    import { smartExtractFieldsFromTitle, type ParsedCaptureResult } from "@/core/block-capture";

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

    // 模式切换：日常高频流水 vs 台账实体建档
    type CaptureTab = "event" | "ledger";
    let captureTab = $state<CaptureTab>("event");

    type EventSubAction = "fuel" | "vital" | "shopping" | "snippet";
    let eventSub = $state<EventSubAction>("fuel");

    // 常用流水：车辆与加油
    let vehiclesList = $state<Array<{ itemID: string; name: string; plate: string; mileage?: number }>>([]);
    let selectedVehicleId = $state("");
    let fuelingAmount = $state<number | undefined>();
    let fuelingLiters = $state<number | undefined>();
    let fuelingMileage = $state<number | undefined>();
    let fuelingType = $state("gasoline");
    let fuelingDate = $state(localDateKey(new Date()));

    // 常用流水：生理指标（血压/血糖）
    let vitalMemberId = $state("");
    let vitalMetricType = $state<"bp" | "glucose">("bp");
    let vitalDate = $state(localDateKey(new Date()));
    let vitalSys = $state<number | undefined>();
    let vitalDia = $state<number | undefined>();
    let vitalPulse = $state<number | undefined>();
    let vitalGlucose = $state<number | undefined>();
    let vitalTiming = $state<"fasting" | "postprandial">("fasting");

    // 常用流水：快捷待买
    let quickShopName = $state("");
    let quickShopQty = $state(1);

    // 常用流水：随手便签
    let quickSnippetText = $state("");

    let lastMemberId = $state("");

    async function submitQuickFueling() {
        if (!selectedVehicleId || !fuelingAmount) {
            saveError = "请选择车辆并填写加油金额";
            return;
        }
        saving = true;
        saveError = "";
        try {
            const log = buildFuelingLog({
                date: fuelingDate,
                amount: fuelingAmount,
                liters: fuelingLiters,
                mileage: fuelingMileage,
                fuelType: fuelingType,
            });
            const vRef = plugin.settings.dbRefs?.vehicles;
            if (!vRef?.avId) throw new Error("vehicles ledger not provisioned");
            await updateRowLogs(plugin as any, (cur) => appendEntry(cur, vRef.avId!, selectedVehicleId, fuelingType === "electric" ? "chargings" : "fuelings", log));
            if (fuelingMileage && vRef.columns?.mileage) {
                await setCell(vRef.avId, vRef.columns.mileage, selectedVehicleId, { type: "number", number: { content: fuelingMileage } });
            }
            showMessage(t("capture.savedEvent"), 2500, "info");
            fuelingAmount = undefined;
            fuelingLiters = undefined;
            fuelingMileage = undefined;
            close();
        } catch (e) {
            saveError = String(e);
        } finally {
            saving = false;
        }
    }

    async function submitQuickVital() {
        if (!vitalMemberId) {
            saveError = "请选择家庭成员";
            return;
        }
        saving = true;
        saveError = "";
        try {
            const log = buildVitalLog({
                date: vitalDate,
                metricType: vitalMetricType,
                systolic: vitalSys,
                diastolic: vitalDia,
                pulse: vitalPulse,
                glucose: vitalGlucose,
                glucoseTiming: vitalTiming,
            });
            const healthRef = plugin.settings.dbRefs?.health;
            if (!healthRef?.avId) throw new Error("health ledger not provisioned");
            const all = await renderLedgerAll(healthRef.avId);
            const row = (all.rows ?? []).find((r) => r.cells?.[healthRef.columns!.member]?.relation?.blockIDs?.includes(vitalMemberId)) || all.rows?.[0];
            if (!row) throw new Error("no health record row for member");
            await updateRowLogs(plugin as any, (cur) => appendEntry(cur, healthRef.avId!, row.itemID, "vitals", log));
            showMessage(t("capture.savedEvent"), 2500, "info");
            vitalSys = undefined;
            vitalDia = undefined;
            vitalGlucose = undefined;
            close();
        } catch (e) {
            saveError = String(e);
        } finally {
            saving = false;
        }
    }

    async function submitQuickShopping() {
        const name = quickShopName.trim();
        if (!name) return;
        saving = true;
        saveError = "";
        try {
            const shopRef = plugin.settings.dbRefs?.shopping;
            if (!shopRef?.avId || !shopRef.columns?.name) throw new Error("shopping ledger not provisioned");
            const rowId = await addDetachedRow(shopRef.avId, name, { idempotencyKey: `quick:shop:${Date.now()}` });
            if (shopRef.columns.qty && quickShopQty) {
                await setCell(shopRef.avId, shopRef.columns.qty, rowId, { type: "number", number: { content: quickShopQty } });
            }
            showMessage(t("capture.savedEvent"), 2500, "info");
            quickShopName = "";
            quickShopQty = 1;
            close();
        } catch (e) {
            saveError = String(e);
        } finally {
            saving = false;
        }
    }

    async function submitQuickSnippet() {
        const text = quickSnippetText.trim();
        if (!text) return;
        saving = true;
        saveError = "";
        try {
            const snipRef = plugin.settings.dbRefs?.snippets;
            if (!snipRef?.avId || !snipRef.columns) throw new Error("snippets ledger not provisioned");
            const title = text.slice(0, 30);
            const rowId = await addDetachedRow(snipRef.avId, title, { idempotencyKey: `quick:snip:${Date.now()}` });
            const col = snipRef.columns.content || snipRef.columns.note;
            if (col) {
                await setCell(snipRef.avId, col, rowId, { type: "text", text: { content: text } });
            }
            showMessage(t("capture.savedEvent"), 2500, "info");
            quickSnippetText = "";
            close();
        } catch (e) {
            saveError = String(e);
        } finally {
            saving = false;
        }
    }

    async function loadQuickEventContext() {
        const vRef = plugin.settings.dbRefs?.vehicles;
        if (vRef?.avId && vRef.columns?.name) {
            try {
                const all = await renderLedgerAll(vRef.avId);
                vehiclesList = (all.rows ?? []).map((r) => {
                    const name = String(r.cells[vRef.columns!.name]?.text?.content ?? "").trim() || "未命名车辆";
                    const plate = vRef.columns!.plate ? String(r.cells[vRef.columns!.plate]?.text?.content ?? "") : "";
                    const mileage = vRef.columns!.mileage ? Number(r.cells[vRef.columns!.mileage]?.number?.content) : undefined;
                    return { itemID: r.itemID, name, plate, mileage };
                });
                if (vehiclesList.length > 0 && !selectedVehicleId) {
                    selectedVehicleId = vehiclesList[0].itemID;
                    if (vehiclesList[0].mileage) fuelingMileage = vehiclesList[0].mileage;
                }
            } catch { /* ignore */ }
        }
        if (!vitalMemberId && (plugin.settings.members?.length ?? 0) > 0) {
            const selfMem = plugin.settings.members?.find((m) => m.role === "self") || plugin.settings.members?.[0];
            if (selfMem?.avItemId) vitalMemberId = selfMem.avItemId;
        }
    }

    $effect(() => {
        if (open) {
            void loadQuickEventContext();
        }
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
            initSmartDefaults();
            saveError = "";
            fieldErrors = {};
            return;
        }
        if (currentModuleId !== moduleId) {
            valuesByModule = { ...valuesByModule, [currentModuleId]: { ...values } };
            currentModuleId = moduleId;
            values = { ...(valuesByModule[moduleId] ?? {}) };
            initSmartDefaults();
            saveError = "";
            fieldErrors = {};
        }
    });

    function initSmartDefaults() {
        for (const f of captureFields) {
            if (values[f.key] === undefined || values[f.key] === "") {
                if (f.type === "date" && (f.key === "date" || f.key === "issue_date")) {
                    values[f.key] = localDateKey(new Date());
                } else if (f.type === "number" && (f.key === "qty" || f.key === "stock_qty")) {
                    values[f.key] = 1;
                } else if (f.type === "relation" && f.key === "member" && lastMemberId) {
                    values[f.key] = lastMemberId;
                }
            }
        }
    }

    let saving = $state(false);
    let saveError = $state("");
    let fieldErrors: Record<string, string> = $state({});
    let identityChecked = $state(false);
    let nameEl: HTMLInputElement | undefined = $state();

    // 301波：智能速记与思源块文本结构化预填
    let smartInputText = $state("");
    let smartParsed = $state<ParsedCaptureResult | null>(null);

    async function handleSmartInput() {
        if (!smartInputText.trim()) {
            smartParsed = null;
            return;
        }
        const { smartParseNoteContent } = await import("@/core/block-capture");
        smartParsed = smartParseNoteContent(smartInputText);
    }

    function applySmartParse() {
        if (!smartParsed) return;
        const p = smartParsed;
        const has = (k: string) => captureFields.some((f) => f.key === k);
        if (p.suggestedModule && modules.includes(p.suggestedModule) && !pendingRowId) {
            moduleId = p.suggestedModule;
        }
        if (p.title) values["name"] = p.title;
        if (p.amount !== undefined) {
            if (has("amount")) values["amount"] = p.amount;
            else if (has("deposit")) values["deposit"] = p.amount;
        }
        if (p.date) {
            for (const k of ["expiry", "date", "due"]) {
                if (has(k)) { values[k] = p.date; break; }
            }
        }
        if (p.note && has("note")) values["note"] = p.note;
        smartInputText = "";
        smartParsed = null;
        showMessage(t("capture.smartConfidence").replace("${n}", String(Math.round(p.confidence * 100))), 2500, "info");
    }

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
    let triggerElement: HTMLElement | null = null;
    let focusWasOpen = false;
    $effect(() => {
        if (open && !focusWasOpen) {
            focusWasOpen = true;
            triggerElement = document.activeElement as HTMLElement | null;
            void tick().then(() => {
                if (nameEl) nameEl.focus();
                else {
                    const first = document.querySelector<HTMLElement>(".lv-modal.open .lv-sheet button, .lv-modal.open .lv-sheet select");
                    first?.focus();
                }
            });
        } else if (!open) {
            if (focusWasOpen && triggerElement && typeof triggerElement.focus === "function") {
                triggerElement.focus();
                triggerElement = null;
            }
            focusWasOpen = false;
        }
    });

    const groupedMods = $derived(getGroupedModules(modules));
    const FREQUENT_MODULE_CANDIDATES = ["medicine", "stock", "certs", "shopping", "chores", "contracts", "vehicles", "food", "house", "schooling"];
    const frequentModules = $derived(FREQUENT_MODULE_CANDIDATES.filter((id) => modules.includes(id)).slice(0, 7));

    let keepContext = $state(false);
    const COMMON_LOCATIONS = ["主卧抽屉", "客厅药箱", "玄关柜", "书房书架", "储藏室", "冰箱冷藏", "厨房吊柜"];

    function applyDatePreset(key: string, daysAhead: number) {
        const d = new Date();
        d.setDate(d.getDate() + daysAhead);
        values[key] = localDateKey(d);
        clearFieldError(key);
    }

    function applyLocationPreset(key: string, loc: string) {
        values[key] = loc;
        clearFieldError(key);
    }

    const activeTarget = $derived(plugin.settings.dbRefs?.[moduleId]);
    const currentTemplates = $derived(getQuickTemplates(moduleId));

    function applyTemplate(template: QuickRecordTemplate) {
        for (const [k, v] of Object.entries(template.values)) {
            values[k] = v;
            clearFieldError(k);
        }
    }

    function handleNameBlur() {
        if (!values.name || typeof values.name !== "string") return;
        const res = smartExtractFieldsFromTitle(values.name);
        if (res.cleanTitle !== values.name) {
            values.name = res.cleanTitle;
            const dateField = captureFields.find((f) => f.type === "date");
            if (dateField && res.extractedDate && !values[dateField.key]) {
                values[dateField.key] = res.extractedDate;
                clearFieldError(dateField.key);
            }
            const numField = captureFields.find((f) => f.type === "number" && ["amount", "price", "cost"].includes(f.key));
            if (numField && res.extractedAmount !== undefined && !values[numField.key]) {
                values[numField.key] = res.extractedAmount;
                clearFieldError(numField.key);
            }
        }
    }
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
                try {
                    const { saveSettings } = await import("@/core/settings");
                    await saveSettings(plugin as any, plugin.settings);
                } catch { /* soft persist */ }
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
            if (values.member && typeof values.member === "string") {
                lastMemberId = values.member;
            }
            if (!refreshFailed) showMessage(t("capture.saved").replace("${module}", modLabel(moduleId)), 3000, "info");
            if (continueAfter) {
                // 268 波：连续录入——可按需保留公共字段（家庭录入常成批），焦点回名称
                if (keepContext) {
                    const retained: Record<string, string | number | boolean | undefined> = {};
                    for (const k of ["member", "date", "expiry", "due", "location", "store_place", "category", "energy_type", "status"]) {
                        if (values[k] !== undefined) retained[k] = values[k];
                    }
                    values = retained;
                    valuesByModule = { ...valuesByModule, [moduleId]: { ...retained } };
                } else {
                    values = {};
                    valuesByModule = { ...valuesByModule, [moduleId]: {} };
                }
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
            {#if captureTab === "ledger"}
                <select class="b3-select" style="margin-left:auto;max-width:200px" bind:value={moduleId} aria-label={t("capture.moduleSelect")} disabled={saving || identityPending || !!pendingRowId}>
                    {#each groupedMods as g (g.groupId)}
                        <optgroup label={g.groupLabel}>
                            {#each g.modules as m (m.id)}
                                <option value={m.id}>{modLabel(m.id)}{plugin.settings.dbRefs?.[m.id]?.avId ? "" : t("triage.needProvision")}</option>
                            {/each}
                        </optgroup>
                    {/each}
                </select>
            {:else}
                <span class="fn__flex-1"></span>
            {/if}
            <button class="lv-iconbtn" aria-label={t("capture.closeKeepDraft")} title={t("capture.closeKeepDraft")} onclick={close} disabled={saving}><UiIcon name="close" size={16} /></button>
        </div>
        <div class="lv-sheet-body lv-cap-body">
            <div class="lv-capture-mode-bar">
                <button type="button" class="lv-capture-mode-btn" class:active={captureTab === "event"} onclick={() => { captureTab = "event"; }}>
                    <span>{t("capture.tabEvent")}</span>
                </button>
                <button type="button" class="lv-capture-mode-btn" class:active={captureTab === "ledger"} onclick={() => { captureTab = "ledger"; }}>
                    <span>{t("capture.tabLedger")}</span>
                </button>
            </div>

            {#if captureTab === "event"}
                <!-- 常用生活流水模式 -->
                <div class="lv-event-subnav">
                    <button type="button" class="lv-event-subbtn" class:active={eventSub === "fuel"} onclick={() => { eventSub = "fuel"; }}>{t("capture.actFuel")}</button>
                    <button type="button" class="lv-event-subbtn" class:active={eventSub === "vital"} onclick={() => { eventSub = "vital"; }}>{t("capture.actVital")}</button>
                    <button type="button" class="lv-event-subbtn" class:active={eventSub === "shopping"} onclick={() => { eventSub = "shopping"; }}>{t("capture.actShopping")}</button>
                    <button type="button" class="lv-event-subbtn" class:active={eventSub === "snippet"} onclick={() => { eventSub = "snippet"; }}>{t("capture.actSnippet")}</button>
                </div>

                <div class="lv-event-card">
                    {#if eventSub === "fuel"}
                        {#if vehiclesList.length === 0}
                            <div class="lv-capture-empty">
                                <span class="lv-caption">{t("capture.noVehicles")}</span>
                                <button class="b3-button b3-button--outline" onclick={() => { captureTab = "ledger"; moduleId = "vehicles"; }}>+ {t("capture.addVehicleFirst")}</button>
                            </div>
                        {:else}
                            <div class="lv-frow">
                                <label for="lv-fuel-veh">{t("capture.selectVehicle")}</label>
                                <select id="lv-fuel-veh" class="b3-select" bind:value={selectedVehicleId} disabled={saving}>
                                    {#each vehiclesList as v (v.itemID)}
                                        <option value={v.itemID}>{v.name} {v.plate ? `(${v.plate})` : ""}</option>
                                    {/each}
                                </select>
                            </div>
                            <div class="lv-frow">
                                <label for="lv-fuel-amount">{t("capture.amountCny")} *</label>
                                <input id="lv-fuel-amount" class="b3-text-field" type="number" min="0" step="any" placeholder="加油/充电金额" bind:value={fuelingAmount} disabled={saving} />
                            </div>
                            <div class="lv-frow">
                                <label for="lv-fuel-mileage">{t("capture.currentMileage")}</label>
                                <input id="lv-fuel-mileage" class="b3-text-field" type="number" min="0" placeholder="当前总里程" bind:value={fuelingMileage} disabled={saving} />
                            </div>
                            <div class="lv-frow">
                                <label for="lv-fuel-liters">{t("capture.fuelLiters")}</label>
                                <input id="lv-fuel-liters" class="b3-text-field" type="number" min="0" step="any" placeholder="加油升数 / 充电度数" bind:value={fuelingLiters} disabled={saving} />
                            </div>
                            <div class="lv-frow">
                                <label for="lv-fuel-date">{t("field.date")}</label>
                                <input id="lv-fuel-date" class="b3-text-field" type="date" bind:value={fuelingDate} disabled={saving} />
                            </div>
                        {/if}
                    {:else if eventSub === "vital"}
                        <div class="lv-frow">
                            <label for="lv-vital-mem">{t("field.member")}</label>
                            <select id="lv-vital-mem" class="b3-select" bind:value={vitalMemberId} disabled={saving}>
                                {#each plugin.settings.members ?? [] as m (m.avItemId ?? m.id)}
                                    <option value={m.avItemId ?? ""}>{m.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="lv-frow">
                            <label for="lv-vital-type">指标类型</label>
                            <div style="display:flex;gap:8px">
                                <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="vitalType" value="bp" bind:group={vitalMetricType} /> {t("capture.metricBp")}</label>
                                <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="vitalType" value="glucose" bind:group={vitalMetricType} /> {t("capture.metricGlucose")}</label>
                            </div>
                        </div>
                        {#if vitalMetricType === "bp"}
                            <div class="lv-frow">
                                <label for="lv-vital-sys">{t("capture.systolic")}</label>
                                <input id="lv-vital-sys" class="b3-text-field" type="number" min="40" max="250" placeholder="如 120" bind:value={vitalSys} disabled={saving} />
                            </div>
                            <div class="lv-frow">
                                <label for="lv-vital-dia">{t("capture.diastolic")}</label>
                                <input id="lv-vital-dia" class="b3-text-field" type="number" min="30" max="150" placeholder="如 80" bind:value={vitalDia} disabled={saving} />
                            </div>
                            <div class="lv-frow">
                                <label for="lv-vital-pulse">{t("capture.pulse")}</label>
                                <input id="lv-vital-pulse" class="b3-text-field" type="number" min="30" max="220" placeholder="如 72" bind:value={vitalPulse} disabled={saving} />
                            </div>
                        {:else}
                            <div class="lv-frow">
                                <label for="lv-vital-glu">{t("capture.glucoseVal")}</label>
                                <input id="lv-vital-glu" class="b3-text-field" type="number" min="0" step="0.1" placeholder="如 5.6" bind:value={vitalGlucose} disabled={saving} />
                            </div>
                            <div class="lv-frow">
                                <label for="lv-vital-tim">测量时段</label>
                                <select id="lv-vital-tim" class="b3-select" bind:value={vitalTiming} disabled={saving}>
                                    <option value="fasting">{t("capture.fasting")}</option>
                                    <option value="postprandial">{t("capture.postprandial")}</option>
                                </select>
                            </div>
                        {/if}
                    {:else if eventSub === "shopping"}
                        <div class="lv-frow">
                            <label for="lv-shop-name">{t("field.name")} *</label>
                            <input id="lv-shop-name" class="b3-text-field" type="text" placeholder="输入想买的物品" bind:value={quickShopName} disabled={saving} />
                        </div>
                        <div class="lv-frow">
                            <label for="lv-shop-qty">{t("field.qty")}</label>
                            <input id="lv-shop-qty" class="b3-text-field" type="number" min="1" bind:value={quickShopQty} disabled={saving} />
                        </div>
                    {:else if eventSub === "snippet"}
                        <div class="lv-frow" style="display:flex;flex-direction:column;align-items:stretch">
                            <label for="lv-snip-text">{t("capture.actSnippet")}</label>
                            <textarea id="lv-snip-text" class="b3-text-field" rows="4" placeholder="随时记录一句话、常用语或家庭备忘..." bind:value={quickSnippetText} disabled={saving}></textarea>
                        </div>
                    {/if}
                </div>
            {:else}
                <!-- 实体台账建档模式 -->
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
                <div class="lv-smart-capture-bar" style="margin-bottom:8px">
                    <div style="display:flex;gap:6px;align-items:center">
                        <input class="b3-text-field" style="flex:1;font-size:12px;padding:4px 8px"
                            placeholder={t("capture.smartHint")}
                            aria-label={t("capture.smartHint")}
                            bind:value={smartInputText}
                            oninput={handleSmartInput}
                            disabled={saving}
                        />
                        {#if smartParsed && smartParsed.title}
                            <button class="b3-button b3-button--outline" style="font-size:11.5px;padding:3px 8px;flex-shrink:0"
                                aria-label={t("capture.smartDetected").replace("${module}", modLabel(smartParsed.suggestedModule || moduleId))}
                                onclick={applySmartParse}>
                                {t("capture.smartDetected").replace("${module}", modLabel(smartParsed.suggestedModule || moduleId))}
                            </button>
                        {/if}
                    </div>
                </div>
                {#if frequentModules.length > 0}
                    <div class="lv-quick-chips" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
                        {#each frequentModules as fId (fId)}
                            <button type="button" class="lv-quick-chip" class:active={moduleId === fId}
                                onclick={() => { moduleId = fId; }}
                                disabled={saving || identityPending}
                                title={modLabel(fId)}>
                                <span>{moduleIcon(fId)}</span>
                                <span>{modLabel(fId)}</span>
                            </button>
                        {/each}
                    </div>
                {/if}
                <div class="lv-capture-context" role="status" aria-live="polite">
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
                {#if currentTemplates.length > 0}
                    <div class="lv-template-bar" style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;padding:6px 10px;background:var(--lv-surface-2);border-radius:6px;font-size:11.5px;margin-bottom:6px">
                        <span class="lv-caption" style="color:var(--lv-tx-3);font-size:11px">✨ {t("capture.frequentTemplates") || "常用模板"}:</span>
                        {#each currentTemplates as tpl (tpl.id)}
                            <button type="button" class="lv-preset-tag" onclick={() => applyTemplate(tpl)} disabled={saving} style="font-size:11.5px;padding:2px 8px">
                                {#if tpl.icon}<span>{tpl.icon}</span>{/if}
                                <span>{tpl.label}</span>
                            </button>
                        {/each}
                    </div>
                {/if}
                {#each captureFields as f (f.key)}
                    <div class="lv-frow">
                        {#if f.key === "name"}
                            <label for="lv-cap-name">{fieldLabel(f)} <small class="lv-capture-required">{t("capture.required")}</small></label>
                            <input bind:this={nameEl} id="lv-cap-name" class="b3-text-field" type="text"
                                placeholder={fieldPlaceholder(f)} bind:value={values.name} disabled={saving} required={fieldRequired(f)}
                                aria-invalid={fieldErrors.name ? "true" : undefined}
                                aria-describedby={fieldDescriptionIds(f)}
                                oninput={() => clearFieldError(f.key)}
                                onblur={handleNameBlur}
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
                            <div class="lv-preset-tags">
                                <button type="button" class="lv-preset-tag" onclick={() => applyDatePreset(f.key, 0)}>{t("capture.presetToday")}</button>
                                <button type="button" class="lv-preset-tag" onclick={() => applyDatePreset(f.key, 1)}>{t("capture.presetTomorrow")}</button>
                                <button type="button" class="lv-preset-tag" onclick={() => applyDatePreset(f.key, 7)}>{t("capture.presetNextWeek")}</button>
                                <button type="button" class="lv-preset-tag" onclick={() => applyDatePreset(f.key, 30)}>{t("capture.presetNextMonth")}</button>
                                <button type="button" class="lv-preset-tag" onclick={() => applyDatePreset(f.key, 365)}>{t("capture.presetNextYear")}</button>
                            </div>
                        {:else if f.key !== "name" && f.type === "number"}
                            <input id="lv-cap-{f.key}" class="b3-text-field" type="number" min={f.min} max={f.max} step={f.step ?? "any"} placeholder={fieldPlaceholder(f)} bind:value={values[f.key]} disabled={saving} required={fieldRequired(f)} aria-invalid={fieldErrors[f.key] ? "true" : undefined} aria-describedby={fieldDescriptionIds(f)} oninput={() => clearFieldError(f.key)} />
                        {:else if f.key !== "name" && f.type === "checkbox"}
                            <input id="lv-cap-{f.key}" class="b3-switch" type="checkbox" checked={values[f.key] === true} disabled={saving} required={fieldRequired(f)} aria-invalid={fieldErrors[f.key] ? "true" : undefined} aria-describedby={fieldDescriptionIds(f)} onchange={(event) => { values[f.key] = event.currentTarget.checked; clearFieldError(f.key); }} />
                        {:else if f.key !== "name"}
                            <input id="lv-cap-{f.key}" class="b3-text-field" type={f.type === "url" ? "url" : "text"} placeholder={fieldPlaceholder(f)} bind:value={values[f.key]} disabled={saving} required={fieldRequired(f)} aria-invalid={fieldErrors[f.key] ? "true" : undefined} aria-describedby={fieldDescriptionIds(f)} oninput={() => clearFieldError(f.key)} />
                            {#if f.key === "location" || f.key === "store_place"}
                                <div class="lv-preset-tags">
                                    {#each COMMON_LOCATIONS as loc (loc)}
                                        <button type="button" class="lv-preset-tag" onclick={() => applyLocationPreset(f.key, loc)}>{loc}</button>
                                    {/each}
                                </div>
                            {/if}
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
            {/if}
        </div>
        <div class="lv-sheet-foot">
            <button class="b3-button b3-button--text" onclick={close} disabled={saving}>{t("cancel")}</button>
            {#if captureTab === "event"}
                <span class="fn__flex-1"></span>
                <button class="lv-btn primary" onclick={() => {
                    if (eventSub === "fuel") void submitQuickFueling();
                    else if (eventSub === "vital") void submitQuickVital();
                    else if (eventSub === "shopping") void submitQuickShopping();
                    else if (eventSub === "snippet") void submitQuickSnippet();
                }} disabled={saving}>
                    {saving ? t("ledger.saving") : t("save")}
                </button>
            {:else}
                <label class="lv-keep-context-label" style="display:inline-flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;color:var(--b3-theme-on-surface);margin-left:6px" title={t("capture.keepContext")}>
                    <input type="checkbox" class="b3-switch" style="transform:scale(0.8);transform-origin:left center" bind:checked={keepContext} />
                    <span class="lv-caption" style="user-select:none">{t("capture.keepContext")}</span>
                </label>
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
            {/if}
        </div>
    </div>
</div>
