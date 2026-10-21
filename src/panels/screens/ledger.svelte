<script lang="ts">
    import { renderLedgerAll, addDetachedRow, setCell, RowIdentityPendingError, isKernelError, getOCRConfig, getImageOCRText, recognizeAsset } from "@/core/siyuan";
    import { generateQRDataUrl, blockDeepLink } from "@/core/qr";
    import { buildShoppingList } from "@/core/shopping";
    import { AMOUNT_KEYS, formatAmount, optLabel, optLabelText } from "@/core/format";
    import { parseCsv } from "@/core/csv";
    import { planImport, guessMapping } from "@/core/importer";
    import { buildCsv } from "@/core/csv";
    import { maskCredentialNumber, maskIdNumber, parseIdNumber } from "@/core/idcard";
    import { selectCellValue, selectCellContent } from "@/core/avcell";
    import { renderRecordCardPng, copyPngToClipboard, downloadPng } from "@/core/sharecard";
    import { localDateKey } from "@/core/hub/rule";
    import { showMessage, Dialog, confirm } from "siyuan";
    import type { HomePluginLike } from "@/types/plugin";
    import { saveRuntime } from "@/core/hub/runtime";
    import { saveSettings } from "@/core/settings";
    import { ensurePinyin, pinyinReady, searchMatch } from "@/core/pinyin";
    import { openContactPicker } from "@/libs/contact-picker";
    import { getCertificateProfile, getCertificateReminderField } from "@/core/schema";
    import type { ColumnDef } from "@/core/schema";
    import { getCaptureFields, getFormFields, validateCaptureInput, type CaptureInputError } from "@/core/capture";
    import { assetHref, downloadAsset, isImageAsset, isEncryptedNotebookAsset } from "@/core/assets";
    import { calculateEnergyStats, type EnergyKind, type EnergyRecord } from "@/core/fuel";
    import { calculateMaintenanceStats, calculateVehicleCostSummary, createVehicleActionQueue, type MaintenanceRecord, type VehicleQuickAction } from "@/core/vehicle";
    import { loadRowLogs, updateRowLogs, getEntries, appendEntry, removeEntry } from "@/core/rowlog";
    import type { LogKind } from "@/core/rowlog";
    import { rowLogActivityId, type ActivityTarget } from "@/core/activity";
    /** 312 波：抽屉内子记录行样式（原 4 处重复字面量收敛） */
    const substRowCss = "padding:2px 0;font-size:12.5px";
    import { onDestroy } from "svelte";
    import UiIcon from "@/ui/icon.svelte";
    import { uiIcon } from "@/ui/icons";
    import { panelSession, type TableDensity } from "../panel-session";
    import { maskValueForGuest, createDefaultGuestConfig } from "@/core/guest-mode";
    import { getGroupedModules } from "@/core/modules";
    import { getQuickTemplates, type QuickRecordTemplate } from "@/core/quick-templates";

    let { plugin, t, version }: { plugin: HomePluginLike; t: (k: string) => string; version?: number } = $props();

    // Ledger module selector includes provisioned and enabled-but-unprovisioned modules.
    // 263 波（262 波同款缺陷类）：enabledModules 无响应性——设置保存新启用模块后，
    // 已挂载台账页的下拉不出现新模块；version 驱动重算修复
    const ledgers = $derived.by(() => {
        void version;
        return plugin.settings.enabledModules
            .filter((id: string) => id !== "members")
            .map((id: string) => ({ id, ref: plugin.settings.dbRefs[id] }));
    });
    // 初始快照为设计意图（activeLedger 由模块卡/快速记录预选）
    // svelte-ignore state_referenced_locally
    let active = $state(plugin.activeLedger ?? "certs");
    let rows: any[] = $state([]);
    // Preserve raw columns created directly in the host database view.
    let avCols: any[] = $state([]);
    let loading = $state(false);
    let loadError = $state("");
    let loadRequest = 0;
    let loadController: AbortController | undefined;
    let rebuilding = $state(false);
    let exporting = $state(false);
    let printing = $state(false);
    // The panel session belongs to the stable plugin instance mounted here.
    // svelte-ignore state_referenced_locally
    const panelMemory = panelSession(plugin);
    // Search matches title/note and pinyin; it is independent from member filtering.
    let searchText = $state(panelMemory.ledgerSearch);
    onDestroy(() => {
        loadRequest++;
        loadController?.abort();
        loadController = undefined;
        if (plugin.pendingActivityTarget?.moduleId === active) plugin.pendingActivityTarget = undefined;
    });

    // Settings can disable the currently open module while this screen stays
    // mounted. Keep the selector and form aligned with the enabled set instead
    // of leaving the user on a blank, unselectable ledger.
    const groupedLedgers = $derived(getGroupedModules(ledgers.map((l) => l.id)));
    $effect(() => {
        const available = ledgers;
        if (available.length > 0 && !available.some((entry) => entry.id === active)) {
            active = available[0].id;
            plugin.activeLedger = active;
            searchText = "";
            if (plugin.pendingActivityTarget) {
                plugin.pendingActivityTarget = undefined;
                showMessage(t("activity.navigationUnavailable"), 4000, "error");
            }
        }
    });
    // Progressive rendering keeps the initial table responsive.
    const RENDER_PAGE = 200;
    let renderLimit = $state(RENDER_PAGE);
    // 台账窗口化：数据仍完整保留在内存中，DOM 只保留视口附近的行。
    // 密度模式（§17）：舒适（48px）与紧凑（34px）两档，滚动轨道高度随密度自适应。
    const VIRTUAL_ROW_HEIGHT_COMFORTABLE = 48;
    const VIRTUAL_ROW_HEIGHT_COMPACT = 34;
    let tableDensity = $state<TableDensity>(panelMemory.tableDensity ?? "comfortable");
    let virtualRowHeight = $derived(tableDensity === "compact" ? VIRTUAL_ROW_HEIGHT_COMPACT : VIRTUAL_ROW_HEIGHT_COMFORTABLE);
    function toggleDensity() {
        tableDensity = tableDensity === "compact" ? "comfortable" : "compact";
        panelMemory.tableDensity = tableDensity;
    }
    const VIRTUAL_OVERSCAN = 8;
    let ledgerScrollTop = $state(0);
    let ledgerViewportHeight = $state(640);
    let ledgerTableEl = $state<HTMLTableElement | undefined>(undefined);
    // The scroll owner is an imperative DOM handle; keeping it non-reactive
    // prevents the ResizeObserver setup effect from re-running itself.
    let virtualRoot: HTMLElement | undefined;
    // Load the pinyin dictionary lazily and recompute once it is ready.
    let pyTick = $state(0);
    $effect(() => {
        void active;
        void searchText;
        renderLimit = RENDER_PAGE;
    });
    $effect(() => {
        ensurePinyin().then(() => {
            if (pinyinReady()) pyTick += 1;
        });
    });
    // 17 组：排序偏好记忆（表头点击切换列/方向，跨会话持久化）
    // svelte-ignore state_referenced_locally
    let sortKey = $state<string>(plugin.runtime.ledgerSortKey ?? "");
    // svelte-ignore state_referenced_locally
    let sortAsc = $state<boolean>(plugin.runtime.ledgerSortAsc ?? true);
    async function toggleSort(k: string) {
        const previousKey = sortKey;
        const previousAsc = sortAsc;
        if (sortKey === k) sortAsc = !sortAsc;
        else { sortKey = k; sortAsc = true; }
        plugin.runtime.ledgerSortKey = sortKey;
        plugin.runtime.ledgerSortAsc = sortAsc;
        try {
            await saveRuntime(plugin, plugin.runtime);
        } catch (e) {
            sortKey = previousKey;
            sortAsc = previousAsc;
            plugin.runtime.ledgerSortKey = previousKey;
            plugin.runtime.ledgerSortAsc = previousAsc;
            showMessage(t("ledger.sortSaveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        }
    }
    const ref = $derived(ledgers.find((entry) => entry.id === active)?.ref);
    let filterMemberId = $state("");
    let filterCategory = $state("");
    let selectedItemIds = $state<string[]>([]);

    function toggleRowSelect(id: string) {
        if (selectedItemIds.includes(id)) {
            selectedItemIds = selectedItemIds.filter((x) => x !== id);
        } else {
            selectedItemIds = [...selectedItemIds, id];
        }
    }

    const columnSuggestions = $derived.by(() => {
        const map: Record<string, string[]> = {};
        if (!ref?.columns) return map;
        for (const [colKey, colId] of Object.entries(ref.columns)) {
            if (["name", "location", "store_place", "copy_location", "brand_model", "channel", "hospital", "doctor", "party", "unit"].includes(colKey)) {
                const valuesSet = new Set<string>();
                for (const r of rows) {
                    const txt = String(cellText(r.cells?.[colId], colKey) ?? "").trim();
                    if (txt && txt !== "—" && txt.length <= 40) {
                        valuesSet.add(txt);
                    }
                }
                if (valuesSet.size > 0) {
                    map[colKey] = Array.from(valuesSet).slice(0, 15);
                }
            }
        }
        return map;
    });

    const dynamicLocations = $derived.by(() => {
        const set = new Set<string>();
        for (const l of ["主卧抽屉", "客厅药箱", "玄关柜", "书房书架", "储藏室", "冰箱冷藏", "厨房吊柜"]) {
            set.add(l);
        }
        const locCols = [ref?.columns?.location, ref?.columns?.store_place, ref?.columns?.copy_location].filter(Boolean);
        for (const colId of locCols) {
            for (const r of rows) {
                const txt = String(cellText(r.cells?.[colId as string]) ?? "").trim();
                if (txt && txt !== "—" && txt.length <= 20) {
                    set.add(txt);
                }
            }
        }
        return Array.from(set).slice(0, 12);
    });

    const memberCol = $derived(ref?.columns?.member);
    const categoryCol = $derived(ref?.columns?.category);

    const availableCategories = $derived.by(() => {
        if (!categoryCol) return [] as string[];
        const set = new Set<string>();
        for (const r of rows) {
            const c = selectCellContent(r.cells?.[categoryCol]);
            if (c && c !== "—") set.add(c);
        }
        return [...set];
    });

    const currentLedgerTemplates = $derived(getQuickTemplates(active));

    function applyLedgerTemplate(tpl: QuickRecordTemplate) {
        for (const [k, v] of Object.entries(tpl.values)) {
            form[k] = v;
        }
        if (active === "certs" && tpl.values.category) {
            handleCertificateCategoryChange(String(tpl.values.category));
        }
    }

    async function openBatchLocationModal() {
        if (!selectedItemIds.length || !ref?.avId || !ref?.columns?.location) return;
        const targetCol = ref.columns.location;
        const locOptions = dynamicLocations;
        const dlg = new Dialog({
            title: t("ledger.batchLocationTitle"),
            content: `
                <div class="b3-dialog__content" style="display:flex;flex-direction:column;gap:10px">
                    <label class="lv-caption">${t("ledger.batchLocationTitle")}：</label>
                    <input class="b3-text-field" id="lv-batch-loc-input" style="width:100%" placeholder="${t("capture.presetLocations")}" />
                    <div style="display:flex;gap:4px;flex-wrap:wrap">
                        ${locOptions.map((loc) => `<button type="button" class="lv-preset-tag lv-batch-loc-tag" data-loc="${loc}">${loc}</button>`).join("")}
                    </div>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel">${t("cancel")}</button>
                    <button class="b3-button" id="lv-batch-loc-ok">${t("save")}</button>
                </div>
            `,
            width: "420px",
        });
        const inp = dlg.element.querySelector("#lv-batch-loc-input") as HTMLInputElement;
        dlg.element.querySelectorAll(".lv-batch-loc-tag").forEach((btn) => {
            (btn as HTMLButtonElement).onclick = () => {
                inp.value = btn.getAttribute("data-loc") ?? "";
            };
        });
        (dlg.element.querySelector(".b3-button--cancel") as HTMLButtonElement).onclick = () => dlg.destroy();
        (dlg.element.querySelector("#lv-batch-loc-ok") as HTMLButtonElement).onclick = async function (this: HTMLButtonElement) {
            const locVal = inp.value.trim();
            if (!locVal) return;
            this.disabled = true;
            try {
                const { setCell } = await import("@/core/siyuan");
                const count = selectedItemIds.length;
                for (const rowId of selectedItemIds) {
                    await setCell(ref!.avId!, targetCol, rowId, { type: "text", text: { content: locVal } });
                }
                dlg.destroy();
                selectedItemIds = [];
                showMessage(t("ledger.batchLocation") + ` (${count})`, 3000, "info");
                await load();
            } catch (e) {
                showMessage(String(e), 5000, "error");
            }
        };
    }

    function batchDelete() {
        if (!selectedItemIds.length || !ref?.avId) return;
        const count = selectedItemIds.length;
        confirm(
            t("ledger.batchDelete"),
            t("ledger.batchDeleteConfirm").replace("${n}", String(count)),
            async () => {
                try {
                    const { removeLedgerRows } = await import("@/core/siyuan");
                    const { cleanupRowRuntimeData, saveRuntime } = await import("@/core/hub/runtime");
                    await removeLedgerRows(ref!.avId!, selectedItemIds, {
                        idempotencyKey: `ledger:batch-del:${ref!.avId!}:${Date.now()}`,
                        retries: 1,
                    });
                    for (const id of selectedItemIds) {
                        cleanupRowRuntimeData(plugin.runtime, id);
                    }
                    await saveRuntime(plugin, plugin.runtime);
                    selectedItemIds = [];
                    showMessage(t("ledger.delDone") + ` (${count})`, 3000, "info");
                    await load();
                    try { await plugin.refreshHub?.([active]); } catch { /* ignore */ }
                } catch (e) {
                    showMessage(t("ledger.delFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
                }
            }
        );
    }

    async function adjustRowQty(row: any, fieldKey: string, delta: number) {
        if (!ref?.avId || !ref.columns?.[fieldKey]) return;
        const colId = ref.columns[fieldKey];
        const cur = Number(row.cells?.[colId]?.number?.content ?? 0);
        const next = Math.max(0, cur + delta);
        try {
            const { setCell } = await import("@/core/siyuan");
            await setCell(ref.avId, colId, row.itemID, { type: "number", number: { content: next } });
            if (!row.cells[colId]) row.cells[colId] = { type: "number", number: {} };
            row.cells[colId].number.content = next;
            showMessage(`${delta > 0 ? "+1" : "-1"} (${next})`, 1500, "info");
        } catch (e) {
            showMessage(String(e), 3000, "error");
        }
    }

    const filteredRows = $derived.by(() => {
        const q = searchText.trim().toLowerCase();
        let list = rows;
        if (filterMemberId && memberCol) {
            list = list.filter((r) => {
                const bIds = r.cells?.[memberCol]?.relation?.blockIDs;
                return Array.isArray(bIds) && bIds.includes(filterMemberId);
            });
        }
        if (filterCategory && categoryCol) {
            list = list.filter((r) => {
                const c = selectCellContent(r.cells?.[categoryCol]);
                return c === filterCategory;
            });
        }
        if (q) {
            // Search by full pinyin or initials once the dictionary is ready.
            void pyTick;
            list = list.filter((r) => rowMatchesSearch(r, q, ref?.columns));
        }
        const keyID = sortKey ? ref?.columns?.[sortKey] : undefined;
        const keyType = sortKey ? plugin.schemaCatalog?.[active]?.columns?.find((column: any) => column.key === sortKey)?.type : undefined;
        return sortRows(list, keyID, sortAsc, keyType);
    });

    const allSelected = $derived(filteredRows.length > 0 && selectedItemIds.length === filteredRows.length);

    function toggleSelectAll() {
        if (allSelected) selectedItemIds = [];
        else selectedItemIds = filteredRows.map((r) => r.itemID);
    }
    function sortRows(list: any[], keyID?: string, ascending = true, keyType?: string) {
        if (!keyID) return list;
        return [...list].sort((a, b) => {
            const av = cellText(a.cells[keyID]);
            const bv = cellText(b.cells[keyID]);
            const an = Number(av);
            const bn = Number(bv);
            // Only numeric schema columns use numeric comparison. Date strings
            // such as 2026-10-11 must compare as dates, not as the year 2026.
            const cmp = keyType === "number" && Number.isFinite(an) && Number.isFinite(bn) && av !== "—" && bv !== "—"
                ? an - bn
                : av.localeCompare(bv, undefined, { numeric: true });
            return ascending ? cmp : -cmp;
        });
    }
    // 普通台账表格使用完整结果集配合窗口化渲染；车辆卡片保留渐进加载，
    // 以便图片卡片按批次进入 DOM，避免首次进入触发大量资源解码。
    const visibleRows = $derived(active === "vehicles" ? filteredRows.slice(0, renderLimit) : filteredRows);
    const virtualRange = $derived.by(() => {
        void ledgerScrollTop;
        void ledgerViewportHeight;
        const total = visibleRows.length;
        if (total <= 80) return { start: 0, end: total };
        const tableTop = ledgerTableEl && virtualRoot
            ? ledgerTableEl.getBoundingClientRect().top - virtualRoot.getBoundingClientRect().top + virtualRoot.scrollTop
            : 0;
        const first = Math.max(0, Math.floor((ledgerScrollTop - tableTop) / virtualRowHeight) - VIRTUAL_OVERSCAN);
        const count = Math.ceil(ledgerViewportHeight / virtualRowHeight) + VIRTUAL_OVERSCAN * 2;
        return { start: Math.min(first, Math.max(0, total - count)), end: Math.min(total, first + count) };
    });
    const virtualRows = $derived(visibleRows.slice(virtualRange.start, virtualRange.end));

    function measureLedgerViewport() {
        if (!virtualRoot) return;
        ledgerViewportHeight = virtualRoot.clientHeight || 640;
        ledgerScrollTop = virtualRoot.scrollTop;
    }

    $effect(() => {
        const table = ledgerTableEl;
        if (!table) return;
        const root = table.closest<HTMLElement>(".lv-home");
        if (!root) return;
        virtualRoot = root;
        const onScroll = () => { ledgerScrollTop = root.scrollTop; };
        root.addEventListener("scroll", onScroll, { passive: true });
        const resize = new ResizeObserver(measureLedgerViewport);
        resize.observe(root);
        measureLedgerViewport();
        return () => {
            root.removeEventListener("scroll", onScroll);
            resize.disconnect();
            if (virtualRoot === root) virtualRoot = undefined;
        };
    });

    function rowMatchesSearch(row: any, q: string, columns?: Record<string, string>) {
        // Search every scalar column so plate numbers, categories, dates and
        // certificate numbers are discoverable without opening each row.
        const searchable = Object.values(columns ?? {})
            .map((columnId) => cellText(row.cells?.[columnId as string]))
            .join(" ");
        return searchMatch(searchable, q);
    }

    // Resolve only enabled modules. A disabled module may still have an old
    // dbRef in settings; exposing that ref here would show stale rows after a
    // settings change and make the empty-state actions misleading.
    const schemaKeys = $derived<string[]>(ref?.columns ? Object.keys(ref.columns) : []);
    // Keep the list useful across all modules. A fixed expiry/status list made
    // travel, shopping and other ledgers render only an empty severity column.
    const tableKeys = $derived.by(() => {
        const preferred = ["name", "category", "status", "date", "expiry", "due", "amount", "brand_model", "plate", "energy_type", "mileage", "note"];
        const keys = preferred.filter((key) => schemaKeys.includes(key));
        const columns = plugin.schemaCatalog?.[active]?.columns ?? [];
        for (const column of columns) {
            if (keys.length >= 5) break;
            if (schemaKeys.includes(column.key) && !keys.includes(column.key) && !["asset", "mAsset", "mSelect", "relation"].includes(column.type)) keys.push(column.key);
        }
        return keys.length > 0 ? keys : schemaKeys.slice(0, 5);
    });
    function switchLedger(event: Event) {
        const next = (event.currentTarget as HTMLSelectElement).value;
        const hasDraft = hasAnyInput
            || !!pendingItemID
            || identityPending
            || Object.values(certificateFiles).some((files) => files.length > 0)
            || Object.values(uploadedCertificateFiles).some((files) => files.length > 0);
        if (next !== active && hasDraft) {
            (event.currentTarget as HTMLSelectElement).value = active;
            showMessage(t("ledger.draftModuleSwitchBlocked"), 5000, "info");
            return;
        }
        if (next !== active && plugin.pendingActivityTarget?.moduleId !== next) plugin.pendingActivityTarget = undefined;
        active = next;
        filterMemberId = "";
        filterCategory = "";
        selectedItemIds = [];
        validationAttempted = false;
        saveError = "";
        plugin.activeLedger = active;
        searchText = "";
    }

    // CSV export uses schema columns and a BOM for spreadsheet compatibility.
    // Sensitive modules require an explicit confirmation before export.
    const HIGH_CONSEQUENCE_MODULES = new Set(["health", "parenting", "certs", "insurance", "assets-real", "assets-virtual", "contracts", "medicine", "schooling"]);

    // Print QR labels for all rows in the current module.
    async function printLabels() {
        const sourceRef = ref;
        const query = searchText.trim().toLowerCase();
        if (!sourceRef?.avId || !sourceRef.docId || printing) return;
        printing = true;
        try {
            const all = await renderLedgerAll(sourceRef.avId);
            if (!all.complete) { showMessage(t("ledger.loadIncomplete"), 5000, "error"); return; }
            let list = all.rows;
            if (query) list = list.filter((r) => rowMatchesSearch(r, query, sourceRef.columns));
            if (list.length === 0) { showMessage(t("ledger.printNoRows"), 3000, "info"); return; }
            const labels = await Promise.all(list.map(async (r) => {
                const nameCol = sourceRef.columns?.name;
                const nameVal = nameCol ? r.cells?.[nameCol] : undefined;
                const blockId = nameVal?.type === "block" ? nameVal.block?.id : undefined;
                const name = cellText(nameVal, "name");
                const link = blockDeepLink(blockId || sourceRef.docId!);
                let qr = "";
                try { qr = await generateQRDataUrl(link, 160); } catch { qr = ""; }
                return { name, qr };
            }));
            const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            // 259 波：打印页对齐设计语言（纸面固定色板，独立于屏幕主题——同 index.scss 打印豁免边界）
            const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${t("ledger.printTitle")}</title>
<style>body{font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;margin:0;padding:20px;color:#1f2328;background:#fff}
.head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;border-bottom:1px solid #d0d7de;padding-bottom:10px;margin-bottom:16px}
.head b{font-size:16px;font-weight:600}
.head .sub{font-size:11px;color:#57606a}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.label{border:1px solid #d0d7de;border-radius:10px;padding:14px 12px;text-align:center;page-break-inside:avoid}
.label img{width:132px;height:132px}
.label .nm{font-size:13px;font-weight:600;margin-top:8px;word-break:break-all}
.label .tip{font-size:10px;color:#57606a;margin-top:3px}
.printbtn{padding:7px 18px;border:none;border-radius:8px;background:#0969da;color:#fff;font-size:13px;cursor:pointer}
.printbtn:hover{background:#0860c4}
@media print{.noprint{display:none}body{padding:0}}</style></head><body>
<div class="head"><b>${t("ledger.printTitle")}</b><span class="sub">${t("ledger.printScanTip")} · ${new Date().toLocaleString()}</span></div>
<div class="noprint" style="text-align:center;margin-bottom:14px"><button class="printbtn" onclick="window.print()">${t("ledger.printButton")}</button></div>
<div class="grid">${labels.map((l) => `<div class="label"><img src="${l.qr}" alt="QR" width="132" height="132" decoding="async">${l.name ? `<div class="nm">${esc(l.name)}</div>` : ""}<div class="tip">${t("ledger.printScanTip")}</div></div>`).join("")}</div>
<script>window.print()<\/script></body></html>`;
            const w = window.open("", "_blank");
            if (!w) { showMessage(t("ledger.printBlocked"), 4000, "error"); return; }
            w.document.write(html);
            w.document.close();
        } catch (e) {
            showMessage(t("ledger.readFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        } finally {
            printing = false;
        }
    }

    function exportCsv() {
        const sourceRef = ref;
        const moduleId = active;
        const query = searchText.trim().toLowerCase();
        const sortField = sortKey ? sourceRef?.columns?.[sortKey] : undefined;
        const ascending = sortAsc;
        if (!sourceRef?.columns || filteredRows.length === 0 || exporting) return;
        const download = async () => {
            exporting = true;
            // N7/E13：导出走全量读（UI 列表仍单页，PF11）；搜索词对全量行复用同一过滤语义
            try {
                let all;
                try {
                    all = await renderLedgerAll(sourceRef.avId!);
                } catch (e) {
                    showMessage(t("ledger.readFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
                    return;
                }
                if (!all.complete) { showMessage(t("ledger.loadIncomplete"), 5000, "error"); return; }
                let list = all.rows;
                if (query) list = list.filter((r) => rowMatchesSearch(r, query, sourceRef.columns));
                const sortType = sortKey ? plugin.schemaCatalog?.[moduleId]?.columns?.find((column: any) => column.key === sortKey)?.type : undefined;
                list = sortRows(list, sortField, ascending, sortType);
                const cols = (plugin.schemaCatalog?.[moduleId]?.columns ?? []).filter((c: any) => sourceRef.columns![c.key]);
                const label = (c: any) => (t(`field.${c.key}`) !== `field.${c.key}` ? t(`field.${c.key}`) : c.key);
                const csv = buildCsv(cols.map(label), list.map((r) => cols.map((c: any) => cellText(r.cells[sourceRef.columns![c.key]], c.key, true))));
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `lv-${moduleId}-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(a.href);
            } finally {
                exporting = false;
            }
        };
        if (HIGH_CONSEQUENCE_MODULES.has(moduleId)) {
            confirm(t("ledger.exportSensitiveTitle"), t("ledger.exportSensitiveBody").replace("${module}", t(`module.${moduleId}`)), () => { void download(); });
            return;
        }
        void download();
    }

    // Export Attachments & Certificates Archive Manifest (.md) (303波)
    async function exportArchiveManifest() {
        const sourceRef = ref;
        const moduleId = active;
        if (!sourceRef?.columns || filteredRows.length === 0 || exporting) return;
        const attCol = sourceRef.columns.attachments;
        if (!attCol) {
            showMessage(t("ledger.exportArchiveNoAttCol"), 4000, "info");
            return;
        }

        exporting = true;
        try {
            const all = await renderLedgerAll(sourceRef.avId!);
            if (!all.complete) {
                showMessage(t("ledger.loadIncomplete"), 5000, "error");
                return;
            }

            const { buildArchiveManifest, formatArchiveManifestMarkdown } = await import("@/core/archive");
            const memberMap = new Map((plugin.settings.members ?? []).map((m: any) => [m.avItemId, m.name]));

            const records = all.rows.map((row) => {
                const title = sourceRef.columns?.name ? cellText(row.cells[sourceRef.columns.name]) : "未命名记录";
                const memId = sourceRef.columns?.member ? String(row.cells[sourceRef.columns.member]?.relation?.blockIDs?.[0] ?? "") : "";
                const memberName = memId ? (memberMap.get(memId) ?? "") : "";
                const attList = row.cells[attCol]?.mAsset ?? [];
                return {
                    id: row.itemID,
                    module: moduleId,
                    title,
                    memberName,
                    date: sourceRef.columns?.date ? cellText(row.cells[sourceRef.columns.date]) : undefined,
                    expiry: sourceRef.columns?.expiry ? cellText(row.cells[sourceRef.columns.expiry]) : undefined,
                    attachments: attList,
                };
            }).filter((r) => r.attachments.length > 0);

            if (records.length === 0) {
                showMessage(t("ledger.exportArchiveEmpty"), 4000, "info");
                return;
            }

            const manifest = buildArchiveManifest(records, {
                maskSensitive: Boolean(plugin.runtime?.guestModeActive),
            });
            const md = formatArchiveManifestMarkdown(manifest, t);
            const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `lv-archive-${moduleId}-${new Date().toISOString().slice(0, 10)}.md`;
            a.click();
            URL.revokeObjectURL(a.href);
            showMessage(t("ledger.exportArchiveSuccess").replace("${n}", String(manifest.totalFiles)), 3500, "info");
        } catch (e) {
            showMessage(t("ledger.readFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        } finally {
            exporting = false;
        }
    }

    /** Show fuel and charging usage per vehicle without combining hybrid energy types. */
    async function openEnergyDashboard() {
        const sourceRef = ref;
        if (!sourceRef?.avId || active !== "vehicles") return;
        const dlg = new Dialog({
            title: t("fuel.dashboardTitle"),
            content: `<div class="b3-dialog__content b3-dialog__content--wrap" id="lv-fuel-dashboard" style="max-height:68vh;overflow:auto"></div>`,
            width: "620px",
        });
        dlg.element.classList.add("lv-energy-dialog");
        const body = dlg.element.querySelector("#lv-fuel-dashboard") as HTMLElement;
        const loading = document.createElement("div");
        loading.className = "ft__on-surface";
        loading.textContent = t("fuel.loading");
        body.appendChild(loading);
        try {
            const result = await renderLedgerAll(sourceRef.avId);
            if (!result.complete) throw new Error(t("ledger.loadIncomplete"));
            if (ref?.avId !== sourceRef.avId) { dlg.destroy(); return; }
            const cols = sourceRef.columns ?? {};
            const vehicles = result.rows;
            body.replaceChildren();
            const intro = document.createElement("p");
            intro.className = "ft__on-surface";
            intro.style.cssText = "font-size:12px;line-height:1.65;margin:0 0 10px";
            intro.textContent = t("fuel.dashboardHint");
            body.appendChild(intro);
            if (vehicles.length === 0) {
                const empty = document.createElement("div");
                empty.className = "lv-empty";
                const icon = document.createElement("div"); icon.className = "eic"; icon.innerHTML = uiIcon("car");
                const title = document.createElement("b"); title.textContent = t("fuel.noVehicles");
                const hint = document.createElement("span"); hint.textContent = t("fuel.noVehiclesHint");
                const add = document.createElement("button"); add.className = "b3-button"; add.textContent = `+ ${t("fuel.addVehicle")}`;
                add.onclick = () => { dlg.destroy(); openNewRecord(); };
                empty.append(icon, title, hint, add);
                body.appendChild(empty);
                return;
            }
            const logs = await loadRowLogs(plugin as any);
            const vehicleType = (row: any) => selectCellContent(row.cells?.[cols.energy_type ?? ""]) ?? "gasoline";
            const miniStat = (label: string, value: string) => {
                const item = document.createElement("div");
                item.style.cssText = "min-width:0;padding:8px 10px;border-radius:8px;background:var(--b3-theme-background-light);display:flex;flex-direction:column;gap:3px";
                const name = document.createElement("span"); name.className = "ft__on-surface"; name.style.fontSize = "11px"; name.textContent = label;
                const val = document.createElement("b"); val.style.cssText = "font-size:14px;overflow-wrap:anywhere"; val.textContent = value;
                item.append(name, val);
                return item;
            };
            for (const vehicle of vehicles) {
                const card = document.createElement("section");
                card.className = "lv-card";
                card.style.cssText = "padding:12px;margin-bottom:10px";
                const head = document.createElement("div");
                head.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px";
                const title = document.createElement("b");
                title.style.fontSize = "14px";
                title.textContent = cellText(vehicle.cells?.[cols.name ?? ""], "name") || t("ledger.unnamed");
                const plate = document.createElement("span");
                plate.className = "ft__on-surface";
                plate.style.fontSize = "12px";
                plate.textContent = cellText(vehicle.cells?.[cols.plate ?? ""]);
                head.append(title, plate);
                const records = getEntries<EnergyRecord>(logs, sourceRef.avId, vehicle.itemID, "fuelings")
                    .concat(getEntries<EnergyRecord>(logs, sourceRef.avId, vehicle.itemID, "chargings"));
                const fuel = calculateEnergyStats(records, "fuel");
                const charge = calculateEnergyStats(records, "charging");
                const hybrid = vehicleType(vehicle) === "hybrid";
                const grid = document.createElement("div");
                grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(126px,1fr));gap:6px";
                const consumption = (stats: ReturnType<typeof calculateEnergyStats>, suffix: string) =>
                    stats.consumptionPer100Km !== undefined ? `${stats.consumptionPer100Km.toFixed(2)} ${suffix}/100km${stats.method === "estimated" ? ` · ${t("fuel.estimated")}` : ""}` : "—";
                const cost = (stats: ReturnType<typeof calculateEnergyStats>) => stats.costPer100Km !== undefined
                    ? `${formatAmount(stats.costPer100Km / 100)} ${t("fuel.currencyPerKm")}` : "—";
                grid.append(
                    miniStat(t("fuel.fuelConsumption"), fuel.recordCount ? hybrid ? `${fuel.totalQuantity.toFixed(1)} L · ${t("fuel.totalRecorded")}` : consumption(fuel, "L") : "—"),
                    miniStat(t("fuel.fuelCostPerKm"), fuel.recordCount ? hybrid ? t("fuel.hybridNoRate") : cost(fuel) : "—"),
                    miniStat(t("fuel.chargeConsumption"), charge.recordCount ? hybrid ? `${charge.totalQuantity.toFixed(1)} kWh · ${t("fuel.totalRecorded")}` : consumption(charge, "kWh") : "—"),
                    miniStat(t("fuel.chargeCostPerKm"), charge.recordCount ? hybrid ? t("fuel.hybridNoRate") : cost(charge) : "—"),
                    miniStat(t("fuel.fuelRecordedSpending"), fuel.costRecordCount === 0 ? t("fuel.costUnknown") : `${formatAmount(fuel.totalCost)} ${t("fuel.currency")}${fuel.costRecordCount < fuel.recordCount ? ` · ${t("fuel.subtotal")}` : ""}`),
                    miniStat(t("fuel.chargeRecordedSpending"), charge.costRecordCount === 0 ? t("fuel.costUnknown") : `${formatAmount(charge.totalCost)} ${t("fuel.currency")}${charge.costRecordCount < charge.recordCount ? ` · ${t("fuel.subtotal")}` : ""}`),
                );
                const action = document.createElement("button");
                action.className = "b3-button b3-button--text";
                action.style.cssText = "margin-top:6px;padding:4px 0";
                action.textContent = `${t("fuel.openVehicle")} →`;
                action.onclick = () => { dlg.destroy(); openDetail(vehicle); };
                card.append(head, grid, action);
                body.appendChild(card);
            }
        } catch (error) {
            body.replaceChildren();
            const message = document.createElement("div");
            message.className = "lv-record-error";
            message.textContent = t("ledger.readFailed").replace("${msg}", error instanceof Error ? error.message : String(error));
            body.appendChild(message);
        }
    }

    // Growth chart for parenting records, including an optional WHO reference band.
    function openGrowthChart() {
        import("@/core/growth").then(({ collectGrowthSeries, whoBand, whoPercentile }) => {
            const members = plugin.settings.members ?? [];
            const series = collectGrowthSeries(rows, (ref?.columns ?? {}) as Record<string, string | undefined>, members);
            const dlg = new Dialog({
                title: t("ledger.growthChart"),
                content: `<div class="b3-dialog__content" id="lv-growth-body" style="max-height:60vh;overflow:auto"></div>`,
                width: "560px",
            });
            const body = dlg.element.querySelector("#lv-growth-body") as HTMLElement;
            if (series.length === 0) {
                body.innerHTML = `<div class="ft__on-surface" style="font-size:13px">${t("ledger.noGrowthData")}</div>`;
                return;
            }
            const COLORS = ["#4a6785", "#ac503d", "#5a8a48", "#8a5aa0", "#b08030"];
            const NS = "http://www.w3.org/2000/svg";
            const el = (tag: string, attrs: Record<string, string | number>, textContent?: string) => {
                const e = document.createElementNS(NS, tag);
                for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
                if (textContent !== undefined) e.textContent = textContent;
                return e;
            };
            // Reference-band sex can be automatic, selected, or disabled.
            let bandMode: "auto" | "male" | "female" | "off" = "auto";
            const sexById = new Map(members.map((m) => [m.id, m.sex as "male" | "female" | undefined]));
            const controls = document.createElement("div");
            controls.style.cssText = "display:flex;align-items:center;gap:6px;font-size:12px";
            const ctlLabel = document.createElement("span");
            ctlLabel.className = "ft__on-surface";
            ctlLabel.textContent = t("ledger.growthWhoSex");
            const sel = document.createElement("select");
            sel.className = "b3-select";
            for (const [v, key] of [["auto", "ledger.growthWhoAuto"], ["male", "members.sex.male"], ["female", "members.sex.female"], ["off", "ledger.growthWhoOff"]] as const) {
                const o = document.createElement("option");
                o.value = v;
                o.textContent = t(key); // textContent keeps translated labels safe.
                sel.appendChild(o);
            }
            sel.addEventListener("change", () => { bandMode = sel.value as typeof bandMode; renderPanels(); });
            controls.append(ctlLabel, sel);
            body.appendChild(controls);

            function renderPanels() {
                body.querySelectorAll(".lv-growth-panel, .lv-growth-note").forEach((n) => n.remove());
                for (const metric of ["height", "weight"] as const) {
                    const ss = series.filter((s) => s.metric === metric);
                    if (!ss.length) continue;
                    const panel = document.createElement("div");
                    panel.className = "lv-growth-panel";
                    const head = document.createElement("div");
                    head.style.cssText = "font-weight:600;font-size:13px;margin:10px 0 4px";
                    head.textContent = t(metric === "height" ? "ledger.growthHeight" : "ledger.growthWeight");
                    panel.appendChild(head);
                    const W = 500, H = 170, PAD = 40;
                    const all = ss.flatMap((s) => s.points.map((p, pi) => ({ x: p.ageMonths ?? pi, y: p.value })));
                    const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
                    const xMin = Math.min(...xs), xMax = Math.max(...xs);
                    let yMin = Math.min(...ys), yMax = Math.max(...ys);
                    // Clip the reference band to the data window and 0-60 months.
                    const knownSexes = [...new Set(ss.map((s) => sexById.get(s.memberId)).filter(Boolean))] as ("male" | "female")[];
                    const bandSex: "male" | "female" | null =
                        bandMode === "off" ? null : bandMode === "auto" ? (knownSexes.length === 1 ? knownSexes[0] : null) : bandMode;
                    const x0b = Math.max(xMin, 0), x1b = Math.min(xMax, 60);
                    let bandPts: { x: number; p3: number; p50: number; p97: number }[] = [];
                    if (bandSex && x1b >= x0b) {
                        const samples = new Set<number>([x0b, x1b]);
                        for (let m = Math.ceil(x0b); m <= Math.floor(x1b); m++) samples.add(m);
                        for (const x of [...samples].sort((a, b) => a - b)) {
                            const b = whoBand(bandSex, metric, x);
                            if (b) { bandPts.push({ x, p3: b.p3, p50: b.p50, p97: b.p97 }); yMin = Math.min(yMin, b.p3); yMax = Math.max(yMax, b.p97); }
                        }
                    }
                    const sx = (x: number) => (xMax === xMin ? W / 2 : PAD + ((x - xMin) / (xMax - xMin)) * (W - PAD * 2));
                    const sy = (y: number) => (yMax === yMin ? H / 2 : H - PAD - ((y - yMin) / (yMax - yMin)) * (H - PAD * 2));
                    const fx = (x: number) => (Number.isInteger(x) ? String(x) : (Math.round(x * 10) / 10).toFixed(1)); // 小数月龄标签
                    const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
                    // Axes and endpoint labels.
                    svg.appendChild(el("line", { x1: PAD, y1: H - PAD, x2: W - PAD / 2, y2: H - PAD, stroke: "var(--b3-border-color)" }));
                    svg.appendChild(el("line", { x1: PAD, y1: PAD / 2, x2: PAD, y2: H - PAD, stroke: "var(--b3-border-color)" }));
                    svg.appendChild(el("text", { x: PAD - 6, y: PAD / 2 + 4, "text-anchor": "end", "font-size": 10 }, String(Math.round(yMax * 10) / 10)));
                    svg.appendChild(el("text", { x: PAD - 6, y: H - PAD + 4, "text-anchor": "end", "font-size": 10 }, String(Math.round(yMin * 10) / 10)));
                    svg.appendChild(el("text", { x: PAD, y: H - PAD + 14, "font-size": 10 }, fx(xMin)));
                    svg.appendChild(el("text", { x: W - PAD / 2, y: H - PAD + 14, "text-anchor": "end", "font-size": 10 }, `${fx(xMax)}${xs.some((x) => x > 0) ? "月龄" : ""}`));
                    if (bandPts.length >= 2) {
                        const top = bandPts.map((b) => `${sx(b.x)},${sy(b.p97)}`).join(" ");
                        const bottom = [...bandPts].reverse().map((b) => `${sx(b.x)},${sy(b.p3)}`).join(" ");
                        svg.appendChild(el("polygon", { points: `${top} ${bottom}`, fill: "var(--b3-theme-primary)", opacity: 0.08 }));
                        svg.appendChild(el("polyline", { points: bandPts.map((b) => `${sx(b.x)},${sy(b.p50)}`).join(" "), fill: "none", stroke: "var(--b3-theme-primary)", opacity: 0.45, "stroke-width": 1.2, "stroke-dasharray": "4 3" }));
                        const bandLabel = el("text", { x: W - PAD / 2, y: PAD / 2 - 8, "text-anchor": "end", "font-size": 10, fill: "var(--b3-theme-primary)", opacity: 0.85 });
                        bandLabel.textContent = `WHO P3–P97 · ${t(bandSex === "male" ? "members.sex.male" : "members.sex.female")}`;
                        svg.appendChild(bandLabel);
                    }
                    ss.forEach((s, i) => {
                        const color = COLORS[i % COLORS.length];
                        const pts = s.points;
                        const memberSex = sexById.get(s.memberId);
                        const pointEl = (x: number, y: number, p: { date: string; value: number; ageMonths: number | null }) => {
                            const dot = el("circle", { cx: sx(x), cy: sy(y), r: pts.length === 1 ? 3 : 2.5, fill: color });
                            // Native hover label shows percentile when sex and age are known.
                            const pct = memberSex && p.ageMonths !== null ? whoPercentile(memberSex, metric, p.ageMonths, p.value) : null;
                            const label = document.createElementNS(NS, "title");
                            label.textContent = pct !== null ? `P${Math.round(pct)} · ${p.date} ${p.value}` : `${p.date} ${p.value}`;
                            dot.appendChild(label);
                            return dot;
                        };
                        if (pts.length === 1) {
                            svg.appendChild(pointEl(sx(pts[0].ageMonths ?? 0), sy(pts[0].value), pts[0]));
                        } else {
                            svg.appendChild(el("polyline", {
                                points: pts.map((p) => `${sx(p.ageMonths ?? 0)},${sy(p.value)}`).join(" "),
                                fill: "none", stroke: color, "stroke-width": 2,
                            }));
                            for (const p of pts) svg.appendChild(pointEl(p.ageMonths ?? 0, p.value, p));
                        }
                        const legend = el("text", { x: PAD + 4, y: PAD / 2 + 16 + i * 14, "font-size": 11, fill: color });
                        legend.textContent = s.memberName; // User content is assigned via textContent.
                        svg.appendChild(legend);
                    });
                    panel.appendChild(svg);
                    body.appendChild(panel);
                }
                const note = document.createElement("div");
                note.className = "lv-growth-note ft__on-surface";
                note.style.cssText = "font-size:11.5px;margin-top:6px";
                note.textContent = t("ledger.growthWhoNote");
                body.appendChild(note);
            }
            renderPanels();
        }).catch((e) => {
            showMessage(t("ledger.growthFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
        });
    }

    // Vaccine schedule (given, overdue, due soon, upcoming) for children in parenting records.
    async function openVaccineScheduleModal() {
        if (!ref?.avId || !ref.columns) return;
        const allMembers = plugin.settings.members ?? [];
        const children = allMembers.filter((m) => m.birthday && (m.role === "child" || !m.role));
        const candidate = children.length > 0 ? children : allMembers.filter((m) => m.birthday);

        if (candidate.length === 0) {
            showMessage(t("ledger.vaccineNoBirthdayChild"), 4000, "info");
            return;
        }

        try {
            const all = await renderLedgerAll(ref.avId);
            if (!all.complete) {
                showMessage(t("ledger.loadIncomplete"), 5000, "error");
                return;
            }
            const { calculateVaccineSchedule } = await import("@/core/immunization");
            type GivenDose = import("@/core/immunization").GivenDoseRecord;
            let selectedChildId = candidate[0].id;

            const dlg = new Dialog({
                title: t("ledger.vaccineSchedule"),
                content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-vaccine-sched-body"></div>
<div class="b3-dialog__action"><button class="b3-button" id="lv-vaccine-sched-close">${t("close")}</button></div>`,
                width: "580px",
            });
            const body = dlg.element.querySelector("#lv-vaccine-sched-body") as HTMLElement;
            (dlg.element.querySelector("#lv-vaccine-sched-close") as HTMLButtonElement).onclick = () => dlg.destroy();

            const render = () => {
                body.replaceChildren();
                const child = allMembers.find((m) => m.id === selectedChildId) || candidate[0];
                if (!child.birthday) return;

                // 收集该孩子在 parenting 里的已接种记录
                const givenRecords: GivenDose[] = [];
                for (const r of all.rows) {
                    const mBlock = ref.columns.member ? r.cells[ref.columns.member]?.relation?.blockIDs?.[0] : undefined;
                    if (mBlock && child.avItemId && mBlock !== child.avItemId) continue;

                    const vname = ref.columns.vaccine_name ? cellText(r.cells[ref.columns.vaccine_name]) : (ref.columns.name ? cellText(r.cells[ref.columns.name]) : "");
                    const doseRaw = ref.columns.dose_no ? cellText(r.cells[ref.columns.dose_no]) : "";
                    const dateVal = ref.columns.date ? cellText(r.cells[ref.columns.date]) : "";
                    const batchVal = ref.columns.vaccine_batch ? cellText(r.cells[ref.columns.vaccine_batch]) : "";
                    const siteVal = ref.columns.vaccine_site ? cellText(r.cells[ref.columns.vaccine_site]) : "";

                    if (vname && vname !== "—") {
                        givenRecords.push({
                            id: r.itemID,
                            vaccineName: vname,
                            doseNo: Number(doseRaw) || undefined,
                            date: dateVal !== "—" ? dateVal : undefined,
                            batch: batchVal !== "—" ? batchVal : undefined,
                            site: siteVal !== "—" ? siteVal : undefined,
                        });
                    }
                }

                const report = calculateVaccineSchedule(child.birthday, givenRecords);
                if (!report) return;

                // 顶部孩子切换（若多位孩子）与完成率
                const topBar = document.createElement("div");
                topBar.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px";
                if (candidate.length > 1) {
                    const sel = document.createElement("select");
                    sel.className = "b3-select";
                    sel.style.cssText = "font-size:12px;padding:3px 8px";
                    for (const c of candidate) {
                        const opt = document.createElement("option");
                        opt.value = c.id;
                        opt.textContent = `${c.name} (${c.birthday})`;
                        if (c.id === selectedChildId) opt.selected = true;
                        sel.appendChild(opt);
                    }
                    sel.onchange = () => { selectedChildId = sel.value; render(); };
                    topBar.appendChild(sel);
                } else {
                    const nameSpan = document.createElement("b");
                    nameSpan.style.cssText = "font-size:13px;color:var(--lv-tx)";
                    nameSpan.textContent = `${child.name} · ${child.birthday}`;
                    topBar.appendChild(nameSpan);
                }
                const rateSpan = document.createElement("span");
                rateSpan.className = "lv-caption";
                rateSpan.innerHTML = `${t("ledger.vaccineCompletionRate")}: <b class="lv-num" style="color:var(--lv-accent)">${report.completionRate}%</b>`;
                topBar.appendChild(rateSpan);
                body.appendChild(topBar);

                // 进度条
                const progressTrack = document.createElement("div");
                progressTrack.style.cssText = "height:6px;border-radius:3px;background:var(--lv-line);overflow:hidden;width:100%";
                progressTrack.innerHTML = `<div style="height:100%;background:var(--lv-accent);width:${report.completionRate}%;border-radius:3px"></div>`;
                body.appendChild(progressTrack);

                // 统计概览卡
                const metrics = document.createElement("div");
                metrics.style.cssText = "display:grid;grid-template-columns:repeat(4, 1fr);gap:8px";

                const givenCard = document.createElement("div");
                givenCard.style.cssText = "padding:8px 10px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-line);display:flex;flex-direction:column;gap:2px";
                givenCard.innerHTML = `<span class="lv-caption">${t("ledger.vaccineGiven")}</span><b class="lv-num" style="color:var(--lv-accent);font-size:16px">${report.givenCount}</b>`;

                const overdueCard = document.createElement("div");
                overdueCard.style.cssText = "padding:8px 10px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-line);display:flex;flex-direction:column;gap:2px";
                overdueCard.innerHTML = `<span class="lv-caption">${t("ledger.vaccineOverdue")}</span><b class="lv-num" style="color:var(--lv-danger);font-size:16px">${report.overdueCount}</b>`;

                const dueSoonCard = document.createElement("div");
                dueSoonCard.style.cssText = "padding:8px 10px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-line);display:flex;flex-direction:column;gap:2px";
                dueSoonCard.innerHTML = `<span class="lv-caption">${t("ledger.vaccineDueSoon")}</span><b class="lv-num" style="color:var(--lv-warn);font-size:16px">${report.dueSoonCount}</b>`;

                const upcomingCard = document.createElement("div");
                upcomingCard.style.cssText = "padding:8px 10px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-line);display:flex;flex-direction:column;gap:2px";
                upcomingCard.innerHTML = `<span class="lv-caption">${t("ledger.vaccineUpcoming")}</span><b class="lv-num" style="font-size:16px">${report.upcomingCount}</b>`;

                metrics.append(givenCard, overdueCard, dueSoonCard, upcomingCard);
                body.appendChild(metrics);

                // 疫苗排期列表
                const list = document.createElement("div");
                list.style.cssText = "display:flex;flex-direction:column;gap:6px;margin-top:4px";

                for (const it of report.items) {
                    const itemEl = document.createElement("div");
                    itemEl.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-line);font-size:12.5px";

                    const left = document.createElement("div");
                    left.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0;flex:1";

                    const titleLine = document.createElement("div");
                    titleLine.style.cssText = "display:flex;align-items:center;gap:6px";
                    const nameSpan = document.createElement("b");
                    nameSpan.style.cssText = "color:var(--lv-tx)";
                    nameSpan.textContent = `${it.vaccine}（第 ${it.dose} 剂）`;

                    const monthBadge = document.createElement("span");
                    monthBadge.className = "lv-caption";
                    monthBadge.style.cssText = "padding:1px 6px;border-radius:4px;background:var(--lv-surface);border:1px solid var(--lv-line)";
                    monthBadge.textContent = it.monthAge === 0 ? "出生时" : `${it.monthAge}月龄`;

                    titleLine.append(nameSpan, monthBadge);

                    const metaSpan = document.createElement("span");
                    metaSpan.className = "lv-caption";
                    const metaParts = [`应种日: ${it.targetDate}`];
                    if (it.note) metaParts.push(it.note);
                    if (it.givenDate) metaParts.push(`实种日: ${it.givenDate}`);
                    if (it.batch) metaParts.push(`批号: ${it.batch}`);
                    metaSpan.textContent = metaParts.join(" · ");

                    left.append(titleLine, metaSpan);

                    const right = document.createElement("div");
                    right.style.cssText = "display:flex;align-items:center;gap:6px;flex-shrink:0";

                    const statusBadge = document.createElement("span");
                    if (it.status === "given") {
                        statusBadge.className = "lv-badge green";
                        statusBadge.textContent = t("ledger.vaccineGiven");
                    } else if (it.status === "overdue") {
                        statusBadge.className = "lv-badge danger";
                        statusBadge.textContent = t("ledger.vaccineOverdue");
                    } else if (it.status === "due_soon") {
                        statusBadge.className = "lv-badge orange";
                        statusBadge.textContent = t("ledger.vaccineDueSoon");
                    } else {
                        statusBadge.className = "lv-badge gray";
                        statusBadge.textContent = t("ledger.vaccineUpcoming");
                    }
                    right.appendChild(statusBadge);

                    if (it.status !== "given") {
                        const recordBtn = document.createElement("button");
                        recordBtn.className = "b3-button b3-button--text";
                        recordBtn.style.cssText = "font-size:11.5px;padding:0 4px;color:var(--lv-accent)";
                        recordBtn.textContent = `＋ ${t("ledger.recordVaccineDose")}`;
                        recordBtn.onclick = () => {
                            const rdlg = new Dialog({
                                title: `${t("ledger.recordVaccineTitle")} · ${it.vaccine}`,
                                content: `<div class="b3-dialog__content lv-dialog-col">
                                    <label style="display:flex;flex-direction:column;gap:4px">
                                        <span class="lv-caption">${t("field.date")}</span>
                                        <input class="b3-text-field" id="lv-vrec-date" type="date" value="${it.targetDate}" style="width:100%" />
                                    </label>
                                    <label style="display:flex;flex-direction:column;gap:4px">
                                        <span class="lv-caption">${t("field.vaccine_batch")}</span>
                                        <input class="b3-text-field" id="lv-vrec-batch" placeholder="${t("field.vaccine_batch")}" style="width:100%" />
                                    </label>
                                    <label style="display:flex;flex-direction:column;gap:4px">
                                        <span class="lv-caption">${t("field.vaccine_site")}</span>
                                        <input class="b3-text-field" id="lv-vrec-site" placeholder="${t("field.vaccine_site")}" style="width:100%" />
                                    </label>
                                </div>
                                <div class="b3-dialog__action">
                                    <button class="b3-button b3-button--cancel" id="lv-vrec-cancel">${t("cancel")}</button>
                                    <button class="b3-button" id="lv-vrec-save">${t("save")}</button>
                                </div>`,
                                width: "400px",
                            });
                            (rdlg.element.querySelector("#lv-vrec-cancel") as HTMLButtonElement).onclick = () => rdlg.destroy();
                            (rdlg.element.querySelector("#lv-vrec-save") as HTMLButtonElement).onclick = async function (this: HTMLButtonElement) {
                                const dateVal = (rdlg.element.querySelector("#lv-vrec-date") as HTMLInputElement)?.value.trim() || it.targetDate;
                                const batchVal = (rdlg.element.querySelector("#lv-vrec-batch") as HTMLInputElement)?.value.trim();
                                const siteVal = (rdlg.element.querySelector("#lv-vrec-site") as HTMLInputElement)?.value.trim();

                                this.disabled = true;
                                rdlg.destroy();
                                try {
                                    const { addDetachedRow, setCell } = await import("@/core/siyuan");
                                    const rowId = await addDetachedRow(ref.avId!, it.vaccine);
                                    if (ref.columns.category) {
                                        await setCell(ref.avId!, ref.columns.category, rowId, { type: "select", select: { content: "vaccine_p" } });
                                    }
                                    if (ref.columns.date) {
                                        await setCell(ref.avId!, ref.columns.date, rowId, { type: "date", date: { content: dateVal, isNotEmpty: true } });
                                    }
                                    if (ref.columns.vaccine_name) {
                                        await setCell(ref.avId!, ref.columns.vaccine_name, rowId, { type: "text", text: { content: it.vaccine } });
                                    }
                                    if (ref.columns.dose_no) {
                                        await setCell(ref.avId!, ref.columns.dose_no, rowId, { type: "number", number: { content: it.dose, isNotEmpty: true } });
                                    }
                                    if (ref.columns.vaccine_batch && batchVal) {
                                        await setCell(ref.avId!, ref.columns.vaccine_batch, rowId, { type: "text", text: { content: batchVal } });
                                    }
                                    if (ref.columns.vaccine_site && siteVal) {
                                        await setCell(ref.avId!, ref.columns.vaccine_site, rowId, { type: "text", text: { content: siteVal } });
                                    }
                                    if (ref.columns.member && child.avItemId) {
                                        await setCell(ref.avId!, ref.columns.member, rowId, { type: "relation", relation: { blockIDs: [child.avItemId] } });
                                    }
                                    showMessage(t("ledger.recordVaccineSaved"), 3000, "info");
                                    all.rows.push({
                                        itemID: rowId,
                                        cells: {
                                            [ref.columns.vaccine_name]: { type: "text", text: { content: it.vaccine } },
                                            [ref.columns.dose_no]: { type: "number", number: { content: it.dose } },
                                            [ref.columns.date]: { type: "date", date: { content: dateVal } },
                                            [ref.columns.category]: { type: "select", select: { content: "vaccine_p" } },
                                        },
                                    });
                                    render();
                                    await load();
                                } catch (err) {
                                    showMessage(t("ledger.saveFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 6000, "error");
                                }
                            };
                        };
                        right.appendChild(recordBtn);
                    }

                    itemEl.append(left, right);
                    list.appendChild(itemEl);
                }

                body.appendChild(list);
            };

            render();
        } catch (e) {
            showMessage(t("ledger.logReadFailed") + " (" + (e instanceof Error ? e.message : String(e)) + ")", 6000, "error");
        }
    }

    async function rebuildLedger() {
        rebuilding = true;
        try {
            const report = await plugin.ensureCoreLedgers();
            try {
                // Rebuilding/provisioning changes the set of readable ledgers;
                // a cached scan can otherwise hide the new module for 30s.
                await plugin.refreshHub(undefined, true);
            } catch (e) {
                showMessage(t("ledger.rebuildRefreshFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                return;
            }
            if (report.issues.length > 0) {
                const modules = report.issues.map(({ moduleId }) => t(`module.${moduleId}`)).join(", ");
                showMessage(t("ledger.rebuildPartial").replace("${modules}", modules), 7000, "error");
            } else {
                showMessage(t("ledger.rebuildDone"), 3000, "info");
            }
        } catch (e) {
            showMessage(t("ledger.rebuildFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
        } finally {
            rebuilding = false;
        }
    }

    // Shopping suggestions aggregate low-stock items and support copying the list.
    async function openShoppingList() {
        if (!ref?.avId || !ref.columns?.name || !ref.columns.qty || !ref.columns.low_stock_at) return;
        try {
            const all = await renderLedgerAll(ref.avId);
            if (!all.complete) {
                showMessage(t("ledger.loadIncomplete"), 5000, "error");
                return;
            }
            const items = buildShoppingList(all.rows, {
                nameKey: ref.columns.name, qtyKey: ref.columns.qty, thresholdKey: ref.columns.low_stock_at,
            });
            const dlg = new Dialog({
                title: t("ledger.shoppingList"),
                content: `<div class="b3-dialog__content" id="lv-shop-body" style="max-height:60vh;overflow:auto"></div>
<div class="b3-dialog__action"><span class="lv-caption" id="lv-shop-total" style="flex:1"></span><button class="b3-button b3-button--cancel" id="lv-shop-close">${t("cancel")}</button><button class="b3-button b3-button--text" id="lv-shop-copy" ${items.length === 0 ? "disabled" : ""}>${t("ledger.shopCopy")}</button></div>`,
                width: "520px",
            });
        const body = dlg.element.querySelector("#lv-shop-body") as HTMLElement;
        if (items.length === 0) {
            const none = document.createElement("div");
            none.className = "ft__on-surface";
            none.style.cssText = "font-size:13px;padding:8px 0";
            none.textContent = t("ledger.shopEmpty");
            body.appendChild(none);
        }
        const qtyInputs: HTMLInputElement[] = [];
        for (const it of items) {
            const line = document.createElement("div");
            line.className = "fn__flex";
            line.style.cssText = "gap:8px;align-items:center;padding:4px 0;font-size:13px";
            const label = document.createElement("span");
            label.style.cssText = "flex:1;word-break:break-all";
            label.textContent = it.name;
            const meta = document.createElement("span");
            meta.className = "lv-caption";
            meta.style.cssText = "flex-shrink:0";
            meta.textContent = t("ledger.shopExisting").replace("${q}", String(it.qty)).replace("${t2}", String(it.threshold));
            const input = document.createElement("input");
            input.type = "number";
            input.className = "b3-text-field";
            input.style.cssText = "width:74px;flex-shrink:0";
            input.min = "1";
            input.value = String(it.suggest);
            input.title = t("ledger.shopBuy");
            qtyInputs.push(input);
            line.append(label, meta, input);
            body.appendChild(line);
        }
        const total = dlg.element.querySelector("#lv-shop-total") as HTMLElement;
        total.textContent = t("ledger.shopTotal").replace("${n}", String(items.length));
        (dlg.element.querySelector("#lv-shop-close") as HTMLButtonElement).onclick = () => dlg.destroy();
        (dlg.element.querySelector("#lv-shop-copy") as HTMLButtonElement).onclick = async () => {
            const lines = items
                .map((it, i) => `${it.name} ×${Math.max(1, Math.floor(Number(qtyInputs[i].value) || 1))}`)
                .join("\n");
            const text = `${t("ledger.shoppingList")} · ${localDateKey(new Date())}\n${lines}`;
            try {
                await navigator.clipboard.writeText(text);
                showMessage(t("ledger.shopCopied"), 2500, "info");
            } catch {
                showMessage(t("ledger.shopCopyFailed"), 4000, "error");
            }
        };
        } catch (e) {
            showMessage(t("ledger.shoppingFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
        }
    }

    // Favors annual summary report and relationship balance analysis (317波抽离减负).
    async function openFavorsReport() {
        if (!ref?.avId || !ref.columns) return;
        const { openFavorsReportDialog } = await import("@/core/favors-dialog");
        return openFavorsReportDialog({
            ref,
            t,
            DialogCls: Dialog,
            showMessageFn: showMessage,
            loadRows: () => renderLedgerAll(ref!.avId!),
        });
    }

    // Check validity of URLs in bookmarks ledger and highlight broken links.
    async function openBookmarksCheck() {
        if (!ref?.avId || !ref.columns?.url) return;
        try {
            const all = await renderLedgerAll(ref.avId);
            if (!all.complete) {
                showMessage(t("ledger.loadIncomplete"), 5000, "error");
                return;
            }

            const dlg = new Dialog({
                title: t("ledger.checkBookmarks"),
                content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-bm-check-body">
                    <div style="display:flex;align-items:center;gap:8px;padding:16px;justify-content:center">
                        <span class="lv-caption">${t("ledger.bookmarksChecking").replace("${n}", String(all.rows.length))}</span>
                    </div>
                </div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-bm-check-close">${t("close")}</button><button class="b3-button" id="lv-bm-check-copy" disabled>${t("ledger.bookmarksCopyReport")}</button></div>`,
                width: "560px",
            });
            const body = dlg.element.querySelector("#lv-bm-check-body") as HTMLElement;
            const copyBtn = dlg.element.querySelector("#lv-bm-check-copy") as HTMLButtonElement;

            (dlg.element.querySelector("#lv-bm-check-close") as HTMLButtonElement).onclick = () => dlg.destroy();

            const { checkBookmarksHealth, formatBookmarkHealthReportText } = await import("@/core/bookmarks");
            const report = await checkBookmarksHealth(all.rows, ref.columns);

            body.replaceChildren();

            if (report.total === 0) {
                const empty = document.createElement("div");
                empty.className = "lv-caption";
                empty.style.cssText = "text-align:center;padding:24px 0";
                empty.textContent = t("ledger.bookmarksNoLinks");
                body.appendChild(empty);
                return;
            }

            // 统计指标卡
            const metrics = document.createElement("div");
            metrics.style.cssText = "display:grid;grid-template-columns:repeat(3, 1fr);gap:10px";

            const totalCard = document.createElement("div");
            totalCard.className = "lv-metric-lg";
            totalCard.innerHTML = `<span class="lv-caption">${t("ledger.bookmarksTotal")}</span><b class="lv-num" style="font-size:18px">${report.total}</b>`;

            const healthyCard = document.createElement("div");
            healthyCard.className = "lv-metric-lg";
            healthyCard.innerHTML = `<span class="lv-caption">${t("ledger.bookmarksHealthy")}</span><b class="lv-num" style="color:var(--lv-accent);font-size:18px">${report.healthyCount}</b>`;

            const brokenCard = document.createElement("div");
            const brokenColor = report.brokenCount > 0 ? "var(--lv-danger)" : "var(--lv-tx-3)";
            brokenCard.className = "lv-metric-lg";
            brokenCard.innerHTML = `<span class="lv-caption">${t("ledger.bookmarksBroken")}</span><b class="lv-num" style="color:${brokenColor};font-size:18px">${report.brokenCount}</b>`;

            metrics.append(totalCard, healthyCard, brokenCard);
            body.appendChild(metrics);

            if (report.brokenCount === 0) {
                const okMsg = document.createElement("div");
                okMsg.style.cssText = "padding:14px;background:var(--lv-surface-2);border-radius:8px;border:1px solid var(--lv-accent);color:var(--lv-accent);text-align:center;font-size:13px";
                okMsg.textContent = `✓ ${t("ledger.bookmarksAllHealthy")}`;
                body.appendChild(okMsg);
            } else {
                copyBtn.disabled = false;
                const sec = document.createElement("div");
                sec.style.cssText = "margin-top:4px";
                sec.innerHTML = `<div class="ft__on-surface lv-section-title">${t("ledger.bookmarksBrokenCount").replace("${n}", String(report.brokenCount))}</div>`;

                const list = document.createElement("div");
                list.style.cssText = "display:flex;flex-direction:column;gap:6px";

                for (const item of report.brokenItems) {
                    const rowEl = document.createElement("div");
                    rowEl.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-line);font-size:12px";

                    const left = document.createElement("div");
                    left.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0;flex:1";

                    const titleSpan = document.createElement("span");
                    titleSpan.style.cssText = "font-weight:500;color:var(--lv-tx)";
                    titleSpan.textContent = item.name;

                    const urlSpan = document.createElement("span");
                    urlSpan.className = "lv-caption";
                    urlSpan.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
                    urlSpan.textContent = item.url || "（空链接）";

                    left.append(titleSpan, urlSpan);

                    const right = document.createElement("div");
                    right.style.cssText = "display:flex;align-items:center;gap:6px;flex-shrink:0";

                    const badge = document.createElement("span");
                    badge.className = "lv-badge danger";
                    badge.textContent = item.error ? item.error : (item.statusCode ? `HTTP ${item.statusCode}` : "失效");

                    right.append(badge);

                    if (item.url && (item.url.startsWith("http://") || item.url.startsWith("https://"))) {
                        const testBtn = document.createElement("button");
                        testBtn.className = "b3-button b3-button--text";
                        testBtn.style.cssText = "font-size:11.5px;padding:0 4px;color:var(--lv-accent)";
                        testBtn.textContent = t("ledger.bookmarksOpenTest");
                        testBtn.onclick = () => window.open(item.url, "_blank");
                        right.append(testBtn);
                    }

                    rowEl.append(left, right);
                    list.appendChild(rowEl);
                }

                sec.appendChild(list);
                body.appendChild(sec);
            }

            copyBtn.onclick = async () => {
                const text = formatBookmarkHealthReportText(report);
                try {
                    await navigator.clipboard.writeText(text);
                    showMessage(t("ledger.bookmarksReportCopied"), 2500, "info");
                } catch {
                    showMessage(t("ledger.copyAsImageFail"), 4000, "error");
                }
            };
        } catch (e) {
            showMessage(t("ledger.logReadFailed") + " (" + (e instanceof Error ? e.message : String(e)) + ")", 6000, "error");
        }
    }

    // Calculate subscription expenses normalized to monthly and annual projections.
    async function openSubscriptionStats() {
        if (!ref?.avId || !ref.columns?.amount) return;
        try {
            const all = await renderLedgerAll(ref.avId);
            if (!all.complete) {
                showMessage(t("ledger.loadIncomplete"), 5000, "error");
                return;
            }
            const { openSubscriptionStatsDialog } = await import("@/core/subscriptions");
            openSubscriptionStatsDialog({
                rows: all.rows,
                columns: ref.columns,
                t,
                DialogCls: Dialog,
                showMessageFn: showMessage,
            });
        } catch (e) {
            showMessage(t("ledger.logReadFailed") + " (" + (e instanceof Error ? e.message : String(e)) + ")", 6000, "error");
        }
    }

    // Asset valuation report summarizing initial costs and current appraised values.
    async function openAssetValuationModal() {
        if (!ref?.avId || !ref.columns?.amount) return;
        try {
            const all = await renderLedgerAll(ref.avId);
            if (!all.complete) {
                showMessage(t("ledger.loadIncomplete"), 5000, "error");
                return;
            }
            const { loadRowLogs } = await import("@/core/rowlog");
            const logs = await loadRowLogs(plugin as any);
            const { calculateAssetValuationStats } = await import("@/core/valuation");
            const report = calculateAssetValuationStats(all.rows, ref.columns, logs, ref.avId);

            const dlg = new Dialog({
                title: t("ledger.assetValuationReport"),
                content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-asset-val-body"></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-asset-val-close">${t("close")}</button><button class="b3-button" id="lv-asset-val-copy">${t("ledger.assetValuationCopy")}</button></div>`,
                width: "560px",
            });
            const body = dlg.element.querySelector("#lv-asset-val-body") as HTMLElement;
            const copyBtn = dlg.element.querySelector("#lv-asset-val-copy") as HTMLButtonElement;

            (dlg.element.querySelector("#lv-asset-val-close") as HTMLButtonElement).onclick = () => dlg.destroy();

            if (report.activeItems === 0) {
                const empty = document.createElement("div");
                empty.className = "lv-caption";
                empty.style.cssText = "text-align:center;padding:24px 0";
                empty.textContent = t("ledger.assetValuationEmpty");
                body.appendChild(empty);
                copyBtn.disabled = true;
                return;
            }

            // 指标卡
            const metrics = document.createElement("div");
            metrics.style.cssText = "display:grid;grid-template-columns:repeat(3, 1fr);gap:10px";

            const initCard = document.createElement("div");
            initCard.className = "lv-metric-lg";
            initCard.innerHTML = `<span class="lv-caption">${t("ledger.assetInitialCost")}</span><b class="lv-num" style="font-size:18px">¥${formatAmount(report.totalInitialCost)}</b><span class="lv-caption">${report.activeItems} 件在役</span>`;

            const valCard = document.createElement("div");
            valCard.className = "lv-metric-lg";
            valCard.innerHTML = `<span class="lv-caption">${t("ledger.assetCurrentValuation")}</span><b class="lv-num" style="color:var(--lv-accent);font-size:18px">¥${formatAmount(report.totalCurrentValuation)}</b><span class="lv-caption">最新总估值</span>`;

            const deltaCard = document.createElement("div");
            const deltaColor = report.netValuationChange >= 0 ? "var(--lv-accent)" : "var(--lv-warn)";
            deltaCard.className = "lv-metric-lg";
            deltaCard.innerHTML = `<span class="lv-caption">${t("ledger.assetNetChange")}</span><b class="lv-num" style="color:${deltaColor};font-size:18px">${report.netValuationChange >= 0 ? "+" : "-"}¥${formatAmount(Math.abs(report.netValuationChange))}</b><span class="lv-caption">${report.overallChangeRate >= 0 ? "+" : ""}${report.overallChangeRate}%</span>`;

            metrics.append(initCard, valCard, deltaCard);
            body.appendChild(metrics);

            // TOP 资产列表
            if (report.topValuedItems.length > 0) {
                const sec = document.createElement("div");
                sec.style.cssText = "margin-top:4px";
                sec.innerHTML = `<div class="ft__on-surface lv-section-title">${t("ledger.assetTopValued")}</div>`;
                const list = document.createElement("div");
                list.style.cssText = "display:flex;flex-direction:column;gap:6px";

                for (const it of report.topValuedItems) {
                    const rowEl = document.createElement("div");
                    rowEl.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-line);font-size:12.5px";

                    const left = document.createElement("div");
                    left.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0;flex:1";

                    const nameSpan = document.createElement("b");
                    nameSpan.style.cssText = "color:var(--lv-tx)";
                    nameSpan.textContent = it.name;

                    const metaSpan = document.createElement("span");
                    metaSpan.className = "lv-caption";
                    metaSpan.textContent = `原价: ¥${formatAmount(it.purchaseAmount)}${it.location ? ` · 位置: ${it.location}` : ""}${it.hasValuationLog ? ` · 估值日: ${it.latestValuationDate}` : ""}`;

                    left.append(nameSpan, metaSpan);

                    const right = document.createElement("div");
                    right.style.cssText = "text-align:right;flex-shrink:0";
                    const chgColor = it.valueDelta >= 0 ? "var(--lv-accent)" : "var(--lv-warn)";
                    right.innerHTML = `<div><b class="lv-num" style="font-size:14px;color:var(--lv-accent)">¥${formatAmount(it.currentValue)}</b></div><div class="lv-caption" style="color:${chgColor}">${it.valueDelta >= 0 ? "+" : "-"}¥${formatAmount(Math.abs(it.valueDelta))} (${it.valueChangeRate >= 0 ? "+" : ""}${it.valueChangeRate}%)</div>`;

                    rowEl.append(left, right);
                    list.appendChild(rowEl);
                }
                sec.appendChild(list);
                body.appendChild(sec);
            }

            copyBtn.onclick = async () => {
                const lines = [
                    `【实物资产估值与净值报告】`,
                    `· 在役资产：${report.activeItems} 件`,
                    `· 初始总成本：¥${formatAmount(report.totalInitialCost)}`,
                    `· 当前总估值：¥${formatAmount(report.totalCurrentValuation)}`,
                    `· 资产净变动：${report.netValuationChange >= 0 ? "+" : "-"}¥${formatAmount(Math.abs(report.netValuationChange))} (${report.overallChangeRate >= 0 ? "+" : ""}${report.overallChangeRate}% )`,
                    `---------------------------`,
                    `【高价值资产 TOP】`,
                    ...report.topValuedItems.map((it) => `· ${it.name}：当前估值 ¥${formatAmount(it.currentValue)} (初始 ¥${formatAmount(it.purchaseAmount)}${it.valueDelta !== 0 ? `，变动 ${it.valueDelta >= 0 ? "+" : "-"}¥${formatAmount(Math.abs(it.valueDelta))}` : ""})`),
                ];
                try {
                    await navigator.clipboard.writeText(lines.join("\n"));
                    showMessage(t("ledger.assetValuationCopied"), 2500, "info");
                } catch {
                    showMessage(t("ledger.copyAsImageFail"), 4000, "error");
                }
            };
        } catch (e) {
            showMessage(t("ledger.logReadFailed") + " (" + (e instanceof Error ? e.message : String(e)) + ")", 6000, "error");
        }
    }

    // Media reading/viewing annual report and status analysis.
    async function openMediaReport() {
        if (!ref?.avId || !ref.columns) return;
        try {
            const all = await renderLedgerAll(ref.avId);
            if (!all.complete) {
                showMessage(t("ledger.loadIncomplete"), 5000, "error");
                return;
            }
            const { openMediaReportDialog } = await import("@/core/media");
            openMediaReportDialog({
                rows: all.rows,
                columns: ref.columns,
                t,
                DialogCls: Dialog,
                showMessageFn: showMessage,
            });
        } catch (e) {
            showMessage(t("ledger.logReadFailed") + " (" + (e instanceof Error ? e.message : String(e)) + ")", 6000, "error");
        }
    }

    // Weekly Meal Plan & Grocery Deficit Analysis (295波):
    // Select recipes from food ledger, aggregate ingredients, compare against stock, and generate shopping list.
    async function openMealPlanModal() {
        if (!ref?.avId || !ref.columns?.name) return;
        try {
            const allFood = await renderLedgerAll(ref.avId);
            if (!allFood.complete) {
                showMessage(t("ledger.loadIncomplete"), 5000, "error");
                return;
            }
            if (allFood.rows.length === 0) {
                showMessage(t("ledger.mealPlanEmptyFood"), 4000, "info");
                return;
            }

            let stockItems: import("@/core/meal-plan").StockItemInfo[] = [];
            const stockRef = plugin.settings.dbRefs?.stock;
            if (stockRef?.avId && stockRef.columns?.name) {
                try {
                    const allStock = await renderLedgerAll(stockRef.avId);
                    if (allStock.complete) {
                        const { extractStockItemsFromRows } = await import("@/core/meal-plan");
                        stockItems = extractStockItemsFromRows(allStock.rows, {
                            nameCol: stockRef.columns.name,
                            qtyCol: stockRef.columns.qty,
                        });
                    }
                } catch {
                    // stock 异常时优雅降级为空库存
                }
            }

            const { openMealPlanDialog } = await import("@/core/meal-plan");
            openMealPlanDialog({
                allFoodRows: allFood.rows,
                stockItems,
                ref,
                plugin,
                t,
                DialogCls: Dialog,
                showMessageFn: showMessage,
                cellTextFn: cellText,
                addDetachedRowFn: addDetachedRow,
                setCellFn: setCell,
                cellValueFn: cellValue,
            });
        } catch (e) {
            showMessage(t("ledger.logReadFailed") + " (" + (e instanceof Error ? e.message : String(e)) + ")", 6000, "error");
        }
    }

    // Medicine Supply & Runout Estimation (298波):
    // Analyze dosing instructions, estimate days of supply, predict runout date, and check expiry inversion.
    async function openMedicineSupplyModal() {
        if (!ref?.avId || !ref.columns?.name) return;
        try {
            const allMed = await renderLedgerAll(ref.avId);
            if (!allMed.complete) {
                showMessage(t("ledger.loadIncomplete"), 5000, "error");
                return;
            }
            if (allMed.rows.length === 0) {
                showMessage(t("ledger.medicineSupplyEmpty"), 4000, "info");
                return;
            }

            const { evaluateMedicineSupplyReport, openMedicineSupplyDialog } = await import("@/core/medicine-dosing");
            const report = evaluateMedicineSupplyReport(allMed.rows, ref.columns);

            openMedicineSupplyDialog({
                report,
                t,
                DialogCls: Dialog,
                showMessageFn: showMessage,
            });
        } catch (e) {
            showMessage(t("ledger.logReadFailed") + " (" + (e instanceof Error ? e.message : String(e)) + ")", 5000, "error");
        }
    }

    // Municipal Waste Schedule & Recycling (316波):
    async function openWasteScheduleModal() {
        const { openWasteScheduleDialog } = await import("@/core/waste-dialog");
        openWasteScheduleDialog({
            t,
            DialogCls: Dialog,
            showMessageFn: showMessage,
        });
    }

    // Chores Rewards & Allowance Settlement (317波):
    async function openRewardsLedgerModal() {
        const { openRewardsDialog } = await import("@/core/rewards-dialog");
        openRewardsDialog({
            t,
            plugin,
            DialogCls: Dialog,
            showMessageFn: showMessage,
            renderLedgerAllFn: renderLedgerAll,
            cellTextFn: cellText,
            addDetachedRowFn: addDetachedRow,
            setCellFn: setCell,
        });
    }

    // Expense Trend & Spikes Analysis (305波):
    // Aggregate all rows with an amount + date field into monthly totals, compute MoM and detect spikes.
    async function openExpenseTrendModal() {
        const sourceRef = ref;
        if (!sourceRef?.avId) return;
        const amountCol = sourceRef.columns?.amount;
        const dateCol = sourceRef.columns?.date ?? sourceRef.columns?.expiry;
        if (!amountCol || !dateCol) {
            showMessage(t("ledger.expenseTrendNoCol"), 4000, "info");
            return;
        }
        try {
            const all = await renderLedgerAll(sourceRef.avId);
            if (!all.complete) {
                showMessage(t("ledger.loadIncomplete"), 5000, "error");
                return;
            }

            const entries = all.rows
                .map((row) => ({
                    date: cellText(row.cells[dateCol]),
                    amount: Number(cellText(row.cells[amountCol]).replace(/[^\d.-]/g, "")),
                    category: sourceRef.columns?.category ? cellText(row.cells[sourceRef.columns.category]) : undefined,
                }))
                .filter((e) => e.date && Number.isFinite(e.amount) && e.amount > 0);

            if (entries.length === 0) {
                showMessage(t("ledger.expenseTrendEmpty"), 4000, "info");
                return;
            }

            const { openExpenseTrendDialog } = await import("@/core/expense-dialog");
            openExpenseTrendDialog({
                entries,
                budgetLimits: plugin.settings.budgetLimits,
                t,
                DialogCls: Dialog,
                showMessageFn: showMessage,
            });
        } catch (e) {
            showMessage(t("ledger.logReadFailed") + " (" + (e instanceof Error ? e.message : String(e)) + ")", 5000, "error");
        }
    }

    // Household Utility Tiers & Stepped Pricing Calculation (299波):
    // Analyze meter readings (electricity, water, gas), calculate tiered costs, and issue high-tier warnings.
    async function openUtilityTiersModal() {
        if (!ref?.avId || !ref.columns?.name) return;
        try {
            const allHouse = await renderLedgerAll(ref.avId);
            if (!allHouse.complete) {
                showMessage(t("ledger.loadIncomplete"), 5000, "error");
                return;
            }
            if (allHouse.rows.length === 0) {
                showMessage(t("ledger.utilityEmptyReadings"), 4000, "info");
                return;
            }

            const { loadRowLogs, getEntries } = await import("@/core/rowlog");
            const currentLogs = await loadRowLogs(plugin as any);

            const { openUtilityTiersDialog } = await import("@/core/utility-tiers");
            openUtilityTiersDialog({
                allHouseRows: allHouse.rows,
                currentLogs,
                ref,
                t,
                DialogCls: Dialog,
                showMessageFn: showMessage,
                cellTextFn: cellText,
                getEntriesFn: getEntries,
            });
        } catch (e) {
            showMessage(t("ledger.logReadFailed") + " (" + (e instanceof Error ? e.message : String(e)) + ")", 5000, "error");
        }
    }

    // 313 波（G4）：存放位置全局检索（动态加载 core/location-dialog.ts 减轻初始 bundle）
    async function openLocationIndexModal() {
        const { openLocationIndexDialog } = await import("@/core/location-dialog");
        return openLocationIndexDialog({
            t,
            plugin,
            DialogCls: Dialog,
            showMessageFn: showMessage,
            renderLedgerAllFn: renderLedgerAll,
            cellTextFn: cellText,
        });
    }

    // 319 波：思源块收录入台账（动态加载 core/block-ingest-dialog.ts）
    async function openBlockIngestModal() {
        const { openBlockIngestDialog } = await import("@/core/block-ingest-dialog");
        return openBlockIngestDialog({
            t,
            currentModule: active,
            plugin,
            DialogCls: Dialog,
            showMessageFn: showMessage,
            addDetachedRowFn: addDetachedRow,
            setCellFn: setCell,
            onSuccessCallback: async () => {
                await load();
                try { await plugin.refreshHub([active]); } catch { /* ignore */ }
            },
        });
    }

    // 312 波（G3）：扫货模式（动态加载 core/store-dialog.ts）
    async function openStoreModeModal() {
        const sourceRef = ref;
        if (!sourceRef?.avId || !sourceRef.columns?.name) return;
        const { openStoreModeDialog } = await import("@/core/store-dialog");
        return openStoreModeDialog({
            t,
            DialogCls: Dialog,
            showMessageFn: showMessage,
            loadRows: () => renderLedgerAll(sourceRef.avId!),
            columns: {
                name: sourceRef.columns.name,
                category: sourceRef.columns.category,
                qty: sourceRef.columns.qty,
                note: sourceRef.columns.note,
            },
        });
    }

    // Emergency Kit Checklist & Stock Linking (302波):
    // Compare standard emergency kit items with current stock ledger and import missing rows.
    async function openEmergencyKitModal() {
        if (!ref?.avId || !ref.columns?.name) return;
        try {
            const allStock = await renderLedgerAll(ref.avId);
            if (!allStock.complete) {
                showMessage(t("ledger.loadIncomplete"), 5000, "error");
                return;
            }

            const { openEmergencyKitDialog } = await import("@/core/emergency-kit");
            openEmergencyKitDialog({
                stockRows: allStock.rows,
                ref: ref as { avId: string; columns?: Record<string, string> },
                t,
                DialogCls: Dialog,
                showMessageFn: showMessage,
                cellTextFn: cellText,
                addDetachedRowFn: addDetachedRow,
                setCellFn: setCell,
                isGuestReadOnly: Boolean(plugin.runtime?.guestModeActive),
                onCreatedCallback: async () => {
                    await load();
                    try { await plugin.refreshHub([active]); } catch { /* ignore */ }
                },
            });
        } catch (e) {
            showMessage(t("ledger.logReadFailed") + " (" + (e instanceof Error ? e.message : String(e)) + ")", 5000, "error");
        }
    }

    // CSV import uses a schema-driven mapping wizard; core owns the planning logic.
    function openCsvImport() {
        if (!ref?.avId) return;
        if (plugin.runtime?.guestModeActive) {
            showMessage(t("guest.writeBlocked"), 4000, "info");
            return;
        }
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".csv,text/csv";
        input.style.display = "none";
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            let table: string[][];
            try {
                table = parseCsv(await file.text());
            } catch (e) {
                showMessage(t("ledger.importBadCsv") + ` (${e instanceof Error ? e.message : String(e)})`, 5000, "error");
                return;
            }
            if (table.length < 2) { showMessage(t("ledger.importBadCsv"), 5000, "error"); return; }
            const headers = table[0];
            const importableTypes = new Set(["text", "number", "date", "checkbox", "select"]);
            const schemaCols: any[] = (plugin.schemaCatalog?.[active]?.columns ?? []).filter((c: any) => importableTypes.has(c.type));
            const labelOf = (key: string) => (t(`field.${key}`) !== `field.${key}` ? t(`field.${key}`) : key);
            let mapping = guessMapping(headers, schemaCols, labelOf);
            const dlg = new Dialog({
                title: t("ledger.importCsv"),
                content: `<div class="b3-dialog__content" id="lv-csvimp-body" style="max-height:60vh;overflow:auto">
<p class="lv-caption ft__on-surface">${t("ledger.importMapHint").replace("${file}", file.name).replace("${n}", String(table.length - 1))}</p>
<div id="lv-csvimp-map"></div></div>
<div class="b3-dialog__action"><span class="lv-caption" style="flex:1" id="lv-csvimp-stat"></span><button class="b3-button b3-button--cancel" id="lv-csvimp-close">${t("cancel")}</button><button class="b3-button" id="lv-csvimp-start">${t("ledger.importStart")}</button></div>`,
                width: "560px",
            });
            const mapBox = dlg.element.querySelector("#lv-csvimp-map") as HTMLElement;
            const selects: HTMLSelectElement[] = [];
            headers.forEach((h, i) => {
                const line = document.createElement("div");
                line.className = "fn__flex";
                line.style.cssText = "gap:8px;align-items:center;padding:3px 0;font-size:13px";
                const label = document.createElement("span");
                label.style.cssText = "flex:1;word-break:break-all";
                label.textContent = h || `#${i + 1}`;
                const sel = document.createElement("select");
                sel.className = "b3-select";
                sel.style.cssText = "width:200px;flex-shrink:0";
                sel.add(new Option(t("ledger.importSkip"), ""));
                for (const c of schemaCols) sel.add(new Option(labelOf(c.key), c.key));
                sel.value = mapping[i] ?? "";
                selects.push(sel);
                line.append(label, sel);
                mapBox.appendChild(line);
            });
            (dlg.element.querySelector("#lv-csvimp-close") as HTMLButtonElement).onclick = () => dlg.destroy();
            (dlg.element.querySelector("#lv-csvimp-start") as HTMLButtonElement).onclick = async (event) => {
                const startBtn = event.currentTarget as HTMLButtonElement;
                if (startBtn.disabled) return;
                mapping = Object.fromEntries(selects.map((s, i) => [i, s.value || undefined]));
                const mappedCount = Object.values(mapping).filter(Boolean).length;
                if (mappedCount === 0) { showMessage(t("ledger.importNoMap"), 4000, "error"); return; }
                const plan = planImport(table, mapping, schemaCols, "name");
                if (plan.rows.length === 0) { showMessage(t("ledger.importNoRows"), 4000, "error"); return; }
                startBtn.disabled = true;
                dlg.destroy();
                confirm(
                    t("ledger.importCsv"),
                    t("ledger.importConfirm")
                        .replace("${n}", String(plan.rows.length))
                        .replace("${skip}", String(plan.skipped))
                        .replace("${warnings}", String(plan.rows.reduce((n, row) => n + row.warnings.length, 0))),
                    async () => {
                        try {
                            let ok = 0;
                            const importOperationKey = `ledger-import:${active}:${file.name}:${file.size}:${file.lastModified}`;
                            const failed: number[] = [];
                            const partial: number[] = [];
                            const pending: number[] = [];
                            for (let i = 0; i < plan.rows.length; i++) {
                                const row = plan.rows[i];
                                let created = false;
                                try {
                                    const rowOperationKey = `${importOperationKey}:row:${i}`;
                                    const itemID = await addDetachedRow(ref!.avId!, row.name, { idempotencyKey: rowOperationKey });
                                    created = true;
                                    for (const c of row.cells) {
                                        if (ref!.columns![c.key]) await setCell(ref!.avId!, ref!.columns![c.key], itemID, cellValue(c.type, c.value), {
                                            idempotencyKey: `${rowOperationKey}:cell:${c.key}`,
                                        });
                                    }
                                    ok++;
                                } catch (e) {
                                    if (e instanceof RowIdentityPendingError) pending.push(i + 1);
                                    else if (created) partial.push(i + 1);
                                    else failed.push(i + 1);
                                }
                            }
                            await load();
                            if (loadError) {
                                showMessage(t("ledger.importRefreshFailed").replace("${msg}", loadError), 6000, "error");
                                return;
                            }
                            try {
                                await plugin.refreshHub([active]); // Refresh only the active module.
                            } catch (e) {
                                showMessage(t("ledger.importRefreshFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                            }
                            const failTxt = failed.length ? ` · ${t("ledger.importRowFail").replace("${n}", String(failed.length))} (#${failed.slice(0, 3).join(", #")}${failed.length > 3 ? "..." : ""})` : "";
                            const partialTxt = partial.length ? ` · ${t("ledger.importPartial").replace("${n}", String(partial.length))} (#${partial.slice(0, 3).join(", #")}${partial.length > 3 ? "..." : ""})` : "";
                            const pendingTxt = pending.length ? ` · ${t("ledger.importPending").replace("${n}", String(pending.length))} (#${pending.slice(0, 3).join(", #")}${pending.length > 3 ? "..." : ""})` : "";
                            const warningRows = plan.rows.flatMap((row, i) => row.warnings.map((warning) => `#${i + 1} ${t(`field.${warning.key}`) !== `field.${warning.key}` ? t(`field.${warning.key}`) : warning.key}: ${warning.message}`));
                            const warningTxt = warningRows.length ? ` · ${t("ledger.importWarnings").replace("${n}", String(warningRows.length))}: ${warningRows.slice(0, 3).join("; ")}${warningRows.length > 3 ? "..." : ""}` : "";
                            const hasIssues = failed.length + partial.length + pending.length + warningRows.length > 0;
                            showMessage(t("ledger.importDone").replace("${ok}", String(ok)).replace("${skip}", String(plan.skipped)) + failTxt + partialTxt + pendingTxt + warningTxt, 10000, hasIssues ? "error" : "info");
                        } catch (e) {
                            showMessage(t("ledger.importRefreshFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                        }
                    },
                );
            };
        };
        input.click();
    }

    async function load() {
        const avID = ref?.avId;
        const request = ++loadRequest;
        loadController?.abort();
        const controller = new AbortController();
        loadController = controller;
        loadError = "";
        rows = [];
        avCols = [];
        if (!avID) {
            if (plugin.pendingActivityTarget?.moduleId === active) {
                plugin.pendingActivityTarget = undefined;
                showMessage(t("activity.navigationUnavailable"), 4000, "error");
            }
            loading = false;
            if (loadController === controller) loadController = undefined;
            return;
        }
        loading = true;
        try {
            // Bound each render request to the kernel page size.
            // 表格永远只显示前 50 行——改用分页聚合的 renderLedgerAll
            const res = await renderLedgerAll(avID, 200, {
                signal: controller.signal,
                latestKey: `ledger:${active}`,
            });
            if (request !== loadRequest || avID !== ref?.avId) return;
            if (!res.complete) {
                loadError = t("ledger.loadIncomplete");
                if (plugin.pendingActivityTarget?.moduleId === active) {
                    plugin.pendingActivityTarget = undefined;
                    showMessage(t("activity.recordNotFound"), 4500, "error");
                }
                return;
            }
            rows = res.rows;
            avCols = res.columns ?? [];
            const pendingTarget = plugin.pendingActivityTarget;
            if (pendingTarget && pendingTarget.moduleId === active) {
                const targetRow = rows.find((row) => row.itemID === pendingTarget.rowId);
                requestAnimationFrame(() => {
                    if (plugin.pendingActivityTarget?.requestId !== pendingTarget.requestId) return;
                    plugin.pendingActivityTarget = undefined;
                    if (!targetRow) {
                        showMessage(t("activity.recordNotFound"), 4500, "error");
                        return;
                    }
                    if (active !== pendingTarget.moduleId) return;
                    openDetail(targetRow, undefined, pendingTarget);
                });
            }
        } catch (e) {
            if (controller.signal.aborted || (e instanceof Error && (e.name === "RequestSupersededError" || e.name === "RequestAbortedError"))) return;
            if (request === loadRequest && avID === ref?.avId) {
                loadError = t("ledger.readFailed").replace("${msg}", e instanceof Error ? e.message : String(e));
                if (plugin.pendingActivityTarget?.moduleId === active) {
                    plugin.pendingActivityTarget = undefined;
                    showMessage(t("ledger.readFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                }
            }
        } finally {
            if (request === loadRequest) {
                loadController = undefined;
                loading = false;
            }
        }
    }
    $effect(() => { void version; void active; void plugin.scan?.scannedAt; load(); });

    // Keep the fast path small, while exposing every supported schema field in
    // the expandable section below. Writes still follow the declared cell type.
    const captureCols = $derived.by(() => {
        return getCaptureFields(plugin.schemaCatalog?.[active]);
    });
    const schemaCols = $derived(plugin.schemaCatalog?.[active]?.columns ?? []);
    const supportableCols = $derived(getFormFields(plugin.schemaCatalog?.[active]).filter((field) =>
        !(active === "certs" && field.key.startsWith("x_cert_"))
        && !(field.type === "relation" && field.key !== "member")));
    const captureKeys = $derived(new Set(captureCols.map((field) => field.key)));
    const additionalCols = $derived(supportableCols.filter((field) =>
        !captureKeys.has(field.key)
        && !(active === "certs" && (field.key.startsWith("x_cert_")
            || ["holder_no", "issue_date", "issuance_rule", "store_place", "location", "copy_location", "note", "due"].includes(field.key)))));
    const unsupportedCols = $derived(schemaCols.filter((field) =>
        ["asset", "mSelect"].includes(field.type)
        || (field.type === "relation" && field.key !== "member")));
    const unsupportedCount = $derived(unsupportedCols.length);
    // Form values are keyed by schema key.
    let form: Record<string, any> = $state({});
    let nameInput: HTMLInputElement | undefined = $state();
    let newRecordOpen = $state(false);
    let closeAfterSave = $state(true);
    let newRecordTrigger: HTMLElement | null = null;
    let savedDocId = $state("");
    let savedRecordName = $state("");
    const certificateProfile = $derived(active === "certs" && form.category ? getCertificateProfile(String(form.category)) : null);
    const certificateScalarCols = $derived.by(() => {
        if (!certificateProfile) return [] as { key: string; type: string; options?: string[] }[];
        const schemaCols: any[] = plugin.schemaCatalog?.certs?.columns ?? [];
        const keys = new Set(["x_cert_holder_name", "holder_no", "x_cert_id_number", "issue_date", "x_cert_valid_from", "issuance_rule", "store_place", "location", "copy_location", "note", ...certificateProfile.fieldKeys]);
        if (!getCertificateReminderField(certificateProfile.category)) keys.add("due");
        if (certificateProfile.category === "id") keys.delete("holder_no");
        return schemaCols.filter((col: any) => keys.has(col.key) && col.type !== "mAsset")
            .map((col: any) => ({ key: col.key, type: col.type, options: col.options }));
    });
    // R7 资料强化：身份证号实时校验（输入非空才解析；校验通过且性别未填时自动回填）
    const idcardCheck = $derived.by(() => {
        const v = String(form.x_cert_id_number ?? "").trim();
        return v ? parseIdNumber(v) : null;
    });
    $effect(() => {
        const check = idcardCheck;
        if (check?.ok && check.sex && !form.x_cert_id_gender) form.x_cert_id_gender = check.sex;
    });
    const certificateAssetCols = $derived.by(() => active === "certs"
        ? [
            ...schemaCols.filter((col) => col.key === "attachments" && col.type === "mAsset"),
            ...(certificateProfile?.columns.filter((col) => col.type === "mAsset") ?? []),
        ]
        : []);
    const quickAssetCols = $derived.by(() => {
        const seen = new Set<string>();
        const out: { key: string; type: string; labelKey?: string }[] = [];
        const genericAssetCols = schemaCols.filter((entry) => entry.type === "mAsset" && !entry.key.startsWith("x_cert_"));
        for (const col of [...genericAssetCols, ...certificateAssetCols]) {
            if (seen.has(col.key)) continue;
            seen.add(col.key);
            out.push({ key: col.key, type: "mAsset", labelKey: col.labelKey });
        }
        return out;
    });
    // Keep local files across partial failures; successful uploads are cached by asset path.
    let certificateFiles: Record<string, File[]> = $state({});
    let uploadedCertificateFiles: Record<string, { name: string; content: string }[]> = $state({});
    const attachmentWriteKeys = new Map<string, { signature: string; key: string }>();
    let lastCertificateCategory = $state("");
    function fileFingerprint(file: File): string {
        return `${file.name}:${file.size}:${file.lastModified}`;
    }
    /** Generate one stable operation id for a user action and its retries. */
    function newOperationKey(prefix: string): string {
        try { return `${prefix}:${crypto.randomUUID()}`; }
        catch { return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`; }
    }
    const ledgerWriteChains = new WeakMap<object, Promise<unknown>>();
    function enqueueLedgerWrite<T>(run: () => Promise<T>): Promise<T> {
        const previous = ledgerWriteChains.get(plugin) ?? Promise.resolve();
        const current = previous.then(run);
        ledgerWriteChains.set(plugin, current.catch(() => undefined));
        return current;
    }
    function setCertificateFiles(key: string, files: File[]) {
        const vehiclePhoto = active === "vehicles" && key === "attachments";
        if (vehiclePhoto) {
            const invalid = files.filter((file) => !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024);
            if (invalid.length) showMessage(t("vehicle.photoInvalid"), 4500, "error");
            files = files.filter((file) => file.type.startsWith("image/") && file.size <= 5 * 1024 * 1024).slice(0, 1);
        }
        const previous = certificateFiles[key] ?? [];
        const seen = new Set(previous.map(fileFingerprint));
        const unique = files.filter((file) => {
            const fingerprint = fileFingerprint(file);
            if (seen.has(fingerprint)) return false;
            seen.add(fingerprint);
            return true;
        });
        certificateFiles = { ...certificateFiles, [key]: [...previous, ...unique] };
    }
    async function removeCertificateFile(key: string, source: "local" | "uploaded", index: number, confirmed = false) {
        // Removing an already-uploaded asset writes immediately to the kernel;
        // require an explicit confirmation so a misclick cannot lose it.
        if (source === "uploaded" && !confirmed) {
            confirm(t("ledger.removeAttachment"), t("ledger.removeAttachmentConfirm"), () => {
                void removeCertificateFile(key, source, index, true);
            });
            return;
        }
        if (source === "local") {
            certificateFiles = { ...certificateFiles, [key]: (certificateFiles[key] ?? []).filter((_, i) => i !== index) };
        } else {
            const next = (uploadedCertificateFiles[key] ?? []).filter((_, i) => i !== index);
            if (pendingItemID && ref?.avId && ref.columns?.[key]) {
                try {
                    const signature = JSON.stringify(next.map(({ name, content }) => ({ name, content })));
                    const slot = `${pendingItemID}:${key}`;
                    let operation = attachmentWriteKeys.get(slot);
                    if (!operation || operation.signature !== signature) {
                        operation = { signature, key: newOperationKey(`ledger:${pendingItemID}:attachment:${key}`) };
                        attachmentWriteKeys.set(slot, operation);
                    }
                    await setCell(ref.avId, ref.columns[key], pendingItemID, {
                        type: "mAsset",
                        mAsset: next.map(({ name, content }) => ({ name, content })),
                    }, { idempotencyKey: operation.key, retries: 1 });
                    attachmentWriteKeys.delete(slot);
                } catch (e) {
                    showMessage(t("ledger.attachmentRemoveFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
                    return;
                }
            }
            uploadedCertificateFiles = { ...uploadedCertificateFiles, [key]: next };
        }
    }
    function selectedFileText(key: string): string {
        const count = (certificateFiles[key]?.length ?? 0) + (uploadedCertificateFiles[key]?.length ?? 0);
        return count > 0 ? t("ledger.selectedFiles").replace("${n}", String(count)) : t("ledger.chooseAttachment");
    }
    function handleCertificateCategoryChange(category: string) {
        const hasDraft = active === "certs" && (
            Object.entries(form).some(([key, value]) => key !== "category" && value !== undefined && value !== "" && value !== false)
            || Object.values(certificateFiles).some((files) => files.length > 0)
            || Object.values(uploadedCertificateFiles).some((files) => files.length > 0)
            || !!pendingItemID
        );
        if (lastCertificateCategory && category !== lastCertificateCategory && hasDraft) {
            showMessage(t("ledger.categoryChangeBlocked"), 5000, "error");
            form = { ...form, category: lastCertificateCategory };
            return;
        }
        lastCertificateCategory = category;
        const keep = new Set(["name", "member", "expiry", "status", "x_cert_holder_name", "holder_no", "issue_date", "x_cert_valid_from", "issuance_rule", "store_place", "location", "copy_location", "note"]);
        form = { ...Object.fromEntries(Object.entries(form).filter(([key]) => keep.has(key))), category };
        certificateFiles = Object.fromEntries(Object.entries(certificateFiles).filter(([key]) => key === "attachments"));
        uploadedCertificateFiles = Object.fromEntries(Object.entries(uploadedCertificateFiles).filter(([key]) => key === "attachments"));
    }
            // Saving prevents double submits; retries preserve the item ID and form values.
    let saving = $state(false);
    let saveError = $state("");
    let validationAttempted = $state(false);
    let identityPending = $state(false); // 行已提交但身份未确认（D02）：禁止自动重试，防重复建行
    let identityChecked = $state(false);
    let savedModule = $state(""); // Brief save confirmation state.
    let pendingItemID = $state<string | null>(null);
    /** Stable key for one new-row submission. Retries after a timeout reuse it
     * so addAttributeViewBlocks cannot create a second detached row. */
    let recordOperationKey = $state<string | null>(null);
    // Keep the duplicate-name confirmation single-flight.  The host confirm
    // dialog is asynchronous while the form remains mounted, so without this
    // guard a rapid double click could open multiple dialogs and create rows
    // more than once after each confirmation.
    let duplicateConfirmPending = $state(false);

    function onNewRecordKeydown(event: KeyboardEvent) {
        if (!newRecordOpen) {
            if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey) {
                const target = event.target as HTMLElement | null;
                const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
                if (!isInput) {
                    event.preventDefault();
                    const searchEl = document.querySelector<HTMLInputElement>(".lv-ledger-toolbar input[type='search']");
                    searchEl?.focus();
                }
            }
            return;
        }
        // The host duplicate-confirm dialog owns keyboard focus while it is open.
        if (duplicateConfirmPending) return;
        if (event.key === "Tab" && saving) {
            // The form controls are disabled while saving. Keep keyboard focus
            // inside the modal instead of allowing Tab to escape to the page.
            event.preventDefault();
            document.querySelector<HTMLElement>(".lv-record-modal.open[role='dialog']")?.focus();
            return;
        }
        if (saving) return;
        if (event.key === "Escape") {
            event.preventDefault();
            closeNewRecord();
            return;
        }
        if (event.key !== "Tab") return;
        const sheet = document.querySelector(".lv-record-modal.open .lv-record-sheet");
        if (!sheet) return;
        const focusables = Array.from(sheet.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter((element) => !element.hasAttribute("disabled") && element.getClientRects().length > 0);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    function fieldLabel(key: string): string {
        return t(`field.${key}`) !== `field.${key}` ? t(`field.${key}`) : key;
    }
    function fieldMetaText(key: string | undefined): string {
        if (!key) return "";
        const value = t(key);
        return value === key ? "" : value;
    }
    function captureValidationMessage(field: ColumnDef, issue: CaptureInputError): string {
        return t(`capture.validation.${issue}`)
            .replace("${field}", fieldLabel(field.key))
            .replace("${min}", String(field.min ?? ""))
            .replace("${max}", String(field.max ?? ""));
    }
    function formFieldError(field: ColumnDef): string {
        if (!validationAttempted) return "";
        const issue = validateCaptureInput(field, form[field.key]);
        if (issue) return captureValidationMessage(field, issue);
        if (field.type === "relation") {
            const relationID = String(form[field.key] ?? "").trim();
            if (relationID && !(plugin.settings.members ?? []).some((member) => member.avItemId === relationID)) return t("members.notLinked");
        }
        return "";
    }
    function focusCaptureField(key: string) {
        const control = document.getElementById(`lv-new-${key}`);
        const collapsed = control?.closest("details");
        if (collapsed instanceof HTMLDetailsElement) collapsed.open = true;
        requestAnimationFrame(() => control?.focus());
    }

    function openNewRecord() {
        if (!ref?.avId) {
            showMessage(t("ledger.notProvisionedHint"), 4500, "info");
            return;
        }
        newRecordTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        validationAttempted = false;
        saveError = "";
        newRecordOpen = true;
        requestAnimationFrame(() => nameInput?.focus());
    }

    function restoreNewRecordFocus() {
        const trigger = newRecordTrigger;
        newRecordTrigger = null;
        requestAnimationFrame(() => {
            if (trigger?.isConnected && !trigger.closest("[inert]")) trigger.focus();
        });
    }

    function closeNewRecord() {
        if (saving) return;
        newRecordOpen = false;
        restoreNewRecordFocus();
    }

    function openPendingLedger() {
        if (!ref?.docId) return;
        identityChecked = true;
        closeNewRecord();
        plugin.showTabDocs(ref.docId);
    }

    function discardUncertainDraft() {
        resetForm();
        identityChecked = false;
        showMessage(t("ledger.uncertainDraftDiscarded"), 6000, "error");
    }

    function clearNewRecord() {
        if (pendingItemID) {
            void discardPartialRecord();
            return;
        }
        if (!hasAnyInput) {
            resetForm();
            return;
        }
        confirm(t("ledger.clearDraft"), t("ledger.clearDraftConfirm"), () => resetForm());
    }

    async function discardPartialRecord() {
        if (!pendingItemID || !ref?.avId || saving || identityPending) return;
        confirm(t("ledger.discardPartial"), t("ledger.discardPartialConfirm"), async () => {
            saving = true;
            try {
                const { removeLedgerRows } = await import("@/core/siyuan");
                await removeLedgerRows(ref!.avId!, [pendingItemID!], { idempotencyKey: `ledger:discard:${pendingItemID}` });
                resetForm();
                await load();
                try { await plugin.refreshHub([active]); } catch { /* cleanup succeeded; refresh is best effort */ }
                showMessage(t("ledger.discardPartialDone"), 3000, "info");
            } catch (e) {
                showMessage(t("ledger.discardPartialFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
            } finally {
                saving = false;
            }
        });
    }

    function saveNewRecord(continueAfter: boolean) {
        closeAfterSave = !continueAfter;
        void createRow();
    }

    function cellValue(type: string, v: any): unknown | null {
        switch (type) {
            case "select": return selectCellValue(v);
            case "relation": {
                // Relations currently target the members ledger. Disabled options may still exist in stale drafts.
                // Validate the selected row ID again before writing it.
                const relationID = typeof v === "string" ? v.trim() : "";
                const linked = relationID && (plugin.settings.members ?? []).some((m) => m.avItemId === relationID);
                return linked ? { type: "relation", relation: { blockIDs: [relationID], contents: null } } : null;
            }
            case "date": return v === "" ? { type: "date", date: { isNotEmpty: false } } : { type: "date", date: { content: new Date(`${v}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true } };
            case "number": return v === "" || v === null ? { type: "number", number: { isNotEmpty: false } } : { type: "number", number: { content: Number(v), isNotEmpty: true } };
            case "url": return { type: "url", url: { content: v } };
            case "checkbox": return { type: "checkbox", checkbox: { checked: !!v } };
            default: return { type: "text", text: { content: String(v) } };
        }
    }
    const hasAnyInput = $derived(supportableCols.some((e) => {
        const v = form[e.key];
        return e.key === "name" ? !!(v && String(v).trim()) : v !== undefined && v !== "" && v !== false;
    }) || certificateScalarCols.some((e) => form[e.key] !== undefined && form[e.key] !== "" && form[e.key] !== false)
        || quickAssetCols.some((e) => (certificateFiles[e.key]?.length ?? 0) > 0 || (uploadedCertificateFiles[e.key]?.length ?? 0) > 0));
    // A name is required whenever any other field has been entered.
    const nameMissing = $derived(hasAnyInput && !(form.name && String(form.name).trim()));

    function resetForm() {
        form = {};
        lastCertificateCategory = "";
        certificateFiles = {};
        uploadedCertificateFiles = {};
        saveError = ""; validationAttempted = false; identityPending = false; identityChecked = false; pendingItemID = null; recordOperationKey = null;
    }

    /** Format a cell for both the table and the detail drawer. */
    function cellText(v: any, colKey?: string, revealSensitive = false): string {
        if (!v) return "—";
        // 297 波：访客模式下对敏感财务金额与代码做受控脱敏遮蔽
        if (plugin.runtime?.guestModeActive) {
            const guestConfig = createDefaultGuestConfig(true);
            const rawVal = v.type === "number" && v.number?.isNotEmpty ? v.number.content : (v.text?.content ?? "");
            const masked = maskValueForGuest(rawVal, colKey ?? "", guestConfig);
            if (masked !== rawVal) return String(masked);
        }
        switch (v.type) {
            case "text": {
                const content = v.text?.content ?? "—";
                // 完整证件号在表格默认掩码（防侧窥）；详情抽屉内可显文明本
                if (!revealSensitive && colKey === "x_cert_id_number" && content !== "—") return maskIdNumber(content);
                if (!revealSensitive && ["holder_no", "x_cert_birth_registration_no_last4", "x_cert_vocational_registration_last4", "x_cert_professional_registration_last4", "x_cert_graduation_no_last4", "x_cert_degree_no_last4"].includes(colKey ?? "") && content !== "—") return maskCredentialNumber(content);
                return content;
            }
            case "date": return v.date?.isNotEmpty ? localDateKey(new Date(v.date.content)) : "—";
            case "select": {
                // Select values can be stored as either scalar or mSelect cells.
                const s = selectCellContent(v) ?? "—";
                return colKey ? optLabel(t, colKey, s) : s;
            }
            case "mSelect": {
                const list = v.mSelect?.length ? v.mSelect.map((o: any) => o.content).join(", ") : "—";
                return colKey && list !== "—" ? optLabelText(t, colKey, list) : list;
            }
            case "number": return v.number?.isNotEmpty ? String(v.number.content) : "—";
            case "url": return v.url?.content ?? "—";
            case "checkbox": return v.checkbox?.checked ? "是" : "—";
            case "block": return v.block?.content ?? "—";
            case "relation": return (v.relation?.contents ?? []).map((c: any) => c.block?.content ?? "").join(", ") || "—";
            case "mAsset": return (v.mAsset ?? []).map((asset: any) => asset?.name ?? asset?.content ?? "").filter(Boolean).join(", ") || "—";
            default: return "—";
        }
    }

    // 252 波（对齐原型台账状态语义）：由到期日推导展示级色调——只读日期比较，
    // 不写数据、不参与提醒派生
    type LedgerTone = "danger" | "warn" | "ok" | "none";
    // Warning thresholds follow each module's reminder lead time.
    const warnDays = $derived.by(() => {
        void version;
        const rules = (plugin.schemaCatalog?.[active]?.reminders ?? []) as { key: string; leadDays: number }[];
        let max = 0;
        for (const rule of rules) {
            const lead = plugin.settings.leadOverrides?.[`${active}.${rule.key}`] ?? rule.leadDays;
            if (typeof lead === "number" && lead > max) max = lead;
        }
        return max > 0 ? max : 30;
    });
    function ledgerTone(r: any): LedgerTone {
        const col = ref?.columns?.expiry ?? ref?.columns?.due;
        if (!col) return "none";
        const v = r.cells?.[col];
        const s = v?.type === "date" && v.date?.isNotEmpty ? localDateKey(new Date(v.date.content)) : "";
        if (!s) return "none";
        const today = localDateKey(new Date());
        if (s < today) return "danger";
        const end = localDateKey(new Date(Date.now() + warnDays * 86400000));
        return s <= end ? "warn" : "ok";
    }
    function toneCls(tone: LedgerTone): string {
        return tone === "danger" ? "red" : tone === "warn" ? "orange" : tone === "ok" ? "green" : "gray";
    }
    function toneColor(tone: LedgerTone): string {
        return tone === "danger" ? "var(--lv-danger)" : tone === "warn" ? "var(--lv-warn)" : "";
    }

    // Detail drawer view/edit state is kept at the UI layer.
    function rawFromValue(type: string, v: any): any {
        switch (type) {
            case "number": return v?.number?.isNotEmpty && typeof v.number.content === "number" ? v.number.content : "";
            case "date": return v?.date?.isNotEmpty ? localDateKey(new Date(v.date.content)) : "";
            case "checkbox": return !!v?.checkbox?.checked;
            case "select": return selectCellContent(v) ?? "";
            case "url": return v?.url?.content ?? "";
            default: return v?.text?.content ?? "";
        }
    }

    // Select a person from the shared contacts picker.
    function pickFromContacts(onPicked: (snapshot: string) => void) {
        openContactPicker({
            t: (key, vars) => {
                let out = t(key);
                if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`\${${k}}`, v);
                return out;
            },
            showMessage: (msg, timeout, type) => showMessage(msg, timeout, type),
        }, onPicked);
    }

    // Row click opens a detail drawer; user content is assigned through DOM APIs.
    function openDetail(row: any, vehicleAction?: "fuel" | "charging" | "maintenance" | "edit", activityTarget?: ActivityTarget) {
        if (!ref?.columns) return;
        // Show the row name in the drawer header, with a generic fallback.
        const detailTitle = (ref.columns.name && cellText(row.cells[ref.columns.name], "name")) || t("ledger.detail");
        const dlg = new Dialog({
            title: detailTitle,
            content: `<div class="b3-dialog__content b3-dialog__content--wrap" id="lv-detail-body" style="max-height:60vh;overflow:auto"></div>
<div class="b3-dialog__action lv-detail-actions"><button class="b3-button b3-button--text ft__error" id="lv-detail-del" style="color:var(--b3-theme-error)">${t("delete")}</button><button class="b3-button b3-button--text" id="lv-detail-duplicate">📋 ${t("ledger.duplicateRow")}</button><span class="fn__flex-1"></span><details class="lv-detail-more"><summary class="b3-button b3-button--outline">${t("ledger.detailMore")}</summary><div class="lv-detail-more-menu"><button class="b3-button b3-button--cancel" id="lv-detail-card-copy">${t("ledger.copyAsImage")}</button><button class="b3-button b3-button--cancel" id="lv-detail-card-png">${t("ledger.downloadPng")}</button><button class="b3-button b3-button--cancel" id="lv-detail-card-text">${t("ledger.copyAsText")}</button><button class="b3-button b3-button--cancel" id="lv-detail-card-masked-text">${t("ledger.copyAsMaskedText")}</button><button class="b3-button b3-button--cancel" id="lv-detail-open">${t("ledger.openDoc")} →</button></div></details><button class="b3-button b3-button--cancel" id="lv-detail-close">${t("close")}</button><button class="b3-button" id="lv-detail-edit">${t("ledger.detailEditAll")}</button></div>`,
            width: "520px",
        });
        const body = dlg.element.querySelector("#lv-detail-body") as HTMLElement;
        const vehicleActionQueue = createVehicleActionQueue();
        const showVehicleActionError = (error: string) =>
            showMessage(t("ledger.logReadFailed") + " (" + error + ")", 6000, "error");
        const markActivityLine = (line: HTMLElement) => {
            if (!activityTarget?.activityId) return;
            line.classList.add("lv-activity-target");
            line.setAttribute("aria-current", "location");
            line.tabIndex = -1;
            line.style.cssText += ";border-radius:6px;background:var(--lv-accent-soft, var(--b3-theme-background-light));outline:2px solid var(--lv-accent, var(--b3-theme-primary));outline-offset:2px;padding:7px";
            requestAnimationFrame(() => {
                if (!dlg.element.isConnected || !line.isConnected) return;
                line.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
                line.focus({ preventScroll: true });
            });
        };
        const registerVehicleAction = (action: VehicleQuickAction, target: HTMLButtonElement) => {
            vehicleActionQueue.register(action, () => {
                if (!body.contains(target)) return;
                target.click();
                target.scrollIntoView({ block: "nearest" });
            });
        };
        const requestVehicleAction = (action: VehicleQuickAction, notifyQueued = true) => {
            const result = vehicleActionQueue.request(action);
            if (result.status === "queued" && notifyQueued) showMessage(t("vehicle.quickLoading"), 2500, "info");
            else if (result.status === "failed") showVehicleActionError(result.error ?? "");
        };
        const failVehicleActions = (actions: readonly VehicleQuickAction[], error: unknown) => {
            const detail = error instanceof Error ? error.message : String(error);
            for (const action of actions) vehicleActionQueue.fail(action, detail);
            showVehicleActionError(detail);
        };
        body.classList.toggle("lv-detail-body-vehicle", active === "vehicles");
        const rowCategory = active === "certs" ? selectCellContent(row.cells[ref.columns.category ?? ""]) : undefined;
        const activeCertFields = active === "certs" ? new Set(getCertificateProfile(rowCategory).fieldKeys) : null;
        const schemaCols: any[] = (plugin.schemaCatalog?.[active]?.columns ?? []).filter((col: any) =>
            active !== "certs" || !String(col.key).startsWith("x_cert_") || activeCertFields?.has(col.key));
        // Editable scalar fields are handled here; complex relations remain in the host view.
        const EDITABLE = new Set(["text", "number", "date", "select", "url", "checkbox"]);
        const colLabel = (col: any) => (t(`field.${col.key}`) !== `field.${col.key}` ? t(`field.${col.key}`) : col.key);
        function labelSpan(col: any) {
            const k = document.createElement("span");
            k.className = "ft__on-surface";
            k.style.cssText = "min-width:96px;flex-shrink:0";
            k.textContent = colLabel(col);
            return k;
        }
        /**
         * Inline field editing keeps the detail view useful for quick corrections.
         * Scalar cells are edited in place; relations, assets and blocks keep their
         * dedicated actions so a click never opens an incomplete picker.
         */
        function inlineEditHint(): string {
            const translated = t("ledger.inlineEditHint");
            return translated === "ledger.inlineEditHint" ? "点击字段值即可编辑" : translated;
        }
        function inlineValue(value: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): any {
            if (value instanceof HTMLInputElement && value.type === "checkbox") return value.checked;
            return value.value;
        }
        function beginInlineEdit(col: any, keyID: string, line: HTMLElement, valueEl: HTMLElement) {
            if (!EDITABLE.has(col.type) || line.dataset.lvEditing === "true") return;
            valueEl.setAttribute("aria-hidden", "true");
            line.dataset.lvEditing = "true";
            const originalChildren = Array.from(line.children);
            const current = rawFromValue(col.type, row.cells[keyID]);
            const editor = document.createElement("div");
            editor.className = "lv-inline-editor";
            editor.style.cssText = "display:flex;align-items:center;gap:6px;flex:1;min-width:0;flex-wrap:wrap";
            let control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            const longText = col.type === "text" && /(^|_)(note|memo|description|remark|address)($|_)/i.test(String(col.key));
            if (col.type === "select") {
                const select = document.createElement("select");
                select.className = "b3-select";
                select.style.cssText = "flex:1;min-width:140px";
                select.add(new Option("", ""));
                for (const opt of col.options ?? []) select.add(new Option(optLabel(t, col.key, opt), String(opt)));
                select.value = String(current ?? "");
                control = select;
            } else if (longText) {
                const area = document.createElement("textarea");
                area.className = "b3-text-field";
                area.rows = 2;
                area.style.cssText = "flex:1;min-width:160px;resize:vertical";
                area.value = String(current ?? "");
                control = area;
            } else {
                const input = document.createElement("input");
                input.className = col.type === "checkbox" ? "b3-switch" : "b3-text-field";
                input.type = col.type === "checkbox" ? "checkbox" : col.type === "number" ? "number" : col.type === "date" ? "date" : col.type === "url" ? "url" : "text";
                if (col.type === "checkbox") input.checked = !!current;
                else input.value = String(current ?? "");
                if (col.type === "number") input.step = "any";
                input.style.cssText = col.type === "checkbox" ? "flex:0 0 auto" : "flex:1;min-width:140px";
                control = input;
            }
            const actions = document.createElement("span");
            actions.style.cssText = "display:inline-flex;gap:3px;flex:0 0 auto";
            const save = document.createElement("button");
            save.type = "button";
            save.className = "b3-button b3-button--text";
            save.style.cssText = "padding:3px 6px;font-size:12px";
            save.textContent = t("save");
            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "b3-button b3-button--text";
            cancel.style.cssText = "padding:3px 6px;font-size:12px";
            cancel.textContent = t("cancel");
            actions.append(save, cancel);
            editor.append(control);
            if (col.key === "contact" && control instanceof HTMLInputElement) {
                const pick = document.createElement("button");
                pick.type = "button";
                pick.className = "b3-button b3-button--outline";
                pick.style.cssText = "padding:3px 6px;font-size:12px";
                pick.textContent = t("ledger.pickContact");
                pick.onclick = () => pickFromContacts((picked) => { control.value = picked; });
                editor.append(pick);
            }
            editor.append(actions);
            control.setAttribute("aria-label", colLabel(col));
            line.replaceChildren(...[originalChildren[0], editor]);
            const restore = () => {
                line.replaceChildren(...originalChildren);
                delete line.dataset.lvEditing;
                valueEl.removeAttribute("aria-hidden");
            };
            let writeOperation: { signature: string; key: string } | null = null;
            cancel.onclick = restore;
            const saveInline = async () => {
                if (save.disabled) return;
                const value = inlineValue(control);
                if (col.type === "number" && value !== "" && !Number.isFinite(Number(value))) {
                    showMessage(t("ledger.logInvalid"), 3000, "error");
                    control.focus();
                    return;
                }
                const original = rawFromValue(col.type, row.cells[keyID]);
                const same = col.type === "checkbox" ? value === original : String(value) === String(original);
                if (same) { restore(); return; }
                save.disabled = true;
                cancel.disabled = true;
                control.disabled = true;
                try {
                    const nextCell = cellValue(col.type, value);
                    const signature = JSON.stringify(nextCell);
                    if (!writeOperation || writeOperation.signature !== signature) {
                        writeOperation = { signature, key: newOperationKey(`ledger:inline:${row.itemID}:${keyID}`) };
                    }
                    await setCell(ref!.avId!, keyID, row.itemID, nextCell, {
                        idempotencyKey: writeOperation.key,
                        retries: 1,
                    });
                    writeOperation = null;
                    row.cells[keyID] = nextCell;
                    // Reload the table and reopen the same detail card so derived
                    // sections (history, QR and vehicle summaries) stay in sync.
                    await load();
                    try { await plugin.refreshHub([active]); }
                    catch (refreshError) { showMessage(t("ledger.refreshFailed").replace("${msg}", refreshError instanceof Error ? refreshError.message : String(refreshError)), 5000, "error"); }
                    dlg.destroy();
                    const fresh = rows.find((entry) => entry.itemID === row.itemID);
                    if (fresh) openDetail(fresh);
                    showMessage(t("ledger.editSaved"), 2500, "info");
                } catch (error) {
                    save.disabled = false;
                    cancel.disabled = false;
                    control.disabled = false;
                    showMessage(t("ledger.saveFailed").replace("${msg}", error instanceof Error ? error.message : String(error)), 6000, "error");
                }
            };
            save.onclick = () => { void saveInline(); };
            control.addEventListener("keydown", (event) => {
                const keyEvent = event as KeyboardEvent;
                if (keyEvent.key === "Escape") { keyEvent.preventDefault(); restore(); }
                else if (keyEvent.key === "Enter" && (!(control instanceof HTMLTextAreaElement) || keyEvent.ctrlKey || keyEvent.metaKey)) { keyEvent.preventDefault(); void saveInline(); }
            });
            requestAnimationFrame(() => control.focus());
        }
        function addHistorySection() {
            const history = (plugin.runtime?.renewHistory?.[row.itemID] ?? []) as { from: string; to: string; at: string }[];
            if (history.length === 0) return;
            const head = document.createElement("div");
            head.className = "ft__on-surface";
            head.style.cssText = "margin-top:10px;padding-top:8px;border-top:1px solid var(--b3-border-color);font-size:12px";
            head.textContent = t("ledger.renewHistory");
            body.appendChild(head);
            for (const h of history) {
                const line = document.createElement("div");
                if (active === "vehicles") line.className = "lv-detail-wide";
                line.style.cssText = substRowCss;
                line.textContent = `${h.from} → ${h.to} · ${h.at.slice(0, 10)}`;
                body.appendChild(line);
            }
        }
        function addAttachmentsSection() {
            const assetCols = schemaCols.filter((col) => col.type === "mAsset" && ref!.columns[col.key]);
            const pendingDetailAssets: Record<string, { name?: string; content?: string }[]> = {};

            function showOCRGuide() {
                const guide = new Dialog({
                    title: t("ledger.ocrSetupTitle"),
                    content: `<div class="b3-dialog__content b3-dialog__content--wrap" style="line-height:1.7;max-height:60vh;overflow:auto"><p>${t("ledger.ocrSetupIntro")}</p><ol><li>${t("ledger.ocrSetupStep1")}</li><li>${t("ledger.ocrSetupStep2")}</li><li>${t("ledger.ocrSetupStep3")}</li></ol><p>${t("ledger.ocrSetupStorage")}</p><p>${t("ledger.ocrSetupAI")}</p></div><div class="b3-dialog__action"><button class="b3-button" id="lv-ocr-guide-close">${t("close")}</button></div>`,
                    width: "460px",
                });
                guide.element.querySelector("#lv-ocr-guide-close")?.addEventListener("click", () => guide.destroy());
            }

            function escapeOCRHtml(value: string): string {
                return value.replace(/[&<>"']/g, (char) => ({
                    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
                })[char] ?? char);
            }

            function showOCRText(fileName: string, text: string, rerun: () => void) {
                const result = new Dialog({
                    title: t("ledger.ocrResultTitle"),
                    content: `<div class="b3-dialog__content b3-dialog__content--wrap" style="display:flex;flex-direction:column;gap:8px"><div class="ft__on-surface" id="lv-ocr-result-name" style="word-break:break-all"></div><textarea id="lv-ocr-result-text" class="b3-text-field fn__block" readonly style="min-height:180px;resize:vertical"></textarea><div class="ft__on-surface" style="font-size:12px">${t("ledger.ocrResultStored")}</div></div><div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-ocr-rerun">${t("ledger.ocrRerun")}</button><span style="flex:1"></span><button class="b3-button b3-button--cancel" id="lv-ocr-copy" ${text ? "" : "disabled"}>${t("ledger.ocrCopy")}</button><button class="b3-button" id="lv-ocr-close">${t("close")}</button></div>`,
                    width: "520px",
                });
                (result.element.querySelector("#lv-ocr-result-name") as HTMLElement).textContent = fileName;
                (result.element.querySelector("#lv-ocr-result-text") as HTMLTextAreaElement).value = text || t("ledger.ocrNoText");
                result.element.querySelector("#lv-ocr-close")?.addEventListener("click", () => result.destroy());
                result.element.querySelector("#lv-ocr-copy")?.addEventListener("click", async () => {
                    try {
                        await navigator.clipboard.writeText(text);
                        showMessage(t("ledger.ocrCopyDone"), 2500, "info");
                    } catch {
                        showMessage(t("ledger.ocrCopyFailed"), 4000, "error");
                    }
                });
                result.element.querySelector("#lv-ocr-rerun")?.addEventListener("click", () => {
                    result.destroy();
                    rerun();
                });
            }

            function confirmAIOCR(modelName: string, providerName: string): Promise<boolean> {
                return new Promise((resolve) => {
                    let settled = false;
                    const finish = (accepted: boolean, dialog?: Dialog) => {
                        if (settled) return;
                        settled = true;
                        resolve(accepted);
                        dialog?.destroy();
                    };
                    const dialog = new Dialog({
                        title: t("ledger.ocrAIConfirmTitle"),
                        content: `<div class="b3-dialog__content b3-dialog__content--wrap" style="line-height:1.7"><p>${t("ledger.ocrAIConfirmBody")
                            .replace("${model}", escapeOCRHtml(modelName))
                            .replace("${provider}", escapeOCRHtml(providerName))}</p></div><div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-ocr-ai-cancel">${t("cancel")}</button><span style="flex:1"></span><button class="b3-button" id="lv-ocr-ai-send">${t("ledger.ocrAISend")}</button></div>`,
                        width: "460px",
                        destroyCallback: () => finish(false),
                    });
                    dialog.element.querySelector("#lv-ocr-ai-cancel")?.addEventListener("click", () => finish(false, dialog));
                    dialog.element.querySelector("#lv-ocr-ai-send")?.addEventListener("click", () => finish(true, dialog));
                });
            }

            async function recognizeImage(path: string, fileName: string, button: HTMLButtonElement) {
                button.disabled = true;
                const previousLabel = button.textContent;
                button.textContent = t("ledger.ocrRunning");
                try {
                    const config = await getOCRConfig();
                    const provider = config.config?.provider;
                    const providerState = config.providers?.find((item) => item.id === provider);
                    if (!providerState?.available) {
                        showOCRGuide();
                        return;
                    }
                    if (provider === "ai") {
                        const model = config.config.aiModelId
                            ? config.aiModels?.find((item) => item.id === config.config.aiModelId)
                            : undefined;
                        if (!model) {
                            showOCRGuide();
                            return;
                        }
                        const accepted = await confirmAIOCR(model.name, model.provider);
                        if (accepted) await runRecognition();
                    } else if (provider === "tesseract" || provider === "paddleocr") {
                        await runRecognition();
                    } else {
                        showOCRGuide();
                    }
                } catch (error) {
                    if (isKernelError(error)) showOCRGuide();
                    else showMessage(t("ledger.ocrConfigFailed").replace("${msg}", error instanceof Error ? error.message : String(error)), 7000, "error");
                } finally {
                    button.disabled = false;
                    button.textContent = previousLabel;
                }

                async function runRecognition() {
                    button.disabled = true;
                    button.textContent = t("ledger.ocrRunning");
                    try {
                        const result = await recognizeAsset(path);
                        showOCRText(fileName, result.text, () => { void recognizeImage(path, fileName, button); });
                    } catch (error) {
                        showMessage(t("ledger.ocrFailed").replace("${msg}", error instanceof Error ? error.message : String(error)), 7000, "error");
                    } finally {
                        button.disabled = false;
                        button.textContent = previousLabel;
                    }
                }
            }

            for (const attCol of assetCols) {
                const attKeyID = ref!.columns[attCol.key];
                const attHead = document.createElement("div");
                attHead.className = active === "vehicles" ? "ft__on-surface lv-detail-wide" : "ft__on-surface";
                attHead.style.cssText = "margin-top:10px;padding-top:8px;border-top:1px solid var(--b3-border-color);font-size:12px";
                attHead.textContent = colLabel(attCol);
                body.appendChild(attHead);
                const existing = (row.cells[attKeyID]?.mAsset ?? []) as { name?: string; content?: string }[];
                for (const f of existing) {
                    const line = document.createElement("div");
                    line.className = active === "vehicles" ? "lv-detail-wide" : "";
                    line.style.cssText = "padding:4px 0;font-size:12.5px;display:flex;gap:8px;align-items:center;flex-wrap:wrap";
                    const name = document.createElement("span");
                    name.style.cssText = "word-break:break-all;flex:1;min-width:120px";
                    name.textContent = `📎 ${f.name ?? f.content ?? "?"}`;
                    line.appendChild(name);
                    if (f.content) {
                        try {
                            const preview = document.createElement("a");
                            preview.className = "b3-button b3-button--text";
                            preview.style.cssText = "padding:2px 4px;font-size:12px";
                            preview.textContent = t("ledger.previewAttachment");
                            preview.href = assetHref(f.content);
                            preview.target = "_blank";
                            preview.rel = "noopener noreferrer";
                            line.appendChild(preview);
                        } catch {
                            // A malformed/legacy path remains visible by name but cannot become a navigation target.
                        }
                        const download = document.createElement("button");
                        download.className = "b3-button b3-button--text";
                        download.style.cssText = "padding:2px 4px;font-size:12px";
                        download.textContent = t("ledger.downloadAttachment");
                        download.onclick = async () => {
                            download.disabled = true;
                            try {
                                await downloadAsset(f);
                            } catch (e) {
                                showMessage(t("ledger.downloadFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                            } finally {
                                download.disabled = false;
                            }
                        };
                        line.appendChild(download);

                        if (isImageAsset(f.content) && isEncryptedNotebookAsset(f.content, window.siyuan.notebooks ?? [])) {
                            const encryptedHint = document.createElement("span");
                            encryptedHint.className = "ft__on-surface";
                            encryptedHint.style.cssText = "padding:2px 4px;font-size:12px";
                            encryptedHint.textContent = t("ledger.ocrEncrypted");
                            line.appendChild(encryptedHint);
                        } else if (isImageAsset(f.content)) {
                            const ocr = document.createElement("button");
                            ocr.className = "b3-button b3-button--text";
                            ocr.style.cssText = "padding:2px 4px;font-size:12px";
                            ocr.textContent = t("ledger.ocrOpen");
                            ocr.onclick = async () => {
                                ocr.disabled = true;
                                try {
                                    const text = await getImageOCRText(f.content!);
                                    if (text) showOCRText(f.name ?? f.content!, text, () => { void recognizeImage(f.content!, f.name ?? f.content!, ocr); });
                                    else await recognizeImage(f.content!, f.name ?? f.content!, ocr);
                                } catch (error) {
                                    if (isKernelError(error)) showOCRGuide();
                                    else showMessage(t("ledger.ocrConfigFailed").replace("${msg}", error instanceof Error ? error.message : String(error)), 7000, "error");
                                } finally {
                                    ocr.disabled = false;
                                }
                            };
                            line.appendChild(ocr);
                        }
                    }
                    body.appendChild(line);
                }
                if (existing.length === 0) {
                    const none = document.createElement("div");
                    none.className = active === "vehicles" ? "ft__on-surface lv-detail-wide" : "ft__on-surface";
                    none.style.cssText = "font-size:12.5px";
                    none.textContent = t("ledger.noAttachments");
                    body.appendChild(none);
                }
                const uploadBtn = document.createElement("button");
                uploadBtn.className = `b3-button b3-button--outline${active === "vehicles" ? " lv-detail-wide" : ""}`;
                uploadBtn.style.cssText = "margin-top:6px;font-size:12px";
                uploadBtn.textContent = t("ledger.upload");
                const fileInput = document.createElement("input");
                fileInput.type = "file";
                fileInput.accept = active === "vehicles" && attCol.key === "attachments" ? "image/*" : "image/*,.pdf";
                fileInput.multiple = attCol.key === "attachments";
                if (active === "certs" && attCol.key !== "attachments") fileInput.setAttribute("capture", "environment");
                fileInput.style.display = "none";
                uploadBtn.onclick = () => fileInput.click();
                fileInput.onchange = async () => {
                    let files = Array.from(fileInput.files ?? []);
                    if (files.length === 0) return;
                    if (active === "vehicles" && attCol.key === "attachments") {
                        const valid = files.filter((file) => file.type.startsWith("image/") && file.size <= 5 * 1024 * 1024);
                        if (valid.length !== files.length) showMessage(t("vehicle.photoInvalid"), 4500, "error");
                        files = valid.slice(0, 1);
                    }
                    if (files.length === 0) return;
                    uploadBtn.disabled = true;
                    const failed: string[] = [];
                    try {
                        const pending = pendingDetailAssets[attCol.key] ?? [];
                        const appended = [...existing, ...pending];
                        for (const f of files) {
                            try {
                                const { uploadAsset } = await import("@/core/siyuan");
                                const { name, path } = await uploadAsset(f, "/assets/siyuan-home/", {
                                    idempotencyKey: `ledger:detail-asset:${row.itemID}:${attCol.key}:${fileFingerprint(f)}`,
                                    retries: 1,
                                });
                                appended.push({ name, content: path });
                            } catch (e) {
                                failed.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
                            }
                        }
                        if (appended.length !== existing.length) {
                            try {
                                await setCell(ref!.avId!, attKeyID, row.itemID, { type: "mAsset", mAsset: appended }, {
                                    idempotencyKey: `ledger:detail-asset-cell:${row.itemID}:${attCol.key}:${appended.map((asset) => asset.content).join("|")}`,
                                    retries: 1,
                                });
                                delete pendingDetailAssets[attCol.key];
                                const msg = failed.length ? t("ledger.uploadFailed").replace("${msg}", failed.join("; ")) : t("ledger.uploadDone");
                                showMessage(msg, 5000, failed.length ? "error" : "info");
                                dlg.destroy();
                                await load();
                            } catch (e) {
                                pendingDetailAssets[attCol.key] = appended.slice(existing.length);
                                showMessage(t("ledger.uploadFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                            }
                        } else if (failed.length) {
                            showMessage(t("ledger.uploadFailed").replace("${msg}", failed.join("; ")), 6000, "error");
                        }
                    } finally {
                        uploadBtn.disabled = false;
                    }
                    // 附件写入不影响提醒派生——无需扫描（PF06：无相关变更不重扫）
                };
                body.append(uploadBtn, fileInput);
            }
            if (assetCols.length > 0) {
                const hint = document.createElement("div");
                hint.className = active === "vehicles" ? "ft__on-surface lv-detail-wide" : "ft__on-surface";
                hint.style.cssText = "font-size:12px;line-height:1.6;margin-top:6px";
                hint.textContent = t("ledger.ocrHint");
                body.appendChild(hint);
            }
        }
        // View mode includes key/value rows, history, and attachments.
        let cardRows: { key?: string; label: string; value: string }[] = [];
        function buildView() {
            body.innerHTML = "";
            cardRows = [];
            const editAction = dlg.element.querySelector("#lv-detail-edit") as HTMLButtonElement;
            const closeAction = dlg.element.querySelector("#lv-detail-close") as HTMLButtonElement;
            editAction.textContent = t("ledger.detailEditAll");
            editAction.onclick = () => buildEdit();
            closeAction.textContent = t("close");
            closeAction.onclick = () => dlg.destroy();
            (dlg.element.querySelector(".lv-detail-more") as HTMLDetailsElement).hidden = false;
            const intro = document.createElement("p");
            intro.className = "lv-detail-wide lv-detail-intro";
            intro.textContent = inlineEditHint();
            body.append(intro);
            for (const col of schemaCols) {
                const keyID = ref!.columns[col.key];
                if (!keyID) continue;
                const line = document.createElement("div");
                line.className = active === "vehicles" ? "fn__flex lv-detail-kv" : "fn__flex";
                line.style.cssText = "gap:10px;padding:7px 0;font-size:13px;min-width:0";
                line.append(labelSpan(col));
                const v = document.createElement("span");
                v.style.cssText = "word-break:break-all";
                // 提案 B/210 波：金额白名单列的数值走千分位显示（CSV/导入仍为机器可读原始值）
                const cell = row.cells[keyID];
                if (AMOUNT_KEYS.has(col.key) && cell?.type === "number" && cell?.number?.isNotEmpty && typeof cell.number.content === "number") {
                    v.textContent = formatAmount(cell.number.content);
                } else {
                    v.textContent = cellText(cell, col.key); // 211 波：select 值走枚举 i18n
                }
                // Sensitive certificate values are masked by default and can be explicitly revealed.
                if (active === "certs" && ["x_cert_id_number", "holder_no", "x_cert_birth_registration_no_last4", "x_cert_vocational_registration_last4", "x_cert_professional_registration_last4", "x_cert_graduation_no_last4", "x_cert_degree_no_last4"].includes(col.key)) {
                    const full = String(rawFromValue("text", cell) ?? "").trim();
                    if (full) {
                        const mask = col.key === "x_cert_id_number" ? maskIdNumber(full) : maskCredentialNumber(full);
                        v.textContent = mask;
                        const reveal = document.createElement("button");
                        reveal.className = "b3-button b3-button--text";
                        reveal.style.cssText = "padding:0 6px;font-size:12px";
                        reveal.textContent = t("ledger.idNumberShow");
                        let shown = false;
                        reveal.onclick = () => {
                            shown = !shown;
                            v.textContent = shown ? full : mask;
                            reveal.textContent = shown ? t("ledger.idNumberHide") : t("ledger.idNumberShow");
                        };
                        const copy = document.createElement("button");
                        copy.className = "b3-button b3-button--text";
                        copy.style.cssText = "padding:0 6px;font-size:12px";
                        copy.textContent = t("ledger.idNumberCopy");
                        copy.onclick = async () => {
                            try {
                                await navigator.clipboard.writeText(full);
                                showMessage(t("ledger.idNumberCopied"), 2500, "info");
                            } catch {
                                showMessage(t("ledger.copyAsImageFail"), 4000, "error");
                            }
                        };
                        line.append(reveal, copy);
                        // Valid ID cards can fill a linked member's birth date.
                        // Other certificate numbers support reveal/copy without ID parsing.
                        const parsedId = col.key === "x_cert_id_number" ? parseIdNumber(full) : null;
                        const memberBid = ref.columns.member ? row.cells[ref.columns.member]?.relation?.blockIDs?.[0] : undefined;
                        const member = memberBid ? (plugin.settings.members ?? []).find(m => m.avItemId === memberBid) : undefined;
                        if (parsedId?.ok && parsedId.birth && member && !member.birthday && !member.lunarBirthday) {
                            const birthFill = document.createElement("button");
                            birthFill.className = "b3-button b3-button--text";
                            birthFill.style.cssText = "padding:0 6px;font-size:12px";
                            birthFill.textContent = t("ledger.idBirthFill").replace("${birth}", parsedId.birth);
                            birthFill.onclick = async () => {
                                const target = (plugin.settings.members ?? []).find(m => m.id === member.id);
                                if (!target || target.birthday) return;
                                const previousBirthday = target.birthday;
                                target.birthday = parsedId.birth;
                                try {
                                    const { updateMember } = await import("@/core/members");
                                    await updateMember(plugin as any, plugin.settings, target);
                                    // Filling a member birthday changes the
                                    // birthday reminder provider immediately.
                                    await plugin.refreshHub(undefined, true);
                                    showMessage(t("ledger.idBirthFilled").replace("${birth}", parsedId.birth), 3000, "info");
                                    birthFill.disabled = true;
                                } catch (e) {
                                    target.birthday = previousBirthday;
                                    showMessage(t("ledger.copyAsImageFail").replace(": Downloaded instead", "") + ` (${e instanceof Error ? e.message : String(e)})`, 5000, "error");
                                }
                            };
                            line.append(birthFill);
                        }
                    }
                }
            if (EDITABLE.has(col.type)) {
                if (!v.textContent?.trim() || v.textContent === "—") {
                    v.textContent = t("ledger.detailEmpty");
                    v.classList.add("is-empty");
                }
                v.addEventListener("click", () => beginInlineEdit(col, keyID, line, v));
                v.addEventListener("keydown", (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        beginInlineEdit(col, keyID, line, v);
                    }
                });
                v.tabIndex = 0;
                v.role = "button";
                v.title = inlineEditHint();
                v.classList.add("lv-detail-value");
                v.setAttribute("aria-label", `${colLabel(col)}：${v.textContent}`);
                v.style.cssText += ";cursor:text;min-height:22px;display:inline-flex;align-items:center;flex:1;min-width:0;border-radius:4px;padding:1px 4px;margin:-1px -4px;transition:background .15s ease";
                v.dataset.lvEditable = "true";
            }
                line.append(v);
                body.appendChild(line);
                cardRows.push({ key: col.key, label: colLabel(col), value: v.classList.contains("is-empty") ? "—" : String(v.textContent) });
            }
            // Append user-created columns outside the schema as a read-only section.
            const schemaKeyIDs = new Set(Object.values<string>(ref!.columns));
            const customCols = avCols.filter((c: any) => c?.id && !schemaKeyIDs.has(c.id) && String(c.name ?? "").trim() !== "");
            if (customCols.length > 0) {
                const head = document.createElement("div");
                head.className = "ft__on-surface";
                head.style.cssText = "margin-top:10px;padding-top:8px;border-top:1px solid var(--b3-border-color);font-size:12px";
                head.textContent = t("ledger.customCols");
                body.appendChild(head);
                for (const c of customCols) {
                    const line = document.createElement("div");
                    line.className = active === "vehicles" ? "fn__flex lv-detail-wide" : "fn__flex";
                    line.style.cssText = "gap:10px;padding:4px 0;font-size:13px";
                    const k = document.createElement("span");
                    k.className = "ft__on-surface";
                    k.style.cssText = "min-width:96px;flex-shrink:0";
                    k.textContent = String(c.name);
                    line.append(k);
                    const v = document.createElement("span");
                    v.style.cssText = "word-break:break-all";
                    v.textContent = cellText(row.cells[c.id]);
                    if (EDITABLE.has(c.type)) {
                        if (!v.textContent?.trim() || v.textContent === "—") { v.textContent = t("ledger.detailEmpty"); v.classList.add("is-empty"); }
                        v.addEventListener("click", () => beginInlineEdit({ ...c, key: c.id }, c.id, line, v));
                        v.addEventListener("keydown", (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                beginInlineEdit({ ...c, key: c.id }, c.id, line, v);
                            }
                        });
                        v.tabIndex = 0;
                        v.role = "button";
                        v.title = inlineEditHint();
                        v.classList.add("lv-detail-value");
                        v.setAttribute("aria-label", `${c.name}：${v.textContent}`);
                        v.style.cssText += ";cursor:text;min-height:22px;display:inline-flex;align-items:center;flex:1;min-width:0;border-radius:4px;padding:1px 4px;margin:-1px -4px;transition:background .15s ease";
                    }
                    line.append(v);
                    body.appendChild(line);
                    cardRows.push({ label: String(c.name), value: cellText(row.cells[c.id]) });
                }
            }
        // Shared row-log timeline section; deletion cleanup is handled with the row.
        async function addRowLogSection(opts: {
            title: string;
            emptyText: string;
            addLabel: string;
            kind?: LogKind;
            fields: { key: string; type: "date" | "number" | "text"; placeholder: string; width: number }[];
            load: () => Promise<Record<string, any>[]>;
            add: (vals: Record<string, string>) => Promise<boolean>;
            remove: (entry: Record<string, any>) => Promise<void>;
            format: (entry: Record<string, any>) => string;
        }) {
            const section = document.createElement("div");
            let loaded: Record<string, any>[] = [];
            let loadFailed = false;
            const render = () => {
                section.replaceChildren();
                for (const e of loaded) {
                    const line = document.createElement("div");
                    line.style.cssText = `${substRowCss};display:flex;gap:6px;align-items:center`;
                    if (opts.kind) {
                        line.dataset.lvActivityId = rowLogActivityId(active, row.itemID, opts.kind, e);
                        if (line.dataset.lvActivityId === activityTarget?.activityId) markActivityLine(line);
                    }
                    const text = document.createElement("span");
                    text.textContent = opts.format(e);
                    const del = document.createElement("button");
                    del.className = "b3-button b3-button--text";
                    del.style.cssText = "padding:0 4px;font-size:12px";
                    del.textContent = t("delete");
                    del.onclick = async () => {
                        del.disabled = true;
                        try {
                            await opts.remove(e);
                        } catch (err) {
                            showMessage(t("ledger.logDeleteFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 5000, "error");
                            del.disabled = false;
                            return;
                        }
                        loaded = loaded.filter((item) => item !== e);
                        loadFailed = false;
                        render();
                        try {
                            loaded = await opts.load();
                            render();
                        } catch (err) {
                            loadFailed = true;
                            render();
                            showMessage(t("ledger.logReadFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 5000, "error");
                        }
                    };
                    line.append(text, del);
                    section.appendChild(line);
                }
                if (loadFailed) {
                    const error = document.createElement("div");
                    error.className = "ft__on-surface";
                    error.style.cssText = "font-size:12.5px;color:var(--lv-danger)";
                    error.textContent = t("ledger.logReadFailed");
                    section.appendChild(error);
                } else if (loaded.length === 0) {
                    const none = document.createElement("div");
                    none.className = "ft__on-surface";
                    none.style.cssText = "font-size:12.5px";
                    none.textContent = opts.emptyText;
                    section.appendChild(none);
                }
            };
            const head = document.createElement("div");
            head.className = "ft__on-surface";
            head.style.cssText = "margin-top:10px;padding-top:8px;border-top:1px solid var(--b3-border-color);font-size:12px";
            head.textContent = opts.title;
            body.appendChild(head);
            body.appendChild(section);
            const form = document.createElement("div");
            form.style.cssText = "display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap";
            const inputs: Record<string, HTMLInputElement> = {};
            for (const f of opts.fields) {
                const inp = document.createElement("input");
                inp.type = f.type;
                inp.className = "b3-text-field";
                inp.placeholder = f.placeholder;
                inp.style.cssText = `width:${f.width}px;font-size:12px`;
                inputs[f.key] = inp;
                form.appendChild(inp);
            }
            const addBtn = document.createElement("button");
            addBtn.className = "b3-button b3-button--outline";
            addBtn.style.cssText = "font-size:12px";
            addBtn.textContent = opts.addLabel;
            addBtn.onclick = async () => {
                if (addBtn.disabled) return;
                const vals = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
                if (!vals.date) {
                    showMessage(t("ledger.logInvalid"), 3000, "error");
                    return;
                }
                addBtn.disabled = true;
                try {
                    if (await opts.add(vals)) {
                        for (const i of Object.values(inputs)) i.value = "";
                        loadFailed = false;
                        try {
                            loaded = await opts.load();
                        } catch (err) {
                            loadFailed = true;
                            showMessage(t("ledger.logReadFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 5000, "error");
                        }
                        render();
                    }
                } catch (err) {
                    showMessage(t("ledger.logSaveFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 5000, "error");
                } finally {
                    addBtn.disabled = false;
                }
            };
            form.appendChild(addBtn);
            body.appendChild(form);
            try {
                loaded = await opts.load();
            } catch (err) {
                loadFailed = true;
                showMessage(t("ledger.logReadFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 5000, "error");
            }
            render();
        }

        /** Show a compact, read-only vehicle cost/event overview above the detailed sections. */
        async function addVehicleCostSummarySection() {
            if (!ref?.avId) return;
            const wrap = document.createElement("section");
            wrap.style.cssText = "margin-top:12px;padding-top:10px;border-top:1px solid var(--b3-border-color)";
            body.appendChild(wrap);
            const logs = await loadRowLogs(plugin as any);
            const fuelRecords = getEntries<EnergyRecord>(logs, ref.avId, row.itemID, "fuelings");
            const chargingRecords = getEntries<EnergyRecord>(logs, ref.avId, row.itemID, "chargings");
            const maintenanceRecords = getEntries<MaintenanceRecord>(logs, ref.avId, row.itemID, "maintenance");
            const currentOdometer = Number(cellText(row.cells[ref.columns.mileage ?? ""], "mileage"));
            const summary = calculateVehicleCostSummary(
                fuelRecords,
                chargingRecords,
                maintenanceRecords,
                new Date().toISOString().slice(0, 10),
                Number.isFinite(currentOdometer) ? currentOdometer : undefined,
            );
            const title = document.createElement("h3");
            title.style.cssText = "font-size:14px;margin:0 0 8px";
            title.textContent = t("vehicle.summary.title");
            wrap.appendChild(title);
            const hint = document.createElement("div");
            hint.className = "ft__on-surface";
            hint.style.cssText = "font-size:11px;line-height:1.5;margin:0 0 8px";
            hint.textContent = t("vehicle.summary.hint");
            wrap.appendChild(hint);
            const grid = document.createElement("div");
            grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:6px";
            const metric = (label: string, value: string) => {
                const box = document.createElement("div");
                box.style.cssText = "min-width:0;padding:8px;border-radius:8px;background:var(--b3-theme-background-light)";
                const cap = document.createElement("span");
                cap.className = "ft__on-surface";
                cap.style.cssText = "display:block;font-size:11px;margin-bottom:3px";
                cap.textContent = label;
                const val = document.createElement("b");
                val.style.cssText = "font-size:14px;overflow-wrap:anywhere";
                val.textContent = value;
                box.append(cap, val);
                grid.appendChild(box);
            };
            const money = (amount: number) => `${formatAmount(amount)} ${t("fuel.currency")}`;
            const costLabel = (records: number, known: number, amount: number) =>
                records === 0 ? "—" : known === 0 ? t("fuel.costUnknown") : `${money(amount)}${known < records ? ` · ${t("fuel.subtotal")}` : ""}`;
            const knownCosts = summary.fuel.costRecordCount + summary.charging.costRecordCount + summary.maintenance.costRecordCount;
            metric(t("vehicle.summary.totalCost"), summary.eventCount === 0 ? "—" : knownCosts === 0 ? t("fuel.costUnknown") : `${money(summary.totalCost)}${!summary.costComplete ? ` · ${t("fuel.subtotal")}` : ""}`);
            metric(t("vehicle.summary.fuelCost"), costLabel(summary.fuel.recordCount, summary.fuel.costRecordCount, summary.fuelCost));
            metric(t("vehicle.summary.chargingCost"), costLabel(summary.charging.recordCount, summary.charging.costRecordCount, summary.chargingCost));
            metric(t("vehicle.summary.maintenanceCost"), costLabel(summary.maintenance.recordCount, summary.maintenance.costRecordCount, summary.maintenanceCost));
            metric(t("vehicle.summary.eventCount"), String(summary.eventCount));
            metric(t("vehicle.summary.latestEvent"), summary.latestDate ?? "—");
            wrap.appendChild(grid);
            if (summary.eventCount && !summary.costComplete) {
                const incomplete = document.createElement("div");
                incomplete.className = "ft__on-surface";
                incomplete.style.cssText = "font-size:10px;line-height:1.5;margin-top:6px";
                incomplete.textContent = t("vehicle.summary.incomplete");
                wrap.appendChild(incomplete);
            }
            const reminders: string[] = [];
            if (summary.maintenance.nextDate) reminders.push(`${t("vehicle.maintenance.nextDateShort")} ${summary.maintenance.nextDate}`);
            if (summary.maintenance.nextOdometer !== undefined) reminders.push(`${t("vehicle.maintenance.nextOdometerShort")} ${formatAmount(summary.maintenance.nextOdometer)} ${t("fuel.km")}`);
            if (summary.maintenance.overdueDate) reminders.push(`${t("vehicle.maintenance.overdueDate")} ${summary.maintenance.overdueDate}`);
            if (summary.maintenance.overdueOdometer !== undefined) reminders.push(`${t("vehicle.maintenance.overdueOdometer")} ${formatAmount(summary.maintenance.overdueOdometer)} ${t("fuel.km")}`);
            if (reminders.length) {
                const reminder = document.createElement("div");
                reminder.className = "lv-record-next";
                reminder.style.cssText = "font-size:11px;line-height:1.6;margin-top:6px";
                reminder.textContent = `${t("vehicle.summary.nextAction")}：${reminders.join(" · ")}`;
                wrap.appendChild(reminder);
            }
        }

        /** Record and summarize fuel and charging separately per vehicle row. */
        async function addVehicleEnergySection() {
            if (!ref?.avId) return;
            const energyWrap = document.createElement("section");
            energyWrap.id = "lv-vehicle-energy";
            energyWrap.style.cssText = "margin-top:12px;padding-top:10px;border-top:1px solid var(--b3-border-color)";
            body.appendChild(energyWrap);
            const hint = document.createElement("p");
            hint.className = "ft__on-surface";
            hint.style.cssText = "font-size:12px;line-height:1.6;margin:0 0 10px";
            hint.textContent = t("fuel.vehicleHint");
            energyWrap.appendChild(hint);

            let logs = await loadRowLogs(plugin as any);
            const energyKinds: EnergyKind[] = ["fuel", "charging"];
            const vehicleEnergyType = selectCellContent(row.cells[ref.columns.energy_type ?? ""]) ?? "gasoline";
            const isHybridVehicle = vehicleEnergyType === "hybrid";
            const entriesFor = (kind: EnergyKind) => getEntries<EnergyRecord>(logs, ref!.avId!, row.itemID, kind === "fuel" ? "fuelings" : "chargings");
            const compactNumber = (value: number | undefined, digits = 2) => value === undefined || !Number.isFinite(value) ? "—" : String(Number(value.toFixed(digits)));

            function openEnergyForm(kind: EnergyKind, existing?: EnergyRecord) {
                const isFuel = kind === "fuel";
                const dialog = new Dialog({
                    title: t(existing ? "fuel.editRecord" : isFuel ? "fuel.addFuel" : "fuel.addCharging"),
                    content: `<div class="b3-dialog__content b3-dialog__content--wrap" id="lv-energy-form-body" style="max-height:65vh;overflow:auto"></div><div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-energy-cancel">${t("cancel")}</button><span style="flex:1"></span><button class="b3-button" id="lv-energy-save">${t(existing ? "fuel.update" : "save")}</button></div>`,
                    width: "560px",
                });
                dialog.element.classList.add("lv-energy-dialog");
                const formBody = dialog.element.querySelector("#lv-energy-form-body") as HTMLElement;
                const grid = document.createElement("div");
                grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px 8px";
                const controls: Record<string, HTMLInputElement | HTMLSelectElement> = {};
                const fieldErrors: Record<string, HTMLSpanElement> = {};
                const clearFieldErrors = () => {
                    for (const [key, control] of Object.entries(controls)) {
                        control.removeAttribute("aria-invalid");
                        control.removeAttribute("aria-describedby");
                        fieldErrors[key]?.replaceChildren();
                    }
                };
                const markFieldError = (key: string, message: string): boolean => {
                    const control = controls[key];
                    if (!control) return false;
                    control.setAttribute("aria-invalid", "true");
                    const error = fieldErrors[key];
                    if (error) {
                        error.textContent = message;
                        control.setAttribute("aria-describedby", error.id);
                    }
                    return true;
                };
                const field = (key: string, type: "date" | "number" | "text" | "select", opts?: string[]) => {
                    const label = document.createElement("label");
                    label.style.cssText = "display:flex;flex-direction:column;gap:4px;min-width:0;font-size:12px";
                    const caption = document.createElement("span"); caption.className = "ft__on-surface"; caption.textContent = t(`fuel.field.${key}`);
                    const input = type === "select" ? document.createElement("select") : document.createElement("input");
                    input.className = type === "select" ? "b3-select" : "b3-text-field";
                    if (input instanceof HTMLInputElement) {
                        input.type = type;
                        if (type === "number") { input.step = key === "odometer" || key === "quantity" ? "0.1" : "0.01"; input.min = "0"; }
                        if (type === "date" && key === "date") input.value = localDateKey(new Date());
                    } else {
                        input.append(new Option(t("fuel.chooseOptional"), ""));
                        for (const value of opts ?? []) input.append(new Option(t(`fuel.option.${value}`), value));
                    }
                    controls[key] = input;
                    const error = document.createElement("span");
                    error.id = `lv-energy-${key}-error`;
                    error.className = "lv-field-error";
                    error.setAttribute("role", "alert");
                    error.style.cssText = "min-height:16px;color:var(--lv-danger);font-size:11px;line-height:1.35";
                    fieldErrors[key] = error;
                    input.addEventListener("input", () => {
                        input.removeAttribute("aria-invalid");
                        input.removeAttribute("aria-describedby");
                        error.replaceChildren();
                    });
                    label.append(caption, input, error);
                    grid.appendChild(label);
                };
                field("date", "date");
                field("odometer", "number");
                const odometerInput = controls.odometer as HTMLInputElement;
                const currentOdometer = rawFromValue("number", row.cells[ref!.columns.mileage ?? ""]);
                if (currentOdometer !== "") odometerInput.value = String(currentOdometer);
                field("quantity", "number");
                if (isFuel) field("fuelGrade", "select", ["92", "95", "98", "0", "diesel", "other"]);
                else field("chargingMode", "select", ["ac", "dc", "other"]);
                field("unitPrice", "number");
                field("totalCost", "number");
                field("station", "text");
                field("note", "text");
                formBody.appendChild(grid);

                if (existing) {
                    for (const key of ["date", "odometer", "quantity", "unitPrice", "totalCost", "fuelGrade", "chargingMode", "station", "note"]) {
                        if (!(key in controls)) continue;
                        const value = (existing as any)[key];
                        if (value !== undefined && value !== null) (controls[key] as HTMLInputElement | HTMLSelectElement).value = String(value);
                    }
                }

                const fullLabel = document.createElement("label");
                fullLabel.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px";
                const full = document.createElement("input"); full.type = "checkbox"; full.className = "b3-switch";
                full.checked = existing?.full === true;
                const fullText = document.createElement("span"); fullText.textContent = t(isFuel ? "fuel.fullTank" : "fuel.fullCharge");
                fullLabel.append(full, fullText);
                formBody.appendChild(fullLabel);
                const formHint = document.createElement("p");
                formHint.className = "ft__on-surface";
                formHint.style.cssText = "font-size:11px;line-height:1.6;margin:10px 0 0";
                formHint.textContent = t("fuel.formHint");
                formBody.appendChild(formHint);

                const cancel = dialog.element.querySelector("#lv-energy-cancel") as HTMLButtonElement;
                const save = dialog.element.querySelector("#lv-energy-save") as HTMLButtonElement;
                cancel.onclick = () => dialog.destroy();
                save.onclick = async () => {
                    clearFieldErrors();
                    const date = (controls.date as HTMLInputElement).value;
                    const odometer = Number((controls.odometer as HTMLInputElement).value);
                    const quantity = Number((controls.quantity as HTMLInputElement).value);
                    const priceText = (controls.unitPrice as HTMLInputElement).value.trim();
                    const costText = (controls.totalCost as HTMLInputElement).value.trim();
                    const unitPrice = priceText ? Number(priceText) : undefined;
                    const totalCost = costText ? Number(costText) : undefined;
                    // Cost is optional for both fuel and charging. Users can
                    // record odometer/quantity first and fill the amount later.
                    const invalid: string[] = [];
                    if (!date) invalid.push("date");
                    if (!Number.isFinite(odometer) || odometer <= 0) invalid.push("odometer");
                    if (!Number.isFinite(quantity) || quantity <= 0) invalid.push("quantity");
                    if (unitPrice !== undefined && (!Number.isFinite(unitPrice) || unitPrice < 0)) invalid.push("unitPrice");
                    if (totalCost !== undefined && (!Number.isFinite(totalCost) || totalCost < 0)) invalid.push("totalCost");
                    if (invalid.length) {
                        const first = invalid[0];
                        for (const key of invalid) markFieldError(key, t("fuel.invalidField").replace("${field}", t(`fuel.field.${key}`)));
                        (controls[first] as HTMLElement)?.focus();
                        showMessage(t("fuel.invalidRecord"), 4000, "error");
                        return;
                    }
                    save.disabled = true;
                    cancel.disabled = true;
                    try {
                        const entry: EnergyRecord = {
                            kind, date, odometer, quantity, full: full.checked,
                            ...(unitPrice !== undefined ? { unitPrice } : {}),
                            ...(totalCost !== undefined ? { totalCost } : {}),
                            ...(isFuel && (controls.fuelGrade as HTMLSelectElement).value ? { fuelGrade: (controls.fuelGrade as HTMLSelectElement).value } : {}),
                            ...(!isFuel && (controls.chargingMode as HTMLSelectElement).value ? { chargingMode: (controls.chargingMode as HTMLSelectElement).value as EnergyRecord["chargingMode"] } : {}),
                            ...((controls.station as HTMLInputElement).value.trim() ? { station: (controls.station as HTMLInputElement).value.trim() } : {}),
                            ...((controls.note as HTMLInputElement).value.trim() ? { note: (controls.note as HTMLInputElement).value.trim() } : {}),
                        };
                        const logKind = kind === "fuel" ? "fuelings" : "chargings";
                        const next = await updateRowLogs(plugin as any, (latest) => {
                            const base = existing ? removeEntry(latest, ref!.avId!, row.itemID, logKind, existing as unknown as Record<string, unknown>) : latest;
                            return appendEntry(base, ref!.avId!, row.itemID, logKind, { ...entry, at: new Date().toISOString() });
                        });
                        logs = next;
                        dialog.destroy();
                        renderEnergy();
                        try {
                            await plugin.refreshHub(["vehicles"], true);
                        } catch (refreshError) {
                            showMessage(t("ledger.logSavedRefreshFailed").replace("${msg}", refreshError instanceof Error ? refreshError.message : String(refreshError)), 5000, "error");
                        }
                        showMessage(t(existing ? "fuel.updated" : "fuel.saved"), 2500, "info");
                    } catch (error) {
                        showMessage(t("ledger.logSaveFailed").replace("${msg}", error instanceof Error ? error.message : String(error)), 6000, "error");
                        save.disabled = false;
                        cancel.disabled = false;
                    }
                };
            }

            function renderEnergy() {
                energyWrap.replaceChildren(hint);
                const title = document.createElement("h3");
                title.style.cssText = "font-size:14px;margin:0 0 8px";
                title.textContent = t("fuel.sectionTitle");
                energyWrap.appendChild(title);
                const hybridHint = document.createElement("div");
                hybridHint.className = "lv-record-next";
                hybridHint.style.cssText = "margin-bottom:10px;font-size:11px";
                hybridHint.textContent = t(isHybridVehicle ? "fuel.hybridHint" : "fuel.separateEnergyHint");
                energyWrap.appendChild(hybridHint);

                for (const kind of energyKinds) {
                    const isFuel = kind === "fuel";
                    const records = entriesFor(kind);
                    const stats = calculateEnergyStats(records, kind);
                    const section = document.createElement("section");
                    section.className = "lv-card";
                    section.style.cssText = "padding:10px;margin:8px 0";
                    const head = document.createElement("div");
                    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px";
                    const heading = document.createElement("b"); heading.textContent = t(isFuel ? "fuel.fuelTitle" : "fuel.chargingTitle");
                    const add = document.createElement("button"); add.className = "b3-button b3-button--outline"; add.dataset.lvVehicleAction = kind;
                    add.textContent = `+ ${t(isFuel ? "fuel.addFuel" : "fuel.addCharging")}`;
                    add.onclick = () => openEnergyForm(kind);
                    head.append(heading, add);
                    section.appendChild(head);
                    registerVehicleAction(kind, add);

                    const statsGrid = document.createElement("div");
                    statsGrid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:6px";
                    const metric = (label: string, value: string) => {
                        const box = document.createElement("div"); box.style.cssText = "min-width:0;padding:8px;border-radius:8px;background:var(--b3-theme-background-light)";
                        const cap = document.createElement("span"); cap.className = "ft__on-surface"; cap.style.cssText = "display:block;font-size:11px;margin-bottom:3px"; cap.textContent = label;
                        const val = document.createElement("b"); val.style.cssText = "font-size:14px;overflow-wrap:anywhere"; val.textContent = value;
                        box.append(cap, val); statsGrid.appendChild(box);
                    };
                    const unit = isFuel ? "L" : "kWh";
                    const average = stats.consumptionPer100Km === undefined ? "—" : `${compactNumber(stats.consumptionPer100Km)} ${unit}/100km`;
                    const costPerKm = isHybridVehicle ? t("fuel.hybridNoRate") : stats.costPer100Km === undefined ? "—" : `${formatAmount(stats.costPer100Km / 100)} ${t("fuel.currencyPerKm")}`;
                    metric(t("fuel.avgConsumption"), isHybridVehicle ? `${formatAmount(stats.totalQuantity)} ${unit} · ${t("fuel.totalRecorded")}` : `${average}${stats.method === "estimated" && stats.intervals.length ? ` · ${t("fuel.estimated")}` : ""}`);
                    metric(t("fuel.avgCostPerKm"), costPerKm);
                    metric(t("fuel.totalSpent"), stats.costRecordCount === 0 ? t("fuel.costUnknown") : `${formatAmount(stats.totalCost)} ${t("fuel.currency")}${stats.costRecordCount < stats.recordCount ? ` · ${t("fuel.subtotal")}` : ""}`);
                    if (!isHybridVehicle) metric(t("fuel.totalDistance"), `${formatAmount(stats.totalDistance)} ${t("fuel.km")}`);
                    section.appendChild(statsGrid);
                    if (stats.warnings.includes("non_increasing_odometer")) {
                        const warning = document.createElement("div"); warning.className = "lv-record-error lv-record-warning"; warning.style.cssText = "font-size:11px;margin-top:8px"; warning.textContent = t("fuel.odometerWarning"); section.appendChild(warning);
                    }
                    if (stats.warnings.includes("incomplete_initial_interval") || stats.warnings.includes("incomplete_latest_interval")) {
                        const boundary = document.createElement("div"); boundary.className = "ft__on-surface"; boundary.style.cssText = "font-size:10px;line-height:1.5;margin-top:6px"; boundary.textContent = t("fuel.boundaryWarning"); section.appendChild(boundary);
                    }

                    const intervals = stats.intervals.slice(-8);
                    if (!isHybridVehicle && intervals.length) {
                        const chartTitle = document.createElement("div"); chartTitle.className = "ft__on-surface"; chartTitle.style.cssText = "font-size:11px;margin:10px 0 3px"; chartTitle.textContent = t("fuel.trendTitle");
                        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                        svg.setAttribute("viewBox", "0 0 300 76"); svg.setAttribute("width", "100%"); svg.setAttribute("height", "76"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", t("fuel.trendTitle"));
                        const values = intervals.map((item) => item.consumptionPer100Km);
                        const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
                        const points = values.map((value, index) => `${12 + index * (276 / Math.max(1, values.length - 1))},${62 - ((value - min) / range) * 46}`).join(" ");
                        const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
                        line.setAttribute("points", points); line.setAttribute("fill", "none"); line.setAttribute("stroke", "var(--b3-theme-primary)"); line.setAttribute("stroke-width", "2.5"); line.setAttribute("stroke-linecap", "round"); line.setAttribute("stroke-linejoin", "round");
                        svg.appendChild(line);
                        for (const [index, interval] of intervals.entries()) {
                            const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                            dot.setAttribute("cx", String(12 + index * (276 / Math.max(1, intervals.length - 1))));
                            dot.setAttribute("cy", String(62 - ((interval.consumptionPer100Km - min) / range) * 46));
                            dot.setAttribute("r", "3.5"); dot.setAttribute("fill", "var(--b3-theme-primary)");
                            const tip = document.createElementNS("http://www.w3.org/2000/svg", "title"); tip.textContent = `${interval.toDate} · ${compactNumber(interval.consumptionPer100Km)} ${unit}/100km`;
                            dot.appendChild(tip); svg.appendChild(dot);
                        }
                        section.append(chartTitle, svg);
                    } else if (!isHybridVehicle) {
                        const guidance = document.createElement("div"); guidance.className = "ft__on-surface"; guidance.style.cssText = "font-size:11px;line-height:1.6;margin-top:8px";
                        guidance.textContent = t(records.length ? "fuel.baselineHint" : "fuel.emptyHint");
                        section.appendChild(guidance);
                    }

                    const monthlyCosts = new Map<string, { amount: number; count: number }>();
                    for (const entry of records) {
                        const amount = typeof entry.totalCost === "number" && Number.isFinite(entry.totalCost)
                            ? entry.totalCost
                            : typeof entry.unitPrice === "number" && Number.isFinite(entry.unitPrice) ? entry.quantity * entry.unitPrice : undefined;
                        if (amount === undefined) continue;
                        const month = entry.date.slice(0, 7);
                        const current = monthlyCosts.get(month) ?? { amount: 0, count: 0 };
                        current.amount += amount; current.count += 1; monthlyCosts.set(month, current);
                    }
                    const monthRows = [...monthlyCosts.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6);
                    if (monthRows.length) {
                        const monthlyTitle = document.createElement("div"); monthlyTitle.className = "ft__on-surface"; monthlyTitle.style.cssText = "font-size:11px;margin:10px 0 5px"; monthlyTitle.textContent = t("fuel.monthlyCostTrend");
                        const monthly = document.createElement("div"); monthly.style.cssText = "display:grid;grid-template-columns:repeat(6,minmax(32px,1fr));gap:5px;align-items:end;height:88px";
                        const maxSpend = Math.max(...monthRows.map(([, v]) => v.amount), 1);
                        for (const [month, value] of monthRows) {
                            const column = document.createElement("div"); column.style.cssText = "height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;min-width:0";
                            const amount = document.createElement("span"); amount.className = "ft__on-surface"; amount.style.cssText = "font-size:9px;max-width:100%;overflow:hidden;text-overflow:ellipsis"; amount.textContent = formatAmount(value.amount); amount.title = `${month} · ${formatAmount(value.amount)} ${t("fuel.currency")} · ${value.count}`;
                            const bar = document.createElement("i"); bar.style.cssText = `display:block;width:min(24px,70%);min-height:3px;height:${Math.max(4, (value.amount / maxSpend) * 52)}px;background:var(--b3-theme-primary);border-radius:4px 4px 1px 1px`;
                            const label = document.createElement("span"); label.style.cssText = "font-size:9px;white-space:nowrap"; label.textContent = month.slice(5);
                            column.append(amount, bar, label); monthly.appendChild(column);
                        }
                        const monthlyHint = document.createElement("div"); monthlyHint.className = "ft__on-surface"; monthlyHint.style.cssText = "font-size:10px;line-height:1.5;margin-top:3px"; monthlyHint.textContent = t("fuel.monthlyCostHint");
                        section.append(monthlyTitle, monthly, monthlyHint);
                    }

                    const historyTitle = document.createElement("div"); historyTitle.className = "ft__on-surface"; historyTitle.style.cssText = "font-size:11px;margin:10px 0 4px"; historyTitle.textContent = `${t("fuel.historyTitle")} · ${records.length}`;
                    section.appendChild(historyTitle);
                    const recent = [...records].reverse().slice(0, 5);
                    if (activityTarget?.activityId) {
                        const targetEntry = records.find((entry) => rowLogActivityId(active, row.itemID, kind === "fuel" ? "fuelings" : "chargings", entry as unknown as Record<string, unknown>) === activityTarget.activityId);
                        if (targetEntry && !recent.includes(targetEntry)) recent.push(targetEntry);
                    }
                    if (!recent.length) {
                        const empty = document.createElement("div"); empty.className = "ft__on-surface"; empty.style.fontSize = "12px"; empty.textContent = t("fuel.noRecords"); section.appendChild(empty);
                    }
                    for (const entry of recent) {
                        const line = document.createElement("div");
                        line.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;gap:6px;padding:6px 0;border-top:1px solid var(--b3-border-color);font-size:12px;flex-wrap:wrap";
                    line.dataset.lvActivityId = rowLogActivityId(active, row.itemID, kind === "fuel" ? "fuelings" : "chargings", entry as unknown as Record<string, unknown>);
                    if (line.dataset.lvActivityId === activityTarget?.activityId) markActivityLine(line);
                        const desc = document.createElement("span"); desc.style.cssText = "flex:1;min-width:180px;overflow-wrap:anywhere";
                        const volume = `${compactNumber(entry.quantity)} ${unit}`;
                        const type = isFuel ? (entry.fuelGrade ? t(`fuel.option.${entry.fuelGrade}`) : "") : (entry.chargingMode ? t(`fuel.option.${entry.chargingMode}`) : "");
                        const price = typeof entry.totalCost === "number" ? `${formatAmount(entry.totalCost)} ${t("fuel.currency")}` : typeof entry.unitPrice === "number" ? `${compactNumber(entry.unitPrice)} ${t("fuel.unitPrice")}` : t("fuel.costUnknown");
                        desc.textContent = `${entry.date} · ${volume}${type ? ` · ${type}` : ""} · ${formatAmount(entry.odometer)} ${t("fuel.km")}${entry.full ? ` · ${t(isFuel ? "fuel.fullTankShort" : "fuel.fullChargeShort")}` : ""} · ${price}${entry.station ? ` · ${entry.station}` : ""}`;
                        const del = document.createElement("button"); del.className = "b3-button b3-button--text"; del.textContent = t("delete"); del.style.cssText = "padding:0 4px;font-size:11px";
                        const edit = document.createElement("button"); edit.className = "b3-button b3-button--text"; edit.textContent = t("members.edit"); edit.style.cssText = "padding:0 4px;font-size:11px";
                        edit.onclick = () => openEnergyForm(kind, entry);
                        del.onclick = () => confirm(t("fuel.deleteEntry"), t("fuel.deleteEntryConfirm"), async () => {
                            del.disabled = true;
                            try {
                                const next = await updateRowLogs(plugin as any, (latest) => removeEntry(latest, ref!.avId!, row.itemID, kind === "fuel" ? "fuelings" : "chargings", entry as unknown as Record<string, unknown>));
                                logs = next; renderEnergy();
                                try {
                                    await plugin.refreshHub(["vehicles"], true);
                                } catch (refreshError) {
                                    showMessage(t("ledger.logSavedRefreshFailed").replace("${msg}", refreshError instanceof Error ? refreshError.message : String(refreshError)), 5000, "error");
                                }
                            } catch (error) {
                                del.disabled = false;
                                showMessage(t("ledger.logDeleteFailed").replace("${msg}", error instanceof Error ? error.message : String(error)), 5000, "error");
                            }
                        });
                        line.append(desc, edit, del); section.appendChild(line);
                    }
                    energyWrap.appendChild(section);
                }
            }
            renderEnergy();
        }

        /** Track maintenance/repair costs and future date/odometer reminders per vehicle. */
        async function addVehicleMaintenanceSection() {
            if (!ref?.avId) return;
            const wrap = document.createElement("section");
            wrap.id = "lv-vehicle-maintenance";
            wrap.style.cssText = "margin-top:12px;padding-top:10px;border-top:1px solid var(--b3-border-color)";
            body.appendChild(wrap);
            let records = getEntries<MaintenanceRecord>(await loadRowLogs(plugin as any), ref.avId, row.itemID, "maintenance");
            const categories = ["routine", "repair", "tires", "battery", "inspection", "cleaning", "other"];
            const categoryLabel = (category: string) => {
                const key = `vehicle.maintenance.category.${category}`;
                return t(key) === key ? category : t(key);
            };
            const currentOdometer = Number(cellText(row.cells[ref.columns.mileage ?? ""], "mileage"));
            const formatMoney = (value: number) => `${formatAmount(value)} ${t("fuel.currency")}`;
            const openForm = (existing?: MaintenanceRecord) => {
                const dialog = new Dialog({
                    title: t(existing ? "vehicle.maintenance.edit" : "vehicle.maintenance.add"),
                    content: `<div class="b3-dialog__content b3-dialog__content--wrap" id="lv-maintenance-form" style="max-height:65vh;overflow:auto"></div><div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-maintenance-cancel">${t("cancel")}</button><span style="flex:1"></span><button class="b3-button" id="lv-maintenance-save">${t(existing ? "vehicle.maintenance.update" : "save")}</button></div>`,
                    width: "500px",
                });
                dialog.element.classList.add("lv-energy-dialog");
                const form = dialog.element.querySelector("#lv-maintenance-form") as HTMLElement;
                const controls: Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = {};
                const fieldErrors: Record<string, HTMLSpanElement> = {};
                const addField = (key: string, type: "text" | "date" | "number" | "select" | "textarea", label: string, value = "", options?: string[]) => {
                    const rowEl = document.createElement("label");
                    rowEl.style.cssText = "display:flex;flex-direction:column;gap:4px;margin:0 0 9px";
                    const caption = document.createElement("span"); caption.className = "ft__on-surface"; caption.textContent = label;
                    let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
                    if (type === "select") {
                        const select = document.createElement("select"); select.className = "b3-select";
                        select.append(new Option(t("vehicle.maintenance.chooseCategory"), ""));
                        for (const option of options ?? []) select.append(new Option(categoryLabel(option), option));
                        select.value = value; input = select;
                    } else if (type === "textarea") {
                        const area = document.createElement("textarea"); area.className = "b3-text-field"; area.rows = 2; area.value = value; area.style.resize = "vertical"; input = area;
                    } else {
                        const field = document.createElement("input"); field.className = "b3-text-field"; field.type = type; field.value = value; field.step = type === "number" ? "any" : ""; input = field;
                    }
                    input.id = `lv-maintenance-${key}`;
                    if (type !== "select") (input as HTMLInputElement | HTMLTextAreaElement).placeholder = label;
                    const error = document.createElement("span");
                    error.id = `lv-maintenance-${key}-error`;
                    error.className = "lv-field-error";
                    error.setAttribute("role", "alert");
                    error.style.cssText = "min-height:16px;color:var(--lv-danger);font-size:11px;line-height:1.35";
                    input.addEventListener("input", () => {
                        input.removeAttribute("aria-invalid");
                        input.removeAttribute("aria-describedby");
                        error.replaceChildren();
                    });
                    rowEl.htmlFor = input.id; rowEl.append(caption, input, error); form.appendChild(rowEl); controls[key] = input; fieldErrors[key] = error;
                };
                addField("category", "select", t("vehicle.maintenance.field.category"), existing?.category, categories);
                addField("date", "date", t("vehicle.maintenance.field.date"), existing?.date ?? new Date().toISOString().slice(0, 10));
                addField("odometer", "number", t("vehicle.maintenance.field.odometer"), existing ? String(existing.odometer) : "");
                addField("cost", "number", t("vehicle.maintenance.field.cost"), existing?.cost === undefined ? "" : String(existing.cost));
                addField("nextDate", "date", t("vehicle.maintenance.field.nextDate"), existing?.nextDate ?? "");
                addField("nextOdometer", "number", t("vehicle.maintenance.field.nextOdometer"), existing?.nextOdometer === undefined ? "" : String(existing.nextOdometer));
                addField("shop", "text", t("vehicle.maintenance.field.shop"), existing?.shop ?? "");
                addField("note", "textarea", t("vehicle.maintenance.field.note"), existing?.note ?? "");
                const cancel = dialog.element.querySelector("#lv-maintenance-cancel") as HTMLButtonElement;
                const save = dialog.element.querySelector("#lv-maintenance-save") as HTMLButtonElement;
                cancel.onclick = () => dialog.destroy();
                save.onclick = async () => {
                    const value = (key: string) => String((controls[key] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value ?? "").trim();
                    for (const [key, control] of Object.entries(controls)) {
                        control.removeAttribute("aria-invalid");
                        control.removeAttribute("aria-describedby");
                        fieldErrors[key]?.replaceChildren();
                    }
                    const category = value("category");
                    const date = value("date");
                    const odometer = Number(value("odometer"));
                    const costText = value("cost");
                    const nextDate = value("nextDate");
                    const nextOdometerText = value("nextOdometer");
                    const invalid: string[] = [];
                    if (!category) invalid.push("category");
                    if (!date) invalid.push("date");
                    if (!Number.isFinite(odometer) || !(odometer > 0)) invalid.push("odometer");
                    if (costText !== "" && (!Number.isFinite(Number(costText)) || Number(costText) < 0)) invalid.push("cost");
                    if (nextDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) invalid.push("nextDate");
                    if (nextOdometerText !== "" && (!Number.isFinite(Number(nextOdometerText)) || !(Number(nextOdometerText) > 0))) invalid.push("nextOdometer");
                    if (invalid.length) {
                        for (const key of invalid) {
                            const control = controls[key];
                            const error = fieldErrors[key];
                            if (control && error) {
                                control.setAttribute("aria-invalid", "true");
                                control.setAttribute("aria-describedby", error.id);
                                error.textContent = t("vehicle.maintenance.invalidField").replace("${field}", t(`vehicle.maintenance.field.${key}`));
                            }
                        }
                        (controls[invalid[0]] as HTMLElement | undefined)?.focus();
                        showMessage(t("vehicle.maintenance.invalid"), 3500, "error");
                        return;
                    }
                    save.disabled = true; cancel.disabled = true;
                    const entry: MaintenanceRecord = {
                        category, date, odometer,
                        ...(costText === "" ? {} : { cost: Number(costText) }),
                        ...(nextDate ? { nextDate } : {}),
                        ...(nextOdometerText === "" ? {} : { nextOdometer: Number(nextOdometerText) }),
                        ...(value("shop") ? { shop: value("shop") } : {}),
                        ...(value("note") ? { note: value("note") } : {}),
                    };
                    try {
                        const next = await updateRowLogs(plugin as any, (latest) => {
                            const base = existing ? removeEntry(latest, ref!.avId!, row.itemID, "maintenance", existing as unknown as Record<string, unknown>) : latest;
                            return appendEntry(base, ref!.avId!, row.itemID, "maintenance", { ...entry, at: new Date().toISOString() });
                        });
                        records = getEntries<MaintenanceRecord>(next, ref!.avId!, row.itemID, "maintenance");
                        dialog.destroy(); render();
                        try {
                            await plugin.refreshHub(["vehicles"], true);
                        } catch (refreshError) {
                            showMessage(t("ledger.logSavedRefreshFailed").replace("${msg}", refreshError instanceof Error ? refreshError.message : String(refreshError)), 5000, "error");
                        }
                        showMessage(t(existing ? "vehicle.maintenance.updated" : "vehicle.maintenance.saved"), 2500, "info");
                    } catch (error) {
                        showMessage(t("ledger.logSaveFailed").replace("${msg}", error instanceof Error ? error.message : String(error)), 5000, "error");
                        save.disabled = false; cancel.disabled = false;
                    }
                };
            };
            const render = () => {
                wrap.replaceChildren();
                const head = document.createElement("div"); head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px";
                const title = document.createElement("h3"); title.style.cssText = "font-size:14px;margin:0"; title.textContent = t("vehicle.maintenance.title");
                const add = document.createElement("button"); add.className = "b3-button b3-button--outline"; add.dataset.lvVehicleAction = "maintenance"; add.textContent = `+ ${t("vehicle.maintenance.add")}`; add.onclick = () => openForm();
                head.append(title, add); wrap.appendChild(head);
                registerVehicleAction("maintenance", add);
                const stats = calculateMaintenanceStats(records, new Date().toISOString().slice(0, 10), Number.isFinite(currentOdometer) ? currentOdometer : undefined);
                const summary = document.createElement("div"); summary.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:6px;margin-bottom:8px";
                const metric = (label: string, value: string) => { const box = document.createElement("div"); box.style.cssText = "min-width:0;padding:8px;border-radius:8px;background:var(--b3-theme-background-light)"; const cap = document.createElement("span"); cap.className = "ft__on-surface"; cap.style.cssText = "display:block;font-size:11px;margin-bottom:3px"; cap.textContent = label; const val = document.createElement("b"); val.style.cssText = "font-size:14px;overflow-wrap:anywhere"; val.textContent = value; box.append(cap, val); summary.appendChild(box); };
                metric(t("vehicle.maintenance.totalRecords"), String(stats.recordCount));
                metric(t("vehicle.maintenance.totalCost"), stats.costRecordCount ? formatMoney(stats.totalCost) : t("fuel.costUnknown"));
                metric(t("vehicle.maintenance.nextDate"), stats.nextDate ?? "—");
                metric(t("vehicle.maintenance.nextOdometer"), stats.nextOdometer === undefined ? "—" : `${formatAmount(stats.nextOdometer)} ${t("fuel.km")}`);
                if (stats.overdueDate) metric(t("vehicle.maintenance.overdueDate"), stats.overdueDate);
                if (stats.overdueOdometer !== undefined) metric(t("vehicle.maintenance.overdueOdometer"), `${formatAmount(stats.overdueOdometer)} ${t("fuel.km")}`);
                wrap.appendChild(summary);
                const byCategory = Object.entries(stats.byCategory);
                if (byCategory.length) { const line = document.createElement("div"); line.className = "ft__on-surface"; line.style.cssText = "font-size:11px;line-height:1.6;margin:0 0 6px"; line.textContent = `${t("vehicle.maintenance.byCategory")}：${byCategory.map(([key, value]) => `${categoryLabel(key)} ${value.count}${value.cost ? ` · ${formatMoney(value.cost)}` : ""}`).join(" · ")}`; wrap.appendChild(line); }
                if (!records.length) { const empty = document.createElement("div"); empty.className = "ft__on-surface"; empty.style.cssText = "font-size:12px;line-height:1.6"; empty.textContent = t("vehicle.maintenance.empty"); wrap.appendChild(empty); return; }
                const recentRecords = [...records].reverse().slice(0, 8);
                if (activityTarget?.activityId) {
                    const targetEntry = records.find((entry) => rowLogActivityId(active, row.itemID, "maintenance", entry as unknown as Record<string, unknown>) === activityTarget.activityId);
                    if (targetEntry && !recentRecords.includes(targetEntry)) recentRecords.push(targetEntry);
                }
                for (const entry of recentRecords) {
                    const line = document.createElement("div"); line.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;gap:6px;padding:6px 0;border-top:1px solid var(--b3-border-color);font-size:12px;flex-wrap:wrap";
                    line.dataset.lvActivityId = rowLogActivityId(active, row.itemID, "maintenance", entry as unknown as Record<string, unknown>);
                    if (line.dataset.lvActivityId === activityTarget?.activityId) markActivityLine(line);
                    const desc = document.createElement("span"); desc.style.cssText = "flex:1;min-width:180px;overflow-wrap:anywhere"; desc.textContent = `${entry.date} · ${categoryLabel(entry.category)} · ${formatAmount(entry.odometer)} ${t("fuel.km")}${entry.cost !== undefined ? ` · ${formatMoney(entry.cost)}` : ""}${entry.shop ? ` · ${entry.shop}` : ""}${entry.nextDate ? ` · ${t("vehicle.maintenance.nextDateShort")} ${entry.nextDate}` : ""}${entry.nextOdometer !== undefined ? ` · ${t("vehicle.maintenance.nextOdometerShort")} ${formatAmount(entry.nextOdometer)}` : ""}`;
                    const edit = document.createElement("button"); edit.className = "b3-button b3-button--text"; edit.style.cssText = "padding:0 4px;font-size:11px"; edit.textContent = t("members.edit"); edit.onclick = () => openForm(entry);
                    const del = document.createElement("button"); del.className = "b3-button b3-button--text"; del.style.cssText = "padding:0 4px;font-size:11px"; del.textContent = t("delete"); del.onclick = () => confirm(t("vehicle.maintenance.delete"), t("vehicle.maintenance.deleteConfirm"), async () => { del.disabled = true; try { const next = await updateRowLogs(plugin as any, (latest) => removeEntry(latest, ref!.avId!, row.itemID, "maintenance", entry as unknown as Record<string, unknown>)); records = getEntries<MaintenanceRecord>(next, ref!.avId!, row.itemID, "maintenance"); render(); try { await plugin.refreshHub(["vehicles"], true); } catch (refreshError) { showMessage(t("ledger.logSavedRefreshFailed").replace("${msg}", refreshError instanceof Error ? refreshError.message : String(refreshError)), 5000, "error"); } } catch (error) { del.disabled = false; showMessage(t("ledger.logDeleteFailed").replace("${msg}", error instanceof Error ? error.message : String(error)), 5000, "error"); } });
                    line.append(desc, edit, del); wrap.appendChild(line);
                }
            };
            render();
        }

        addHistorySection();
        addAttachmentsSection();
        // 26.6 QR 标签（路线图 QR 项，235 波接线）：扫码直达——行有绑定块用块深链，否则回退台账文档深链
        addQrSection();

        function addQrSection() {
            const nameKey = ref?.columns?.name;
            const nameVal = nameKey ? row.cells?.[nameKey] : undefined;
            const blockId = nameVal?.type === "block" ? nameVal.block?.id : undefined;
            const link = blockDeepLink(blockId || ref?.docId || "");
            const wrap = document.createElement("div");
            if (active === "vehicles") wrap.className = "lv-detail-wide";
            wrap.style.cssText = "border-top:1px solid var(--b3-border-color);margin-top:10px;padding-top:10px";
            const head = document.createElement("p");
            head.style.cssText = "font-size:12px;margin:0 0 6px;color:var(--b3-theme-on-surface)";
            head.textContent = t("ledger.qrTitle");
            const rowEl = document.createElement("div");
            rowEl.style.cssText = "display:flex;gap:10px;align-items:center";
            const img = document.createElement("img");
            img.alt = "QR";
            img.style.cssText = "width:96px;height:96px;border:1px solid var(--b3-border-color);border-radius:8px;padding:4px;background:#fff;flex-shrink:0";
            const hint = document.createElement("span");
            hint.style.cssText = "font-size:12px;color:var(--b3-theme-on-surface);flex:1";
            hint.textContent = t("ledger.qrHint");
            rowEl.append(img, hint);
            wrap.append(head, rowEl);
            body.appendChild(wrap);
            generateQRDataUrl(link, 128).then((url) => { img.src = url; }).catch(() => { wrap.remove(); });
        }
        // Module timelines share the rowlogs storage and are read-only here.
        (async () => {
            const rl = await import("@/core/rowlog");
            const at = () => new Date().toISOString();
            const fresh = () => rl.loadRowLogs(plugin as any);
            if (active === "vehicles") {
                try {
                    await addVehicleCostSummarySection();
                } catch (error) {
                    showVehicleActionError(error instanceof Error ? error.message : String(error));
                }
                try {
                    await addVehicleEnergySection();
                } catch (error) {
                    failVehicleActions(["fuel", "charging"], error);
                }
                try {
                    await addVehicleMaintenanceSection();
                } catch (error) {
                    failVehicleActions(["maintenance"], error);
                }
            }
            // Keep the assets-real module ID aligned with the CSV import entry point.
            if (active === "assets-real") {
                await addRowLogSection({
                    title: t("ledger.valuations"), emptyText: t("ledger.noValuations"), addLabel: t("ledger.valAdd"), kind: "valuations",
                    fields: [
                        { key: "date", type: "date", placeholder: "", width: 130 },
                        { key: "value", type: "number", placeholder: t("ledger.valValue"), width: 100 },
                    ],
                    load: () => fresh().then((l) => rl.getValuations(l, ref!.avId!, row.itemID)),
                    add: async (v) => {
                        if (!Number.isFinite(Number(v.value))) { showMessage(t("ledger.logInvalid"), 3000, "error"); return false; }
                        await rl.updateRowLogs(plugin as any, (current) => rl.appendValuation(current, ref!.avId!, row.itemID, v.date, Number(v.value), at()));
                        return true;
                    },
                    remove: async (e) => { await rl.updateRowLogs(plugin as any, (current) => rl.removeValuation(current, ref!.avId!, row.itemID, e.date)); },
                    format: (e) => `${e.date} · ${e.value}`,
                });
                await addRowLogSection({
                    title: t("ledger.moves"), emptyText: t("ledger.noMoves"), addLabel: t("ledger.valAdd"), kind: "moves",
                    fields: [
                        { key: "date", type: "date", placeholder: "", width: 130 },
                        { key: "from", type: "text", placeholder: t("ledger.moveFrom"), width: 90 },
                        { key: "to", type: "text", placeholder: t("ledger.moveTo"), width: 90 },
                    ],
                    load: () => fresh().then((l) => rl.getEntries<any>(l, ref!.avId!, row.itemID, "moves")),
                    add: async (v) => {
                        if (!v.from || !v.to) { showMessage(t("ledger.logInvalid"), 3000, "error"); return false; }
                        await rl.updateRowLogs(plugin as any, (current) => rl.appendEntry(current, ref!.avId!, row.itemID, "moves", { date: v.date, from: v.from, to: v.to, at: at() }));
                        return true;
                    },
                    remove: async (e) => { await rl.updateRowLogs(plugin as any, (current) => rl.removeEntry(current, ref!.avId!, row.itemID, "moves", e)); },
                    format: (e) => `${e.date} · ${e.from} → ${e.to}`,
                });
            } else if (active === "shopping") {
                // Wish progress combines target_amount with deposit row logs.
                (async () => {
                    const targetCell = row.cells[ref!.columns.target_amount ?? ""]?.number;
                    const target = targetCell?.isNotEmpty && typeof targetCell.content === "number" ? targetCell.content : undefined;
                    const logs = await rl.loadRowLogs(plugin as any);
                    const entries = rl.getEntries<any>(logs, ref!.avId!, row.itemID, "deposits");
                    const saved = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
                    if (target !== undefined || entries.length > 0) {
                        const head = document.createElement("div");
                        head.style.cssText = "margin-top:10px;font-size:12px";
                        const line = document.createElement("div");
                        line.className = "lv-caption";
                        line.textContent = `${t("ledger.savedOf").replace("${s}", formatAmount(saved)).replace("${t2}", target !== undefined ? formatAmount(target) : "—")}${target !== undefined && target > 0 ? ` (${Math.min(999, Math.round((saved / target) * 100))}%)` : ""}`;
                        head.appendChild(line);
                        // Progress bars cap their visual width at 100%.
                        if (target !== undefined && target > 0) {
                            const bar = document.createElement("div");
                            bar.style.cssText = "height:6px;border-radius:3px;background:var(--b3-theme-background-light);overflow:hidden;margin-top:4px";
                            const fill = document.createElement("div");
                            fill.style.cssText = `height:100%;width:${Math.min(100, Math.round((saved / target) * 100))}%;background:var(--lv-accent)`;
                            bar.appendChild(fill);
                            head.appendChild(bar);
                        }
                        body.appendChild(head);
                    }
                })().catch((e) => {
                    showMessage(t("ledger.logReadFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
                });
                await addRowLogSection({
                    title: t("ledger.deposits"), emptyText: t("ledger.noDeposits"), addLabel: t("ledger.valAdd"), kind: "deposits",
                    fields: [
                        { key: "date", type: "date", placeholder: "", width: 130 },
                        { key: "amount", type: "number", placeholder: t("ledger.depositAmt"), width: 100 },
                    ],
                    load: () => fresh().then((l) => rl.getEntries<any>(l, ref!.avId!, row.itemID, "deposits")),
                    add: async (v) => {
                        if (!v.date || !Number.isFinite(Number(v.amount))) { showMessage(t("ledger.logInvalid"), 3000, "error"); return false; }
                        await rl.updateRowLogs(plugin as any, (current) => rl.appendEntry(current, ref!.avId!, row.itemID, "deposits", { date: v.date, amount: Number(v.amount), at: at() }));
                        return true;
                    },
                    remove: async (e) => { await rl.updateRowLogs(plugin as any, (current) => rl.removeEntry(current, ref!.avId!, row.itemID, "deposits", e)); },
                    format: (e) => `${e.date} · +${e.amount}`,
                });
                await addRowLogSection({
                    title: t("ledger.prices"), emptyText: t("ledger.noPrices"), addLabel: t("ledger.valAdd"), kind: "prices",
                    fields: [
                        { key: "date", type: "date", placeholder: "", width: 130 },
                        { key: "price", type: "number", placeholder: t("ledger.priceValue"), width: 90 },
                        { key: "channel", type: "text", placeholder: t("ledger.priceChannel"), width: 100 },
                    ],
                    load: () => fresh().then((l) => rl.getEntries<any>(l, ref!.avId!, row.itemID, "prices")),
                    add: async (v) => {
                        if (!Number.isFinite(Number(v.price))) { showMessage(t("ledger.logInvalid"), 3000, "error"); return false; }
                        await rl.updateRowLogs(plugin as any, (current) => rl.appendEntry(current, ref!.avId!, row.itemID, "prices", { date: v.date, price: Number(v.price), channel: v.channel, at: at() }));
                        return true;
                    },
                    remove: async (e) => { await rl.updateRowLogs(plugin as any, (current) => rl.removeEntry(current, ref!.avId!, row.itemID, "prices", e)); },
                    format: (e) => `${e.date} · ${formatAmount(Number(e.price))}${e.channel ? ` · ${e.channel}` : ""}`,
                });
            } else if (active === "chores") {
                // 310/313 波：家务轮换（动态加载 core/chore-dialog.ts）
                const { addChoreRotationSectionImpl } = await import("@/core/chore-dialog");
                await addChoreRotationSectionImpl({ t, plugin, avId: ref!.avId!, rowId: row.itemID, body, showMessageFn: showMessage });
            } else if (active === "health") {
                // 314 波（G5）：生理指标（血压/血糖/心率）趋势与留痕
                const { addVitalsSectionImpl } = await import("@/core/vitals-dialog");
                await addVitalsSectionImpl({ t, plugin: plugin as any, avId: ref!.avId!, rowId: row.itemID, body, showMessageFn: showMessage });
            } else if (active === "schooling") {
                await addRowLogSection({
                    title: t("ledger.transfers"), emptyText: t("ledger.noTransfers"), addLabel: t("ledger.valAdd"), kind: "transfers",
                    fields: [
                        { key: "date", type: "date", placeholder: "", width: 130 },
                        { key: "from", type: "text", placeholder: t("ledger.transferFrom"), width: 90 },
                        { key: "to", type: "text", placeholder: t("ledger.transferTo"), width: 90 },
                    ],
                    load: () => fresh().then((l) => rl.getEntries<any>(l, ref!.avId!, row.itemID, "transfers")),
                    add: async (v) => {
                        if (!v.from || !v.to) { showMessage(t("ledger.logInvalid"), 3000, "error"); return false; }
                        await rl.updateRowLogs(plugin as any, (current) => rl.appendEntry(current, ref!.avId!, row.itemID, "transfers", { date: v.date, from: v.from, to: v.to, at: at() }));
                        return true;
                    },
                    remove: async (e) => { await rl.updateRowLogs(plugin as any, (current) => rl.removeEntry(current, ref!.avId!, row.itemID, "transfers", e)); },
                    format: (e) => `${e.date} · ${e.from} → ${e.to}`,
                });
            } else if (active === "house") {
                // Utility meter logs record usage as the positive delta from the previous reading.
                await addRowLogSection({
                    title: t("ledger.meters"), emptyText: t("ledger.noMeters"), addLabel: t("ledger.valAdd"), kind: "meters",
                    fields: [
                        { key: "date", type: "date", placeholder: "", width: 130 },
                        { key: "reading", type: "number", placeholder: t("ledger.meterReading"), width: 110 },
                    ],
                    load: () => fresh().then((l) => rl.getMeterReadings(l, ref!.avId!, row.itemID)),
                    add: async (v) => {
                        if (!v.date || !Number.isFinite(Number(v.reading))) { showMessage(t("ledger.logInvalid"), 3000, "error"); return false; }
                        await rl.updateRowLogs(plugin as any, (current) => rl.appendMeterReading(current, ref!.avId!, row.itemID, v.date, Number(v.reading), at()));
                        return true;
                    },
                    remove: async (e) => { await rl.updateRowLogs(plugin as any, (current) => rl.removeMeterReading(current, ref!.avId!, row.itemID, e.date)); },
                    format: (e: any) => `${e.date} · ${e.reading}${typeof e.usage === "number" ? ` (${e.usage})` : ""}`,
                });

                // §16 房屋保修期与关联合同只读联动核对
                const contractsRef = plugin.settings.dbRefs?.contracts;
                if (contractsRef?.avId && contractsRef?.columns) {
                    const houseWarrantySection = document.createElement("div");
                    houseWarrantySection.className = "lv-detail-section";
                    houseWarrantySection.style.cssText = "margin-top:14px;padding-top:10px;border-top:1px solid var(--b3-border-color)";

                    const head = document.createElement("div");
                    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px";
                    const title = document.createElement("span");
                    title.className = "ft__on-surface";
                    title.style.cssText = "font-weight:600;font-size:12px";
                    title.textContent = t("ledger.houseContractsTitle");
                    head.append(title);
                    if (contractsRef.docId) {
                        const openAll = document.createElement("button");
                        openAll.className = "b3-button b3-button--text";
                        openAll.style.cssText = "font-size:11.5px;padding:0 4px;color:var(--lv-accent)";
                        openAll.textContent = t("ledger.houseContractsOpenAll");
                        openAll.onclick = () => plugin.showTabDocs(contractsRef.docId);
                        head.append(openAll);
                    }
                    houseWarrantySection.append(head);

                    const contentWrap = document.createElement("div");
                    contentWrap.style.cssText = "font-size:12.5px;display:flex;flex-direction:column;gap:6px";
                    contentWrap.innerHTML = `<span class="lv-caption">${t("ledger.loading")}</span>`;
                    houseWarrantySection.append(contentWrap);
                    body.appendChild(houseWarrantySection);

                    void (async () => {
                        try {
                            const contractAll = await renderLedgerAll(contractsRef.avId!);
                            const { matchHouseContracts } = await import("@/core/contracts");
                            const matched = matchHouseContracts(row, ref!.columns, contractAll.rows, contractsRef.columns);
                            contentWrap.replaceChildren();
                            if (matched.length === 0) {
                                const empty = document.createElement("span");
                                empty.className = "lv-caption";
                                empty.textContent = t("ledger.houseContractsEmpty");
                                contentWrap.append(empty);
                                return;
                            }
                            for (const m of matched) {
                                const line = document.createElement("div");
                                line.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-line)";
                                const nameSpan = document.createElement("b");
                                nameSpan.style.cssText = "font-size:12.5px;color:var(--lv-tx)";
                                nameSpan.textContent = m.title;

                                const badge = document.createElement("span");
                                if (m.warrantyStatus === "valid") {
                                    badge.className = "lv-badge green";
                                    badge.textContent = t("ledger.warrantyValid");
                                } else if (m.warrantyStatus === "expiring") {
                                    badge.className = "lv-badge orange";
                                    badge.textContent = t("ledger.warrantyExpiring");
                                } else if (m.warrantyStatus === "expired") {
                                    badge.className = "lv-badge gray";
                                    badge.textContent = t("ledger.warrantyExpired");
                                } else {
                                    badge.className = "lv-badge gray";
                                    badge.textContent = t("ledger.warrantyUnknown");
                                }

                                const metaSpan = document.createElement("span");
                                metaSpan.className = "lv-caption";
                                metaSpan.style.cssText = "margin-left:auto;font-size:11.5px";
                                const parts = [];
                                if (m.party || m.contact) parts.push(m.party || m.contact);
                                if (m.expiry) parts.push(m.daysLeft !== undefined && m.daysLeft >= 0 ? `${m.expiry} (${m.daysLeft}d)` : m.expiry);
                                metaSpan.textContent = parts.join(" · ");

                                line.append(nameSpan, badge, metaSpan);
                                contentWrap.append(line);
                            }
                        } catch (err) {
                            contentWrap.innerHTML = `<span class="lv-caption" style="color:var(--lv-danger)">${t("ledger.houseContractsFailed")}</span>`;
                        }
                    })();
                }
            } else if (active === "food") {
                const foodName = (ref?.columns?.name && cellText(row.cells[ref.columns.name])) || "";
                const ingredientsRaw = (ref?.columns?.ingredients && cellText(row.cells[ref.columns.ingredients])) || "";
                if (foodName || (ingredientsRaw && ingredientsRaw !== "—")) {
                    const foodDietarySection = document.createElement("div");
                    foodDietarySection.className = "lv-detail-section";
                    foodDietarySection.style.cssText = "margin-top:14px;padding-top:10px;border-top:1px solid var(--b3-border-color)";

                    const head = document.createElement("div");
                    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px";
                    const title = document.createElement("span");
                    title.className = "ft__on-surface";
                    title.style.cssText = "font-weight:600;font-size:12px";
                    title.textContent = t("ledger.foodDietaryTitle");
                    head.append(title);
                    foodDietarySection.append(head);

                    const contentWrap = document.createElement("div");
                    contentWrap.style.cssText = "font-size:12.5px;display:flex;flex-direction:column;gap:6px";
                    foodDietarySection.append(contentWrap);
                    body.appendChild(foodDietarySection);

                    void (async () => {
                        const healthRef = plugin.settings.dbRefs?.health;
                        let healthRows: any[] | undefined;
                        if (healthRef?.avId) {
                            try {
                                const healthAll = await renderLedgerAll(healthRef.avId);
                                healthRows = healthAll.rows;
                            } catch {
                                // 静默降级
                            }
                        }
                        const { matchFoodDietaryConflicts, formatShoppingIngredientsText } = await import("@/core/food");
                        const check = matchFoodDietaryConflicts(
                            foodName,
                            ingredientsRaw !== "—" ? ingredientsRaw : "",
                            plugin.settings.members ?? [],
                            healthRows,
                            healthRef?.columns,
                        );

                        contentWrap.replaceChildren();

                        if (check.isSafe) {
                            const safeBadge = document.createElement("div");
                            safeBadge.style.cssText = "padding:8px 12px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-accent);color:var(--lv-accent);font-size:12px";
                            safeBadge.textContent = `✓ ${t("ledger.foodDietarySafe")}`;
                            contentWrap.append(safeBadge);
                        } else {
                            for (const c of check.conflicts) {
                                const alertEl = document.createElement("div");
                                if (c.type === "allergy") {
                                    alertEl.style.cssText = "display:flex;align-items:center;gap:6px;padding:6px 10px;background:color-mix(in srgb, var(--lv-danger) 10%, var(--lv-surface));border-radius:6px;border:1px solid var(--lv-danger);color:var(--lv-danger);font-size:12px";
                                    alertEl.innerHTML = `<span>🚨 <b>${c.memberName}</b>：${t("ledger.foodAllergyAlert").replace("${member}", c.memberName).replace("${item}", c.matchedItem)}${c.detail ? ` (${c.detail})` : ""}</span>`;
                                } else {
                                    alertEl.style.cssText = "display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-line);color:var(--lv-warn);font-size:12px";
                                    alertEl.innerHTML = `<span>⚠️ <b>${c.memberName}</b>：${t("ledger.foodDislikeAlert").replace("${member}", c.memberName).replace("${item}", c.matchedItem)}</span>`;
                                }
                                contentWrap.append(alertEl);
                            }
                        }

                        if (check.parsedIngredients.length > 0) {
                            const actionRow = document.createElement("div");
                            actionRow.style.cssText = "display:flex;align-items:center;justify-content:flex-end;margin-top:4px";
                            const copyIngBtn = document.createElement("button");
                            copyIngBtn.className = "b3-button b3-button--outline";
                            copyIngBtn.style.cssText = "font-size:12px;padding:3px 8px";
                            copyIngBtn.textContent = `＋ ${t("ledger.foodCopyIngredients")}`;
                            copyIngBtn.onclick = async () => {
                                const text = formatShoppingIngredientsText(foodName, check.parsedIngredients);
                                try {
                                    await navigator.clipboard.writeText(text);
                                    showMessage(t("ledger.foodIngredientsCopied"), 2500, "info");
                                } catch {
                                    showMessage(t("ledger.copyAsImageFail"), 4000, "error");
                                }
                            };
                            actionRow.append(copyIngBtn);
                            contentWrap.append(actionRow);
                        }
                    })();
                }
            } else if (active === "schooling") {
                const catVal = ref?.columns?.category ? cellText(row.cells[ref.columns.category]) : "";
                const enrollRaw = ref?.columns?.enroll_year ? cellText(row.cells[ref.columns.enroll_year]) : "";
                const enrollYear = Number(enrollRaw);
                const statusVal = ref?.columns?.status ? cellText(row.cells[ref.columns.status]) : "enrolled";

                if (catVal && Number.isFinite(enrollYear) && enrollYear >= 1980) {
                    const schoolStageSection = document.createElement("div");
                    schoolStageSection.className = "lv-detail-section";
                    schoolStageSection.style.cssText = "margin-top:14px;padding-top:10px;border-top:1px solid var(--b3-border-color)";

                    const head = document.createElement("div");
                    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px";
                    const title = document.createElement("span");
                    title.className = "ft__on-surface";
                    title.style.cssText = "font-weight:600;font-size:12px";
                    title.textContent = t("ledger.schoolingStageTitle");
                    head.append(title);
                    schoolStageSection.append(head);

                    const contentWrap = document.createElement("div");
                    contentWrap.style.cssText = "padding:10px 12px;background:var(--lv-surface-2);border-radius:8px;border:1px solid var(--lv-line);display:flex;flex-direction:column;gap:6px;font-size:12px";
                    schoolStageSection.append(contentWrap);
                    body.appendChild(schoolStageSection);

                    void (async () => {
                        const { calculateSchoolingStage } = await import("@/core/schooling");
                        const stage = calculateSchoolingStage({
                            category: catVal,
                            enrollYear,
                            status: statusVal,
                        });

                        if (stage) {
                            const badgeCls = stage.isGraduated ? "green" : stage.daysUntilGraduation <= 100 ? "orange" : "blue";
                            const badgeText = stage.isGraduated
                                ? t("ledger.schoolingGraduated")
                                : t("ledger.schoolingDaysUntil").replace("${n}", String(stage.daysUntilGraduation));

                            contentWrap.innerHTML = `
                                <div style="display:flex;align-items:center;justify-content:space-between">
                                  <span><b>${stage.currentGradeLabel}</b> · ${stage.transitionEventLabel}</span>
                                  <span class="lv-badge ${badgeCls}">${badgeText}</span>
                                </div>
                                <div style="display:flex;align-items:center;justify-content:space-between;color:var(--lv-tx-2);font-size:11.5px">
                                  <span>${t("ledger.schoolingGraduationDate")}: ${stage.graduationDate} (${stage.stageTotalYears} 年制)</span>
                                  <span>${t("ledger.schoolingProgress")}: ${stage.stageProgressPercent}%</span>
                                </div>
                                <div style="height:4px;border-radius:2px;background:var(--lv-line);overflow:hidden;width:100%">
                                  <div style="height:100%;background:var(--lv-accent);width:${stage.stageProgressPercent}%;border-radius:2px"></div>
                                </div>`;
                        }
                    })();
                }
            } else if (active === "pets") {
                const speciesVal = ref?.columns?.species ? cellText(row.cells[ref.columns.species]) : "cat";
                const vdueVal = ref?.columns?.vaccine_due ? cellText(row.cells[ref.columns.vaccine_due]) : undefined;
                const ddueVal = ref?.columns?.deworm_due ? cellText(row.cells[ref.columns.deworm_due]) : undefined;
                const noteVal = ref?.columns?.note ? cellText(row.cells[ref.columns.note]) : "";

                // 尝试从备注中匹配生日或出生日期（如 "2024-05-01" 或 "出生: 2024-05-01"）
                let birthMatch = noteVal.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];

                const petCareSection = document.createElement("div");
                petCareSection.className = "lv-detail-section";
                petCareSection.style.cssText = "margin-top:14px;padding-top:10px;border-top:1px solid var(--b3-border-color)";

                const head = document.createElement("div");
                head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px";
                const title = document.createElement("span");
                title.className = "ft__on-surface";
                title.style.cssText = "font-weight:600;font-size:12px";
                title.textContent = t("ledger.petCareTitle");
                head.append(title);
                petCareSection.append(head);

                const contentWrap = document.createElement("div");
                contentWrap.style.cssText = "padding:10px 12px;background:var(--lv-surface-2);border-radius:8px;border:1px solid var(--lv-line);display:flex;flex-direction:column;gap:8px;font-size:12px";
                petCareSection.append(contentWrap);
                body.appendChild(petCareSection);

                void (async () => {
                    const { evaluatePetSummary } = await import("@/core/pets");
                    const summary = evaluatePetSummary(
                        birthMatch,
                        speciesVal,
                        vdueVal !== "—" ? vdueVal : undefined,
                        ddueVal !== "—" ? ddueVal : undefined,
                    );

                    contentWrap.replaceChildren();

                    // 1. 生理年龄与阶段
                    if (summary.ageInfo) {
                        const ageLine = document.createElement("div");
                        ageLine.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px";
                        ageLine.innerHTML = `
                            <span>${t("ledger.petAgeEquivalent")}: <b>${summary.ageInfo.humanEquivalentAge} 岁</b> (${summary.ageInfo.chronologicalYears} 岁 ${summary.ageInfo.chronologicalMonths} 个月)</span>
                            <span class="lv-badge purple">${summary.ageInfo.lifeStageLabel}</span>
                        `;
                        const desc = document.createElement("div");
                        desc.className = "lv-caption";
                        desc.style.cssText = "font-size:11px;line-height:1.4";
                        desc.textContent = summary.ageInfo.description;
                        contentWrap.append(ageLine, desc);
                    }

                    // 2. 疫苗与驱虫状态条
                    const careGrid = document.createElement("div");
                    careGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:2px";

                    const badgeCls = (u: string) => u === "overdue" ? "danger" : u === "soon" ? "orange" : u === "ok" ? "green" : "gray";

                    const vBox = document.createElement("div");
                    vBox.style.cssText = "padding:6px 8px;background:var(--lv-surface);border-radius:6px;border:1px solid var(--lv-line);display:flex;flex-direction:column;gap:3px";
                    vBox.innerHTML = `
                        <div style="display:flex;justify-content:space-between;align-items:center">
                            <span style="font-weight:500">${t("field.vaccine_due")}</span>
                            <span class="lv-badge ${badgeCls(summary.vaccine.urgency)}">${summary.vaccine.label}</span>
                        </div>
                        <span class="lv-caption" style="font-size:11px">${summary.vaccine.dueDate ? summary.vaccine.dueDate : "未填写"}</span>
                    `;

                    const dBox = document.createElement("div");
                    dBox.style.cssText = "padding:6px 8px;background:var(--lv-surface);border-radius:6px;border:1px solid var(--lv-line);display:flex;flex-direction:column;gap:3px";
                    dBox.innerHTML = `
                        <div style="display:flex;justify-content:space-between;align-items:center">
                            <span style="font-weight:500">${t("field.deworm_due")}</span>
                            <span class="lv-badge ${badgeCls(summary.deworm.urgency)}">${summary.deworm.label}</span>
                        </div>
                        <span class="lv-caption" style="font-size:11px">${summary.deworm.dueDate ? summary.deworm.dueDate : "未填写"}</span>
                    `;

                    careGrid.append(vBox, dBox);
                    contentWrap.append(careGrid);
                })();
            } else if (active === "travel-plan") {
                // Certificate checks are appended and deduplicated by the row-log helper.
                await addRowLogSection({
                    title: t("ledger.checks"), emptyText: t("ledger.noChecks"), addLabel: t("ledger.valAdd"), kind: "checks",
                    fields: [
                        { key: "date", type: "date", placeholder: "", width: 130 },
                        { key: "result", type: "text", placeholder: t("ledger.checkResult"), width: 200 },
                    ],
                    load: () => fresh().then((l) => rl.getEntries<any>(l, ref!.avId!, row.itemID, "checks")),
                    add: async (v) => {
                        if (!v.date || !v.result) { showMessage(t("ledger.logInvalid"), 3000, "error"); return false; }
                        await rl.updateRowLogs(plugin as any, (current) => rl.appendEntry(current, ref!.avId!, row.itemID, "checks", { date: v.date, result: v.result, at: at() }));
                        return true;
                    },
                    remove: async (e) => { await rl.updateRowLogs(plugin as any, (current) => rl.removeEntry(current, ref!.avId!, row.itemID, "checks", e)); },
                    format: (e) => `${e.date} · ${e.result}`,
                });
            } else if (active === "media") {
                // Book loans leave the return date empty while still borrowed.
                await addRowLogSection({
                    title: t("ledger.loans"), emptyText: t("ledger.noLoans"), addLabel: t("ledger.valAdd"), kind: "loans",
                    fields: [
                        { key: "date", type: "date", placeholder: "", width: 130 },
                        { key: "to", type: "text", placeholder: t("ledger.loanTo"), width: 100 },
                        { key: "back", type: "date", placeholder: t("ledger.loanBack"), width: 130 },
                    ],
                    load: () => fresh().then((l) => rl.getEntries<any>(l, ref!.avId!, row.itemID, "loans")),
                    add: async (v) => {
                        if (!v.date || !v.to) { showMessage(t("ledger.logInvalid"), 3000, "error"); return false; }
                        await rl.updateRowLogs(plugin as any, (current) => rl.appendEntry(current, ref!.avId!, row.itemID, "loans", { date: v.date, to: v.to, back: v.back || "", at: at() }));
                        return true;
                    },
                    remove: async (e) => { await rl.updateRowLogs(plugin as any, (current) => rl.removeEntry(current, ref!.avId!, row.itemID, "loans", e)); },
                    format: (e) => `${e.date} · ${t("ledger.loanTo")} ${e.to}${e.back ? ` · ${e.back} ${t("ledger.loanReturned")}` : ` · ${t("ledger.loanOut")}`}`,
                });
            } else if (active === "parenting") {
                const catVal = ref?.columns?.category ? cellText(row.cells[ref.columns.category]) : "";
                // 仅辅食/喂养类记录接入 3 天排敏观察期与健康过敏史联动
                if (catVal === "feeding" || catVal === t("field.category.opt.feeding")) {
                    const dateVal = ref?.columns?.date ? cellText(row.cells[ref.columns.date]) : "";
                    const foodName = (ref?.columns?.name && cellText(row.cells[ref.columns.name])) || "";
                    const memberBlockId = ref?.columns?.member ? row.cells[ref.columns.member]?.relation?.blockIDs?.[0] : undefined;

                    const feedingSection = document.createElement("div");
                    feedingSection.className = "lv-detail-section";
                    feedingSection.style.cssText = "margin-top:14px;padding-top:10px;border-top:1px solid var(--b3-border-color)";

                    const head = document.createElement("div");
                    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px";
                    const title = document.createElement("span");
                    title.className = "ft__on-surface";
                    title.style.cssText = "font-weight:600;font-size:12px";
                    title.textContent = t("ledger.feedingObserveTitle");
                    head.append(title);
                    feedingSection.append(head);

                    const contentWrap = document.createElement("div");
                    contentWrap.style.cssText = "font-size:12.5px;display:flex;flex-direction:column;gap:8px";
                    feedingSection.append(contentWrap);
                    body.appendChild(feedingSection);

                    void (async () => {
                        const { evaluateFeedingObservation, findMemberAllergies, checkAllergyConflict } = await import("@/core/feeding");
                        const obs = evaluateFeedingObservation(dateVal);

                        // 1. 观察期状态条
                        if (obs) {
                            const statusLine = document.createElement("div");
                            statusLine.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-line)";
                            const badge = document.createElement("span");
                            if (obs.status === "observing") {
                                badge.className = "lv-badge orange";
                                badge.textContent = obs.dayProgressText;
                            } else if (obs.status === "completed") {
                                badge.className = "lv-badge green";
                                badge.textContent = t("ledger.feedingObserveDone");
                            } else {
                                badge.className = "lv-badge gray";
                                badge.textContent = obs.dayProgressText;
                            }
                            const timeText = document.createElement("span");
                            timeText.className = "lv-caption";
                            timeText.style.cssText = "margin-left:auto;font-size:11.5px";
                            timeText.textContent = `${t("ledger.feedingObserveUntil")}: ${obs.observeUntil}`;
                            statusLine.append(badge, timeText);
                            contentWrap.append(statusLine);
                        }

                        // 2. 健康库过敏史核对
                        const healthRef = plugin.settings.dbRefs?.health;
                        if (healthRef?.avId && healthRef?.columns) {
                            try {
                                const healthAll = await renderLedgerAll(healthRef.avId);
                                const allergies = findMemberAllergies(memberBlockId, healthAll.rows, healthRef.columns);
                                const conflict = checkAllergyConflict(foodName, allergies);

                                if (conflict) {
                                    const alertLine = document.createElement("div");
                                    alertLine.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 10px;background:color-mix(in srgb, var(--lv-danger) 10%, var(--lv-surface));border-radius:6px;border:1px solid var(--lv-danger);color:var(--lv-danger);font-size:12px";
                                    alertLine.innerHTML = `<span>⚠️ ${t("ledger.feedingAllergyConflict").replace("${food}", conflict.name)}${conflict.reaction ? `（${conflict.reaction}）` : ""}</span>`;
                                    contentWrap.append(alertLine);
                                }
                            } catch (e) {
                                // 静默降级
                            }
                        }

                        // 3. 标记过敏并存入健康过敏史动作入口
                        if (healthRef?.avId && healthRef?.columns) {
                            const actionRow = document.createElement("div");
                            actionRow.style.cssText = "display:flex;align-items:center;justify-content:flex-end;margin-top:2px";
                            const addAllergyBtn = document.createElement("button");
                            addAllergyBtn.className = "b3-button b3-button--outline";
                            addAllergyBtn.style.cssText = "font-size:12px;padding:3px 8px";
                            addAllergyBtn.textContent = `＋ ${t("ledger.recordAllergyToHealth")}`;
                            addAllergyBtn.onclick = () => {
                                const adlg = new Dialog({
                                    title: t("ledger.recordAllergyTitle"),
                                    content: `<div class="b3-dialog__content lv-dialog-col">
                                        <p class="lv-caption" style="margin:0">${t("ledger.recordAllergyIntro").replace("${food}", foodName)}</p>
                                        <input class="b3-text-field" id="lv-allergy-reaction" placeholder="${t("ledger.recordAllergyReactionPlaceholder")}" style="width:100%" />
                                    </div>
                                    <div class="b3-dialog__action">
                                        <button class="b3-button b3-button--cancel" id="lv-allergy-cancel">${t("cancel")}</button>
                                        <button class="b3-button" id="lv-allergy-save">${t("save")}</button>
                                    </div>`,
                                    width: "420px",
                                });
                                const rxInput = adlg.element.querySelector("#lv-allergy-reaction") as HTMLInputElement;
                                requestAnimationFrame(() => rxInput?.focus());
                                (adlg.element.querySelector("#lv-allergy-cancel") as HTMLButtonElement).onclick = () => adlg.destroy();
                                (adlg.element.querySelector("#lv-allergy-save") as HTMLButtonElement).onclick = async function (this: HTMLButtonElement) {
                                    this.disabled = true;
                                    const reactionVal = rxInput?.value.trim() || "";
                                    adlg.destroy();
                                    try {
                                        const { addDetachedRow, setCell } = await import("@/core/siyuan");
                                        const rowId = await addDetachedRow(healthRef.avId!, foodName);
                                        if (healthRef.columns.category) {
                                            await setCell(healthRef.avId!, healthRef.columns.category, rowId, {
                                                type: "select", select: { content: "allergy" },
                                            });
                                        }
                                        if (healthRef.columns.diagnosis && reactionVal) {
                                            await setCell(healthRef.avId!, healthRef.columns.diagnosis, rowId, {
                                                type: "text", text: { content: reactionVal },
                                            });
                                        }
                                        if (healthRef.columns.date && dateVal) {
                                            await setCell(healthRef.avId!, healthRef.columns.date, rowId, {
                                                type: "date", date: { content: dateVal, isNotEmpty: true },
                                            });
                                        }
                                        if (healthRef.columns.member && memberBlockId) {
                                            await setCell(healthRef.avId!, healthRef.columns.member, rowId, {
                                                type: "relation", relation: { blockIDs: [memberBlockId] },
                                            });
                                        }
                                        showMessage(t("ledger.recordAllergySaved"), 3500, "info");
                                    } catch (err) {
                                        showMessage(t("ledger.saveFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 6000, "error");
                                    }
                                };
                            };
                            actionRow.append(addAllergyBtn);
                            contentWrap.append(actionRow);
                        }
                    })();
                }
            } else if (active === "social") {
                const memberBlockId = ref?.columns?.member ? row.cells[ref.columns.member]?.relation?.blockIDs?.[0] : undefined;
                const member = memberBlockId ? (plugin.settings.members ?? []).find((m) => m.avItemId === memberBlockId) : undefined;
                if (member?.birthday) {
                    const socialRetireSection = document.createElement("div");
                    socialRetireSection.className = "lv-detail-section";
                    socialRetireSection.style.cssText = "margin-top:14px;padding-top:10px;border-top:1px solid var(--b3-border-color)";

                    const head = document.createElement("div");
                    head.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px";
                    const title = document.createElement("span");
                    title.className = "ft__on-surface";
                    title.style.cssText = "font-weight:600;font-size:12px";
                    title.textContent = `${t("members.retirementTitle")} · ${member.name}`;
                    head.append(title);
                    socialRetireSection.append(head);

                    const contentWrap = document.createElement("div");
                    contentWrap.style.cssText = "padding:10px 12px;background:var(--lv-surface-2);border-radius:8px;border:1px solid var(--lv-line);display:flex;flex-direction:column;gap:6px;font-size:12px";
                    socialRetireSection.append(contentWrap);
                    body.appendChild(socialRetireSection);

                    void (async () => {
                        const { calculateRetirement } = await import("@/core/retirement");
                        const ret = calculateRetirement({ birthday: member.birthday, sex: member.sex });
                        if (ret) {
                            const delayText = ret.delayedMonths > 0 ? ` · ${t("members.retirementDelay").replace("${n}", String(ret.delayedMonths))}` : "";
                            const daysBadge = ret.isRetired
                                ? `<span class="lv-badge green">${t("members.retirementRetired")}</span>`
                                : `<span class="lv-badge orange">${t("members.retirementDaysLeft").replace("${n}", String(ret.daysLeft))}</span>`;

                            contentWrap.innerHTML = `
                                <div style="display:flex;align-items:center;justify-content:space-between">
                                    <span>${t("members.retirementTarget")}: <b>${ret.targetRetireDate}</b> (${t("members.retirementAge").replace("${age}", String(ret.targetRetireAge))}${delayText})</span>
                                    ${daysBadge}
                                </div>
                                <div style="display:flex;align-items:center;justify-content:space-between;color:var(--lv-tx-2);font-size:11.5px">
                                    <span>${t("members.retirementCareerProgress")}</span>
                                    <span>${ret.careerProgressPercent}%</span>
                                </div>
                                <div style="height:4px;border-radius:2px;background:var(--lv-line);overflow:hidden;width:100%">
                                    <div style="height:100%;background:var(--lv-accent);width:${ret.careerProgressPercent}%;border-radius:2px"></div>
                                </div>`;
                        }
                    })();
                }
            }
        })().catch((error) => {
            if (active === "vehicles") {
                failVehicleActions(["fuel", "charging", "maintenance"], error);
            } else {
                showMessage(t("ledger.logReadFailed") + " (" + (error instanceof Error ? error.message : String(error)) + ")", 6000, "error");
            }
        });

        // Modules with templates expose a document generation action.
        (async () => {
            const tplList = ((plugin.schemaCatalog?.[active] as any)?.templates ?? []) as { key: string; nameKey: string; file: string }[];
            for (const tp of tplList) {
                const label = t(tp.nameKey) !== tp.nameKey ? t(tp.nameKey) : tp.key;
                const btn = document.createElement("button");
                btn.className = "b3-button b3-button--outline";
                btn.style.cssText = "margin-top:8px;font-size:12px";
                btn.textContent = `${t("ledger.genDoc")} · ${label}`;
                btn.onclick = async () => {
                    try {
                        const { getTemplate, renderTemplate, sanitizeDocTitle } = await import("@/core/templates");
                        const { sql, createDocWithMd } = await import("@/core/siyuan");
                        const file = getTemplate(tp.file);
                        if (!file) throw new Error("template missing: " + tp.file);
                        const rows = await sql<{ box: string }>(`SELECT box FROM blocks WHERE id='${ref!.docId}' LIMIT 1`);
                        const notebook = rows[0]?.box;
                        if (!notebook) throw new Error("notebook not found for " + ref!.docId);
                        const vars: Record<string, string> = { name: String(cellText(row.cells[ref!.columns.name])), date: localDateKey(new Date()) };
                        for (const c of schemaCols) vars[c.key] = cellText(row.cells[ref!.columns[c.key]]);
                        // Sanitize titles before creating documents in the notebook tree.
                        const title = sanitizeDocTitle(`${vars.name} · ${label} · ${vars.date}`);
                        // G2（UG12 研究产出）：落点说明——文档建在台账笔记本内，随思源同步/分享范围流转
                        confirm(t("ledger.genDoc"), t("ledger.genDocConfirm").replace("${title}", title), async () => {
                            try {
                                const docId = await createDocWithMd(notebook, `/${title}`, renderTemplate(file, vars));
                                showMessage(t("ledger.genDocDone").replace("${title}", title), 3000, "info");
                                dlg.destroy();
                                plugin.showTabDocs(docId);
                            } catch (e) {
                                showMessage(t("ledger.genDocFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                            }
                        });
                    } catch (e) {
                        showMessage(t("ledger.genDocFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                    }
                };
                body.appendChild(btn);
            }
        })();
        // Link health prescriptions to medicine stock rows when both ledgers exist.
        function addRxToMedicineButton() {
            if (active !== "health") return;
            const medRef = plugin.settings.dbRefs?.["medicine"];
            if (!medRef?.avId) return;
            const name = String(cellText(row.cells[ref!.columns.name]));
            if (!name || name === "—") return;
            const btn = document.createElement("button");
            btn.className = "b3-button b3-button--outline";
            btn.style.cssText = "margin-top:8px;font-size:12px";
            btn.textContent = t("ledger.rxToMedicine");
            let pendingMedicineID: string | null = null;
            let medicineOperationKey: string | null = null;
            btn.onclick = () => {
                if (btn.disabled) return;
                confirm(t("ledger.rxToMedicine"), t("ledger.rxToMedicineBody").replace("${name}", name), async () => {
                    btn.disabled = true;
                    try {
                        const { addDetachedRow, setCell } = await import("@/core/siyuan");
                        if (!medicineOperationKey) medicineOperationKey = newOperationKey(`ledger:rx-to-medicine:${row.itemID}`);
                        const itemID = pendingMedicineID ?? await addDetachedRow(medRef.avId!, name, {
                            idempotencyKey: `${medicineOperationKey}:row`,
                            retries: 1,
                        });
                        pendingMedicineID = itemID;
                        const catKey = medRef.columns?.category;
                        if (catKey) await setCell(medRef.avId!, catKey, itemID, selectCellValue("rx"), {
                            idempotencyKey: `${medicineOperationKey}:category`,
                            retries: 1,
                        });
                        const memKey = medRef.columns?.member;
                        const relBlock = row.cells[ref!.columns.member]?.relation?.blockIDs?.[0];
                        if (memKey && relBlock) await setCell(medRef.avId!, memKey, itemID, { type: "relation", relation: { blockIDs: [relBlock], contents: null } }, {
                            idempotencyKey: `${medicineOperationKey}:member`,
                            retries: 1,
                        });
                        showMessage(t("ledger.rxToMedicineDone").replace("${name}", name), 3000, "info");
                        pendingMedicineID = null;
                        medicineOperationKey = null;
                    } catch (e) {
                        showMessage(t("ledger.rxToMedicineFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                        btn.disabled = false;
                    }
                });
            };
            body.appendChild(btn);
        }
        addRxToMedicineButton();

        // Link shopping purchases to stock rows, creating a row when needed.
        function addStockInButton() {
            if (active !== "shopping") return;
            const medRef = plugin.settings.dbRefs?.["medicine"];
            if (!medRef?.avId) return;
            const name = String(cellText(row.cells[ref!.columns.name]));
            if (!name || name === "—") return;
            const qtyRaw = cellText(row.cells[ref!.columns.qty]);
            const qty = qtyRaw !== "—" && qtyRaw !== "" && Number.isFinite(Number(qtyRaw)) && Number(qtyRaw) > 0 ? Number(qtyRaw) : 1;
            const btn = document.createElement("button");
            btn.className = "b3-button b3-button--outline";
            btn.style.cssText = "margin-top:8px;font-size:12px";
            btn.textContent = t("ledger.stockIn");
            let pendingStockItemID: string | null = null;
            let stockOperationKey: string | null = null;
            let stockWrite: { itemID: string; value: number; idempotencyKey: string } | null = null;
            let stockInBusy = false;
            btn.onclick = async () => {
                if (stockInBusy) return;
                stockInBusy = true;
                btn.disabled = true;
                try {
                    const { addDetachedRow, setCell } = await import("@/core/siyuan");
                    const read = await renderLedgerAll(medRef.avId!);
                    if (!read.complete) throw new Error(t("ledger.loadIncomplete"));
                    const nameKey = medRef.columns?.name;
                    const stockKey = medRef.columns?.stock_qty;
                    if (!stockKey) throw new Error("stock quantity column is unavailable");
                    const matches = nameKey
                        ? read.rows.filter((r) => String(r.cells[nameKey]?.text?.content ?? "").trim() === name)
                        : [];
                    const dialog = new Dialog({
                        title: t("ledger.stockIn"),
                        content: `<div class="b3-dialog__content" id="lv-stockin-body"></div><div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-stockin-cancel">${t("cancel")}</button><button class="b3-button" id="lv-stockin-ok">${t("ledger.stockIn")}</button></div>`,
                        width: "420px",
                        destroyCallback: () => {
                            if (!stockCommitted) {
                                stockInBusy = false;
                                btn.disabled = false;
                            }
                        },
                    });
                    let stockCommitted = false;
                    const body = dialog.element.querySelector("#lv-stockin-body") as HTMLElement;
                    body.textContent = t("ledger.stockInBody").replace("${name}", name).replace("${qty}", String(qty)).replace("${n}", String(matches.length));
                    const cancel = dialog.element.querySelector("#lv-stockin-cancel") as HTMLButtonElement;
                    const ok = dialog.element.querySelector("#lv-stockin-ok") as HTMLButtonElement;
                    cancel.onclick = () => { dialog.destroy(); stockInBusy = false; btn.disabled = false; };
                    ok.onclick = async () => {
                        if (ok.disabled) return;
                        ok.disabled = true;
                        cancel.disabled = true;
                        try {
                            await enqueueLedgerWrite(async () => {
                                // Re-read at commit time so a dialog left open cannot
                                // overwrite a newer stock quantity. The queue also
                                // serializes two stock-in dialogs in this plugin.
                                const latest = await renderLedgerAll(medRef.avId!);
                                if (!latest.complete) throw new Error(t("ledger.loadIncomplete"));
                                const latestMatches = nameKey
                                    ? latest.rows.filter((r) => String(r.cells[nameKey]?.text?.content ?? "").trim() === name)
                                    : [];
                                const target = stockWrite ? { itemID: stockWrite.itemID, cells: {} } : latestMatches[0];
                                if (!stockOperationKey) stockOperationKey = newOperationKey(`ledger:stock-in:${row.itemID}`);
                                if (target) {
                                    if (!stockWrite) {
                                        const cur = target.cells[stockKey]?.number;
                                        const curVal = cur?.isNotEmpty && typeof cur.content === "number" ? cur.content : 0;
                                        stockWrite = { itemID: target.itemID, value: curVal + qty, idempotencyKey: `${stockOperationKey}:cell:${target.itemID}` };
                                    }
                                    await setCell(medRef.avId!, stockKey, stockWrite.itemID, { type: "number", number: { content: stockWrite.value, isNotEmpty: true } }, {
                                        idempotencyKey: stockWrite.idempotencyKey,
                                        retries: 1,
                                    });
                                } else {
                                    const itemID = pendingStockItemID ?? await addDetachedRow(medRef.avId!, name, {
                                        idempotencyKey: `${stockOperationKey}:row`,
                                        retries: 1,
                                    });
                                    pendingStockItemID = itemID;
                                    if (!stockWrite) stockWrite = { itemID, value: qty, idempotencyKey: `${stockOperationKey}:cell:${itemID}` };
                                    await setCell(medRef.avId!, stockKey, stockWrite.itemID, { type: "number", number: { content: stockWrite.value, isNotEmpty: true } }, {
                                        idempotencyKey: stockWrite.idempotencyKey,
                                        retries: 1,
                                    });
                                    pendingStockItemID = null;
                                }
                            });
                            stockCommitted = true;
                            stockOperationKey = null;
                            stockWrite = null;
                            dialog.destroy();
                            btn.textContent = t("ledger.stockIn");
                            try {
                                await plugin.refreshHub?.(["medicine"]); // Refresh low-stock reminders.
                            } catch (e) {
                                showMessage(t("ledger.stockInRefreshFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                            } finally {
                                stockInBusy = false;
                                btn.disabled = false;
                            }
                        } catch (e) {
                            if (stockCommitted) {
                                showMessage(t("ledger.stockInRefreshFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                                stockInBusy = false;
                                btn.disabled = false;
                            } else {
                                showMessage(t("ledger.stockInFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                                ok.disabled = false;
                                cancel.disabled = false;
                            }
                            return;
                        }
                    };
                } catch (e) {
                    showMessage(t("ledger.stockInFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                    stockInBusy = false;
                    btn.disabled = false;
                }
            };
            body.appendChild(btn);
        }
        addStockInButton();

        // Link shopping delivered purchases to assets-real records.
        function addShoppingToAssetButton() {
            if (active !== "shopping") return;
            const assetsRef = plugin.settings.dbRefs?.["assets-real"];
            if (!assetsRef?.avId || !assetsRef.columns) return;
            const name = String(cellText(row.cells[ref!.columns.name]));
            if (!name || name === "—") return;

            const btn = document.createElement("button");
            btn.className = "b3-button b3-button--outline";
            btn.style.cssText = "margin-top:8px;margin-left:6px;font-size:12px";
            btn.textContent = t("ledger.shoppingToAsset");

            let busy = false;
            btn.onclick = async () => {
                if (busy) return;
                busy = true;
                btn.disabled = true;
                try {
                    const { mapShoppingToAssetReal } = await import("@/core/valuation");
                    const draft = mapShoppingToAssetReal(row, ref!.columns);

                    const catOptions = [
                        { val: "digital", label: "数码电子" },
                        { val: "appliance", label: "家用电器" },
                        { val: "furniture", label: "家具家居" },
                        { val: "apparel", label: "服饰箱包" },
                        { val: "collection", label: "潮玩收藏" },
                        { val: "sports", label: "运动户外" },
                        { val: "other_ar", label: "其他资产" },
                    ].map((c) => `<option value="${c.val}" ${c.val === draft.suggestedCategory ? "selected" : ""}>${c.label}</option>`).join("");

                    const dlg = new Dialog({
                        title: t("ledger.shoppingToAssetTitle"),
                        content: `<div class="b3-dialog__content lv-dialog-col">
                            <p class="lv-caption" style="margin:0">${t("ledger.shoppingToAssetIntro")}</p>
                            <label style="display:flex;flex-direction:column;gap:4px">
                                <span class="lv-caption">${t("field.name")}</span>
                                <input class="b3-text-field" id="lv-s2a-name" value="${draft.name}" style="width:100%" />
                            </label>
                            <label style="display:flex;flex-direction:column;gap:4px">
                                <span class="lv-caption">${t("field.category")}</span>
                                <select class="b3-select" id="lv-s2a-cat" style="width:100%">${catOptions}</select>
                            </label>
                            <label style="display:flex;flex-direction:column;gap:4px">
                                <span class="lv-caption">${t("field.amount")}</span>
                                <input class="b3-text-field" id="lv-s2a-amount" type="number" value="${draft.amount ?? ""}" style="width:100%" />
                            </label>
                        </div>
                        <div class="b3-dialog__action">
                            <button class="b3-button b3-button--cancel" id="lv-s2a-cancel">${t("cancel")}</button>
                            <button class="b3-button" id="lv-s2a-save">${t("save")}</button>
                        </div>`,
                        width: "420px",
                    });

                    (dlg.element.querySelector("#lv-s2a-cancel") as HTMLButtonElement).onclick = () => {
                        dlg.destroy();
                        busy = false;
                        btn.disabled = false;
                    };

                    (dlg.element.querySelector("#lv-s2a-save") as HTMLButtonElement).onclick = async function (this: HTMLButtonElement) {
                        const nameVal = (dlg.element.querySelector("#lv-s2a-name") as HTMLInputElement)?.value.trim() || draft.name;
                        const catVal = (dlg.element.querySelector("#lv-s2a-cat") as HTMLSelectElement)?.value || draft.suggestedCategory;
                        const amtVal = Number((dlg.element.querySelector("#lv-s2a-amount") as HTMLInputElement)?.value) || draft.amount;

                        this.disabled = true;
                        dlg.destroy();
                        try {
                            const { addDetachedRow, setCell } = await import("@/core/siyuan");
                            const rowId = await addDetachedRow(assetsRef.avId!, nameVal);
                            if (assetsRef.columns.category) {
                                await setCell(assetsRef.avId!, assetsRef.columns.category, rowId, {
                                    type: "select", select: { content: catVal },
                                });
                            }
                            if (assetsRef.columns.amount && typeof amtVal === "number" && Number.isFinite(amtVal)) {
                                await setCell(assetsRef.avId!, assetsRef.columns.amount, rowId, {
                                    type: "number", number: { content: amtVal, isNotEmpty: true },
                                });
                            }
                            if (assetsRef.columns.date && draft.date) {
                                await setCell(assetsRef.avId!, assetsRef.columns.date, rowId, {
                                    type: "date", date: { content: draft.date, isNotEmpty: true },
                                });
                            }
                            if (assetsRef.columns.channel && draft.channel) {
                                await setCell(assetsRef.avId!, assetsRef.columns.channel, rowId, {
                                    type: "text", text: { content: draft.channel },
                                });
                            }
                            if (assetsRef.columns.member && draft.memberId) {
                                await setCell(assetsRef.avId!, assetsRef.columns.member, rowId, {
                                    type: "relation", relation: { blockIDs: [draft.memberId] },
                                });
                            }
                            if (assetsRef.columns.note) {
                                const noteContent = draft.note ? `${draft.note} (来自购物记录)` : "来自购物记录";
                                await setCell(assetsRef.avId!, assetsRef.columns.note, rowId, {
                                    type: "text", text: { content: noteContent },
                                });
                            }
                            showMessage(t("ledger.shoppingToAssetDone").replace("${name}", nameVal), 3500, "info");
                            btn.textContent = `✓ ${t("ledger.shoppingToAssetDoneShort")}`;
                            btn.disabled = true;
                        } catch (err) {
                            showMessage(t("ledger.saveFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 6000, "error");
                            busy = false;
                            btn.disabled = false;
                        }
                    };
                } catch (e) {
                    showMessage(t("ledger.logReadFailed") + " (" + (e instanceof Error ? e.message : String(e)) + ")", 6000, "error");
                    busy = false;
                    btn.disabled = false;
                }
            };
            body.appendChild(btn);
        }
        addShoppingToAssetButton();

        // Certificate renewal chains show both forward and reverse relations.
        function addRenewChainSection() {
            if (active !== "certs") return;
            const relKey = ref!.columns.renewed_to;
            if (!relKey) return;
            const nameOf = (id: string) => {
                const r = rows.find((x) => x.itemID === id);
                return r ? String(cellText(r.cells[ref!.columns.name])) : "?";
            };
            const forward = (row.cells[relKey]?.relation?.blockIDs ?? []) as string[];
            const backward = rows.filter((r) => ((r.cells[relKey]?.relation?.blockIDs ?? []) as string[]).includes(row.itemID));
            const linkBtn = () => {
                const btn = document.createElement("button");
                btn.className = "b3-button b3-button--outline";
                btn.style.cssText = "margin-top:6px;font-size:12px";
                btn.textContent = t("ledger.linkNew");
                btn.onclick = () => {
                    const picker = new Dialog({
                        title: t("ledger.pickNew"),
                        content: `<div class="b3-dialog__content" id="lv-pick-body" style="max-height:50vh;overflow:auto"></div>`,
                        width: "420px",
                    });
                    const list = picker.element.querySelector("#lv-pick-body") as HTMLElement;
                    for (const r of rows) {
                        if (r.itemID === row.itemID) continue;
                        const b = document.createElement("button");
                        b.className = "b3-button b3-button--text";
                        b.style.cssText = "display:block;width:100%;text-align:left;font-size:13px";
                        const exp = ref!.columns.expiry ? cellText(r.cells[ref!.columns.expiry]) : "";
                        b.textContent = `${String(cellText(r.cells[ref!.columns.name]))}${exp && exp !== "—" ? ` · ${exp}` : ""}`;
                        b.onclick = async () => {
                            b.disabled = true;
                            try {
                                const { setCell } = await import("@/core/siyuan");
                                await setCell(ref!.avId!, relKey, row.itemID, { type: "relation", relation: { blockIDs: [r.itemID], contents: null } }, {
                                    idempotencyKey: `ledger:renew-link:${row.itemID}:${r.itemID}`,
                                    retries: 1,
                                });
                                picker.destroy();
                                dlg.destroy();
                                showMessage(t("ledger.linked").replace("${name}", String(cellText(r.cells[ref!.columns.name]))), 2500, "info");
                                await load();
                                try {
                                    await plugin.refreshHub([active]);
                                } catch (e) {
                                    showMessage(t("ledger.refreshFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
                                }
                                const fresh = rows.find((x) => x.itemID === row.itemID);
                                if (fresh) openDetail(fresh);
                            } catch (e) {
                                showMessage(t("ledger.renewLinkFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                                b.disabled = false;
                            }
                        };
                        list.appendChild(b);
                    }
                    if (!list.children.length) list.innerHTML = `<div class="ft__on-surface" style="font-size:13px">${t("ledger.noOtherRows")}</div>`;
                };
                return btn;
            };
            if (forward.length === 0 && backward.length === 0) {
                body.appendChild(linkBtn());
                return;
            }
            const head = document.createElement("div");
            head.className = "ft__on-surface";
            head.style.cssText = "margin-top:10px;padding-top:8px;border-top:1px solid var(--b3-border-color);font-size:12px";
            head.textContent = t("ledger.renewChain");
            body.appendChild(head);
            for (const id of forward) {
                const line = document.createElement("div");
                line.style.cssText = substRowCss;
                line.textContent = `→ ${nameOf(id)} (${t("ledger.newCert")})`;
                body.appendChild(line);
            }
            for (const r of backward) {
                const line = document.createElement("div");
                line.style.cssText = substRowCss;
                line.textContent = `← ${String(cellText(r.cells[ref!.columns.name]))} (${t("ledger.oldCert")})`;
                body.appendChild(line);
            }
            body.appendChild(linkBtn());
        }
        addRenewChainSection();

            addFavorsSyncSection();
        }
        // Favor interactions use an idempotent external reference and degrade gracefully when contacts are unavailable.
        function addFavorsSyncSection() {
            if (active !== "favors") return;
            const personName = (row.cells[ref!.columns.person ?? ""]?.text?.content ?? "").trim();
            if (!personName || !ref!.columns.person) return;
            const synced = plugin.runtime?.favorSyncs?.[row.itemID];
            const head = document.createElement("div");
            head.className = "ft__on-surface";
            head.style.cssText = "margin-top:10px;padding-top:8px;border-top:1px solid var(--b3-border-color);font-size:12px";
            head.textContent = t("ec15.title");
            body.appendChild(head);
            const btn = document.createElement("button");
            btn.className = "b3-button b3-button--outline";
            btn.style.cssText = "margin-top:6px;font-size:12px";
            btn.textContent = synced ? t("ec15.again") : t("ec15.record");
	            btn.onclick = async () => {
	                const w = (typeof window !== "undefined" ? window : {}) as Record<string, unknown>;
	                const bridge = (w.LvContacts || w.xiaolvContacts || w.siyuanContacts || w.lvContacts) as {
	                    ensurePerson: (name: string) => Promise<{ docId: string; name: string; created: boolean }>;
	                    recordInteraction: (ids: readonly string[], meta?: { ref?: string; date?: string; note?: string }) => Promise<{ recorded: number }>;
	                } | undefined;
	                if (!bridge?.ensurePerson || !bridge.recordInteraction) {
                    showMessage(t("ledger.contactsMissing"), 5000, "info");
                    return;
                }
                btn.disabled = true;
                try {
                    const person = await bridge.ensurePerson(personName);
                    const dateVal = ref!.columns.date ? rawFromValue("date", row.cells[ref!.columns.date]) : "";
                    const dir = selectCellContent(row.cells[ref!.columns.direction ?? ""]) ?? "";
                    const amount = row.cells[ref!.columns.amount ?? ""]?.number;
                    const noteParts = [
                        dir === "in" ? t("ec15.received") : dir === "out" ? t("ec15.given") : "",
                        typeof amount?.content === "number" && amount.isNotEmpty ? String(amount.content) : "",
                    ].filter(Boolean);
                    const result = await bridge.recordInteraction([person.docId], {
                        ref: `favor:${row.itemID}`,
                        date: dateVal || undefined,
                        note: noteParts.join(" "),
                    });
                    plugin.runtime.favorSyncs = { ...(plugin.runtime.favorSyncs ?? {}), [row.itemID]: { docId: person.docId, at: new Date().toISOString() } };
                                        await saveRuntime(plugin, plugin.runtime);
                    showMessage(t("ec15.done").replace("${n}", person.name).replace("${r}", String(result.recorded)), 3000, "info");
                    btn.disabled = false;
                } catch (e) {
                    showMessage(t("ec15.failed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                    btn.disabled = false;
                }
            };
            if (synced) {
                const tag = document.createElement("span");
                tag.className = "lv-caption";
                tag.style.cssText = "margin-left:8px;color:var(--lv-accent)";
                tag.textContent = t("ec15.synced");
                head.appendChild(tag);
            }
            body.appendChild(btn);
        }
        // Edit mode writes supported fields independently and reports partial failures.
        function buildEdit() {
            body.innerHTML = "";
            body.scrollTop = 0;
            const more = dlg.element.querySelector(".lv-detail-more") as HTMLDetailsElement;
            more.open = false;
            more.hidden = true;
            const inputs: { keyID: string; type: string; label: string; get: () => any }[] = [];
            for (const col of schemaCols) {
                const keyID = ref!.columns[col.key];
                if (!keyID || !EDITABLE.has(col.type)) continue;
                const wrap = document.createElement("div");
                wrap.className = "fn__flex";
                wrap.style.cssText = "gap:10px;padding:4px 0;font-size:13px;align-items:center";
                wrap.append(labelSpan(col));
                const cur = rawFromValue(col.type, row.cells[keyID]);
                let control: HTMLInputElement | HTMLSelectElement;
                if (col.type === "select") {
                    const sel = document.createElement("select");
                    sel.className = "b3-select fn__flex-1";
                    sel.add(new Option("", ""));
                    for (const opt of col.options ?? []) sel.add(new Option(optLabel(t, col.key, opt), String(opt))); // 211 波：枚举标签
                    sel.value = String(cur ?? "");
                    control = sel;
                } else {
                    const input = document.createElement("input");
                    input.className = "b3-text-field fn__flex-1";
                    input.type = col.type === "number" ? "number" : col.type === "date" ? "date" : col.type === "url" ? "url" : "text";
                    input.value = String(cur ?? "");
                    if (col.type === "checkbox") { input.type = "checkbox"; input.checked = !!cur; input.className = "b3-switch"; }
                    control = input;
                }
                control.setAttribute("aria-label", colLabel(col));
                wrap.append(control);
                // Contact fields can use the shared contacts picker when available.
                if (col.key === "contact" && control instanceof HTMLInputElement) {
                    const pick = document.createElement("button");
                    pick.className = "b3-button b3-button--outline";
                    pick.style.cssText = "flex-shrink:0;font-size:12px";
                    pick.textContent = t("ledger.pickContact");
                    pick.onclick = () => pickFromContacts((picked) => { control.value = picked; });
                    wrap.append(pick);
                }
                body.appendChild(wrap);
                inputs.push({ keyID, type: col.type, label: colLabel(col), get: () => (control instanceof HTMLInputElement && control.type === "checkbox" ? control.checked : control.value) });
            }
            const errorBox = document.createElement("div");
            errorBox.className = "lv-record-error";
            errorBox.setAttribute("role", "alert");
            errorBox.style.display = "none";
            body.appendChild(errorBox);
            const save = dlg.element.querySelector("#lv-detail-edit") as HTMLButtonElement;
            save.textContent = t("save");
            const cancel = dlg.element.querySelector("#lv-detail-close") as HTMLButtonElement;
            cancel.textContent = t("cancel");
            cancel.onclick = () => buildView();
            save.onclick = async () => {
                if (save.disabled) return;
                save.disabled = true;
                cancel.disabled = true;
                errorBox.style.display = "none";
                const failed: string[] = [];
                let changed = 0;
                let personChanged = false;
                const personKeyID = ref!.columns.person;
                const previousFavorSync = plugin.runtime?.favorSyncs?.[row.itemID];
                try {
                    for (const e of inputs) {
                        const v = e.get();
                        const orig = rawFromValue(e.type, row.cells[e.keyID]);
                        const same = e.type === "checkbox" ? v === orig : String(v) === String(orig);
                        if (same) continue;
                        try {
                            const nextCell = cellValue(e.type, v);
                            await setCell(ref!.avId!, e.keyID, row.itemID, nextCell, {
                                idempotencyKey: `ledger:detail-edit:${row.itemID}:${e.keyID}:${JSON.stringify(nextCell)}`,
                                retries: 1,
                            });
                            row.cells[e.keyID] = nextCell;
                            changed++;
                            if (personKeyID && e.keyID === personKeyID) personChanged = true;
                        } catch {
                            failed.push(e.label); // Aggregate field-level failures.
                        }
                    }
                    // A person change invalidates favor syncs and requires a fresh interaction.
                    if (personChanged && previousFavorSync) {
                        delete plugin.runtime.favorSyncs[row.itemID];
                        try {
                            await saveRuntime(plugin, plugin.runtime);
                        } catch (err) {
                            plugin.runtime.favorSyncs = { ...(plugin.runtime.favorSyncs ?? {}), [row.itemID]: previousFavorSync };
                            showMessage(t("ledger.saveFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 6000, "error");
                        }
                    }
                    if (failed.length > 0) {
                        if (changed > 0) {
                            await load();
                            try { await plugin.refreshHub([active]); }
                            catch (err) { showMessage(t("ledger.refreshFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 5000, "error"); }
                        }
                        errorBox.textContent = t("ledger.editSavePartial").replace("${fields}", failed.join(", "));
                        errorBox.style.display = "block";
                        save.disabled = false;
                        cancel.disabled = false;
                        return;
                    }
                    dlg.destroy();
                    if (changed > 0) {
                        await load();
                        if (loadError) showMessage(t("ledger.refreshFailed").replace("${msg}", loadError), 5000, "error");
                        try {
                            await plugin.refreshHub([active]); // Refresh only the active module.
                        } catch (err) {
                            showMessage(t("ledger.refreshFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 5000, "error");
                        }
                    }
                    if (changed > 0) showMessage(t("ledger.editSaved"), 2500, "info");
                } catch (err) {
                    showMessage(t("ledger.saveFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 6000, "error");
                    save.disabled = false;
                    cancel.disabled = false;
                }
            };
        }
        buildView();
        if (active === "vehicles") {
            const quick = document.createElement("section");
            quick.className = "lv-vehicle-quick-actions";
            quick.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 14px;padding:10px 12px;border:1px solid var(--b3-border-color);border-radius:8px;background:var(--b3-theme-background-light)";
            const label = document.createElement("b"); label.textContent = t("vehicle.quickActions"); label.style.cssText = "font-size:12px;margin-right:2px";
            quick.appendChild(label);
            for (const action of ["fuel", "charging", "maintenance"] as const) {
                const button = document.createElement("button");
                button.className = "b3-button b3-button--outline";
                button.textContent = t(`vehicle.quick.${action}`);
                button.onclick = () => requestVehicleAction(action);
                quick.appendChild(button);
            }
            body.prepend(quick);
            if (vehicleAction === "edit") {
                requestAnimationFrame(() => (dlg.element.querySelector("#lv-detail-edit") as HTMLButtonElement | null)?.click());
            } else if (vehicleAction) {
                requestAnimationFrame(() => requestVehicleAction(vehicleAction));
            }
        }
        (dlg.element.querySelector("#lv-detail-close") as HTMLButtonElement).onclick = () => dlg.destroy();
        (dlg.element.querySelector("#lv-detail-edit") as HTMLButtonElement).onclick = () => buildEdit();
        (dlg.element.querySelector("#lv-detail-open") as HTMLButtonElement).onclick = () => { dlg.destroy(); plugin.showTabDocs(ref?.docId); };
        // R7 资料强化：分享卡（复制为图片 / 下载 PNG）——kv 用当前显示文本（掩码态即导出掩码态）
        const nameKeyForCard = ref?.columns?.name;
        const nameValForCard = nameKeyForCard ? row.cells?.[nameKeyForCard] : undefined;
        const cardTitle = (nameValForCard?.type === "block" ? nameValForCard.block?.content : "") || detailTitle;
        const cardDeepLink = nameValForCard?.type === "block" && nameValForCard.block?.id ? blockDeepLink(nameValForCard.block.id) : blockDeepLink(ref?.docId || "");
        const buildCard = async () => renderRecordCardPng({
            title: cardTitle,
            moduleLabel: t(`module.${active}`) !== `module.${active}` ? t(`module.${active}`) : active,
            rows: cardRows,
            deepLink: cardDeepLink,
        });
        (dlg.element.querySelector("#lv-detail-card-copy") as HTMLButtonElement).onclick = async function (this: HTMLButtonElement) {
            this.disabled = true;
            try {
                const blob = await buildCard();
                const ok = await copyPngToClipboard(blob);
                if (ok) showMessage(t("ledger.copyAsImageOk"), 2500, "info");
                else { downloadPng(blob, `${cardTitle.slice(0, 20) || "lvhome"}.png`); showMessage(t("ledger.copyAsImageFail"), 4000, "info"); }
            } catch (e) {
                showMessage(t("ledger.copyAsImageFail").replace(": Downloaded instead", "") + ` (${e instanceof Error ? e.message : String(e)})`, 5000, "error");
            } finally { this.disabled = false; }
        };
        (dlg.element.querySelector("#lv-detail-card-png") as HTMLButtonElement).onclick = async function (this: HTMLButtonElement) {
            this.disabled = true;
            try {
                const blob = await buildCard();
                downloadPng(blob, `${cardTitle.slice(0, 20) || "lvhome"}.png`);
            } catch (e) {
                showMessage(t("ledger.copyAsImageFail").replace(": Downloaded instead", "") + ` (${e instanceof Error ? e.message : String(e)})`, 5000, "error");
            } finally { this.disabled = false; }
        };
        // Copy the detail card as label/value text.
        (dlg.element.querySelector("#lv-detail-card-text") as HTMLButtonElement).onclick = async () => {
            const text = cardRows.map((r) => `${r.label}: ${r.value}`).join("\n");
            try {
                await navigator.clipboard.writeText(`${cardTitle}\n${text}`);
                showMessage(t("ledger.copyAsTextOk"), 2500, "info");
            } catch (e) {
                showMessage(t("ledger.copyAsImageFail") + ` (${e instanceof Error ? e.message : String(e)})`, 5000, "error");
            }
        };
        // Copy the detail card as masked label/value text.
        (dlg.element.querySelector("#lv-detail-card-masked-text") as HTMLButtonElement).onclick = async () => {
            const { formatMaskedRecordText } = await import("@/core/format");
            const text = formatMaskedRecordText(cardTitle, cardRows);
            try {
                await navigator.clipboard.writeText(text);
                showMessage(t("ledger.copyAsMaskedTextOk"), 2500, "info");
            } catch (e) {
                showMessage(t("ledger.copyAsImageFail") + ` (${e instanceof Error ? e.message : String(e)})`, 5000, "error");
            }
        };
        // Copy record as new draft.
        const dupBtn = dlg.element.querySelector("#lv-detail-duplicate") as HTMLButtonElement | null;
        if (dupBtn) {
            dupBtn.onclick = () => {
                const rowName = cellText(row.cells[ref.columns.name]) || "";
                const cloneName = rowName ? `${rowName} (副本)` : "";
                const copiedValues: Record<string, any> = { name: cloneName };
                for (const col of schemaCols) {
                    if (col.key === "name" || ["asset", "mAsset", "relation"].includes(col.type)) continue;
                    const v = row.cells[ref.columns[col.key]];
                    if (v) {
                        if (col.type === "select") copiedValues[col.key] = selectCellContent(v);
                        else if (col.type === "number") copiedValues[col.key] = v.number?.content;
                        else if (col.type === "date") copiedValues[col.key] = v.date?.content ? localDateKey(new Date(v.date.content)) : "";
                        else if (col.type === "checkbox") copiedValues[col.key] = v.checkbox?.checked;
                        else copiedValues[col.key] = cellText(v, col.key);
                    }
                }
                dlg.destroy();
                openNewRecord();
                form = copiedValues;
                showMessage(t("ledger.duplicateSuccess").replace("${name}", cloneName || rowName), 3000, "info");
            };
        }
        // Row deletion is explicit and confirmed before mutation.
        (dlg.element.querySelector("#lv-detail-del") as HTMLButtonElement).onclick = () => {
            if (plugin.runtime?.guestModeActive) {
                showMessage(t("guest.writeBlocked"), 4000, "info");
                return;
            }
            confirm(t("ledger.delTitle"), t("ledger.delBody").replace("${name}", cellText(row.cells[ref.columns.name])), async () => {
                try {
                    const { removeLedgerRows, } = await import("@/core/siyuan");
                    await removeLedgerRows(ref!.avId!, [row.itemID], {
                        idempotencyKey: `ledger:delete:${ref!.avId!}:${row.itemID}`,
                        retries: 1,
                    });
                } catch (e) {
                    showMessage(t("ledger.delFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                    return;
                }
                showMessage(t("ledger.delDone"), 2500, "info");
                dlg.destroy();
                const followupErrors: string[] = [];
                try {
                    const memberRef = plugin.settings.dbRefs.members;
                    if (memberRef?.avId === ref!.avId) {
                        const linkedMembers = (plugin.settings.members ?? []).filter((member) => member.avItemId === row.itemID);
                        if (linkedMembers.length) {
                            for (const member of linkedMembers) {
                                member.avItemId = undefined;
                                member.syncError = "ledger row deleted";
                                member.avRowCreatePending = undefined;
                            }
                            await saveSettings(plugin, plugin.settings);
                        }
                    }
                } catch (e) {
                    followupErrors.push(`${t("ledger.memberLinkCleanupFailed")} (${e instanceof Error ? e.message : String(e)})`);
                }
                try {
                    // Clean orphaned runtime state after deleting the row.
                    const { cleanupRowRuntimeData } = await import("@/core/hub/runtime");
                    const dirty = cleanupRowRuntimeData(plugin.runtime, row.itemID);
                    if (dirty) {
                        await saveRuntime(plugin, plugin.runtime);
                    }
                } catch (e) {
                    followupErrors.push(e instanceof Error ? e.message : String(e));
                }
                try {
                    // Remove child row-log records as well.
                    const { updateRowLogs, removeRowLog } = await import("@/core/rowlog");
                    await updateRowLogs(plugin as any, (current) => removeRowLog(current, ref!.avId!, row.itemID));
                } catch (e) {
                    followupErrors.push(e instanceof Error ? e.message : String(e));
                }
                try {
                    await load();
                    await plugin.refreshHub([active]); // Refresh only the active module.
                } catch (e) {
                    followupErrors.push(e instanceof Error ? e.message : String(e));
                }
                // The row is already deleted; follow-up failures must not trigger a second deletion.
                if (followupErrors.length) showMessage(t("ledger.delFollowupFailed").replace("${msg}", followupErrors.join("; ")), 6000, "error");
            });
        };
    }

    async function createRow() {
        if (!ref?.avId || saving || identityPending || duplicateConfirmPending) return;
        // 297 波：访客模式写保护拦截
        if (plugin.runtime?.guestModeActive) {
            showMessage(t("guest.writeBlocked"), 4000, "info");
            return;
        }
        validationAttempted = true;
        if (!hasAnyInput) {
            nameInput?.focus();
            showMessage(t("ledger.nameRequired"), 4000, "info");
            return;
        }
        // Name validation prevents unnamed rows when other fields are present.
        if (nameMissing) {
            saveError = t("ledger.nameRequired");
            showMessage(saveError, 4000, "error");
            return;
        }
        if (active === "certs" && !String(form.category ?? "").trim()) {
            saveError = t("ledger.categoryRequired");
            showMessage(saveError, 4000, "info");
            return;
        }
        if (active === "certs" && form.x_cert_id_number && idcardCheck && !idcardCheck.ok) {
            saveError = t("ledger.idcardBad").replace("${reason}", t(`ledger.idcardReason.${idcardCheck.reason ?? "format"}`));
            focusCaptureField("x_cert_id_number");
            showMessage(saveError, 4500, "error");
            return;
        }
        for (const field of supportableCols) {
            const error = formFieldError(field);
            if (!error) continue;
            saveError = error;
            focusCaptureField(field.key);
            showMessage(saveError, 4500, "error");
            return;
        }
        // D24（UG04 数据质量）：同名行确认——对照已加载行（render 窗口）提示同名数，确认可继续；D06 成员同名确认同款交互
        const dupName = String(form.name ?? "").trim();
        const nameKey = ref.columns?.name;
        if (dupName && !pendingItemID && nameKey) {
            const dupCount = rows.filter((r) => cellText(r.cells[nameKey]) === dupName).length;
            if (dupCount > 0) {
                duplicateConfirmPending = true;
                confirm(
                    t("ledger.dupTitle"),
                    t("ledger.dupBody").replace("${name}", dupName).replace("${n}", String(dupCount)),
                    () => { duplicateConfirmPending = false; void doCreateRow(); },
                    () => { duplicateConfirmPending = false; },
                );
                return;
            }
        }
        await doCreateRow();
    }

    async function doCreateRow() {
        if (!ref?.avId || saving || identityPending) return;
        saving = true;
        saveError = "";
        if (!recordOperationKey) {
            try { recordOperationKey = `ledger:${crypto.randomUUID()}`; }
            catch { recordOperationKey = `ledger:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`; }
        }
        try {
            // 重试路径：部分字段失败时复用已建行（补写同一行，不重复建行）
            const itemID = pendingItemID ?? await addDetachedRow(ref.avId, String(form.name ?? "").trim() || t("ledger.unnamed"), {
                idempotencyKey: `${recordOperationKey}:row`,
            });
            pendingItemID = itemID;
            const cols = ref.columns ?? {};
            const failed: string[] = [];
            const tryCell = async (label: string, key: string | undefined, value: unknown) => {
                if (!key) {
                    failed.push(label);
                    return;
                }
                // Null means final type validation failed; do not write an empty relation.
                if (value === null) {
                    failed.push(label);
                    return;
                }
                try {
                    await setCell(ref.avId!, key, itemID, value, {
                        idempotencyKey: `${recordOperationKey}:cell:${key}`,
                    });
                } catch {
                    failed.push(label); // Preserve the field value for retry.
                }
            };
            for (const e of supportableCols) {
                const v = form[e.key];
                if (e.key !== "name" && (v === undefined || v === "" || v === false)) continue;
                if (e.key === "name" && !(v && String(v).trim()) && pendingItemID) continue; // Do not overwrite a name on retry.
                if (e.type === "number" && (v === undefined || isNaN(Number(v)))) continue;
                await tryCell(t(`field.${e.key}`), cols[e.key], cellValue(e.type, e.key === "name" ? String(v ?? "").trim() : v));
            }
            for (const e of certificateScalarCols) {
                const v = form[e.key];
                if (v === undefined || v === "" || v === false) continue;
                if (e.type === "number" && isNaN(Number(v))) continue;
                await tryCell(t(`field.${e.key}`), cols[e.key], cellValue(e.type, v));
            }
            // Image attachments are uploaded before mAsset references are written.
            // Successful uploads remain cached so retries do not duplicate them.
            if (quickAssetCols.length > 0) {
                for (const target of quickAssetCols) {
                    const previous = uploadedCertificateFiles[target.key] ?? [];
                    const uploaded = [...previous];
                    const failedFiles: File[] = [];
                    if (!cols[target.key]) {
                        failed.push(t(`field.${target.key}`));
                        continue;
                    }
                    for (const file of certificateFiles[target.key] ?? []) {
                        try {
                            const { uploadAsset } = await import("@/core/siyuan");
                            const { name, path } = await uploadAsset(file, "/assets/siyuan-home/", {
                                idempotencyKey: `${recordOperationKey}:asset:${target.key}:${fileFingerprint(file)}`,
                            });
                            uploaded.push({ name, content: path });
                        } catch (e) {
                            failed.push(`${t(`field.${target.key}`)}: ${file.name} (${e instanceof Error ? e.message : String(e)})`);
                            failedFiles.push(file);
                        }
                    }
                    certificateFiles = { ...certificateFiles, [target.key]: failedFiles };
                    if (uploaded.length === 0) continue;
                    uploadedCertificateFiles = { ...uploadedCertificateFiles, [target.key]: uploaded };
                    await tryCell(t(`field.${target.key}`), cols[target.key], {
                        type: "mAsset",
                        mAsset: uploaded.map(({ name, content }) => ({ name, content })),
                    });
                }
            }
            // Fill the schema default status, falling back to the first enum option.
            const statusCol = (plugin.schemaCatalog?.[active]?.columns ?? []).find((c: any) => c.key === "status");
            if (statusCol?.options?.length && (form.status === undefined || form.status === "")) {
                await tryCell(t("field.status"), cols.status, selectCellValue(statusCol.default ?? statusCol.options[0]));
            }
            if (failed.length > 0) {
                // Preserve input and item ID so a retry updates the same row.
                saveError = t("ledger.savePartial").replace("${fields}", failed.join(", "));
                const { coalescedNotify } = await import("@/libs/notify-queue");
                coalescedNotify("ledger-save-error", () => showMessage(saveError, 6000, "error"));
            } else {
                savedRecordName = String(form.name ?? "").trim();
                savedDocId = ref.docId ?? "";
                resetForm();
                // Brief save confirmation keeps the user in the recording flow.
                savedModule = active;
                setTimeout(() => { savedModule = ""; }, 8000);
                if (closeAfterSave) {
                    newRecordOpen = false;
                    restoreNewRecordFocus();
                }
            }
            await load();
            try {
                await plugin.refreshHub([active]); // Refresh only the active module.
            } catch (e) {
                showMessage(t("ledger.refreshFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
            }
        } catch (e) {
            if (e instanceof RowIdentityPendingError) {
                // D02：行已提交但身份未确认——不自动重试（会重复建行），提示人工核对
                identityPending = true;
                saveError = t("ledger.savePending");
            } else {
                saveError = t("ledger.saveFailed").replace("${msg}", e instanceof Error ? e.message : String(e));
            }
            showMessage(saveError, 6000, "error");
        } finally {
            saving = false;
        }
    }

    function vehicleImageHref(row: any): string {
        if (active !== "vehicles" || !ref?.columns?.attachments) return "";
        const cell = row.cells?.[ref.columns.attachments];
        const asset = Array.isArray(cell?.mAsset) ? cell.mAsset.find((item: any) => isImageAsset(String(item?.content ?? ""))) : undefined;
        if (!asset?.content) return "";
        try { return assetHref(String(asset.content)); } catch { return ""; }
    }

    function vehicleText(row: any, key: string): string {
        const id = ref?.columns?.[key];
        return id ? cellText(row.cells?.[id], key) : "—";
    }
</script>

<div class="lv-toolbar lv-ledger-toolbar" style="margin:0 0 14px">
    {#if ledgers.length > 0}
        <!-- Switching modules clears the previous search query. Grouped by category. -->
        <select class="b3-select" value={active} onchange={switchLedger}>
            {#each groupedLedgers as g (g.groupId)}
                <optgroup label={g.groupLabel}>
                    {#each g.modules as l (l.id)}
                        <option value={l.id}>{t(`module.${l.id}`)}{plugin.settings.dbRefs?.[l.id]?.avId ? "" : ` (${t("diag.missing")})`}</option>
                    {/each}
                </optgroup>
            {/each}
        </select>
    {:else}
        <div class="lv-ledger-no-modules" role="status">
            <span>{t("ledger.noEnabledModules")}</span>
            <button class="b3-button b3-button--outline" onclick={() => plugin.openSetting()}>{t("startGuide.openSettings")}</button>
        </div>
    {/if}
    <span class="fn__flex-1"></span>
    {#if rebuilding}
        <span class="lv-caption">{t("diag.rebuilding")}</span>
    {:else if ledgers.length === 0}
        <span class="lv-caption">{t("ledger.noEnabledModulesHint")}</span>
    {:else if !ref?.avId}
        <button class="b3-button" onclick={rebuildLedger}>{t("ledger.rebuild")}</button>
    {:else}
        <div class="lv-search-box" style="position:relative;display:inline-flex;align-items:center">
            <input class="b3-text-field" style="width:min(240px, 100%);padding-right:48px" type="search" placeholder={t("ledger.search")}
                bind:value={searchText}
                oninput={(event) => { panelMemory.ledgerSearch = event.currentTarget.value; }}
                onkeydown={(event) => { if (event.key === "Escape") { searchText = ""; panelMemory.ledgerSearch = ""; } }}
                title={t("ledger.search")} />
            {#if searchText}
                <span class="lv-badge" style="position:absolute;right:22px;font-size:10.5px;padding:1px 5px;pointer-events:none;opacity:0.85">
                    {filteredRows.length}
                </span>
                <button class="b3-button b3-button--text" style="position:absolute;right:2px;padding:2px 5px;font-size:11px;color:var(--b3-theme-on-surface);cursor:pointer"
                    title={t("clear")} onclick={() => { searchText = ""; panelMemory.ledgerSearch = ""; }}>✕</button>
            {/if}
        </div>
        <button class="b3-button b3-button--outline lv-density-btn"
            title={tableDensity === "compact" ? t("ledger.densityComfortable") : t("ledger.densityCompact")}
            aria-label={tableDensity === "compact" ? t("ledger.densityComfortable") : t("ledger.densityCompact")}
            onclick={toggleDensity}>
            {tableDensity === "compact" ? t("ledger.densityComfortable") : t("ledger.densityCompact")}
        </button>
        <button class="lv-btn primary" onclick={openNewRecord} disabled={rebuilding}>＋ {t("ledger.newRecord")}</button>
        <details class="lv-ledger-more">
            <summary class="b3-button b3-button--outline">{t("ledger.moreActions")}</summary>
            <div class="lv-ledger-more__menu">
                <button class="b3-button b3-button--outline" title={t("ledger.exportCsvTip")}
                    disabled={filteredRows.length === 0 || exporting || printing} aria-busy={exporting} onclick={exportCsv}>{exporting ? t("ledger.saving") : t("ledger.exportCsv")}</button>
                <button class="b3-button b3-button--outline" title={t("ledger.exportArchiveTip")}
                    disabled={filteredRows.length === 0 || exporting || printing} aria-busy={exporting} onclick={exportArchiveManifest}>{t("ledger.exportArchive")}</button>
                <button class="b3-button b3-button--outline" title={t("ledger.printLabels")}
                    disabled={filteredRows.length === 0 || printing || exporting} aria-busy={printing} onclick={printLabels}>{printing ? t("ledger.saving") : t("ledger.printLabels")}</button>
                {#if active === "vehicles"}<button class="b3-button b3-button--outline" onclick={openEnergyDashboard}>{t("fuel.dashboardButton")}</button>{/if}
                {#if active === "parenting"}
                    <button class="b3-button b3-button--outline" onclick={openGrowthChart}>{t("ledger.growthChart")}</button>
                    <button class="b3-button b3-button--outline" onclick={openVaccineScheduleModal}>{t("ledger.vaccineSchedule")}</button>
                {/if}
                {#if active === "stock"}<button class="b3-button b3-button--outline" onclick={openShoppingList}>{t("ledger.shoppingList")}</button>{/if}
                {#if active === "stock"}<button class="b3-button b3-button--outline" onclick={openEmergencyKitModal}>{t("ledger.emergencyKit")}</button>{/if}
                {#if active === "shopping"}<button class="b3-button b3-button--outline" onclick={openStoreModeModal}>{t("ledger.storeMode")}</button>{/if}
                <button class="b3-button b3-button--outline" onclick={openLocationIndexModal}>{t("ledger.locSearch")}</button>
                <button class="b3-button b3-button--outline" onclick={openBlockIngestModal}>{t("capture.ingestAction")}</button>
                {#if ref?.columns?.amount}<button class="b3-button b3-button--outline" onclick={openExpenseTrendModal}>{t("ledger.expenseTrend")}</button>{/if}
                {#if active === "favors"}<button class="b3-button b3-button--outline" onclick={openFavorsReport}>{t("ledger.favorsReport")}</button>{/if}
                {#if active === "bookmarks"}<button class="b3-button b3-button--outline" onclick={openBookmarksCheck}>{t("ledger.checkBookmarks")}</button>{/if}
                {#if active === "memberships"}<button class="b3-button b3-button--outline" onclick={openSubscriptionStats}>{t("ledger.subscriptionStats")}</button>{/if}
                {#if active === "assets-real"}<button class="b3-button b3-button--outline" onclick={openAssetValuationModal}>{t("ledger.assetValuationReport")}</button>{/if}
                {#if active === "media"}<button class="b3-button b3-button--outline" onclick={openMediaReport}>{t("ledger.mediaReport")}</button>{/if}
                {#if active === "food"}<button class="b3-button b3-button--outline" onclick={openMealPlanModal}>{t("ledger.mealPlan")}</button>{/if}
                {#if active === "medicine"}<button class="b3-button b3-button--outline" onclick={openMedicineSupplyModal}>{t("ledger.medicineSupply")}</button>{/if}
                {#if active === "house"}<button class="b3-button b3-button--outline" onclick={openUtilityTiersModal}>{t("ledger.utilityTiers")}</button>{/if}
                {#if active === "house" || active === "chores"}<button class="b3-button b3-button--outline" onclick={openWasteScheduleModal}>{t("ledger.wasteSchedule")}</button>{/if}
                {#if active === "chores"}<button class="b3-button b3-button--outline" onclick={openRewardsLedgerModal}>{t("ledger.rewardsSettle")}</button>{/if}
                {#if active !== "members" && active !== "adhoc"}<button class="b3-button b3-button--outline" disabled={printing || exporting} onclick={openCsvImport}>{t("ledger.importCsv")}</button>{/if}
                <button class="b3-button b3-button--outline" disabled={!ref?.docId}
                    onclick={() => plugin.showTabDocs(ref?.docId)}>{t("ledger.openDoc")} →</button>
            </div>
        </details>
    {/if}
</div>

{#if (memberCol && (plugin.settings.members?.length ?? 0) > 0) || (categoryCol && availableCategories.length > 0)}
    <div class="lv-filter-bar" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 10px;font-size:11.5px">
        {#if memberCol && (plugin.settings.members?.length ?? 0) > 0}
            <div style="display:inline-flex;gap:3px;align-items:center;padding:2px 6px;background:var(--lv-surface-2);border-radius:12px;border:1px solid var(--lv-line)">
                <span class="lv-caption" style="font-size:11px;margin-right:2px">👤</span>
                <button type="button" class="lv-preset-tag" class:active={!filterMemberId} onclick={() => { filterMemberId = ""; }}>{t("ledger.allMembers")}</button>
                {#each plugin.settings.members ?? [] as m (m.id)}
                    {#if m.avItemId}
                        <button type="button" class="lv-preset-tag" class:active={filterMemberId === m.avItemId} onclick={() => { filterMemberId = filterMemberId === m.avItemId ? "" : m.avItemId; }}>
                            {m.name}
                        </button>
                    {/if}
                {/each}
            </div>
        {/if}
        {#if categoryCol && availableCategories.length > 0}
            <div style="display:inline-flex;gap:3px;align-items:center;padding:2px 6px;background:var(--lv-surface-2);border-radius:12px;border:1px solid var(--lv-line)">
                <span class="lv-caption" style="font-size:11px;margin-right:2px">🏷️</span>
                <button type="button" class="lv-preset-tag" class:active={!filterCategory} onclick={() => { filterCategory = ""; }}>{t("ledger.allCategories")}</button>
                {#each availableCategories as catVal (catVal)}
                    <button type="button" class="lv-preset-tag" class:active={filterCategory === catVal} onclick={() => { filterCategory = filterCategory === catVal ? "" : catVal; }}>
                        {optLabel(t, "category", catVal)}
                    </button>
                {/each}
            </div>
        {/if}
    </div>
{/if}

{#if savedModule}
    <div class="lv-record-save-status" role="status">
        {t("ledger.newRecordSaved").replace("${name}", savedRecordName)} · {t("ledger.savedTo").replace("${module}", t(`module.${savedModule}`) !== `module.${savedModule}` ? t(`module.${savedModule}`) : savedModule)}
        <button class="b3-button b3-button--text" onclick={() => plugin.showTabDocs(savedDocId || undefined)}>{t("ledger.openDoc")} →</button>
    </div>
{/if}

<div class="lv-mask" class:open={newRecordOpen} aria-hidden="true" onclick={closeNewRecord}></div>
<svelte:window onkeydown={onNewRecordKeydown} />
<div class="lv-modal lv-record-modal" class:open={newRecordOpen} role="dialog" aria-modal="true" aria-labelledby="lv-new-record-title" aria-busy={saving || duplicateConfirmPending} tabindex="-1" inert={!newRecordOpen || duplicateConfirmPending}>
    <div class="lv-sheet lv-record-sheet">
        <div class="lv-sheet-head">
            <div class="lv-record-title">
                <b id="lv-new-record-title">{t("ledger.newRecordTitle").replace("${module}", t(`module.${active}`) !== `module.${active}` ? t(`module.${active}`) : active)}</b>
                <span>{t("ledger.newRecordIntro")}</span>
            </div>
            <button class="lv-iconbtn" aria-label={t("ledger.closeKeepDraft")} title={t("ledger.closeKeepDraft")} onclick={closeNewRecord} disabled={saving}><UiIcon name="close" size={16} /></button>
        </div>
        <div class="lv-sheet-body lv-record-body">
            <section class="lv-record-section">
                <h3>{t("ledger.newRecordBasic")}</h3>
                {#if currentLedgerTemplates.length > 0}
                    <div class="lv-template-bar" style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;padding:6px 10px;background:var(--lv-surface-2);border-radius:6px;font-size:11.5px;margin-bottom:12px">
                        <span class="lv-caption" style="color:var(--lv-tx-3);font-size:11px">✨ {t("capture.frequentTemplates")}:</span>
                        {#each currentLedgerTemplates as tpl (tpl.id)}
                            <button type="button" class="lv-preset-tag" onclick={() => applyLedgerTemplate(tpl)} disabled={saving} style="font-size:11.5px;padding:2px 8px">
                                {#if tpl.icon}<span>{tpl.icon}</span>{/if}
                                <span>{tpl.label}</span>
                            </button>
                        {/each}
                    </div>
                {/if}
                <div class="lv-record-grid">
                    {#each captureCols as e (e.key)}
                        <div class="lv-record-field" class:lv-record-field-wide={e.key === "name" || e.type === "url"}>
                            {#if e.type !== "checkbox"}<label for="lv-new-{e.key}">{fieldLabel(e.key)}{e.required || (active === "certs" && e.key === "category") ? " *" : ""}</label>{/if}
                            {#if e.type === "select"}
                                <select id="lv-new-{e.key}" class="b3-select" bind:value={form[e.key]} onfocus={active === "certs" && e.key === "category" ? () => { lastCertificateCategory = String(form.category ?? ""); } : undefined} onchange={active === "certs" && e.key === "category" ? (event) => handleCertificateCategoryChange((event.currentTarget as HTMLSelectElement).value) : undefined} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined}>
                                    <option value="">{fieldLabel(e.key)}</option>
                                    {#each e.options ?? [] as opt (opt)}
                                        <option value={opt}>{t(`field.${e.key}.opt.${opt}`) !== `field.${e.key}.opt.${opt}` ? t(`field.${e.key}.opt.${opt}`) : opt}</option>
                                    {/each}
                                </select>
                            {:else if e.type === "relation"}
                                <select id="lv-new-{e.key}" class="b3-select" bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined}>
                                    <option value="">{fieldLabel(e.key)}: {t("members.all")}</option>
                                    {#each plugin.settings.members ?? [] as m (m.avItemId ?? m.id)}
                                        <option value={m.avItemId ?? ""} disabled={!m.avItemId}>{m.name}{m.avItemId ? "" : ` · ${t("members.notLinked")}`}</option>
                                    {/each}
                                </select>
                            {:else if e.type === "date"}
                                <input id="lv-new-{e.key}" class="b3-text-field" type="date" bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined} />
                                <div class="lv-preset-tags">
                                    <button type="button" class="lv-preset-tag" onclick={() => { const d = new Date(); form[e.key] = localDateKey(d); }}>{t("capture.presetToday")}</button>
                                    <button type="button" class="lv-preset-tag" onclick={() => { const d = new Date(); d.setDate(d.getDate() + 1); form[e.key] = localDateKey(d); }}>{t("capture.presetTomorrow")}</button>
                                    <button type="button" class="lv-preset-tag" onclick={() => { const d = new Date(); d.setDate(d.getDate() + 7); form[e.key] = localDateKey(d); }}>{t("capture.presetNextWeek")}</button>
                                    <button type="button" class="lv-preset-tag" onclick={() => { const d = new Date(); d.setDate(d.getDate() + 30); form[e.key] = localDateKey(d); }}>{t("capture.presetNextMonth")}</button>
                                    <button type="button" class="lv-preset-tag" onclick={() => { const d = new Date(); d.setDate(d.getDate() + 365); form[e.key] = localDateKey(d); }}>{t("capture.presetNextYear")}</button>
                                </div>
                            {:else if e.type === "number"}
                                <input id="lv-new-{e.key}" class="b3-text-field" type="number" min={e.min} max={e.max} step={e.step ?? "any"} placeholder={fieldMetaText(e.placeholderKey) || fieldLabel(e.key)} bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined} />
                            {:else if e.type === "url"}
                                <input id="lv-new-{e.key}" class="b3-text-field" type="url" placeholder={fieldMetaText(e.placeholderKey) || fieldLabel(e.key)} bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined} />
                            {:else if e.type === "checkbox"}
                                <label class="lv-record-check"><input id="lv-new-{e.key}" type="checkbox" class="b3-switch" bind:checked={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined} />{fieldLabel(e.key)}{e.required ? " *" : ""}</label>
                            {:else if e.key === "name"}
                                <input bind:this={nameInput} id="lv-new-{e.key}" class="b3-text-field" type="text" placeholder={fieldMetaText(e.placeholderKey) || t("ledger.newName")} bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined} onkeydown={(event: KeyboardEvent) => { if (event.key === "Enter" && !event.isComposing) saveNewRecord(false); }} />
                            {:else if ["note", "violations", "diagnosis"].includes(e.key)}
                                <textarea id="lv-new-{e.key}" class="b3-text-field lv-record-textarea" rows="3" placeholder={fieldMetaText(e.placeholderKey) || fieldLabel(e.key)} bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined}></textarea>
                            {:else}
                                <input id="lv-new-{e.key}" class="b3-text-field" type="text" list={columnSuggestions[e.key] ? `lv-datalist-${e.key}` : undefined} placeholder={fieldMetaText(e.placeholderKey) || fieldLabel(e.key)} bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined} />
                                {#if columnSuggestions[e.key]}
                                    <datalist id="lv-datalist-{e.key}">
                                        {#each columnSuggestions[e.key] as suggestion (suggestion)}
                                            <option value={suggestion}></option>
                                        {/each}
                                    </datalist>
                                {/if}
                                {#if e.key === "location" || e.key === "store_place" || e.key === "copy_location"}
                                    <div class="lv-preset-tags">
                                        {#each dynamicLocations as loc (loc)}
                                            <button type="button" class="lv-preset-tag" onclick={() => { form[e.key] = loc; }}>{loc}</button>
                                        {/each}
                                    </div>
                                {/if}
                            {/if}
                            {#if fieldMetaText(e.helpKey) || fieldMetaText(e.unitKey)}
                                <small class="lv-capture-field-hint">
                                    {fieldMetaText(e.helpKey)}{#if fieldMetaText(e.helpKey) && fieldMetaText(e.unitKey)} · {/if}{#if fieldMetaText(e.unitKey)}{t("capture.unitLabel")}：{fieldMetaText(e.unitKey)}{/if}
                                </small>
                            {/if}
                            {#if formFieldError(e)}<small class="lv-record-field-error" id="lv-new-{e.key}-error" role="alert">{formFieldError(e)}</small>{/if}
                        </div>
                    {/each}
                </div>
            </section>

            {#if additionalCols.length > 0}
                <details class="lv-record-more">
                    <summary>{t("ledger.additionalFields")} <span>{additionalCols.length}</span></summary>
                    <section class="lv-record-section lv-record-section--nested">
                        <div class="lv-record-grid">
                            {#each additionalCols as e (e.key)}
                                <div class="lv-record-field" class:lv-record-field-wide={e.key === "name" || e.type === "url" || ["note", "violations", "diagnosis"].includes(e.key)}>
                                    {#if e.type !== "checkbox"}<label for="lv-new-{e.key}">{fieldLabel(e.key)}{e.required ? " *" : ""}</label>{/if}
                                    {#if e.type === "select"}
                                        <select id="lv-new-{e.key}" class="b3-select" bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined}>
                                            <option value="">{fieldLabel(e.key)}</option>
                                            {#each e.options ?? [] as opt (opt)}<option value={opt}>{t(`field.${e.key}.opt.${opt}`) !== `field.${e.key}.opt.${opt}` ? t(`field.${e.key}.opt.${opt}`) : opt}</option>{/each}
                                        </select>
                                    {:else if e.type === "relation"}
                                        <select id="lv-new-{e.key}" class="b3-select" bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined}>
                                            <option value="">{fieldLabel(e.key)}: {t("members.all")}</option>
                                            {#each plugin.settings.members ?? [] as m (m.avItemId ?? m.id)}<option value={m.avItemId ?? ""} disabled={!m.avItemId}>{m.name}{m.avItemId ? "" : ` · ${t("members.notLinked")}`}</option>{/each}
                                        </select>
                                    {:else if e.type === "date"}
                                        <input id="lv-new-{e.key}" class="b3-text-field" type="date" bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined} />
                                    {:else if e.type === "number"}
                                        <input id="lv-new-{e.key}" class="b3-text-field" type="number" min={e.min} max={e.max} step={e.step ?? "any"} placeholder={fieldMetaText(e.placeholderKey) || fieldLabel(e.key)} bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined} />
                                    {:else if e.type === "url"}
                                        <input id="lv-new-{e.key}" class="b3-text-field" type="url" placeholder={fieldMetaText(e.placeholderKey) || fieldLabel(e.key)} bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined} />
                                    {:else if e.type === "checkbox"}
                                        <label class="lv-record-check"><input id="lv-new-{e.key}" type="checkbox" class="b3-switch" bind:checked={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined} />{fieldLabel(e.key)}{e.required ? " *" : ""}</label>
                                    {:else if ["note", "violations", "diagnosis"].includes(e.key)}
                                        <textarea id="lv-new-{e.key}" class="b3-text-field lv-record-textarea" rows="3" placeholder={fieldMetaText(e.placeholderKey) || fieldLabel(e.key)} bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined}></textarea>
                                    {:else}
                                        <input id="lv-new-{e.key}" class="b3-text-field" type="text" placeholder={fieldMetaText(e.placeholderKey) || fieldLabel(e.key)} bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined} />
                                    {/if}
                                    {#if fieldMetaText(e.helpKey) || fieldMetaText(e.unitKey)}<small class="lv-capture-field-hint">{fieldMetaText(e.helpKey)}{#if fieldMetaText(e.helpKey) && fieldMetaText(e.unitKey)} · {/if}{#if fieldMetaText(e.unitKey)}{t("capture.unitLabel")}：{fieldMetaText(e.unitKey)}{/if}</small>{/if}
                                    {#if formFieldError(e)}<small class="lv-record-field-error" id="lv-new-{e.key}-error" role="alert">{formFieldError(e)}</small>{/if}
                                </div>
                            {/each}
                        </div>
                    </section>
                </details>
            {/if}

            {#if active === "certs"}
                {#if !form.category}
                    <div class="lv-record-next" role="status">{t("ledger.chooseCategoryFirst")}</div>
                {:else}
                    <section class="lv-record-section">
                        <h3>{t("ledger.newRecordDetails")}</h3>
                        <div class="lv-record-grid">
                            {#each certificateScalarCols as e (e.key)}
                                <div class="lv-record-field" class:lv-record-field-wide={e.key === "x_cert_id_number" || e.key === "note"}>
                                    <label for="lv-new-{e.key}">{fieldLabel(e.key)}</label>
                                    {#if e.type === "select"}
                                        <select id="lv-new-{e.key}" class="b3-select" bind:value={form[e.key]} disabled={saving || identityPending}>
                                            <option value="">{fieldLabel(e.key)}</option>
                                            {#each e.options ?? [] as opt (opt)}<option value={opt}>{t(`field.${e.key}.opt.${opt}`) !== `field.${e.key}.opt.${opt}` ? t(`field.${e.key}.opt.${opt}`) : opt}</option>{/each}
                                        </select>
                                    {:else if e.type === "date"}
                                        <input id="lv-new-{e.key}" class="b3-text-field" type="date" bind:value={form[e.key]} disabled={saving || identityPending} />
                                    {:else if e.key === "x_cert_id_number"}
                                        <div class="lv-record-field-stack">
                                            <input id="lv-new-{e.key}" class="b3-text-field lv-sensitive-input" type="text" inputmode="numeric" autocomplete="off" placeholder={fieldLabel(e.key)} bind:value={form[e.key]} disabled={saving || identityPending} />
                                            {#if idcardCheck}
                                                {#if idcardCheck.ok}<span class="lv-caption lv-valid" role="status">{t("ledger.idcardValid").replace("${birth}", idcardCheck.birth ?? "").replace("${sex}", t(`ledger.idcardGender.${idcardCheck.sex}`))}</span>
                                                {:else}<span class="lv-caption lv-warn" role="alert">{t("ledger.idcardBad").replace("${reason}", t(`ledger.idcardReason.${idcardCheck.reason ?? "format"}`))}</span>{/if}
                                            {/if}
                                        </div>
                                    {:else}
                                        <input id="lv-new-{e.key}" class="b3-text-field" type="text" placeholder={fieldLabel(e.key)} bind:value={form[e.key]} disabled={saving || identityPending} />
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </section>
                    {#if quickAssetCols.length > 0}
                        <section class="lv-record-section">
                            <h3>{t("ledger.newRecordAttachments")}</h3>
                            <div class="lv-record-assets">
                                {#each quickAssetCols as e (e.key)}
                                    <label class="b3-button b3-button--outline lv-record-upload">
                                        <input type="file" accept="image/*,.pdf" multiple={e.key === "attachments"} capture={e.key === "attachments" ? undefined : "environment"} aria-label={fieldLabel(e.key)} onchange={(event) => { const input = event.currentTarget as HTMLInputElement; setCertificateFiles(e.key, Array.from(input.files ?? [])); input.value = ""; }} disabled={saving || identityPending} />
                                        {fieldLabel(e.key)} · {selectedFileText(e.key)}
                                    </label>
                                    {#each certificateFiles[e.key] ?? [] as file, index (`${e.key}-local-${index}`)}
                                        <span class="lv-record-file">{file.name}<button class="b3-button b3-button--text" aria-label={t("ledger.removeAttachment")} title={t("ledger.removeAttachment")} onclick={() => removeCertificateFile(e.key, "local", index)} disabled={saving}>×</button></span>
                                    {/each}
                                    {#each uploadedCertificateFiles[e.key] ?? [] as file, index (`${e.key}-uploaded-${index}`)}
                                        <span class="lv-record-file">{file.name}<button class="b3-button b3-button--text" aria-label={t("ledger.removeAttachment")} title={t("ledger.removeAttachment")} onclick={() => removeCertificateFile(e.key, "uploaded", index)} disabled={saving}>×</button></span>
                                    {/each}
                                {/each}
                                <span class="lv-caption">{t("ledger.photoUploadTip")}</span>
                            </div>
                        </section>
                    {/if}
                {/if}
            {/if}
            {#if active === "vehicles" && quickAssetCols.length > 0}
                <section class="lv-record-section">
                    <h3>{t("vehicle.photoTitle")}</h3>
                    <div class="lv-record-assets">
                        {#each quickAssetCols as e (e.key)}
                            <label class="b3-button b3-button--outline lv-record-upload">
                                <input type="file" accept="image/*" multiple={false} aria-label={t("vehicle.photoTitle")} onchange={(event) => { const input = event.currentTarget as HTMLInputElement; setCertificateFiles(e.key, Array.from(input.files ?? [])); input.value = ""; }} disabled={saving || identityPending} />
                                {t("vehicle.photoChoose")} · {selectedFileText(e.key)}
                            </label>
                            {#each certificateFiles[e.key] ?? [] as file, index (`vehicle-photo-local-${index}`)}
                                <span class="lv-record-file">{file.name}<button class="b3-button b3-button--text" aria-label={t("ledger.removeAttachment")} title={t("ledger.removeAttachment")} onclick={() => removeCertificateFile(e.key, "local", index)} disabled={saving}>×</button></span>
                            {/each}
                        {/each}
                        <span class="lv-caption">{t("vehicle.photoHint")}</span>
                    </div>
                </section>
            {/if}
            {#if active !== "certs" && active !== "vehicles" && quickAssetCols.length > 0}
                <section class="lv-record-section">
                    <h3>{t("ledger.newRecordAttachments")}</h3>
                    <div class="lv-record-assets">
                        {#each quickAssetCols as e (e.key)}
                            <label class="b3-button b3-button--outline lv-record-upload">
                                <input type="file" accept="image/*,.pdf" multiple aria-label={fieldLabel(e.key)} onchange={(event) => { const input = event.currentTarget as HTMLInputElement; setCertificateFiles(e.key, Array.from(input.files ?? [])); input.value = ""; }} disabled={saving || identityPending} />
                                {fieldLabel(e.key)} · {selectedFileText(e.key)}
                            </label>
                            {#each certificateFiles[e.key] ?? [] as file, index (`generic-asset-local-${e.key}-${index}`)}
                                <span class="lv-record-file">{file.name}<button class="b3-button b3-button--text" aria-label={t("ledger.removeAttachment")} title={t("ledger.removeAttachment")} onclick={() => removeCertificateFile(e.key, "local", index)} disabled={saving}>×</button></span>
                            {/each}
                            {#each uploadedCertificateFiles[e.key] ?? [] as file, index (`generic-asset-uploaded-${e.key}-${index}`)}
                                <span class="lv-record-file">{file.name}<button class="b3-button b3-button--text" aria-label={t("ledger.removeAttachment")} title={t("ledger.removeAttachment")} onclick={() => removeCertificateFile(e.key, "uploaded", index)} disabled={saving}>×</button></span>
                            {/each}
                        {/each}
                        <span class="lv-caption">{t("ledger.photoUploadTip")}</span>
                    </div>
                </section>
            {/if}
            {#if unsupportedCount > 0}
                <div class="lv-record-next" role="note">
                    <span>{t("ledger.unsupportedInForm").replace("${fields}", unsupportedCols.map((field) => fieldLabel(field.key)).join("、"))}</span>
                    <button class="b3-button b3-button--outline" onclick={() => plugin.showTabDocs(ref?.docId)} disabled={!ref?.docId}>{t("ledger.openDoc")} →</button>
                </div>
            {/if}
            {#if saveError}<div class="lv-record-error" role="alert">{saveError}</div>{:else if nameMissing}<div class="lv-record-error lv-record-warning" role="status">{t("ledger.nameRequired")}</div>{:else if active === "certs" && !form.category}<div class="lv-record-error lv-record-warning" role="status">{t("ledger.categoryRequired")}</div>{/if}
        </div>
        <div class="lv-sheet-foot lv-record-foot">
            {#if identityPending}
                <button class="lv-btn ghost" onclick={openPendingLedger}>{t("ledger.checkPending")}</button>
                {#if identityChecked}<button class="lv-btn ghost" onclick={discardUncertainDraft}>{t("ledger.discardUncertain")}</button>{/if}
            {/if}
            <button class="b3-button b3-button--text" onclick={clearNewRecord} disabled={saving || identityPending}>{pendingItemID ? t("ledger.discardPartial") : t("ledger.clearDraft")}</button>
            <span class="fn__flex-1"></span>
            <button class="lv-btn" onclick={() => saveNewRecord(true)} disabled={saving || identityPending || nameMissing || (active === "certs" && !form.category)}>{t("ledger.saveContinue")}</button>
            <button class="lv-btn primary" onclick={() => saveNewRecord(false)} disabled={saving || identityPending || nameMissing || (active === "certs" && !form.category)}>{saving ? t("ledger.saving") : t("save")}</button>
        </div>
    </div>
</div>

{#if loading}
    <div class="lv-card" style="padding:20px"><div class="lv-skel" style="height:16px;width:60%"></div></div>
{:else if loadError}
    <div class="lv-card"><div class="lv-empty" role="alert"><div class="eic"><UiIcon name="alert" size={22} /></div><b>{loadError}</b>
        <button class="b3-button b3-button--outline" onclick={() => void load()}>{t("ledger.retryRead")}</button>
    </div></div>
{:else if filteredRows.length === 0}
    {#if ledgers.length === 0}
        <div class="lv-card"><div class="lv-empty" role="status"><div class="eic"><UiIcon name="settings" size={22} /></div><b>{t("ledger.noEnabledModules")}</b><span>{t("ledger.noEnabledModulesHint")}</span>
            <button class="lv-btn primary" style="margin-top:4px" onclick={() => plugin.openSetting()}>{t("startGuide.openSettings")}</button>
        </div></div>
    {:else if !ref?.avId}
        <div class="lv-card"><div class="lv-empty" role="status"><div class="eic"><UiIcon name="archive" size={22} /></div><b>{t("ledger.notProvisioned")}</b><span>{t("ledger.notProvisionedHint")}</span></div></div>
    {:else if rows.length > 0}
        <!-- Empty state for a search with no matches. -->
        <div class="lv-card"><div class="lv-empty" role="status"><div class="eic"><UiIcon name="search" size={22} /></div><b>{t("ledger.searchEmpty")}</b><span>{t("ledger.searchEmptyHint").replace("${q}", searchText.trim())}</span></div></div>
    {:else}
        <div class="lv-card"><div class="lv-empty" role="status"><div class="eic"><UiIcon name="folder" size={22} /></div><b>{t("ledger.empty")}</b><span>{t("ledger.emptyHint")}</span>
            <button class="lv-btn primary" style="margin-top:4px" onclick={openNewRecord} disabled={rebuilding}>+ {t("ledger.newRecord")}</button>
        </div></div>
    {/if}
{:else if active === "vehicles"}
    <div class="lv-vehicle-grid" aria-label={t("module.vehicles")}>
        {#each visibleRows as r (r.itemID)}
            {@const tone = ledgerTone(r)}
            {@const photo = vehicleImageHref(r)}
            <article class="lv-vehicle-card lv-card" role="group">
                <div class="lv-vehicle-photo">
                    {#if photo}<img src={photo} alt={vehicleText(r, "name")} width="96" height="72" decoding="async" loading="lazy" />{:else}<UiIcon name="car" size={28} />{/if}
                </div>
                <div class="lv-vehicle-main">
                    <div class="lv-vehicle-head">
                        <button type="button" class="lv-vehicle-title" onclick={() => openDetail(r)} aria-label={`${t("ledger.detail")}：${vehicleText(r, "name")}`}>
                            {vehicleText(r, "name")}
                        </button>
                        <span class="lv-sev {toneCls(tone)}" title={tone === "danger" ? t("level.overdue") : tone === "warn" ? t("level.soon") : ""}></span>
                    </div>
                    <div class="lv-vehicle-sub">{vehicleText(r, "brand_model")} · {vehicleText(r, "plate")}</div>
                    <div class="lv-vehicle-meta">
                        <span>{vehicleText(r, "energy_type")}</span>
                        <span>{vehicleText(r, "mileage")} {t("fuel.km")}</span>
                        <span>{t("field.inspection_due")} · {vehicleText(r, "inspection_due")}</span>
                        <span>{t("field.insurance_due")} · {vehicleText(r, "insurance_due")}</span>
                    </div>
                    <div class="lv-vehicle-actions">
                        <button class="b3-button b3-button--outline" onclick={(e) => { e.stopPropagation(); openDetail(r, "fuel"); }}>{t("vehicle.quick.fuel")}</button>
                        <button class="b3-button b3-button--outline" onclick={(e) => { e.stopPropagation(); openDetail(r, "charging"); }}>{t("vehicle.quick.charging")}</button>
                        <button class="b3-button b3-button--outline" onclick={(e) => { e.stopPropagation(); openDetail(r, "maintenance"); }}>{t("vehicle.quick.maintenance")}</button>
                        <button class="b3-button b3-button--text" onclick={(e) => { e.stopPropagation(); openDetail(r, "edit"); }}>{t("members.edit")}</button>
                    </div>
                </div>
            </article>
        {/each}
        {#if filteredRows.length > visibleRows.length}
            <button class="b3-button b3-button--outline lv-vehicle-more" onclick={() => (renderLimit += RENDER_PAGE)}>{t("ledger.loadMore").replace("${n}", String(filteredRows.length - visibleRows.length))}</button>
        {/if}
    </div>
{:else}
    <div class="lv-card lv-table-wrap lv-table" class:lv-table--compact={tableDensity === "compact"} style="margin-top:12px">
        <table bind:this={ledgerTableEl}>
            <thead><tr>
                <th style="width:36px;padding:4px 6px;text-align:center">
                    <input type="checkbox" class="b3-switch" style="transform:scale(0.8);margin:0" checked={allSelected} onclick={toggleSelectAll} title="全选/取消全选" />
                </th>
                <!-- Severity indicator column. -->
                <th class="lv-sev-col"></th>
                {#each tableKeys as k (k)}
                    <th>
                        <button class="b3-button b3-button--text" style="padding:0 2px;font-weight:600" title={t("ledger.sortTip")}
                            onclick={() => toggleSort(k)}>
                            {fieldLabel(k)}{sortKey === k ? (sortAsc ? " ↑" : " ↓") : ""}
                        </button>
                    </th>
                {/each}
            </tr></thead>
            <tbody>
                {#if virtualRange.start > 0}
                    <tr class="lv-virtual-spacer" aria-hidden="true"><td colspan={tableKeys.length + 2} style={`height:${virtualRange.start * virtualRowHeight}px`}></td></tr>
                {/if}
                {#each virtualRows as r (r.itemID)}
                    {@const tone = ledgerTone(r)}
                    {@const rowName = cellText(r.cells[ref.columns.name], "name") || cellText(r.cells[ref.columns.title], "title") || t("ledger.detail")}
                    <tr class="lv-row-link" onclick={() => openDetail(r)} title={t("ledger.detail")}>
                        <td style="width:36px;padding:4px 6px;text-align:center" onclick={(e) => e.stopPropagation()}>
                            <input type="checkbox" class="b3-switch" style="transform:scale(0.8);margin:0" checked={selectedItemIds.includes(r.itemID)} onclick={() => toggleRowSelect(r.itemID)} />
                        </td>
                        <td class="lv-sev-cell">
                            <button type="button" class="lv-table-open" aria-label={`${t("ledger.detail")}：${rowName}`} title={t("ledger.detail")}
                                onclick={(e) => { e.stopPropagation(); openDetail(r); }}>
                                <span class="lv-sev {toneCls(tone)}" aria-hidden="true"></span><UiIcon name="forward" size={14} />
                            </button>
                        </td>
                        {#each tableKeys as k (k)}
                            {@const v = r.cells[ref.columns[k]]}
                            <td class="lv-num" style={k === "expiry" || k === "due" ? `color:${toneColor(tone)}` : ""}>
                                {#if k === "qty" || k === "stock_qty"}
                                    <div style="display:inline-flex;align-items:center;gap:4px">
                                        <button type="button" class="b3-button b3-button--text" style="padding:0 3px;font-size:11px;min-height:0;line-height:1"
                                            title={t("ledger.quickDec")} onclick={(e) => { e.stopPropagation(); adjustRowQty(r, k, -1); }}>－</button>
                                        <span>{cellText(v, k)}</span>
                                        <button type="button" class="b3-button b3-button--text" style="padding:0 3px;font-size:11px;min-height:0;line-height:1"
                                            title={t("ledger.quickInc")} onclick={(e) => { e.stopPropagation(); adjustRowQty(r, k, 1); }}>＋</button>
                                    </div>
                                {:else}
                                    {cellText(v, k)}
                                {/if}
                            </td>
                        {/each}
                    </tr>
                {/each}
                {#if virtualRange.end < visibleRows.length}
                    <tr class="lv-virtual-spacer" aria-hidden="true"><td colspan={tableKeys.length + 2} style={`height:${(visibleRows.length - virtualRange.end) * virtualRowHeight}px`}></td></tr>
                {/if}
                {#if filteredRows.length > visibleRows.length}
                    <!-- Progressive rendering load-more row. -->
                    <tr class="lv-more">
                        <td colspan={tableKeys.length + 2}>
                            <button class="b3-button b3-button--outline" style="margin:0 auto;display:block"
                                onclick={() => (renderLimit += RENDER_PAGE)}>
                                {t("ledger.loadMore").replace("${n}", String(filteredRows.length - visibleRows.length))}
                            </button>
                        </td>
                    </tr>
                {/if}
            </tbody>
        </table>
    </div>
    {#if selectedItemIds.length > 0}
        <div class="lv-batch-bar" role="toolbar" aria-label="批量操作">
            <span class="lv-caption" style="font-weight:600;color:var(--lv-tx)">
                {t("ledger.batchSelected").replace("${n}", String(selectedItemIds.length))}
            </span>
            {#if ref?.columns?.location}
                <button type="button" class="b3-button b3-button--outline" style="font-size:12px;padding:3px 10px" onclick={openBatchLocationModal}>
                    📍 {t("ledger.batchLocation")}
                </button>
            {/if}
            <button type="button" class="b3-button b3-button--text ft__error" style="font-size:12px;padding:3px 10px;color:var(--b3-theme-error)" onclick={batchDelete}>
                🗑️ {t("ledger.batchDelete")}
            </button>
            <button type="button" class="b3-button b3-button--text" style="font-size:12px;padding:3px 6px" onclick={() => { selectedItemIds = []; }} title={t("close")}>
                ✕
            </button>
        </div>
    {/if}
{/if}
