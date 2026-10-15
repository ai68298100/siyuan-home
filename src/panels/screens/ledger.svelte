<script lang="ts">
    import { renderLedgerAll, addDetachedRow, setCell, RowIdentityPendingError, isKernelError, getOCRConfig, getImageOCRText, recognizeAsset } from "@/core/siyuan";
    import { generateQRDataUrl, blockDeepLink } from "@/core/qr";
    import { AMOUNT_KEYS, formatAmount, optLabel, optLabelText } from "@/core/format";
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
    import { assetHref, downloadAsset, isImageAsset, isEncryptedNotebookAsset, isPdfAsset, isDangerousAsset } from "@/core/assets";
    import { calculateEnergyStats, type EnergyKind, type EnergyRecord } from "@/core/fuel";
    import { calculateMaintenanceStats, calculateVehicleCostSummary, createVehicleActionQueue, type MaintenanceRecord, type VehicleQuickAction } from "@/core/vehicle";
    import { loadRowLogs, updateRowLogs, getEntries, appendEntry, removeEntry } from "@/core/rowlog";
    import type { LogKind } from "@/core/rowlog";
    import { rowLogActivityId, type ActivityTarget } from "@/core/activity";
    import { onDestroy } from "svelte";
    import UiIcon from "@/ui/icon.svelte";
    import { panelSession } from "../panel-session";
    import { openGrowthModal } from "../ledger/growth-modal";
    import { openShoppingModal } from "../ledger/shopping-modal";
    import { openCsvModal } from "../ledger/csv-modal";
    import { openEnergyDashboardModal } from "../ledger/vehicle-dashboard-modal";
    import { calculateMembershipSpending } from "@/core/memberships";
    import { buildPaymentSummary } from "@/core/payment-summary";
    import { calculateMedicineSummary, formatMedicineRestockText } from "@/core/medicine";
    import { calculateRetirement, type RetirementWorkerType } from "@/core/retirement";
    import { formatDesensitizedRecord } from "@/core/desensitize";
    import { batchReassignMember } from "@/core/members";
    import { matchWarrantyContracts, type ContractCandidate } from "@/core/warranty";
    import { calculateSolidsObservation, buildAllergyFromFeeding } from "@/core/solids";
    import { calculateFavorsSummary, formatFavorsReportText, type FavorRow } from "@/core/favors";
    import { buildAssetFromShopping } from "@/core/shopping-asset";
    import { calculateAssetValuation, type AssetRowData, type ValuationLogEntry } from "@/core/assets-valuation";
    import { checkAllergyConflicts, type FamilyAllergy } from "@/core/allergy-check";
    import { calculateSchoolingMilestones, type SchoolingRowData } from "@/core/schooling";
    import { calculateMediaSummary, type MediaRowData } from "@/core/media";
    import { calculatePetCareSummary, type PetRowData } from "@/core/pets";
    import { calculateImmunizationSchedule, type RecordedVaccineRow } from "@/core/immunization";
    import { evaluateTravelCertsCheck, type TravelPlanContext, type CandidateCert } from "@/core/travel-certs";
    import { getAllowedStatusTransitions } from "@/core/asset-lifecycle";
    import { escapeHtml, escapeAttr } from "@/core/escape";

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
    let density = $state<"comfortable" | "compact">(panelMemory.ledgerDensity ?? "comfortable");

    function toggleDensity() {
        density = density === "comfortable" ? "compact" : "comfortable";
        panelMemory.ledgerDensity = density;
    }
    onDestroy(() => {
        loadRequest++;
        loadController?.abort();
        loadController = undefined;
        if (plugin.pendingActivityTarget?.moduleId === active) plugin.pendingActivityTarget = undefined;
    });

    // Settings can disable the currently open module while this screen stays
    // mounted. Keep the selector and form aligned with the enabled set instead
    // of leaving the user on a blank, unselectable ledger.
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
    // 通过固定的估算行高保留滚动轨道，避免 500+ 行一次性创建节点。
    const VIRTUAL_ROW_HEIGHT = 48;
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
    const filteredRows = $derived.by(() => {
        const q = searchText.trim().toLowerCase();
        let list = rows;
        if (q) {
            // Search by full pinyin or initials once the dictionary is ready.
            void pyTick;
            list = list.filter((r) => rowMatchesSearch(r, q, ref?.columns));
        }
        const keyID = sortKey ? ref?.columns?.[sortKey] : undefined;
        const keyType = sortKey ? plugin.schemaCatalog?.[active]?.columns?.find((column: any) => column.key === sortKey)?.type : undefined;
        return sortRows(list, keyID, sortAsc, keyType);
    });
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
        const first = Math.max(0, Math.floor((ledgerScrollTop - tableTop) / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
        const count = Math.ceil(ledgerViewportHeight / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2;
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
    const ref = $derived(ledgers.find((entry) => entry.id === active)?.ref);
    const schemaKeys = $derived<string[]>(ref?.columns ? Object.keys(ref.columns) : []);

    const membershipSummary = $derived.by(() => {
        if (active !== "memberships" || !ref?.columns) return undefined;
        return calculateMembershipSpending(rows, ref.columns);
    });

    const paymentSummary = $derived.by(() => {
        if ((active !== "memberships" && active !== "insurance") || !ref?.columns) return undefined;
        return buildPaymentSummary([{ moduleId: active, columns: ref.columns, rows }], new Date());
    });
    const paymentQualityIssueCount = $derived.by(() => {
        const quality = paymentSummary?.dataQuality;
        return quality ? quality.missingCycle + quality.unknownCycle + quality.missingDate : 0;
    });

    /** 付款摘要来源定位：复用台账行详情抽屉，避免摘要复制一套编辑逻辑。 */
    function openPaymentSource(item: { rowId: string }) {
        const row = rows.find((candidate) => candidate.itemID === item.rowId);
        if (row) openDetail(row);
    }

    function paymentDueLabel(daysUntil: number): string {
        if (daysUntil === 0) return t("payment.today");
        if (daysUntil === 1) return t("payment.tomorrow");
        return t("payment.daysAfter").replace("${days}", String(daysUntil));
    }

    function paymentCycleLabel(item: { moduleId: string; cycle: string }): string {
        return optLabel(t, item.moduleId === "insurance" ? "pay_cycle" : "cycle", item.cycle);
    }

    const medicineSummary = $derived.by(() => {
        if (active !== "medicine" || !ref?.columns) return undefined;
        return calculateMedicineSummary(rows, ref.columns);
    });

    let selectedRetireMemberId = $state<string | undefined>();
    let retireWorkerTypeOverride = $state<RetirementWorkerType | undefined>();

    const targetRetireMember = $derived.by(() => {
        const mems = plugin.settings.members ?? [];
        if (mems.length === 0) return undefined;
        return mems.find((m) => m.id === selectedRetireMemberId) ?? mems[0];
    });

    const currentRetireWorkerType = $derived.by<RetirementWorkerType>(() => {
        if (retireWorkerTypeOverride) return retireWorkerTypeOverride;
        return targetRetireMember?.sex === "male" ? "male" : "female_55";
    });

    const retireCalc = $derived.by(() => {
        if (active !== "social" || !targetRetireMember?.birthday) return null;
        return calculateRetirement(targetRetireMember.birthday, currentRetireWorkerType);
    });

    const favorsSummary = $derived.by(() => {
        void version;
        if (active !== "favors" || !ref?.columns) return undefined;
        const nameCol = ref.columns.name;
        const dirCol = ref.columns.direction;
        const amtCol = ref.columns.amount;
        const personCol = ref.columns.person;
        const catCol = ref.columns.category;
        const dateCol = ref.columns.date;
        const fRows: FavorRow[] = rows.map((r) => ({
            id: r.itemID,
            name: cellText(r.cells[nameCol]),
            category: cellText(r.cells[catCol]),
            direction: r.cells[dirCol]?.select?.content ?? r.cells[dirCol]?.mSelect?.[0]?.content ?? r.cells[dirCol]?.text?.content,
            person: cellText(r.cells[personCol]),
            amount: r.cells[amtCol]?.number?.isNotEmpty && typeof r.cells[amtCol].number.content === "number" ? r.cells[amtCol].number.content : undefined,
            date: cellText(r.cells[dateCol]),
        }));
        return calculateFavorsSummary(fRows);
    });

    // Asset Steward reference: valuation snapshots should override purchase
    // price in the read-only summary, while rowlogs remain the only secondary
    // projection and the AV row stays the source of truth.
    let assetValuationLogs = $state<Record<string, ValuationLogEntry[]>>({});
    let assetValuationLogRequest = 0;
    $effect(() => {
        const moduleId = active;
        const avId = ref?.avId;
        const request = ++assetValuationLogRequest;
        if (moduleId !== "assets-real" || !avId) {
            assetValuationLogs = {};
            return;
        }
        loadRowLogs(plugin as any).then((logs) => {
            if (request !== assetValuationLogRequest) return;
            const prefix = `${avId}|`;
            const next: Record<string, ValuationLogEntry[]> = {};
            for (const [key, log] of Object.entries(logs)) {
                if (!key.startsWith(prefix) || !log.valuations?.length) continue;
                const rowId = key.slice(prefix.length);
                next[rowId] = log.valuations.map((entry) => ({
                    value: entry.value,
                    date: entry.date,
                    at: entry.at,
                })).sort((a, b) => String(a.date ?? a.at ?? "").localeCompare(String(b.date ?? b.at ?? "")));
            }
            assetValuationLogs = next;
        }).catch(() => {
            if (request === assetValuationLogRequest) assetValuationLogs = {};
        });
    });

    const realAssetSummary = $derived.by(() => {
        void version;
        if (active !== "assets-real" || !ref?.columns) return undefined;
        const nameCol = ref.columns.name;
        const catCol = ref.columns.category;
        const statusCol = ref.columns.status;
        const amtCol = ref.columns.amount;
        const aRows: AssetRowData[] = rows.map((r) => ({
            id: r.itemID,
            name: cellText(r.cells[nameCol]),
            category: cellText(r.cells[catCol]),
            status: r.cells[statusCol]?.select?.content ?? r.cells[statusCol]?.mSelect?.[0]?.content ?? r.cells[statusCol]?.text?.content ?? "inuse",
            amount: r.cells[amtCol]?.number?.isNotEmpty && typeof r.cells[amtCol].number.content === "number" ? r.cells[amtCol].number.content : undefined,
        }));
        return calculateAssetValuation(aRows, [], assetValuationLogs);
    });

    const assetValuationSnapshotDate = $derived.by(() => {
        void version;
        const dates = Object.values(assetValuationLogs).flatMap((entries) => entries.map((entry) => entry.date ?? entry.at ?? ""))
            .filter(Boolean)
            .sort();
        return dates.length > 0 ? dates[dates.length - 1] : "";
    });
    const assetSnapshotCount = $derived(Object.values(assetValuationLogs).filter((entries) => entries.length > 0).length);

    let selectedSchoolingIndex = $state(0);
    const schoolingMilestones = $derived.by(() => {
        void version;
        if (active !== "schooling" || !ref?.columns) return [];
        const nameCol = ref.columns.name;
        const catCol = ref.columns.category;
        const gradeCol = ref.columns.grade;
        const schoolCol = ref.columns.school;
        const statusCol = ref.columns.status;
        const enrollCol = ref.columns.enroll_year;
        const examCol = ref.columns.exam_date;
        const sRows: SchoolingRowData[] = rows.map((r) => ({
            id: r.itemID,
            name: cellText(r.cells[nameCol]),
            category: cellText(r.cells[catCol]),
            grade: cellText(r.cells[gradeCol]),
            school: cellText(r.cells[schoolCol]),
            status: r.cells[statusCol]?.select?.content ?? r.cells[statusCol]?.mSelect?.[0]?.content ?? r.cells[statusCol]?.text?.content ?? "enrolled",
            enroll_year: r.cells[enrollCol]?.number?.isNotEmpty && typeof r.cells[enrollCol].number.content === "number" ? r.cells[enrollCol].number.content : undefined,
            exam_date: cellText(r.cells[examCol]) !== "—" ? cellText(r.cells[examCol]) : undefined,
        }));
        return calculateSchoolingMilestones(sRows);
    });

    const mediaSummary = $derived.by(() => {
        void version;
        if (active !== "media" || !ref?.columns) return undefined;
        const nameCol = ref.columns.name;
        const catCol = ref.columns.category;
        const statusCol = ref.columns.status;
        const ratingCol = ref.columns.rating;
        const progressCol = ref.columns.progress;
        const dateCol = ref.columns.date;
        const nextUpdateCol = ref.columns.next_update;
        const mRows: MediaRowData[] = rows.map((r) => ({
            id: r.itemID,
            name: cellText(r.cells[nameCol]),
            category: cellText(r.cells[catCol]),
            status: r.cells[statusCol]?.select?.content ?? r.cells[statusCol]?.mSelect?.[0]?.content ?? r.cells[statusCol]?.text?.content ?? "wishlist",
            rating: r.cells[ratingCol]?.number?.isNotEmpty && typeof r.cells[ratingCol].number.content === "number" ? r.cells[ratingCol].number.content : undefined,
            progress: cellText(r.cells[progressCol]),
            date: cellText(r.cells[dateCol]),
            next_update: cellText(r.cells[nextUpdateCol]),
        }));
        return calculateMediaSummary(mRows);
    });

    const petCareSummary = $derived.by(() => {
        void version;
        if (active !== "pets" || !ref?.columns) return undefined;
        const nameCol = ref.columns.name;
        const speciesCol = ref.columns.species;
        const breedCol = ref.columns.breed;
        const vaccineCol = ref.columns.vaccine_due;
        const dewormCol = ref.columns.deworm_due;
        const cycleCol = ref.columns.cycle;
        const noteCol = ref.columns.note;
        const pRows: PetRowData[] = rows.map((r) => ({
            id: r.itemID,
            name: cellText(r.cells[nameCol]),
            species: cellText(r.cells[speciesCol]),
            breed: cellText(r.cells[breedCol]),
            vaccine_due: cellText(r.cells[vaccineCol]) !== "—" ? cellText(r.cells[vaccineCol]) : undefined,
            deworm_due: cellText(r.cells[dewormCol]) !== "—" ? cellText(r.cells[dewormCol]) : undefined,
            cycle: cellText(r.cells[cycleCol]),
            note: cellText(r.cells[noteCol]),
        }));
        return calculatePetCareSummary(pRows);
    });

    function openFavorsReportModal() {
        if (!favorsSummary) return;
        const textReport = formatFavorsReportText(favorsSummary, formatAmount);
        const dlg = new Dialog({
            title: t("favors.reportTitle").replace("${year}", String(favorsSummary.year)),
            content: `
                <div class="b3-dialog__content fn__flex" style="flex-direction:column;gap:12px;max-height:60vh;overflow:auto;padding:16px 20px">
                    <div class="fn__flex" style="gap:16px;justify-content:space-between;padding:12px 14px;border-radius:var(--lv-r-2);background:var(--lv-surface-2);border:1px solid var(--lv-line)">
                        <div>
                            <div class="ft__on-surface" style="font-size:11.5px">${t("favors.netAmount")}</div>
                            <b style="font-size:22px;color:var(--lv-tx);font-weight:700">¥ ${formatAmount(favorsSummary.netAmount)}</b>
                            <span style="font-size:11px;color:var(--lv-tx-3);margin-left:4px">${favorsSummary.netAmount >= 0 ? `(${t("favors.netIn")})` : `(${t("favors.netOut")})`}</span>
                        </div>
                        <div style="text-align:right">
                            <div style="font-size:12px;color:var(--lv-ok)">${t("favors.totalIn")}：¥ ${formatAmount(favorsSummary.totalIn)}（${favorsSummary.countIn}笔）</div>
                            <div style="font-size:12px;color:var(--lv-tx-2);margin-top:4px">${t("favors.totalOut")}：¥ ${formatAmount(favorsSummary.totalOut)}（${favorsSummary.countOut}笔）</div>
                        </div>
                    </div>
                    ${favorsSummary.topIn.length > 0 ? `
                        <div>
                            <div class="ft__on-surface" style="font-size:12px;font-weight:600;margin-bottom:6px">${t("favors.topIn")}</div>
                            <div class="fn__flex" style="flex-direction:column;gap:4px">
                                ${favorsSummary.topIn.map((p, idx) => `
                                    <div class="fn__flex" style="justify-content:space-between;font-size:12px;padding:4px 8px;background:var(--lv-surface);border-radius:4px">
                                        <span>${idx + 1}. <b>${escapeHtml(p.person)}</b> (${p.count}笔)</span>
                                        <b style="color:var(--lv-ok)">¥ ${formatAmount(p.totalIn)}</b>
                                    </div>
                                `).join("")}
                            </div>
                        </div>
                    ` : ""}
                    ${favorsSummary.topOut.length > 0 ? `
                        <div>
                            <div class="ft__on-surface" style="font-size:12px;font-weight:600;margin-bottom:6px">${t("favors.topOut")}</div>
                            <div class="fn__flex" style="flex-direction:column;gap:4px">
                                ${favorsSummary.topOut.map((p, idx) => `
                                    <div class="fn__flex" style="justify-content:space-between;font-size:12px;padding:4px 8px;background:var(--lv-surface);border-radius:4px">
                                        <span>${idx + 1}. <b>${escapeHtml(p.person)}</b> (${p.count}笔)</span>
                                        <b style="color:var(--lv-tx-2)">¥ ${formatAmount(p.totalOut)}</b>
                                    </div>
                                `).join("")}
                            </div>
                        </div>
                    ` : ""}
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel" id="lv-favors-copy">${t("favors.copyReport")}</button>
                    <button class="b3-button" id="lv-favors-close">${t("close")}</button>
                </div>
            `,
            width: "440px",
        });

        const copyBtn = dlg.element.querySelector("#lv-favors-copy") as HTMLButtonElement;
        const closeBtn = dlg.element.querySelector("#lv-favors-close") as HTMLButtonElement;
        closeBtn.onclick = () => dlg.destroy();
        copyBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(textReport);
                showMessage(t("favors.copyDone"), 2500, "info");
            } catch (e) {
                showMessage(String(e), 4000, "error");
            }
        };
    }

    async function copyMedicineRestock() {
        if (!medicineSummary) return;
        const text = formatMedicineRestockText(medicineSummary, t);
        try {
            await navigator.clipboard.writeText(text);
            showMessage(t("medicine.banner.copyRestockDone"), 2500, "info");
        } catch {
            showMessage(t("ledger.shopCopyFailed"), 4000, "error");
        }
    }
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

    /** Show fuel and charging usage per vehicle without combining hybrid energy types. */
    function openEnergyDashboard() {
        openEnergyDashboardModal({
            ref,
            active,
            plugin,
            t,
            cellText: (c, k) => cellText(c, k),
            openDetail: (v) => openDetail(v),
            openNewRecord: () => openNewRecord(),
        });
    }

    // Growth chart for parenting records, including an optional WHO reference band.
    function openGrowthChart() {
        openGrowthModal({
            rows,
            columns: ref?.columns,
            members: plugin.settings.members ?? [],
            t,
            showMessage: (msg, timeout, type) => showMessage(msg, timeout, type),
        });
    }

    // MOD-17 / §8 儿童国家免疫规划疫苗排期视图
    function openImmunizationScheduleDialog() {
        const children = (plugin.settings.members ?? []).filter((m) => m.role === "child" || !!m.birthday);
        if (children.length === 0) {
            showMessage(t("immunization.noChild"), 4500, "info");
            return;
        }

        let childIndex = 0;
        let activeChild = children[childIndex];

        const vaccineCatVal = t("field.category.opt.vaccine_p");
        const getRecordedVaccines = (childMemberId?: string): RecordedVaccineRow[] => {
            const catCol = ref?.columns?.category;
            const nameCol = ref?.columns?.name;
            const vNameCol = ref?.columns?.vaccine_name;
            const doseCol = ref?.columns?.dose_no;
            const dateCol = ref?.columns?.date;
            const memCol = ref?.columns?.member;

            return rows.filter((r) => {
                const cVal = String(cellText(r.cells[catCol]));
                if (cVal !== "vaccine_p" && cVal !== vaccineCatVal) return false;
                if (childMemberId && memCol) {
                    const blockId = r.cells[memCol]?.relation?.blockIDs?.[0];
                    if (blockId && blockId !== activeChild.avItemId) return false;
                }
                return true;
            }).map((r) => ({
                id: r.itemID,
                name: cellText(r.cells[nameCol]),
                vaccine_name: cellText(r.cells[vNameCol]),
                dose_no: cellText(r.cells[doseCol]),
                date: cellText(r.cells[dateCol]),
            }));
        };

        const dlg = new Dialog({
            title: t("immunization.dialogTitle"),
            content: `
                <div class="b3-dialog__content fn__flex" style="flex-direction:column;gap:12px;max-height:68vh;overflow:auto;padding:16px 20px">
                    <div id="lv-vax-header" class="fn__flex" style="align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px"></div>
                    <div id="lv-vax-summary" class="fn__flex" style="gap:8px;align-items:center;flex-wrap:wrap"></div>
                    <div id="lv-vax-list" class="fn__flex" style="flex-direction:column;gap:6px;margin-top:6px"></div>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button" id="lv-vax-close">${t("close")}</button>
                </div>
            `,
            width: "600px",
        });

        const headerEl = dlg.element.querySelector("#lv-vax-header") as HTMLElement;
        const summaryEl = dlg.element.querySelector("#lv-vax-summary") as HTMLElement;
        const listEl = dlg.element.querySelector("#lv-vax-list") as HTMLElement;
        const closeBtn = dlg.element.querySelector("#lv-vax-close") as HTMLButtonElement;
        closeBtn.onclick = () => dlg.destroy();

        const renderDialogBody = () => {
            activeChild = children[childIndex];
            if (!activeChild?.birthday) {
                summaryEl.innerHTML = `<span class="ft__error" style="font-size:12px">${escapeHtml(activeChild.name)} 尚未填写出生日期，无法推算标准接种月龄</span>`;
                listEl.innerHTML = "";
                return;
            }

            const recorded = getRecordedVaccines(activeChild.avItemId);
            const schedule = calculateImmunizationSchedule(activeChild.birthday, activeChild.name, recorded);
            if (!schedule) return;

            headerEl.innerHTML = `
                <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px">
                    <span>${escapeHtml(activeChild.name)}</span>
                    <span class="lv-caption" style="font-size:11.5px">（出生于 ${escapeHtml(activeChild.birthday)}）</span>
                </div>
                ${children.length > 1 ? `
                    <select id="lv-vax-child-select" class="b3-select" style="font-size:12px">
                        ${children.map((c, i) => `<option value="${i}" ${i === childIndex ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
                    </select>
                ` : ""}
            `;

            const childSelect = headerEl.querySelector("#lv-vax-child-select") as HTMLSelectElement | null;
            if (childSelect) {
                childSelect.onchange = (e) => {
                    childIndex = Number((e.target as HTMLSelectElement).value);
                    renderDialogBody();
                };
            }

            summaryEl.innerHTML = `
                <span class="lv-badge green lv-num">✓ ${t("immunization.received")} ${schedule.receivedCount}</span>
                <span class="lv-badge ${schedule.overdueCount > 0 ? 'red' : 'green'} lv-num">${schedule.overdueCount > 0 ? '!' : '✓'} ${t("immunization.overdue")} ${schedule.overdueCount}</span>
                <span class="lv-badge yellow lv-num">● ${t("immunization.upcoming")} ${schedule.upcomingCount}</span>
                <span class="lv-caption" style="margin-left:auto;font-size:11px">共 ${schedule.totalDoses} 剂标准程序</span>
            `;

            listEl.innerHTML = "";
            for (const item of schedule.schedule) {
                const itemEl = document.createElement("div");
                itemEl.style.cssText = `display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border-radius:var(--lv-r-2);border:1px solid var(--lv-line);background:${item.status === 'received' ? 'var(--lv-surface)' : item.status === 'overdue' ? 'color-mix(in srgb, var(--lv-danger) 8%, var(--lv-surface))' : 'var(--lv-surface-2)'}`;

                const left = document.createElement("div");
                left.style.cssText = "min-width:0;display:flex;flex-direction:column;gap:2px";
                left.innerHTML = `
                    <div style="font-size:13px;font-weight:600;color:var(--lv-tx)">
                        ${escapeHtml(item.vaccine)} · 第 ${item.dose} 剂
                        <span class="lv-caption" style="font-size:11px;font-weight:normal;margin-left:6px">${t("immunization.monthAge").replace("${n}", String(item.monthAge))} ${item.note ? `(${escapeHtml(item.note)})` : ""}</span>
                    </div>
                    <div style="font-size:11.5px;color:var(--lv-tx-3)">
                        ${t("immunization.targetDate")}：${escapeHtml(item.targetDate)}
                        ${item.receivedDate ? ` · <b style="color:var(--lv-ok)">${t("immunization.actualDate")}：${escapeHtml(item.receivedDate)}</b>` : ""}
                    </div>
                `;

                const right = document.createElement("div");
                right.style.cssText = "display:flex;align-items:center;gap:8px;flex-shrink:0";

                let statusBadge = "";
                if (item.status === "received") {
                    statusBadge = `<span class="lv-badge green">${t("immunization.received")}</span>`;
                } else if (item.status === "overdue") {
                    statusBadge = `<span class="lv-badge red">${t("immunization.overdue")}</span>`;
                } else {
                    statusBadge = `<span class="lv-badge yellow">${t("immunization.upcoming")}</span>`;
                }
                right.innerHTML = statusBadge;

                if (item.status !== "received") {
                    const logBtn = document.createElement("button");
                    logBtn.className = "b3-button b3-button--text b3-button--small";
                    logBtn.style.cssText = "font-size:11px;padding:2px 6px";
                    logBtn.textContent = t("immunization.logVaccine");
                    logBtn.onclick = async () => {
                        const todayStr = localDateKey(new Date());
                        logBtn.disabled = true;
                        try {
                            const { addDetachedRow, setCell } = await import("@/core/siyuan");
                            const opKey = `vax:log:${activeChild.id}:${item.vaccine}:${item.dose}`;
                            const newRowId = await addDetachedRow(ref!.avId!, `${item.vaccine}（第${item.dose}剂）`, {
                                idempotencyKey: `${opKey}:row`,
                                retries: 1,
                            });
                            const cols = ref!.columns ?? {};
                            if (cols.category) {
                                await setCell(ref!.avId!, cols.category, newRowId, selectCellValue("vaccine_p"), {
                                    idempotencyKey: `${opKey}:category`,
                                    retries: 1,
                                });
                            }
                            if (cols.vaccine_name) {
                                await setCell(ref!.avId!, cols.vaccine_name, newRowId, { type: "text", text: { content: item.vaccine } }, { idempotencyKey: `${opKey}:name`, retries: 1 });
                            }
                            if (cols.dose_no) {
                                await setCell(ref!.avId!, cols.dose_no, newRowId, { type: "number", number: { content: item.dose, isNotEmpty: true } }, { idempotencyKey: `${opKey}:dose`, retries: 1 });
                            }
                            if (cols.date) {
                                await setCell(ref!.avId!, cols.date, newRowId, {
                                    type: "date",
                                    date: { content: new Date(`${todayStr}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true },
                                }, { idempotencyKey: `${opKey}:date`, retries: 1 });
                            }
                            if (cols.member && activeChild.avItemId) {
                                await setCell(ref!.avId!, cols.member, newRowId, {
                                    type: "relation",
                                    relation: { blockIDs: [activeChild.avItemId], contents: null },
                                }, { idempotencyKey: `${opKey}:member`, retries: 1 });
                            }
                            showMessage(t("immunization.logged").replace("${name}", item.vaccine).replace("${dose}", String(item.dose)), 2500, "info");
                            await load();
                            try { await plugin.refreshHub?.(["parenting"]); } catch { /* ignore */ }
                            renderDialogBody();
                        } catch (err) {
                            showMessage(String(err), 5000, "error");
                            logBtn.disabled = false;
                        }
                    };
                    right.appendChild(logBtn);
                }

                itemEl.append(left, right);
                listEl.appendChild(itemEl);
            }
        };

        renderDialogBody();
    }

    // MOD-23 / line 510 书签链接健康巡检
    function openBookmarksCheckDialog() {
        const urlCol = ref?.columns?.url;
        const nameCol = ref?.columns?.name;
        if (!urlCol) {
            showMessage(t("bookmarks.noUrlCol"), 4000, "info");
            return;
        }

        import("@/core/bookmarks").then(({ checkBookmarkHealth, formatBookmarkHealthReport }) => {
            const summary = checkBookmarkHealth(rows, { name: nameCol, url: urlCol });
            const dlg = new Dialog({
                title: t("bookmarks.dialogTitle"),
                content: `
                    <div class="b3-dialog__content fn__flex" style="flex-direction:column;gap:12px;max-height:65vh;overflow:auto;padding:16px 20px">
                        <div class="fn__flex" style="align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
                            <span style="font-size:13px;color:var(--lv-tx)"><b>${t("bookmarks.summaryTotal")}：${summary.totalCount}</b></span>
                            <div class="fn__flex" style="gap:6px">
                                <span class="lv-badge green">✓ ${t("bookmarks.summaryValid")} ${summary.validCount}</span>
                                <span class="lv-badge ${summary.issueCount > 0 ? 'red' : 'gray'}">${summary.issueCount > 0 ? '!' : '✓'} ${t("bookmarks.summaryIssues")} ${summary.issueCount}</span>
                            </div>
                        </div>
                        <div id="lv-bm-list" class="fn__flex" style="flex-direction:column;gap:6px;margin-top:6px"></div>
                    </div>
                    <div class="b3-dialog__action">
                        <button class="b3-button b3-button--outline" id="lv-bm-copy">${t("bookmarks.copyReport")}</button>
                        <button class="b3-button" id="lv-bm-close">${t("close")}</button>
                    </div>
                `,
                width: "560px",
            });

            const listEl = dlg.element.querySelector("#lv-bm-list") as HTMLElement;
            if (summary.issues.length === 0) {
                listEl.innerHTML = `<div class="ft__on-surface" style="padding:16px 0;text-align:center;font-size:13px">✓ ${t("bookmarks.allHealthy")}</div>`;
            } else {
                for (const item of summary.issues) {
                    const row = document.createElement("div");
                    row.className = "lv-card";
                    row.style.cssText = "padding:10px 14px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);display:flex;align-items:center;justify-content:space-between;gap:10px";

                    const left = document.createElement("div");
                    left.style.cssText = "display:flex;flex-direction:column;gap:3px;min-width:0;flex:1";

                    const title = document.createElement("div");
                    title.style.cssText = "font-weight:600;font-size:12.5px;color:var(--lv-tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
                    title.textContent = item.name;

                    const reason = document.createElement("div");
                    reason.style.cssText = "font-size:11.5px;color:var(--lv-tx-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
                    reason.textContent = `${item.url || t("bookmarks.noUrl")} · ${item.reason}`;

                    left.appendChild(title);
                    left.appendChild(reason);

                    const badge = document.createElement("span");
                    badge.className = `lv-badge ${item.status === "empty" ? "yellow" : "red"}`;
                    badge.textContent = t(`bookmarks.status_${item.status}`);

                    row.appendChild(left);
                    row.appendChild(badge);
                    listEl.appendChild(row);
                }
            }

            dlg.element.querySelector("#lv-bm-copy")?.addEventListener("click", async () => {
                const text = formatBookmarkHealthReport(summary, (k) => t(k));
                try {
                    await navigator.clipboard.writeText(text);
                    showMessage(t("bookmarks.copySuccess"), 3000, "info");
                } catch {
                    showMessage(t("bookmarks.copyFailed"), 4000, "error");
                }
            });

            dlg.element.querySelector("#lv-bm-close")?.addEventListener("click", () => dlg.destroy());
        });
    }

    // MOD-18 / §11 行前清单证件自查与护照 6 个月黄金规则核验
    async function openTravelCertsCheckDialog(tripRow?: any) {
        const targetRow = tripRow ?? (filteredRows.length > 0 ? filteredRows[0] : null);
        if (!targetRow) {
            showMessage(t("ledger.loadIncomplete"), 3000, "info");
            return;
        }

        const certsRef = plugin.settings.dbRefs?.["certs"];
        if (!certsRef?.avId) {
            showMessage(t("travel.noCerts"), 5000, "error");
            return;
        }

        const tripName = String(cellText(targetRow.cells[ref?.columns?.name]));
        const destination = ref?.columns?.destination ? String(cellText(targetRow.cells[ref.columns.destination])) : "";
        const startDate = ref?.columns?.date ? String(cellText(targetRow.cells[ref.columns.date])) : "";
        const memberBid = ref?.columns?.member ? targetRow.cells[ref.columns.member]?.relation?.blockIDs?.[0] : undefined;
        const memberObj = memberBid ? (plugin.settings.members ?? []).find((m) => m.avItemId === memberBid) : undefined;

        try {
            const { renderLedgerAll } = await import("@/core/siyuan");
            const certsLedger = await renderLedgerAll(certsRef.avId);
            const cNameCol = certsRef.columns?.name;
            const cCatCol = certsRef.columns?.category;
            const cExpCol = certsRef.columns?.expiry;
            const cMemCol = certsRef.columns?.member;

            const certs: CandidateCert[] = certsLedger.rows.map((cr) => ({
                id: cr.itemID,
                name: cellText(cr.cells[cNameCol]),
                category: cellText(cr.cells[cCatCol]),
                expiry: cellText(cr.cells[cExpCol]) !== "—" ? cellText(cr.cells[cExpCol]) : undefined,
                memberId: cMemCol ? cr.cells[cMemCol]?.relation?.blockIDs?.[0] : undefined,
            })).filter((c) => c.name && c.name !== "—");

            if (certs.length === 0) {
                showMessage(t("travel.noCerts"), 5000, "info");
                return;
            }

            const context: TravelPlanContext = {
                tripName,
                destination: destination !== "—" ? destination : "",
                startDate: startDate !== "—" ? startDate : undefined,
                travelerMemberId: memberBid,
                travelerName: memberObj?.name,
            };

            const summary = evaluateTravelCertsCheck(context, certs);

            const dlg = new Dialog({
                title: t("travel.checkTitle"),
                content: `
                    <div class="b3-dialog__content fn__flex" style="flex-direction:column;gap:12px;max-height:68vh;overflow:auto;padding:16px 20px">
                        <div class="fn__flex" style="justify-content:space-between;align-items:center;padding:12px 14px;border-radius:var(--lv-r-2);background:var(--lv-surface-2);border:1px solid var(--lv-line)">
                            <div>
                                <div style="font-size:14px;font-weight:700;color:var(--lv-tx)">${escapeHtml(summary.tripName)}${summary.destination ? ` · ${escapeHtml(summary.destination)}` : ""}</div>
                                <div class="lv-caption" style="font-size:11.5px;margin-top:2px">${t("travel.travelDate")}：${escapeHtml(summary.travelDate)}</div>
                            </div>
                            <div>
                                <span class="lv-badge ${summary.overallStatus === 'pass' ? 'green' : summary.overallStatus === 'fail' ? 'red' : 'yellow'}" style="font-size:12px">
                                    ${summary.overallStatus === 'pass' ? t("travel.statusPass") : summary.overallStatus === 'fail' ? t("travel.statusFail") : t("travel.statusWarn")}
                                </span>
                            </div>
                        </div>
                        <div style="font-size:11.5px;color:var(--lv-tx-3);line-height:1.4">
                            💡 ${t("travel.ruleHint")}
                        </div>
                        <div class="fn__flex" style="flex-direction:column;gap:8px;margin-top:4px">
                            ${summary.checks.map((ck) => `
                                <div style="padding:10px 12px;border-radius:var(--lv-r-2);background:${ck.status === 'fail' ? 'color-mix(in srgb, var(--lv-danger) 8%, var(--lv-surface))' : 'var(--lv-surface)'};border:1px solid var(--lv-line);display:flex;flex-direction:column;gap:4px">
                                    <div style="display:flex;justify-content:space-between;align-items:center">
                                        <b style="font-size:13px;color:var(--lv-tx)">${escapeHtml(ck.certName)}</b>
                                        <span class="lv-badge ${ck.status === 'pass' ? 'green' : ck.status === 'fail' ? 'red' : 'yellow'}">
                                            ${ck.status === 'pass' ? '✓ 合规' : ck.status === 'fail' ? '! 风险' : '待核'}
                                        </span>
                                    </div>
                                    <div style="font-size:12px;color:${ck.status === 'fail' ? 'var(--lv-danger)' : 'var(--lv-tx-2)'}">
                                        ${escapeHtml(ck.message)}
                                    </div>
                                </div>
                            `).join("")}
                        </div>
                    </div>
                    <div class="b3-dialog__action">
                        <button class="b3-button b3-button--outline" id="lv-travel-archive">${t("travel.archiveCheck")}</button>
                        <button class="b3-button" id="lv-travel-close">${t("close")}</button>
                    </div>
                `,
                width: "560px",
            });

            const archiveBtn = dlg.element.querySelector("#lv-travel-archive") as HTMLButtonElement;
            const closeBtn = dlg.element.querySelector("#lv-travel-close") as HTMLButtonElement;
            closeBtn.onclick = () => dlg.destroy();
            archiveBtn.onclick = async () => {
                archiveBtn.disabled = true;
                try {
                    const { updateRowLogs, appendEntry } = await import("@/core/rowlog");
                    const travelAvId = ref?.avId || plugin.settings.dbRefs?.["travel-plan"]?.avId || "";
                    await updateRowLogs(plugin as any, (current) => appendEntry(current, travelAvId, targetRow.itemID, "checks", {
                        date: localDateKey(new Date()),
                        result: summary.conclusionText,
                        at: new Date().toISOString(),
                    }));
                    showMessage(t("travel.archiveDone"), 3000, "info");
                    archiveBtn.textContent = "✓ 已存档";
                } catch (err) {
                    showMessage(String(err), 4000, "error");
                    archiveBtn.disabled = false;
                }
            };
        } catch (e) {
            showMessage(String(e), 5000, "error");
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
    function openShoppingList() {
        openShoppingModal({
            avId: ref?.avId,
            columns: ref?.columns,
            t,
            showMessage: (msg, timeout, type) => showMessage(msg, timeout, type),
        });
    }

    // CSV import uses a schema-driven mapping wizard; core owns the planning logic.
    function openCsvImport() {
        openCsvModal({
            active,
            ref,
            schemaCatalog: plugin.schemaCatalog,
            members: plugin.settings.members ?? [],
            t,
            onReload: load,
            onRefreshHub: (modules) => plugin.refreshHub?.(modules),
        });
    }

    // MOD-05 / §15 引用完整性：批量改派成员归属
    function openBatchReassignModal() {
        if (!ref?.avId || !ref?.columns?.member) return;
        const memberColKey = ref.columns.member;
        const validMembers = (plugin.settings.members ?? []).filter((m) => !!m.avItemId);
        if (validMembers.length === 0) {
            showMessage(t("ledger.reassignNoTarget"), 4000, "error");
            return;
        }

        const isUnassignedRow = (r: any) => {
            const blockId = r.cells?.[memberColKey]?.relation?.blockIDs?.[0];
            return !blockId || !validMembers.some((m) => m.avItemId === blockId);
        };
        const unassignedRows = filteredRows.filter(isUnassignedRow);
        const totalCount = filteredRows.length;
        const unassignedCount = unassignedRows.length;

        const dlg = new Dialog({
            title: t("ledger.reassignTitle"),
            content: `
                <div class="b3-dialog__content fn__flex" style="flex-direction:column;gap:14px;padding:16px 20px">
                    <div>
                        <label class="ft__on-surface" style="font-size:12px;margin-bottom:6px;display:block;font-weight:600">${t("ledger.reassignTarget")}</label>
                        <select id="lv-reassign-target-select" class="b3-select" style="width:100%">
                            ${validMembers.map((m) => `<option value="${escapeAttr(m.avItemId)}">${escapeHtml(m.name)}（${escapeHtml(t(`role.${m.role}`) !== `role.${m.role}` ? t(`role.${m.role}`) : m.role)}）</option>`).join("")}
                        </select>
                    </div>
                    <div>
                        <label class="ft__on-surface" style="font-size:12px;margin-bottom:6px;display:block;font-weight:600">${t("ledger.reassignScope")}</label>
                        <label class="fn__flex" style="align-items:center;gap:8px;font-size:13px;cursor:pointer">
                            <input type="radio" name="lv-reassign-scope" value="unassigned" ${unassignedCount > 0 ? "checked" : ""} class="b3-radio" />
                            <span>${t("ledger.reassignScopeUnassigned")}（${unassignedCount}）</span>
                        </label>
                        <label class="fn__flex" style="align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-top:8px">
                            <input type="radio" name="lv-reassign-scope" value="all" ${unassignedCount === 0 ? "checked" : ""} class="b3-radio" />
                            <span>${t("ledger.reassignScopeAll")}（${totalCount}）</span>
                        </label>
                    </div>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel" id="lv-reassign-cancel">${t("cancel")}</button>
                    <button class="b3-button b3-button--text" id="lv-reassign-confirm">${t("ledger.reassignConfirm").replace("${n}", String(unassignedCount > 0 ? unassignedCount : totalCount))}</button>
                </div>
            `,
            width: "420px",
        });

        const targetSelect = dlg.element.querySelector("#lv-reassign-target-select") as HTMLSelectElement;
        const cancelBtn = dlg.element.querySelector("#lv-reassign-cancel") as HTMLButtonElement;
        const confirmBtn = dlg.element.querySelector("#lv-reassign-confirm") as HTMLButtonElement;
        const radios = dlg.element.querySelectorAll<HTMLInputElement>("input[name='lv-reassign-scope']");

        const updateConfirmText = () => {
            const checked = dlg.element.querySelector<HTMLInputElement>("input[name='lv-reassign-scope']:checked")?.value;
            const count = checked === "all" ? totalCount : unassignedCount;
            confirmBtn.textContent = t("ledger.reassignConfirm").replace("${n}", String(count));
            confirmBtn.disabled = count === 0;
        };
        radios.forEach((r) => r.onchange = updateConfirmText);
        updateConfirmText();

        cancelBtn.onclick = () => dlg.destroy();
        confirmBtn.onclick = async () => {
            const targetAvItemId = targetSelect.value;
            const targetMember = validMembers.find((m) => m.avItemId === targetAvItemId);
            const checkedScope = dlg.element.querySelector<HTMLInputElement>("input[name='lv-reassign-scope']:checked")?.value;
            const rowsToReassign = (checkedScope === "all" ? filteredRows : unassignedRows).map((r) => r.itemID);

            if (rowsToReassign.length === 0) {
                showMessage(t("ledger.reassignNoRows"), 3000, "info");
                return;
            }

            confirmBtn.disabled = true;
            cancelBtn.disabled = true;
            try {
                const res = await batchReassignMember({
                    avId: ref!.avId!,
                    memberColKey,
                    targetAvItemId,
                    rowItemIds: rowsToReassign,
                });
                dlg.destroy();
                if (res.successCount > 0) {
                    showMessage(t("ledger.reassignDone").replace("${n}", String(res.successCount)).replace("${member}", targetMember?.name ?? ""), 3000, "info");
                    await load();
                    try {
                        await plugin.refreshHub?.(undefined, true);
                    } catch { /* ignored */ }
                } else if (res.failedCount > 0) {
                    showMessage(t("ledger.reassignFailed").replace("${msg}", res.errors[0] || ""), 5000, "error");
                }
            } catch (e) {
                showMessage(t("ledger.reassignFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
            }
        };
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
        if (!newRecordOpen) return;
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
            case "number": return (!revealSensitive && colKey && AMOUNT_KEYS.has(colKey) && plugin.settings.hideAmounts) ? "****" : (v.number?.isNotEmpty ? String(v.number.content) : "—");
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
<div class="b3-dialog__action lv-detail-actions"><button class="b3-button b3-button--text ft__error" id="lv-detail-del" style="color:var(--b3-theme-error)">${t("delete")}</button><span class="fn__flex-1"></span><details class="lv-detail-more"><summary class="b3-button b3-button--outline">${t("ledger.detailMore")}</summary><div class="lv-detail-more-menu"><button class="b3-button b3-button--cancel" id="lv-detail-card-copy">${t("ledger.copyAsImage")}</button><button class="b3-button b3-button--cancel" id="lv-detail-card-png">${t("ledger.downloadPng")}</button><button class="b3-button b3-button--cancel" id="lv-detail-card-text">${t("ledger.copyAsText")}</button><button class="b3-button b3-button--cancel" id="lv-detail-card-text-masked">${t("ledger.copyAsMaskedText")}</button><button class="b3-button b3-button--cancel" id="lv-detail-open">${t("ledger.openDoc")} →</button></div></details><button class="b3-button b3-button--cancel" id="lv-detail-close">${t("close")}</button><button class="b3-button" id="lv-detail-edit">${t("ledger.detailEditAll")}</button></div>`,
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
                line.style.cssText = "padding:2px 0;font-size:12.5px";
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
                        if (isDangerousAsset(f.name || f.content || "")) {
                            const warnBadge = document.createElement("span");
                            warnBadge.className = "lv-badge red";
                            warnBadge.style.cssText = "font-size:11px;margin-left:4px";
                            warnBadge.textContent = `⚠️ ${t("ledger.dangerousAssetNotice")}`;
                            line.appendChild(warnBadge);
                        } else {
                            try {
                                const preview = document.createElement("a");
                                preview.className = "b3-button b3-button--text";
                                preview.style.cssText = "padding:2px 4px;font-size:12px";
                                preview.textContent = isPdfAsset(f.content || "") ? t("ledger.previewPdf") : t("ledger.previewAttachment");
                                preview.href = assetHref(f.content);
                                preview.target = "_blank";
                                preview.rel = "noopener noreferrer";
                                line.appendChild(preview);
                            } catch {
                                // A malformed/legacy path remains visible by name but cannot become a navigation target.
                            }
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
                    v.textContent = formatAmount(cell.number.content, plugin.settings.hideAmounts);
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
                    cardRows.push({ key: c.id, label: String(c.name), value: v.classList.contains("is-empty") ? "—" : String(v.textContent) });
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
                    line.style.cssText = "padding:2px 0;font-size:12.5px;display:flex;gap:6px;align-items:center";
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

        // Shopping purchase to physical asset creation linkage
        function addRealAssetButton() {
            if (active !== "shopping") return;
            const assetRef = plugin.settings.dbRefs?.["assets-real"];
            const name = String(cellText(row.cells[ref!.columns.name]));
            if (!name || name === "—") return;

            const btn = document.createElement("button");
            btn.className = "b3-button b3-button--outline";
            btn.style.cssText = "margin-top:8px;font-size:12px";
            btn.textContent = `📦 ${t("ledger.toRealAsset")}`;

            btn.onclick = () => {
                if (!assetRef?.avId) {
                    showMessage(t("ledger.toRealAssetNoLedger"), 5000, "error");
                    return;
                }

                const catRaw = cellText(row.cells[ref!.columns.category]);
                const amtRaw = row.cells[ref!.columns.amount]?.number?.content;
                const dateRaw = cellText(row.cells[ref!.columns.date]);
                const channelRaw = cellText(row.cells[ref!.columns.channel]);
                const memberBid = ref!.columns.member ? row.cells[ref!.columns.member]?.relation?.blockIDs?.[0] : undefined;

                const payload = buildAssetFromShopping({
                    name,
                    category: catRaw !== "—" ? catRaw : undefined,
                    amount: typeof amtRaw === "number" ? amtRaw : undefined,
                    date: dateRaw !== "—" ? dateRaw : undefined,
                    channel: channelRaw !== "—" ? channelRaw : undefined,
                    memberBlockId: memberBid,
                });

                const bodyText = t("ledger.toRealAssetBody")
                    .replace("${name}", payload.name)
                    .replace("${category}", t(`field.category.opt.${payload.category}`) !== `field.category.opt.${payload.category}` ? t(`field.category.opt.${payload.category}`) : payload.category)
                    .replace("${amount}", formatAmount(payload.amount ?? 0));

                confirm(t("ledger.toRealAssetTitle"), bodyText, async () => {
                    btn.disabled = true;
                    try {
                        const { addDetachedRow, setCell } = await import("@/core/siyuan");
                        const opKey = `ledger:shopping-to-asset:${row.itemID}`;
                        const newRowId = await addDetachedRow(assetRef.avId!, payload.name, {
                            idempotencyKey: `${opKey}:row`,
                            retries: 1,
                        });
                        const cols = assetRef.columns ?? {};
                        if (cols.category) {
                            await setCell(assetRef.avId!, cols.category, newRowId, selectCellValue(payload.category), {
                                idempotencyKey: `${opKey}:category`,
                                retries: 1,
                            });
                        }
                        if (cols.status) {
                            await setCell(assetRef.avId!, cols.status, newRowId, selectCellValue(payload.status), {
                                idempotencyKey: `${opKey}:status`,
                                retries: 1,
                            });
                        }
                        if (cols.amount && payload.amount !== undefined) {
                            await setCell(assetRef.avId!, cols.amount, newRowId, {
                                type: "number",
                                number: { content: payload.amount, isNotEmpty: true },
                            }, { idempotencyKey: `${opKey}:amount`, retries: 1 });
                        }
                        if (cols.date && payload.date) {
                            await setCell(assetRef.avId!, cols.date, newRowId, {
                                type: "date",
                                date: { content: new Date(`${payload.date}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true },
                            }, { idempotencyKey: `${opKey}:date`, retries: 1 });
                        }
                        if (cols.channel && payload.channel) {
                            await setCell(assetRef.avId!, cols.channel, newRowId, {
                                type: "text",
                                text: { content: payload.channel },
                            }, { idempotencyKey: `${opKey}:channel`, retries: 1 });
                        }
                        if (cols.member && payload.memberBlockId) {
                            await setCell(assetRef.avId!, cols.member, newRowId, {
                                type: "relation",
                                relation: { blockIDs: [payload.memberBlockId], contents: null },
                            }, { idempotencyKey: `${opKey}:member`, retries: 1 });
                        }
                        if (cols.note && payload.note) {
                            await setCell(assetRef.avId!, cols.note, newRowId, {
                                type: "text",
                                text: { content: payload.note },
                            }, { idempotencyKey: `${opKey}:note`, retries: 1 });
                        }
                        showMessage(t("ledger.toRealAssetDone").replace("${name}", payload.name), 3000, "info");
                    } catch (e) {
                        showMessage(t("ledger.toRealAssetFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                        btn.disabled = false;
                    }
                });
            };
            body.appendChild(btn);
        }
        addRealAssetButton();

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
                line.style.cssText = "padding:2px 0;font-size:12.5px";
                line.textContent = `→ ${nameOf(id)} (${t("ledger.newCert")})`;
                body.appendChild(line);
            }
            for (const r of backward) {
                const line = document.createElement("div");
                line.style.cssText = "padding:2px 0;font-size:12.5px";
                line.textContent = `← ${String(cellText(r.cells[ref!.columns.name]))} (${t("ledger.oldCert")})`;
                body.appendChild(line);
            }
            body.appendChild(linkBtn());
        }
        addRenewChainSection();

        // House maintenance & warranty contracts linkage
        async function addHouseWarrantySection() {
            if (active !== "house") return;
            const houseName = String(cellText(row.cells[ref!.columns.name]));
            if (!houseName || houseName === "—") return;

            const section = document.createElement("div");
            section.className = "lv-warranty-section";
            section.style.cssText = "margin-top:14px;padding-top:12px;border-top:1px solid var(--b3-border-color)";

            const head = document.createElement("div");
            head.className = "ft__on-surface";
            head.style.cssText = "font-size:12px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between";
            head.textContent = t("warranty.sectionTitle");
            section.appendChild(head);

            const contractsRef = plugin.settings.dbRefs?.["contracts"];
            if (!contractsRef?.avId) {
                const empty = document.createElement("p");
                empty.className = "lv-caption";
                empty.textContent = t("warranty.noContracts");
                section.appendChild(empty);
                body.appendChild(section);
                return;
            }

            try {
                const { renderLedgerAll } = await import("@/core/siyuan");
                const contractsLedger = await renderLedgerAll(contractsRef.avId);
                const nameCol = contractsRef.columns?.name;
                const catCol = contractsRef.columns?.category;
                const expCol = contractsRef.columns?.expiry;
                const partyCol = contractsRef.columns?.party;
                const contactCol = contractsRef.columns?.contact;

                const candidates: ContractCandidate[] = contractsLedger.rows.map((cr) => ({
                    id: cr.itemID,
                    name: cellText(cr.cells[nameCol]),
                    category: cellText(cr.cells[catCol]),
                    expiry: cellText(cr.cells[expCol]) !== "—" ? cellText(cr.cells[expCol]) : undefined,
                    party: cellText(cr.cells[partyCol]) !== "—" ? cellText(cr.cells[partyCol]) : undefined,
                    contact: cellText(cr.cells[contactCol]) !== "—" ? cellText(cr.cells[contactCol]) : undefined,
                    docId: contractsRef.docId,
                })).filter((c) => c.name && c.name !== "—");

                const matches = matchWarrantyContracts(houseName, candidates);

                if (matches.length === 0) {
                    const empty = document.createElement("p");
                    empty.className = "lv-caption";
                    empty.textContent = t("warranty.noContracts");
                    section.appendChild(empty);
                } else {
                    for (const m of matches) {
                        const card = document.createElement("div");
                        card.style.cssText = "padding:10px 12px;border:1px solid var(--lv-line);border-radius:var(--lv-r-2);background:var(--lv-surface-2);margin-bottom:8px";

                        const cardHeader = document.createElement("div");
                        cardHeader.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px";
                        const titleEl = document.createElement("b");
                        titleEl.style.cssText = "font-size:13px;color:var(--lv-tx)";
                        titleEl.textContent = m.contract.name;

                        const tag = document.createElement("span");
                        const evalState = m.evaluation;
                        let tagText = "";
                        let tagColor = "var(--lv-tx-3)";
                        let tagBg = "var(--lv-surface)";
                        if (evalState.status === "valid") {
                            tagText = t("warranty.statusValid").replace("${n}", String(evalState.daysLeft ?? 0));
                            tagColor = "var(--lv-ok)";
                            tagBg = "var(--lv-accent-soft)";
                        } else if (evalState.status === "soon") {
                            tagText = t("warranty.statusSoon").replace("${n}", String(evalState.daysLeft ?? 0));
                            tagColor = "var(--lv-warn)";
                            tagBg = "rgba(245, 158, 11, 0.12)";
                        } else if (evalState.status === "expired") {
                            tagText = t("warranty.statusExpired").replace("${n}", String(evalState.daysExpired ?? 0));
                            tagColor = "var(--lv-danger)";
                            tagBg = "rgba(239, 68, 68, 0.12)";
                        } else {
                            tagText = t("warranty.statusUnknown");
                        }
                        tag.style.cssText = `font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;color:${tagColor};background:${tagBg}`;
                        tag.textContent = tagText;

                        cardHeader.append(titleEl, tag);
                        card.appendChild(cardHeader);

                        const details = document.createElement("div");
                        details.style.cssText = "font-size:12px;color:var(--lv-tx-3);display:flex;flex-wrap:wrap;gap:12px;margin-bottom:6px";
                        if (m.contract.party) {
                            details.innerHTML += `<span>${t("warranty.party")}：<b style="color:var(--lv-tx-2)">${escapeHtml(m.contract.party)}</b></span>`;
                        }
                        if (m.contract.contact) {
                            details.innerHTML += `<span>${t("warranty.contact")}：<b style="color:var(--lv-tx-2)">${escapeHtml(m.contract.contact)}</b></span>`;
                        }
                        if (m.contract.expiry) {
                            details.innerHTML += `<span>${t("warranty.expiry")}：<b style="color:var(--lv-tx-2)">${escapeHtml(m.contract.expiry)}</b></span>`;
                        }
                        card.appendChild(details);

                        if (m.contract.docId) {
                            const openBtn = document.createElement("button");
                            openBtn.className = "b3-button b3-button--text b3-button--small";
                            openBtn.style.cssText = "padding:0;font-size:11.5px";
                            openBtn.textContent = `${t("warranty.openContract")} →`;
                            openBtn.onclick = () => plugin.showTabDocs(m.contract.docId);
                            card.appendChild(openBtn);
                        }

                        section.appendChild(card);
                    }

                    const disclaimer = document.createElement("p");
                    disclaimer.className = "lv-caption";
                    disclaimer.style.cssText = "margin-top:6px;line-height:1.4;color:var(--lv-tx-3);font-size:11.5px";
                    disclaimer.textContent = `⚠️ ${t("warranty.disclaimer")}`;
                    section.appendChild(disclaimer);
                }
            } catch (err) {
                const errEl = document.createElement("p");
                errEl.className = "ft__error";
                errEl.style.fontSize = "12px";
                errEl.textContent = String(err);
                section.appendChild(errEl);
            }
            body.appendChild(section);
        }
        void addHouseWarrantySection();

        // Parenting 3-day solid food observation timeline and health allergy link
        function addParentingSolidsSection() {
            if (active !== "parenting") return;
            const categoryVal = String(cellText(row.cells[ref!.columns.category]));
            // Only feeding records (or foods) have 3-day observation
            if (categoryVal !== "feeding" && categoryVal !== t("field.category.opt.feeding")) return;
            const foodName = String(cellText(row.cells[ref!.columns.name]));
            const dateVal = String(cellText(row.cells[ref!.columns.date]));
            if (!foodName || foodName === "—" || !dateVal || dateVal === "—") return;

            const obs = calculateSolidsObservation(dateVal);

            const section = document.createElement("div");
            section.className = "lv-solids-section";
            section.style.cssText = "margin-top:14px;padding-top:12px;border-top:1px solid var(--b3-border-color)";

            const head = document.createElement("div");
            head.className = "ft__on-surface";
            head.style.cssText = "font-size:12px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between";
            const headTitle = document.createElement("span");
            headTitle.textContent = t("solids.sectionTitle");
            const headStatus = document.createElement("span");
            headStatus.style.cssText = `font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;color:${obs.isObserving ? "var(--lv-warn)" : "var(--lv-ok)"};background:${obs.isObserving ? "rgba(245, 158, 11, 0.12)" : "var(--lv-accent-soft)"}`;
            headStatus.textContent = obs.isObserving ? `${t(obs.labelKey)} · ${t("solids.remainingDays").replace("${n}", String(obs.remainingDays))}` : t("solids.completed");
            head.append(headTitle, headStatus);
            section.appendChild(head);

            // 3-day timeline steps
            const timeline = document.createElement("div");
            timeline.style.cssText = "display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin-bottom:10px";
            for (const win of obs.dayWindows) {
                const dayBox = document.createElement("div");
                const isCurrent = win.isToday;
                const isPassed = win.isPast;
                dayBox.style.cssText = `padding:8px;border:1px solid ${isCurrent ? "var(--lv-accent)" : "var(--lv-line)"};border-radius:var(--lv-r-2);background:${isCurrent ? "var(--lv-accent-soft)" : "var(--lv-surface-2)"};text-align:center`;
                dayBox.innerHTML = `
                    <div style="font-size:11.5px;font-weight:600;color:${isCurrent ? "var(--lv-accent)" : "var(--lv-tx)"}">Day ${win.day}</div>
                    <div style="font-size:11px;color:var(--lv-tx-3);margin-top:2px">${escapeHtml(win.date)}</div>
                    <div style="font-size:10.5px;margin-top:4px;color:${isCurrent ? "var(--lv-accent)" : isPassed ? "var(--lv-ok)" : "var(--lv-tx-3)"}">${isCurrent ? "● 今日" : isPassed ? "✓ 已过" : "待观察"}</div>
                `;
                timeline.appendChild(dayBox);
            }
            section.appendChild(timeline);

            const hint = document.createElement("p");
            hint.className = "lv-caption";
            hint.style.cssText = "font-size:11.5px;line-height:1.4;margin:0 0 10px 0;color:var(--lv-tx-3)";
            hint.textContent = `💡 ${t("solids.hint")}`;
            section.appendChild(hint);

            // Allergy link button
            const allergyBtn = document.createElement("button");
            allergyBtn.className = "b3-button b3-button--outline";
            allergyBtn.style.cssText = "font-size:12px;display:inline-flex;align-items:center;gap:6px";
            allergyBtn.textContent = `⚠️ ${t("solids.linkAllergy")}`;
            allergyBtn.onclick = () => {
                const promptDlg = new Dialog({
                    title: t("solids.linkAllergyTitle"),
                    content: `
                        <div class="b3-dialog__content fn__flex" style="flex-direction:column;gap:10px;padding:16px 20px">
                            <label class="ft__on-surface" style="font-size:12px;font-weight:600">${t("solids.symptomsPrompt")}</label>
                            <input id="lv-allergy-symptoms" class="b3-text-field" placeholder="例如：嘴角周围发红、轻微皮疹、腹泻" style="width:100%" />
                        </div>
                        <div class="b3-dialog__action">
                            <button class="b3-button b3-button--cancel" id="lv-allergy-cancel">${t("cancel")}</button>
                            <button class="b3-button b3-button--text ft__error" id="lv-allergy-confirm" style="color:var(--lv-danger)">${t("confirm")}</button>
                        </div>
                    `,
                    width: "400px",
                });
                const symptomsInput = promptDlg.element.querySelector("#lv-allergy-symptoms") as HTMLInputElement;
                const cancel = promptDlg.element.querySelector("#lv-allergy-cancel") as HTMLButtonElement;
                const confirmBtn = promptDlg.element.querySelector("#lv-allergy-confirm") as HTMLButtonElement;
                cancel.onclick = () => promptDlg.destroy();
                confirmBtn.onclick = async () => {
                    const healthRef = plugin.settings.dbRefs?.["health"];
                    if (!healthRef?.avId) {
                        showMessage(t("solids.linkAllergyFailed").replace("${msg}", "Health ledger not provisioned"), 5000, "error");
                        return;
                    }
                    const symptoms = symptomsInput.value.trim();
                    const memberBlockId = ref?.columns?.member ? row.cells[ref.columns.member]?.relation?.blockIDs?.[0] : undefined;
                    const allergyPayload = buildAllergyFromFeeding({
                        foodName,
                        reactionDate: localDateKey(new Date()),
                        symptoms,
                        memberBlockId,
                    });

                    confirmBtn.disabled = true;
                    cancel.disabled = true;
                    try {
                        const { addDetachedRow, setCell } = await import("@/core/siyuan");
                        const operationKey = `ledger:solids-allergy:${row.itemID}`;
                        const newRowId = await addDetachedRow(healthRef.avId, allergyPayload.name, {
                            idempotencyKey: `${operationKey}:row`,
                            retries: 1,
                        });
                        const hCols = healthRef.columns ?? {};
                        if (hCols.category) {
                            await setCell(healthRef.avId, hCols.category, newRowId, selectCellValue("allergy"), {
                                idempotencyKey: `${operationKey}:category`,
                                retries: 1,
                            });
                        }
                        if (hCols.date) {
                            await setCell(healthRef.avId, hCols.date, newRowId, {
                                type: "date",
                                date: { content: new Date(`${allergyPayload.date}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true },
                            }, { idempotencyKey: `${operationKey}:date`, retries: 1 });
                        }
                        if (hCols.diagnosis) {
                            await setCell(healthRef.avId, hCols.diagnosis, newRowId, {
                                type: "text",
                                text: { content: allergyPayload.diagnosis },
                            }, { idempotencyKey: `${operationKey}:diagnosis`, retries: 1 });
                        }
                        if (hCols.note) {
                            await setCell(healthRef.avId, hCols.note, newRowId, {
                                type: "text",
                                text: { content: allergyPayload.note },
                            }, { idempotencyKey: `${operationKey}:note`, retries: 1 });
                        }
                        if (hCols.member && allergyPayload.memberBlockId) {
                            await setCell(healthRef.avId, hCols.member, newRowId, {
                                type: "relation",
                                relation: { blockIDs: [allergyPayload.memberBlockId], contents: null },
                            }, { idempotencyKey: `${operationKey}:member`, retries: 1 });
                        }

                        promptDlg.destroy();
                        showMessage(t("solids.linkAllergyDone").replace("${name}", allergyPayload.name), 3000, "info");
                        try {
                            await plugin.refreshHub?.(["health"]);
                        } catch { /* ignored */ }
                    } catch (err) {
                        showMessage(t("solids.linkAllergyFailed").replace("${msg}", err instanceof Error ? err.message : String(err)), 5000, "error");
                        confirmBtn.disabled = false;
                        cancel.disabled = false;
                    }
                };
                setTimeout(() => symptomsInput?.focus(), 50);
            };
            section.appendChild(allergyBtn);

            body.appendChild(section);
        }
        addParentingSolidsSection();

        // Food ingredients allergy conflict screening against health ledger
        async function addFoodAllergySection() {
            if (active !== "food") return;
            const healthRef = plugin.settings.dbRefs?.["health"];
            if (!healthRef?.avId) return;

            const dishName = String(cellText(row.cells[ref!.columns.name]));
            const ingredients = ref!.columns.ingredients ? String(cellText(row.cells[ref!.columns.ingredients])) : "";
            if (!dishName || dishName === "—") return;

            try {
                const { renderLedgerAll } = await import("@/core/siyuan");
                const healthLedger = await renderLedgerAll(healthRef.avId);
                const hNameCol = healthRef.columns?.name;
                const hCatCol = healthRef.columns?.category;
                const hDiagCol = healthRef.columns?.diagnosis;
                const hMemCol = healthRef.columns?.member;

                const allergyRows = healthLedger.rows.filter((hr) => {
                    const catVal = String(cellText(hr.cells[hCatCol]));
                    return catVal === "allergy" || catVal === t("field.category.opt.allergy");
                });

                if (allergyRows.length === 0) return;

                const memMap = new Map((plugin.settings.members ?? []).map((m) => [m.avItemId, m.name]));

                const allergies: FamilyAllergy[] = allergyRows.map((hr) => {
                    const aName = cellText(hr.cells[hNameCol]);
                    const aDiag = cellText(hr.cells[hDiagCol]);
                    const memberBid = hMemCol ? hr.cells[hMemCol]?.relation?.blockIDs?.[0] : undefined;
                    const memberName = memberBid ? memMap.get(memberBid) : undefined;
                    return {
                        name: aName,
                        diagnosis: aDiag !== "—" ? aDiag : undefined,
                        memberBlockId: memberBid,
                        memberName,
                    };
                });

                const conflicts = checkAllergyConflicts(dishName, ingredients !== "—" ? ingredients : "", allergies);

                if (conflicts.length === 0) return;

                const alertBox = document.createElement("div");
                alertBox.className = "lv-allergy-alert";
                alertBox.style.cssText = "margin-top:14px;padding:12px 14px;border-radius:var(--lv-r-2);background:color-mix(in srgb, var(--lv-danger) 10%, var(--lv-surface));border:1px solid color-mix(in srgb, var(--lv-danger) 35%, transparent);box-shadow:inset 0 1px 0 var(--lv-inset)";

                const titleRow = document.createElement("div");
                titleRow.style.cssText = "display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--lv-danger);margin-bottom:6px";
                titleRow.innerHTML = `<span>⚠️</span><span>${t("allergy.alertTitle")}</span>`;
                alertBox.appendChild(titleRow);

                const bannerNote = document.createElement("p");
                bannerNote.style.cssText = "font-size:12px;color:var(--lv-tx);margin:0 0 8px 0;line-height:1.4";
                bannerNote.textContent = t("allergy.alertBanner");
                alertBox.appendChild(bannerNote);

                const list = document.createElement("div");
                list.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-bottom:8px";
                for (const c of conflicts) {
                    const item = document.createElement("div");
                    item.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border-radius:4px;background:var(--lv-surface);font-size:12px;border:1px solid var(--lv-line)";
                    const inLabel = c.matchedIn === "ingredients" ? t("allergy.matchedInIngredients") : t("allergy.matchedInName");
                    item.innerHTML = `
                        <span style="color:var(--lv-danger);font-weight:600">${escapeHtml(t("allergy.memberConflict").replace("${member}", c.memberName).replace("${allergen}", c.allergen))}</span>
                        <span class="lv-caption" style="font-size:11px">${escapeHtml(inLabel)}</span>
                    `;
                    list.appendChild(item);
                }
                alertBox.appendChild(list);

                const notice = document.createElement("p");
                notice.className = "lv-caption";
                notice.style.cssText = "font-size:11.5px;color:var(--lv-tx-3);margin:0;line-height:1.4";
                notice.textContent = `💡 ${t("allergy.cautionNotice")}`;
                alertBox.appendChild(notice);

                body.appendChild(alertBox);
            } catch {
                // Silently skip if health ledger read fails
            }
        }
        void addFoodAllergySection();

        function addTravelCheckButton() {
            if (active !== "travel-plan") return;
            const btn = document.createElement("button");
            btn.className = "b3-button b3-button--outline";
            btn.style.cssText = "margin-top:8px;font-size:12px";
            btn.textContent = `✈️ ${t("travel.checkButton")}`;
            btn.onclick = () => openTravelCertsCheckDialog(row);
            body.appendChild(btn);
        }
        addTravelCheckButton();

        // Real asset lifecycle transitions & lending/repairing integration
        function addAssetLifecycleSection() {
            if (active !== "assets-real" || !ref?.columns?.status) return;
            const statusCol = ref.columns.status;
            const curStatus = String(cellText(row.cells[statusCol]));
            const transitions = getAllowedStatusTransitions(curStatus);
            if (transitions.length === 0) return;

            const section = document.createElement("div");
            section.className = "lv-asset-lifecycle-section";
            section.style.cssText = "margin-top:14px;padding-top:12px;border-top:1px solid var(--b3-border-color)";

            const header = document.createElement("div");
            header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px";
            header.innerHTML = `
                <span class="ft__on-surface" style="font-size:12px;font-weight:600">${t("asset.lifecycleTitle")}</span>
                <span class="lv-badge" style="font-size:11px">${optLabel(t, "status", curStatus)}</span>
            `;
            section.appendChild(header);

            const actionsRow = document.createElement("div");
            actionsRow.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap";

            for (const tr of transitions) {
                const btn = document.createElement("button");
                btn.className = "b3-button b3-button--outline b3-button--small";
                btn.style.cssText = "font-size:12px;display:inline-flex;align-items:center;gap:4px";
                btn.textContent = t(tr.actionKey);

                btn.onclick = async () => {
                    if (tr.requiresInput === "borrower") {
                        const promptDlg = new Dialog({
                            title: t("asset.action.lend"),
                            content: `
                                <div class="b3-dialog__content fn__flex" style="flex-direction:column;gap:10px;padding:16px 20px">
                                    <label class="ft__on-surface" style="font-size:12px;font-weight:600">${t("asset.lendPrompt")}</label>
                                    <input id="lv-lend-borrower" class="b3-text-field" placeholder="例如：表弟、朋友小张" style="width:100%" />
                                </div>
                                <div class="b3-dialog__action">
                                    <button class="b3-button b3-button--cancel" id="lv-lend-cancel">${t("cancel")}</button>
                                    <button class="b3-button" id="lv-lend-confirm">${t("confirm")}</button>
                                </div>
                            `,
                            width: "380px",
                        });
                        const borrowerInput = promptDlg.element.querySelector("#lv-lend-borrower") as HTMLInputElement;
                        const cancelBtn = promptDlg.element.querySelector("#lv-lend-cancel") as HTMLButtonElement;
                        const confirmBtn = promptDlg.element.querySelector("#lv-lend-confirm") as HTMLButtonElement;
                        cancelBtn.onclick = () => promptDlg.destroy();
                        confirmBtn.onclick = async () => {
                            const borrower = borrowerInput.value.trim();
                            if (!borrower) {
                                borrowerInput.focus();
                                return;
                            }
                            confirmBtn.disabled = true;
                            try {
                                const { setCell } = await import("@/core/siyuan");
                                const { updateRowLogs, appendEntry } = await import("@/core/rowlog");
                                await setCell(ref!.avId!, statusCol, row.itemID, selectCellValue("lent"), {
                                    idempotencyKey: `asset:status:${row.itemID}:lent`,
                                    retries: 1,
                                });
                                await updateRowLogs(plugin as any, (current) => appendEntry(current, ref!.avId!, row.itemID, "loans", {
                                    date: localDateKey(new Date()),
                                    to: borrower,
                                    back: "",
                                    at: new Date().toISOString(),
                                }));
                                promptDlg.destroy();
                                dlg.destroy();
                                showMessage(t("asset.lendDone").replace("${to}", borrower), 3000, "info");
                                await load();
                            } catch (err) {
                                showMessage(String(err), 5000, "error");
                                confirmBtn.disabled = false;
                            }
                        };
                        setTimeout(() => borrowerInput?.focus(), 50);
                        return;
                    }

                    // 普通状态直接变更
                    btn.disabled = true;
                    try {
                        const { setCell } = await import("@/core/siyuan");
                        await setCell(ref!.avId!, statusCol, row.itemID, selectCellValue(tr.target), {
                            idempotencyKey: `asset:status:${row.itemID}:${tr.target}`,
                            retries: 1,
                        });
                        // 如果是归还，更新 loans
                        if (tr.target === "inuse" && curStatus === "lent") {
                            const { updateRowLogs, appendEntry } = await import("@/core/rowlog");
                            await updateRowLogs(plugin as any, (current) => appendEntry(current, ref!.avId!, row.itemID, "loans", {
                                date: localDateKey(new Date()),
                                to: "已归还",
                                back: localDateKey(new Date()),
                                at: new Date().toISOString(),
                            }));
                        }
                        dlg.destroy();
                        showMessage(t("asset.statusUpdated").replace("${status}", optLabel(t, "status", tr.target)), 2500, "info");
                        await load();
                    } catch (err) {
                        showMessage(String(err), 5000, "error");
                        btn.disabled = false;
                    }
                };

                actionsRow.appendChild(btn);
            }

            section.appendChild(actionsRow);
            body.appendChild(section);
        }
        addAssetLifecycleSection();

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
                const bridge = (window as { LvContacts?: {
                    ensurePerson: (name: string) => Promise<{ docId: string; name: string; created: boolean }>;
                    recordInteraction: (ids: readonly string[], meta?: { ref?: string; date?: string; note?: string }) => Promise<{ recorded: number }>;
                } }).LvContacts;
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
        // Copy the detail card as desensitized text.
        const maskedBtn = dlg.element.querySelector("#lv-detail-card-text-masked") as HTMLButtonElement | null;
        if (maskedBtn) {
            maskedBtn.onclick = async () => {
                const text = formatDesensitizedRecord(cardTitle, cardRows);
                try {
                    await navigator.clipboard.writeText(text);
                    showMessage(t("ledger.copyAsMaskedTextOk"), 2500, "info");
                } catch (e) {
                    showMessage(t("ledger.copyAsImageFail") + ` (${e instanceof Error ? e.message : String(e)})`, 5000, "error");
                }
            };
        }
        // Row deletion is explicit and confirmed before mutation.
        (dlg.element.querySelector("#lv-detail-del") as HTMLButtonElement).onclick = () => {
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
        <!-- Switching modules clears the previous search query. -->
        <select class="b3-select" value={active} onchange={switchLedger}>
            {#each ledgers as l (l.id)}
                <option value={l.id}>{t(`module.${l.id}`)}{l.ref?.avId ? "" : ` (${t("diag.missing")})`}</option>
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
        <input class="b3-text-field" style="width:150px" type="search" placeholder={t("ledger.search")}
            bind:value={searchText} oninput={(event) => { panelMemory.ledgerSearch = event.currentTarget.value; }} title={t("ledger.search")} />
        <button class="b3-button b3-button--outline" title={t("ledger.toggleDensity")} aria-label={t("ledger.toggleDensity")} onclick={toggleDensity}>
            {density === "comfortable" ? t("ledger.densityCompact") : t("ledger.densityComfortable")}
        </button>
        <button class="lv-btn primary" onclick={openNewRecord} disabled={rebuilding}>＋ {t("ledger.newRecord")}</button>
        <details class="lv-ledger-more">
            <summary class="b3-button b3-button--outline">{t("ledger.moreActions")}</summary>
            <div class="lv-ledger-more__menu">
                <button class="b3-button b3-button--outline" onclick={toggleDensity}>{t("ledger.toggleDensity")}（{density === "comfortable" ? t("ledger.densityComfortable") : t("ledger.densityCompact")}）</button>
                <button class="b3-button b3-button--outline" title={t("ledger.exportCsvTip")}
                    disabled={filteredRows.length === 0 || exporting || printing} aria-busy={exporting} onclick={exportCsv}>{exporting ? t("ledger.saving") : t("ledger.exportCsv")}</button>
                <button class="b3-button b3-button--outline" title={t("ledger.printLabels")}
                    disabled={filteredRows.length === 0 || printing || exporting} aria-busy={printing} onclick={printLabels}>{printing ? t("ledger.saving") : t("ledger.printLabels")}</button>
                {#if active === "vehicles"}<button class="b3-button b3-button--outline" onclick={openEnergyDashboard}>{t("fuel.dashboardButton")}</button>{/if}
                {#if active === "parenting"}<button class="b3-button b3-button--outline" onclick={openGrowthChart}>{t("ledger.growthChart")}</button><button class="b3-button b3-button--outline" onclick={openImmunizationScheduleDialog}>{t("immunization.scheduleButton")}</button>{/if}
                {#if active === "travel-plan"}<button class="b3-button b3-button--outline" onclick={() => openTravelCertsCheckDialog()}>{t("travel.checkButton")}</button>{/if}
                {#if active === "favors"}<button class="b3-button b3-button--outline" onclick={openFavorsReportModal}>{t("favors.reportButton")}</button>{/if}
                {#if active === "stock"}<button class="b3-button b3-button--outline" onclick={openShoppingList}>{t("ledger.shoppingList")}</button>{/if}
                {#if active === "bookmarks"}<button class="b3-button b3-button--outline" onclick={openBookmarksCheckDialog}>{t("bookmarks.checkButton")}</button>{/if}
                {#if active !== "members" && active !== "adhoc"}<button class="b3-button b3-button--outline" disabled={printing || exporting} onclick={openCsvImport}>{t("ledger.importCsv")}</button>{/if}
                {#if ref?.columns?.member}<button class="b3-button b3-button--outline" title={t("ledger.batchReassignMemberTip")} onclick={openBatchReassignModal}>{t("ledger.batchReassignMember")}</button>{/if}
                <button class="b3-button b3-button--outline" onclick={() => plugin.showTabDocs(ref?.docId)}>{t("ledger.openDoc")} →</button>
            </div>
        </details>
    {/if}
</div>

{#if paymentSummary && paymentSummary.sourceCount > 0}
    <section class="lv-payment-banner lv-card" aria-label={t("payment.summaryTitle")}>
        <div class="lv-payment-hero">
            <div class="lv-payment-metric">
                <span class="lv-payment-label">{t("payment.monthlyEquivalent")}</span>
                <b class="lv-payment-amount lv-num">¥ {formatAmount(paymentSummary.monthlyTotal, plugin.settings.hideAmounts)}</b>
                <span class="lv-payment-sub">{t("payment.annualEquivalent")}：¥ {formatAmount(paymentSummary.annualTotal, plugin.settings.hideAmounts)}</span>
            </div>
            <div class="lv-payment-stats">
                {#if paymentSummary.overdueTotal > 0}
                    <div class="lv-payment-chip overdue"><span><b>¥ {formatAmount(paymentSummary.overdueTotal, plugin.settings.hideAmounts)}</b> {t("payment.overdue")}</span></div>
                {/if}
                <div class="lv-payment-chip"><span><b>{paymentSummary.next7Total > 0 ? `¥ ${formatAmount(paymentSummary.next7Total, plugin.settings.hideAmounts)}` : "—"}</b> {t("payment.next7")}</span></div>
                <div class="lv-payment-chip highlight"><span><b>{paymentSummary.next30Total > 0 ? `¥ ${formatAmount(paymentSummary.next30Total, plugin.settings.hideAmounts)}` : "—"}</b> {t("payment.next30")}</span></div>
            </div>
        </div>
        {#if paymentSummary.overdue.length > 0}
            <div class="lv-payment-top lv-payment-top--overdue">
                <span class="lv-payment-top__title">{t("payment.overdueItems")}：</span>
                {#each paymentSummary.overdue.slice(0, 3) as item (item.moduleId + item.rowId)}
                    <button type="button" class="lv-payment-top__tag" title={item.title} aria-label={item.title}
                        onclick={() => openPaymentSource(item)}>
                        {item.title} · {Math.abs(item.daysUntil)}{t("payment.daysOverdue")} · {item.dueDate} · ¥{formatAmount(item.amount, plugin.settings.hideAmounts)}
                    </button>
                {/each}
            </div>
        {/if}
        {#if paymentSummary.upcoming.length > 0}
            <div class="lv-payment-top">
                <span class="lv-payment-top__title">{t("payment.upcoming")}：</span>
                {#each paymentSummary.upcoming.slice(0, 3) as item (item.moduleId + item.rowId)}
                    <button type="button" class="lv-payment-top__tag" title={item.title} aria-label={item.title}
                        onclick={() => openPaymentSource(item)}>
                        {item.title} · {paymentCycleLabel(item)} · {paymentDueLabel(item.daysUntil)} · {item.dueDate} · ¥{formatAmount(item.amount, plugin.settings.hideAmounts)}
                    </button>
                {/each}
            </div>
        {:else if paymentSummary.overdue.length === 0}
            <div class="lv-payment-empty">{t("payment.noUpcoming")}</div>
        {/if}
        {#if paymentSummary.topRecurring.length > 0}
            <div class="lv-payment-top" aria-label={t("payment.topRecurring")}>
                <span class="lv-payment-top__title">{t("payment.topRecurring")}：</span>
                {#each paymentSummary.topRecurring.slice(0, 3) as item (item.moduleId + item.rowId)}
                    <button type="button" class="lv-payment-top__tag" title={item.title} aria-label={item.title}
                        onclick={() => openPaymentSource(item)}>
                        {item.title} · {paymentCycleLabel(item)} · ¥{formatAmount(item.monthlyCost, plugin.settings.hideAmounts)}{t("payment.perMonth")}
                    </button>
                {/each}
            </div>
        {/if}
        {#if paymentQualityIssueCount > 0}
            <div class="lv-payment-quality" role="status">
                {t("payment.dataQuality").replace("${count}", String(paymentQualityIssueCount))} ·
                {#if paymentSummary.dataQuality.missingCycle > 0}{t("payment.missingCycle")} ×{paymentSummary.dataQuality.missingCycle}{/if}
                {#if paymentSummary.dataQuality.unknownCycle > 0} {t("payment.unknownCycle")} ×{paymentSummary.dataQuality.unknownCycle}{/if}
                {#if paymentSummary.dataQuality.missingDate > 0} {t("payment.missingDate")} ×{paymentSummary.dataQuality.missingDate}{/if}
            </div>
        {/if}
    </section>
{/if}

{#if active === "memberships" && membershipSummary && membershipSummary.activeCount > 0}
    <section class="lv-membership-banner lv-card" aria-label={t("membership.banner.title")}>
        <div class="lv-membership-hero">
            <div class="lv-membership-metric">
                <span class="lv-membership-label">{t("membership.banner.monthly")}</span>
                <b class="lv-membership-amount lv-num">¥ {formatAmount(membershipSummary.monthlyTotal, plugin.settings.hideAmounts)}</b>
                <span class="lv-membership-sub">{t("membership.banner.annual")}：¥ {formatAmount(membershipSummary.annualTotal, plugin.settings.hideAmounts)}</span>
            </div>
            <div class="lv-membership-stats">
                <div class="lv-membership-chip">
                    <UiIcon name="repeat" size={14} />
                    <span><b>{membershipSummary.activeCount}</b> {t("membership.banner.active")}</span>
                </div>
                {#if membershipSummary.autoRenewCount > 0}
                    <div class="lv-membership-chip highlight">
                        <UiIcon name="bolt" size={14} />
                        <span><b>{membershipSummary.autoRenewCount}</b> {t("membership.banner.autoRenew")}</span>
                    </div>
                {/if}
            </div>
        </div>
        {#if membershipSummary.topItems.length > 0}
            <div class="lv-membership-top">
                <span class="lv-membership-top__title">{t("membership.banner.top")}：</span>
                {#each membershipSummary.topItems as item (item.name)}
                    <span class="lv-membership-top__tag">
                        {item.name} · ¥{formatAmount(item.monthlyCost, plugin.settings.hideAmounts)}{t("membership.banner.unitCnyPerMonth")}
                    </span>
                {/each}
            </div>
        {/if}
    </section>
{/if}

{#if active === "medicine" && medicineSummary && rows.length > 0}
    <section class="lv-medicine-banner lv-card" aria-label={t("medicine.banner.title")}>
        <div class="lv-medicine-hero">
            <div class="lv-medicine-metric">
                <span class="lv-medicine-label">{t("medicine.banner.title")}</span>
                <div class="lv-medicine-tags">
                    {#if medicineSummary.expiredCount > 0}
                        <span class="lv-badge red lv-num">
                            <UiIcon name="alert" size={12} /> {medicineSummary.expiredCount} {t("medicine.banner.expired")}
                        </span>
                    {/if}
                    {#if medicineSummary.lowStockCount > 0}
                        <span class="lv-badge orange lv-num">
                            <UiIcon name="box" size={12} /> {medicineSummary.lowStockCount} {t("medicine.banner.lowStock")}
                        </span>
                    {/if}
                    {#if medicineSummary.expiringSoonCount > 0}
                        <span class="lv-badge yellow lv-num">
                            <UiIcon name="clock" size={12} /> {medicineSummary.expiringSoonCount} {t("medicine.banner.expiring")}
                        </span>
                    {/if}
                    {#if medicineSummary.itemsNeedingAttention.length === 0}
                        <span class="lv-badge green">
                            <UiIcon name="check" size={12} /> {t("medicine.banner.allHealthy")}
                        </span>
                    {/if}
                </div>
            </div>
            {#if medicineSummary.itemsNeedingAttention.length > 0}
                <button type="button" class="b3-button b3-button--outline lv-medicine-btn" onclick={copyMedicineRestock}>
                    <UiIcon name="note" size={14} /> {t("medicine.banner.copyRestock")}
                </button>
            {/if}
        </div>
    </section>
{/if}

{#if active === "favors" && favorsSummary && favorsSummary.totalCount > 0}
    <section class="lv-favors-banner lv-card" aria-label={t("favors.bannerTitle")}>
        <div class="lv-favors-hero">
            <div class="lv-favors-metric">
                <span class="lv-favors-label">{t("favors.netAmount")}（{favorsSummary.year}）</span>
                <b class="lv-favors-amount lv-num">¥ {formatAmount(favorsSummary.netAmount, plugin.settings.hideAmounts)}</b>
                <div class="lv-favors-sub">
                    <span>{t("favors.totalIn")}：<b style="color:var(--lv-ok)">¥ {formatAmount(favorsSummary.totalIn, plugin.settings.hideAmounts)}</b></span>
                    <span>{t("favors.totalOut")}：¥ {formatAmount(favorsSummary.totalOut, plugin.settings.hideAmounts)}</span>
                </div>
            </div>
            <div class="lv-favors-stats">
                <div class="lv-favors-chip in">
                    <span><b>{favorsSummary.countIn}</b> {t("favors.countIn")}</span>
                </div>
                <div class="lv-favors-chip out">
                    <span><b>{favorsSummary.countOut}</b> {t("favors.countOut")}</span>
                </div>
                <button class="b3-button b3-button--outline b3-button--small" onclick={openFavorsReportModal}>
                    {t("favors.reportButton")} →
                </button>
            </div>
        </div>
        {#if favorsSummary.topIn.length > 0}
            <div class="lv-favors-top">
                <span class="lv-favors-top__title">{t("favors.topIn")}：</span>
                {#each favorsSummary.topIn.slice(0, 3) as p (p.person)}
                    <span class="lv-favors-top__tag">
                        {p.person} · ¥{formatAmount(p.totalIn, plugin.settings.hideAmounts)}
                    </span>
                {/each}
            </div>
        {/if}
    </section>
{/if}

{#if active === "assets-real" && realAssetSummary && realAssetSummary.activeItemCount > 0}
    <section class="lv-asset-banner lv-card" aria-label={t("assets.valuationTitle")}>
        <div class="lv-asset-hero">
            <div class="lv-asset-metric">
                <span class="lv-asset-label">{t("assets.valuationTitle")}</span>
                <b class="lv-asset-amount lv-num">¥ {formatAmount(realAssetSummary.totalRealValuation, plugin.settings.hideAmounts)}</b>
                <span class="lv-asset-sub">{t("assets.activeCount")}：{realAssetSummary.activeItemCount} 件{#if realAssetSummary.disposedItemCount > 0} · {t("assets.disposedCount")}：{realAssetSummary.disposedItemCount} 件{/if}</span>
                <span class="lv-asset-source" title={assetSnapshotCount > 0 ? t("assets.snapshotSource").replace("${n}", String(assetSnapshotCount)).replace("${date}", assetValuationSnapshotDate) : t("assets.purchaseSource")}>
                    {assetSnapshotCount > 0
                        ? t("assets.snapshotSource").replace("${n}", String(assetSnapshotCount)).replace("${date}", assetValuationSnapshotDate)
                        : t("assets.purchaseSource")}
                </span>
            </div>
            <div class="lv-asset-stats">
                <div class="lv-asset-chip">
                    <UiIcon name="homeAlt" size={14} />
                    <span><b>{realAssetSummary.activeItemCount}</b> {t("assets.activeCount")}</span>
                </div>
            </div>
        </div>
        {#if realAssetSummary.topAssets.length > 0}
            <div class="lv-asset-top">
                <span class="lv-asset-top__title">{t("assets.topTitle")}：</span>
                {#each realAssetSummary.topAssets.slice(0, 3) as item (item.name)}
                    <span class="lv-asset-top__tag">
                        {item.name} · ¥{formatAmount(item.amount, plugin.settings.hideAmounts)}
                    </span>
                {/each}
            </div>
        {/if}
        {#if realAssetSummary.byCategory.length > 0}
            <div class="lv-asset-category" aria-label={t("assets.categoryTitle")}>
                <div class="lv-asset-category__title">{t("assets.categoryTitle")}</div>
                <div class="lv-asset-category__list" role="list">
                    {#each realAssetSummary.byCategory as item (item.category)}
                        <div class="lv-asset-category__row" role="listitem">
                            <div class="lv-asset-category__meta">
                                <span>{optLabel(t, "category", item.category)}</span>
                                <span>{item.count} · {item.percentage}%</span>
                            </div>
                            <div class="lv-asset-category__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={item.percentage} aria-label={`${optLabel(t, "category", item.category)} ${item.percentage}%`}>
                                <span style={`width:${Math.max(0, Math.min(100, item.percentage))}%`}></span>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </section>
{/if}

{#if active === "schooling" && schoolingMilestones.length > 0}
    {@const currentMilestone = schoolingMilestones[selectedSchoolingIndex] ?? schoolingMilestones[0]}
    <section class="lv-schooling-banner lv-card" aria-label={t("schooling.bannerTitle")}>
        <div class="lv-schooling-top">
            <div class="lv-schooling-header">
                <UiIcon name="backpack" size={16} />
                <span class="lv-schooling-title">{t("schooling.bannerTitle")}</span>
            </div>
            {#if schoolingMilestones.length > 1}
                <div class="lv-schooling-students" role="tablist" aria-label={t("schooling.bannerTitle")}>
                    {#each schoolingMilestones as m, idx (m.studentName + m.milestoneName)}
                        <button type="button" class="lv-schooling-student-chip" class:active={(selectedSchoolingIndex < schoolingMilestones.length ? selectedSchoolingIndex : 0) === idx}
                            onclick={() => { selectedSchoolingIndex = idx; }}>
                            {m.studentName} · {m.milestoneName}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        {#if currentMilestone}
            <div class="lv-schooling-body">
                <div class="lv-schooling-metric">
                    <span class="lv-schooling-label">
                        {currentMilestone.studentName}（{currentMilestone.schoolName}）· {t("schooling.countdown").replace("${milestone}", currentMilestone.milestoneName)}
                    </span>
                    <b class="lv-schooling-countdown lv-num">
                        {#if currentMilestone.yearsLeft > 0}
                            {currentMilestone.yearsLeft} <span class="unit">{t("schooling.years")}</span>
                        {/if}
                        {#if currentMilestone.monthsLeft > 0}
                            {currentMilestone.monthsLeft} <span class="unit">{t("schooling.months")}</span>
                        {/if}
                        {#if currentMilestone.yearsLeft === 0 && currentMilestone.monthsLeft === 0}
                            {currentMilestone.daysLeft} <span class="unit">{t("schooling.days")}</span>
                        {/if}
                    </b>
                    <span class="lv-schooling-sub">
                        {t("schooling.targetDate")}：<b>{currentMilestone.targetDate}</b> · {t("schooling.nextMilestone")}：<b>{currentMilestone.milestoneName}</b>
                    </span>
                </div>
            </div>
        {/if}
    </section>
{/if}

{#if active === "media" && mediaSummary && mediaSummary.totalCount > 0}
    <section class="lv-media-banner lv-card" aria-label={t("media.bannerTitle")}>
        <div class="lv-media-hero">
            <div class="lv-media-metric">
                <span class="lv-media-label">{t("media.bannerTitle")}（{mediaSummary.year}）</span>
                <b class="lv-media-amount lv-num">{mediaSummary.doneThisYearCount} <span style="font-size:14px;font-weight:500;color:var(--lv-tx-2)">{t("media.items")} {t("media.doneThisYear")}</span></b>
                <div class="lv-media-sub">
                    <span>{t("media.doneTotal")}：<b style="color:var(--lv-ok)">{mediaSummary.doneCount}</b></span>
                    <span>{t("media.consuming")}：<b>{mediaSummary.consumingCount}</b></span>
                    <span>{t("media.wishlist")}：{mediaSummary.wishlistCount}</span>
                    {#if mediaSummary.averageRating > 0}
                        <span>{t("media.averageRating")}：<b style="color:var(--lv-amber)">★ {mediaSummary.averageRating}</b></span>
                    {/if}
                </div>
            </div>
            <div class="lv-media-stats">
                <div class="lv-media-chip active">
                    <UiIcon name="film" size={14} />
                    <span><b>{mediaSummary.consumingCount}</b> {t("media.consuming")}</span>
                </div>
                <div class="lv-media-chip">
                    <UiIcon name="bookmark" size={14} />
                    <span><b>{mediaSummary.wishlistCount}</b> {t("media.wishlist")}</span>
                </div>
            </div>
        </div>
        {#if mediaSummary.consumingList.length > 0}
            <div class="lv-media-top">
                <span class="lv-media-top__title">{t("media.currentConsuming")}：</span>
                {#each mediaSummary.consumingList as item (item.name)}
                    <span class="lv-media-top__tag">
                        {item.name} · {item.progress}
                    </span>
                {/each}
            </div>
        {/if}
    </section>
{/if}

{#if active === "pets" && petCareSummary && petCareSummary.totalPets > 0}
    <section class="lv-pets-banner lv-card" aria-label={t("pets.bannerTitle")}>
        <div class="lv-pets-hero">
            <div class="lv-pets-metric">
                <span class="lv-pets-label">{t("pets.bannerTitle")}</span>
                <div class="lv-pets-tags">
                    {#if petCareSummary.overdueCount > 0}
                        <span class="lv-badge red lv-num">
                            <UiIcon name="alert" size={12} /> {petCareSummary.overdueCount} {t("pets.overdue")}
                        </span>
                    {/if}
                    {#if petCareSummary.upcomingVaccineCount > 0}
                        <span class="lv-badge orange lv-num">
                            <UiIcon name="heartPulse" size={12} /> {petCareSummary.upcomingVaccineCount} {t("pets.upcomingVaccine")}
                        </span>
                    {/if}
                    {#if petCareSummary.upcomingDewormCount > 0}
                        <span class="lv-badge yellow lv-num">
                            <UiIcon name="clock" size={12} /> {petCareSummary.upcomingDewormCount} {t("pets.upcomingDeworm")}
                        </span>
                    {/if}
                    {#if petCareSummary.overdueCount === 0 && petCareSummary.upcomingVaccineCount === 0 && petCareSummary.upcomingDewormCount === 0}
                        <span class="lv-badge green">
                            <UiIcon name="check" size={12} /> {t("pets.allHealthy")}
                        </span>
                    {/if}
                </div>
            </div>
            <div class="lv-pets-stats">
                <div class="lv-pets-chip">
                    <UiIcon name="paw" size={14} />
                    <span><b>{petCareSummary.totalPets}</b> {t("module.pets")}</span>
                </div>
            </div>
        </div>
        {#if petCareSummary.pets.some(p => p.needsCare)}
            <div class="lv-pets-list">
                {#each petCareSummary.pets.filter(p => p.needsCare) as pet (pet.name)}
                    <div class="lv-pets-item">
                        <b>{pet.name}</b>
                        {#if pet.vaccineDue}
                            <span style="color:var(--lv-{pet.vaccineStatus === 'overdue' ? 'danger' : 'warn'})">{t("pets.vaccineDue")}：{pet.vaccineDue}</span>
                        {/if}
                        {#if pet.dewormDue}
                            <span style="color:var(--lv-{pet.dewormStatus === 'overdue' ? 'danger' : 'warn'})">{t("pets.dewormDue")}：{pet.dewormDue}</span>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}
    </section>
{/if}

{#if active === "social" && (plugin.settings.members ?? []).length > 0}
    {@const membersList = plugin.settings.members ?? []}
    <section class="lv-retirement-banner lv-card" aria-label={t("social.banner.title")}>
        <div class="lv-retirement-top">
            <div class="lv-retirement-header">
                <UiIcon name="users" size={16} />
                <span class="lv-retirement-title">{t("social.banner.title")}</span>
            </div>
            {#if membersList.length > 1}
                <div class="lv-retirement-members" role="tablist" aria-label={t("members.title")}>
                    {#each membersList as m (m.id)}
                        <button type="button" class="lv-retirement-member-chip" class:active={(targetRetireMember?.id ?? membersList[0]?.id) === m.id}
                            onclick={() => { selectedRetireMemberId = m.id; retireWorkerTypeOverride = undefined; }}>
                            {m.name}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        {#if targetRetireMember}
            {#if retireCalc}
                <div class="lv-retirement-body">
                    <div class="lv-retirement-metric">
                        <span class="lv-retirement-label">
                            {targetRetireMember.name} · {t("social.banner.countdown")}
                        </span>
                        {#if retireCalc.isRetired}
                            <b class="lv-retirement-countdown retired">{t("social.banner.alreadyRetired")}</b>
                            <span class="lv-retirement-sub">
                                {t("social.banner.retireDate")}：{retireCalc.retireDateStr}（{retireCalc.targetAgeYears}{t("social.banner.years")}{#if retireCalc.targetAgeMonths > 0}{retireCalc.targetAgeMonths}{t("social.banner.months")}{/if}）
                            </span>
                        {:else}
                            <b class="lv-retirement-countdown lv-num">
                                {#if retireCalc.yearsLeft > 0}
                                    {retireCalc.yearsLeft} <span class="unit">{t("social.banner.years")}</span>
                                {/if}
                                {retireCalc.monthsLeft} <span class="unit">{t("social.banner.months")}</span>
                            </b>
                            <span class="lv-retirement-sub">
                                {t("social.banner.retireDate")}：<b>{retireCalc.retireDateStr}</b> · {t("social.banner.targetAge")}：{retireCalc.targetAgeYears}{t("social.banner.years")}{#if retireCalc.targetAgeMonths > 0}{retireCalc.targetAgeMonths}{t("social.banner.months")}{/if}
                                {#if retireCalc.delayMonths > 0}
                                    · {t("social.banner.delayed")} {retireCalc.delayMonths}{t("social.banner.months")}
                                {/if}
                            </span>
                        {/if}
                    </div>

                    <div class="lv-retirement-controls">
                        <select class="b3-select lv-retirement-select" value={currentRetireWorkerType}
                            onchange={(e) => { retireWorkerTypeOverride = (e.currentTarget as HTMLSelectElement).value as RetirementWorkerType; }}>
                            <option value="male">{t("social.banner.workerType.male")}</option>
                            <option value="female_55">{t("social.banner.workerType.female_55")}</option>
                            <option value="female_50">{t("social.banner.workerType.female_50")}</option>
                        </select>
                    </div>
                </div>
            {:else}
                <div class="lv-retirement-empty">
                    <UiIcon name="calendar" size={16} />
                    <span>{targetRetireMember.name}：{t("social.banner.needBirthday")}</span>
                    <button class="b3-button b3-button--text" onclick={() => plugin.panelScreenSwitch?.("members")}>
                        {t("startGuide.openMembers")} →
                    </button>
                </div>
            {/if}
        {/if}
    </section>
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
                                <input id="lv-new-{e.key}" class="b3-text-field" type="text" placeholder={fieldMetaText(e.placeholderKey) || fieldLabel(e.key)} bind:value={form[e.key]} disabled={saving || identityPending} aria-invalid={!!formFieldError(e)} aria-describedby={formFieldError(e) ? `lv-new-${e.key}-error` : undefined} />
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
    <div class="lv-card lv-table-wrap lv-table" class:compact={density === "compact"} style="margin-top:12px">
        <table bind:this={ledgerTableEl}>
            <thead><tr>
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
                    <tr class="lv-virtual-spacer" aria-hidden="true"><td colspan={tableKeys.length + 1} style={`height:${virtualRange.start * VIRTUAL_ROW_HEIGHT}px`}></td></tr>
                {/if}
                {#each virtualRows as r (r.itemID)}
                    {@const tone = ledgerTone(r)}
                    {@const rowName = cellText(r.cells[ref.columns.name], "name") || cellText(r.cells[ref.columns.title], "title") || t("ledger.detail")}
                    <tr class="lv-row-link" onclick={() => openDetail(r)} title={t("ledger.detail")}>
                        <td class="lv-sev-cell">
                            <button type="button" class="lv-table-open" aria-label={`${t("ledger.detail")}：${rowName}`} title={t("ledger.detail")}
                                onclick={(e) => { e.stopPropagation(); openDetail(r); }}>
                                <span class="lv-sev {toneCls(tone)}" aria-hidden="true"></span><UiIcon name="forward" size={14} />
                            </button>
                        </td>
                        {#each tableKeys as k (k)}
                            {@const v = r.cells[ref.columns[k]]}
                            <td class="lv-num" style={k === "expiry" || k === "due" ? `color:${toneColor(tone)}` : ""}>
                                {cellText(v, k)}
                            </td>
                        {/each}
                    </tr>
                {/each}
                {#if virtualRange.end < visibleRows.length}
                    <tr class="lv-virtual-spacer" aria-hidden="true"><td colspan={tableKeys.length + 1} style={`height:${(visibleRows.length - virtualRange.end) * VIRTUAL_ROW_HEIGHT}px`}></td></tr>
                {/if}
                {#if filteredRows.length > visibleRows.length}
                    <!-- Progressive rendering load-more row. -->
                    <tr class="lv-more">
                        <td colspan={tableKeys.length + 1}>
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
{/if}
