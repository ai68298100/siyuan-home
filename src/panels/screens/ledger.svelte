<script lang="ts">
    import { renderLedger, addDetachedRow, setCell, RowIdentityPendingError } from "@/core/siyuan";
    import { localDateKey } from "@/core/hub/rule";
    import { showMessage, Dialog, confirm } from "siyuan";
    import type { HomePluginLike } from "@/types/plugin";
    import { saveRuntime } from "@/core/hub/runtime";
    import { openContactPicker } from "@/libs/contact-picker";

    let { plugin, t, version }: { plugin: HomePluginLike; t: (k: string) => string; version?: number } = $props();

    // 台账页模块下拉：已建库 + 已启用但未建库的模块（26.7：后者可从页面直接触发重建）
    const ledgers = $derived(
        plugin.settings.enabledModules
            .filter((id: string) => id !== "members")
            .map((id: string) => ({ id, ref: plugin.settings.dbRefs[id] })),
    );
    // 初始快照为设计意图（activeLedger 由模块卡/快速记录预选）
    // svelte-ignore state_referenced_locally
    let active = $state(plugin.activeLedger ?? "certs");
    let rows: any[] = $state([]);
    let loading = $state(false);
    let rebuilding = $state(false);
    // 17 组：台账内搜索（标题/备注 contains，与成员过滤不叠加——本页无成员过滤）
    let searchText = $state("");
    // 17 组：排序偏好记忆（表头点击切换列/方向，跨会话持久化）
    // svelte-ignore state_referenced_locally
    let sortKey = $state<string>(plugin.runtime.ledgerSortKey ?? "");
    // svelte-ignore state_referenced_locally
    let sortAsc = $state<boolean>(plugin.runtime.ledgerSortAsc ?? true);
    async function toggleSort(k: string) {
        if (sortKey === k) sortAsc = !sortAsc;
        else { sortKey = k; sortAsc = true; }
        plugin.runtime.ledgerSortKey = sortKey;
        plugin.runtime.ledgerSortAsc = sortAsc;
                await saveRuntime(plugin, plugin.runtime);
    }
    const filteredRows = $derived.by(() => {
        const q = searchText.trim().toLowerCase();
        let list = rows;
        if (q) {
            list = list.filter((r) => {
                const nameCol = ref?.columns?.name ? (r.cells[ref.columns.name]?.text?.content ?? r.cells[ref.columns.name]?.block?.content ?? "") : "";
                const noteCol = ref?.columns?.note ? (r.cells[ref.columns.note]?.text?.content ?? "") : "";
                return nameCol.toLowerCase().includes(q) || noteCol.toLowerCase().includes(q);
            });
        }
        const keyID = sortKey ? ref?.columns?.[sortKey] : undefined;
        if (!keyID) return list;
        return [...list].sort((a, b) => {
            const av = cellText(a.cells[keyID]);
            const bv = cellText(b.cells[keyID]);
            const an = parseFloat(av);
            const bn = parseFloat(bv);
            const cmp = !isNaN(an) && !isNaN(bn) && av !== "—" && bv !== "—" ? an - bn : av.localeCompare(bv);
            return sortAsc ? cmp : -cmp;
        });
    });

    const ref = $derived(plugin.settings.dbRefs[active]);
    const schemaKeys = $derived<string[]>(ref?.columns ? Object.keys(ref.columns) : []);

    // 13 组/DL11：CSV 导出（当前模块、schema 全列、BOM 头兼容 Excel；本地生成不外传）
    function exportCsv() {
        if (!ref?.columns || filteredRows.length === 0) return;
        const cols = (plugin.schemaCatalog?.[active]?.columns ?? []).filter((c: any) => ref!.columns![c.key]);
        const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
        const head = cols.map((c: any) => esc(t(`field.${c.key}`) !== `field.${c.key}` ? t(`field.${c.key}`) : c.key)).join(",");
        const lines = filteredRows.map((r) => cols.map((c: any) => esc(cellText(r.cells[ref!.columns![c.key]]))).join(","));
        const blob = new Blob(["\uFEFF" + [head, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `lv-${active}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    async function rebuildLedger() {
        rebuilding = true;
        try {
            await plugin.ensureCoreLedgers();
            await plugin.refreshHub();
        } finally {
            rebuilding = false;
        }
    }

    async function load() {
        if (!ref?.avId) { rows = []; return; }
        loading = true;
        try {
            const res = await renderLedger(ref.avId);
            rows = res.rows;
        } finally {
            loading = false;
        }
    }
    $effect(() => { void version; void active; void plugin.scan?.scannedAt; load(); });

    // D09：capture 驱动的快速表单——列集/类型/枚举全部来自 schema（不再写死字段）。
    // asset/mAsset/mSelect 列快速表单不支持，显式说明（不静默省略）。
    const captureCols = $derived.by(() => {
        const schema = plugin.schemaCatalog?.[active];
        if (!schema?.capture) return [] as { key: string; type: string; options?: string[] }[];
        const cols: any[] = schema.columns ?? [];
        const out: { key: string; type: string; options?: string[] }[] = [];
        for (const key of schema.capture as string[]) {
            const col = cols.find((c: any) => c.key === key);
            if (col) out.push({ key: col.key, type: col.type, options: col.options });
        }
        return out;
    });
    const UNSUPPORTED_TYPES = ["asset", "mAsset", "mSelect"];
    const supportableCols = $derived(captureCols.filter((e) => !UNSUPPORTED_TYPES.includes(e.type)));
    const unsupportedCount = $derived(captureCols.filter((e) => UNSUPPORTED_TYPES.includes(e.type)).length);
    // 表单值：列 key → 输入值（select/relation 为字符串值，checkbox 为布尔）
    let form: Record<string, any> = $state({});
    // D03：保存状态与恢复——saving 防双击；失败保留输入；已建行 itemID 保留，重试补写同一行
    let saving = $state(false);
    let saveError = $state("");
    let identityPending = $state(false); // 行已提交但身份未确认（D02）：禁止自动重试，防重复建行
    let savedModule = $state(""); // C6b：保存成功回执（"保存并查看"入口，8 秒自动消失）
    let pendingItemID: string | null = null;

    function cellValue(type: string, v: any): unknown | null {
        switch (type) {
            case "select": return { type: "select", select: { content: v } };
            case "relation": return { type: "relation", relation: { blockIDs: [v], contents: null } };
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
    }));

    function resetForm() {
        form = {};
        saveError = ""; identityPending = false; pendingItemID = null;
    }

    /** 单元格值 → 显示文本（详情抽屉/表格共用；日期走本地时区） */
    function cellText(v: any): string {
        if (!v) return "—";
        switch (v.type) {
            case "text": return v.text?.content ?? "—";
            case "date": return v.date?.isNotEmpty ? localDateKey(new Date(v.date.content)) : "—";
            case "select": return v.select?.content ?? "—";
            case "mSelect": return v.mSelect?.length ? v.mSelect.map((o: any) => o.content).join("、") : "—";
            case "number": return v.number?.isNotEmpty ? String(v.number.content) : "—";
            case "url": return v.url?.content ?? "—";
            case "checkbox": return v.checkbox?.checked ? "✓" : "—";
            case "block": return v.block?.content ?? "—";
            case "relation": return (v.relation?.contents ?? []).map((c: any) => c.block?.content ?? "").join("、") || "—";
            default: return "—";
        }
    }

    // 详情抽屉：值 ↔ 编辑态互转（A5 行编辑 UI 层；relation 复杂编辑暂不开放）
    function rawFromValue(type: string, v: any): any {
        switch (type) {
            case "number": return v?.number?.isNotEmpty && typeof v.number.content === "number" ? v.number.content : "";
            case "date": return v?.date?.isNotEmpty ? localDateKey(new Date(v.date.content)) : "";
            case "checkbox": return !!v?.checkbox?.checked;
            case "select": return v?.select?.content ?? "";
            case "url": return v?.url?.content ?? "";
            default: return v?.text?.content ?? "";
        }
    }

    // EC13：从人脉选人（共享对话框见 src/libs/contact-picker.ts；快照格式 `名称 [docId]`）
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

    // C4b：行点击 → 详情抽屉（全列 kv；DOM 构建用户内容，不走 HTML 模板——19 组安全）
    function openDetail(row: any) {
        if (!ref?.columns) return;
        const dlg = new Dialog({
            title: t("ledger.detail"),
            content: `<div class="b3-dialog__content b3-dialog__content--wrap" id="lv-detail-body" style="max-height:60vh;overflow:auto"></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-detail-del">${t("delete")}</button><span style="flex:1"></span><button class="b3-button b3-button--cancel" id="lv-detail-close">${t("cancel")}</button><button class="b3-button b3-button--text" id="lv-detail-edit">${t("members.edit")}</button><button class="b3-button b3-button--text" id="lv-detail-open">${t("ledger.openDoc")} ↗</button></div>`,
            width: "520px",
        });
        const body = dlg.element.querySelector("#lv-detail-body") as HTMLElement;
        const schemaCols: any[] = plugin.schemaCatalog?.[active]?.columns ?? [];
        // A5 行编辑 UI 层：可编辑类型（relation/mAsset 等复杂类型仍在台账文档编辑）
        const EDITABLE = new Set(["text", "number", "date", "select", "url", "checkbox"]);
        const colLabel = (col: any) => (t(`field.${col.key}`) !== `field.${col.key}` ? t(`field.${col.key}`) : col.key);
        function labelSpan(col: any) {
            const k = document.createElement("span");
            k.className = "ft__on-surface";
            k.style.cssText = "min-width:96px;flex-shrink:0";
            k.textContent = colLabel(col);
            return k;
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
                line.style.cssText = "padding:2px 0;font-size:12.5px";
                line.textContent = `${h.from} → ${h.to} · ${h.at.slice(0, 10)}`;
                body.appendChild(line);
            }
        }
        function addAttachmentsSection() {
            const attCol: any = schemaCols.find((c) => c.key === "attachments");
            const attKeyID = ref!.columns.attachments;
            if (!attCol || !attKeyID) return;
            const attHead = document.createElement("div");
            attHead.className = "ft__on-surface";
            attHead.style.cssText = "margin-top:10px;padding-top:8px;border-top:1px solid var(--b3-border-color);font-size:12px";
            attHead.textContent = t("field.attachments");
            body.appendChild(attHead);
            const existing = (row.cells[attKeyID]?.mAsset ?? []) as { name?: string; content?: string }[];
            for (const f of existing) {
                const line = document.createElement("div");
                line.style.cssText = "padding:2px 0;font-size:12.5px;word-break:break-all";
                line.textContent = `📎 ${f.name ?? f.content ?? "?"}`;
                body.appendChild(line);
            }
            if (existing.length === 0) {
                const none = document.createElement("div");
                none.className = "ft__on-surface";
                none.style.cssText = "font-size:12.5px";
                none.textContent = t("ledger.noAttachments");
                body.appendChild(none);
            }
            const uploadBtn = document.createElement("button");
            uploadBtn.className = "b3-button b3-button--outline";
            uploadBtn.style.cssText = "margin-top:6px;font-size:12px";
            uploadBtn.textContent = t("ledger.upload");
            const fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.multiple = true;
            fileInput.style.display = "none";
            uploadBtn.onclick = () => fileInput.click();
            fileInput.onchange = async () => {
                const files = Array.from(fileInput.files ?? []);
                if (files.length === 0) return;
                const failed: string[] = [];
                const appended = [...existing];
                for (const f of files) {
                    try {
                        const { uploadAsset } = await import("@/core/siyuan");
                        const { name, path } = await uploadAsset(f);
                        appended.push({ name, content: path });
                    } catch (e) {
                        failed.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
                    }
                }
                if (appended.length !== existing.length) {
                    try {
                        await setCell(ref!.avId!, attKeyID, row.itemID, { type: "mAsset", mAsset: appended });
                        const msg = failed.length ? `${t("ledger.uploadFailed").replace("${msg}", failed.join("; "))}` : t("ledger.uploadDone");
                        showMessage(msg, 5000, failed.length ? "error" : "info");
                    } catch (e) {
                        showMessage(t("ledger.uploadFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                    }
                } else if (failed.length) {
                    showMessage(t("ledger.uploadFailed").replace("${msg}", failed.join("; ")), 6000, "error");
                }
                dlg.destroy();
                await load();
                // 附件写入不影响提醒派生——无需扫描（PF06：无相关变更不重扫）
            };
            body.appendChild(uploadBtn);
            body.appendChild(fileInput);
        }
        // 查看模式：kv 行 + 历史 + 附件
        function buildView() {
            body.innerHTML = "";
            for (const col of schemaCols) {
                const keyID = ref!.columns[col.key];
                if (!keyID) continue;
                const line = document.createElement("div");
                line.className = "fn__flex";
                line.style.cssText = "gap:10px;padding:4px 0;font-size:13px";
                line.append(labelSpan(col));
                const v = document.createElement("span");
                v.style.cssText = "word-break:break-all";
                v.textContent = cellText(row.cells[keyID]);
                line.append(v);
                body.appendChild(line);
            }
            addHistorySection();
            addAttachmentsSection();
            addFavorsSyncSection();
        }
        // EC15：人情往来 → 人脉交集记录（ensurePerson + recordInteraction，externalRef 幂等；
        // 重复点击不产生重复记录；人脉未装/未初始化时降级提示）
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
                    const dir = row.cells[ref!.columns.direction ?? ""]?.select?.content ?? "";
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
        // 编辑模式（A5）：可编辑类型表单化，保存时逐字段容错写回（D03 语义：失败保留现场并报告）
        function buildEdit() {
            body.innerHTML = "";
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
                    for (const opt of col.options ?? []) sel.add(new Option(opt, String(opt)));
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
                wrap.append(control);
                // EC13：contact 列附加"从人脉选择"（window.LvContacts.searchPeople；未装人脉则不显示按钮）
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
            const saveBar = document.createElement("div");
            saveBar.style.cssText = "display:flex;gap:8px;margin-top:10px";
            const save = document.createElement("button");
            save.className = "b3-button b3-button--text";
            save.textContent = t("save");
            const cancel = document.createElement("button");
            cancel.className = "b3-button b3-button--outline";
            cancel.textContent = t("cancel");
            cancel.onclick = () => buildView();
            save.onclick = async () => {
                const failed: string[] = [];
                let changed = 0;
                let personChanged = false;
                const personKeyID = ref!.columns.person;
                for (const e of inputs) {
                    const v = e.get();
                    const orig = rawFromValue(e.type, row.cells[e.keyID]);
                    const same = e.type === "checkbox" ? v === orig : String(v) === String(orig);
                    if (same) continue;
                    try {
                        await setCell(ref!.avId!, e.keyID, row.itemID, cellValue(e.type, v));
                        changed++;
                        if (personKeyID && e.keyID === personKeyID) personChanged = true;
                    } catch {
                        failed.push(e.label); // D03 语义：失败字段聚合报告
                    }
                }
                // EC15：person 变更 → favorSyncs 失效（新对手方的交集需重新记录）
                if (personChanged && plugin.runtime?.favorSyncs?.[row.itemID]) {
                    delete plugin.runtime.favorSyncs[row.itemID];
                    const { saveRuntime } = await import("@/core/hub/runtime");
                    await saveRuntime(plugin, plugin.runtime);
                }
                dlg.destroy();
                if (changed > 0) {
                    await load();
                    await plugin.refreshHub([active]); // PF06：只重扫本模块
                }
                if (failed.length > 0) showMessage(t("ledger.savePartial").replace("${fields}", failed.join("、")), 6000, "error");
                else if (changed > 0) showMessage(t("ledger.editSaved"), 2500, "info");
            };
            saveBar.append(save, cancel);
            body.appendChild(saveBar);
        }
        buildView();
        (dlg.element.querySelector("#lv-detail-close") as HTMLButtonElement).onclick = () => dlg.destroy();
        (dlg.element.querySelector("#lv-detail-edit") as HTMLButtonElement).onclick = () => buildEdit();
        (dlg.element.querySelector("#lv-detail-open") as HTMLButtonElement).onclick = () => { dlg.destroy(); plugin.showTabDocs(ref?.docId); };
        // 17 组：行删除（detached 行走内核 av 删除端点 [待实测]；删除是显式用户动作，双确认说明影响范围）
        (dlg.element.querySelector("#lv-detail-del") as HTMLButtonElement).onclick = () => {
            confirm(t("ledger.delTitle"), t("ledger.delBody").replace("${name}", cellText(row.cells[ref.columns.name])), async () => {
                try {
                    const { removeLedgerRows } = await import("@/core/siyuan");
                    await removeLedgerRows(ref!.avId!, [row.itemID]);
                    // 行删除后清理孤儿运行态数据（renewHistory + favorSyncs）
                    let dirty = false;
                    if (plugin.runtime?.renewHistory?.[row.itemID]) {
                        delete plugin.runtime.renewHistory[row.itemID];
                        dirty = true;
                    }
                    if (plugin.runtime?.favorSyncs?.[row.itemID]) {
                        delete plugin.runtime.favorSyncs[row.itemID];
                        dirty = true;
                    }
                    if (dirty) {
                                                await saveRuntime(plugin, plugin.runtime);
                    }
                    showMessage(t("ledger.delDone"), 2500, "info");
                    dlg.destroy();
                    await load();
                    await plugin.refreshHub([active]); // PF06：只重扫本模块
                } catch (e) {
                    // 端点不可用等失败：给出人工路径，不静默假删
                    showMessage(t("ledger.delFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                }
            });
        };
    }

    async function createRow() {
        if (!ref?.avId || saving || identityPending || !hasAnyInput) return;
        saving = true;
        saveError = "";
        try {
            // 重试路径：部分字段失败时复用已建行（补写同一行，不重复建行）
            const itemID = pendingItemID ?? await addDetachedRow(ref.avId, String(form.name ?? "").trim() || t("ledger.unnamed"));
            pendingItemID = itemID;
            const cols = ref.columns ?? {};
            const failed: string[] = [];
            const tryCell = async (label: string, key: string | undefined, value: unknown) => {
                if (!key) return;
                try {
                    await setCell(ref.avId!, key, itemID, value);
                } catch {
                    failed.push(label); // D03：单字段失败不清空表单，逐字段保留现场
                }
            };
            for (const e of supportableCols) {
                const v = form[e.key];
                if (e.key !== "name" && (v === undefined || v === "" || v === false)) continue;
                if (e.key === "name" && !(v && String(v).trim()) && pendingItemID) continue; // 重试时不写空名
                if (e.type === "number" && (v === undefined || isNaN(Number(v)))) continue;
                await tryCell(t(`field.${e.key}`), cols[e.key], cellValue(e.type, e.key === "name" ? String(v ?? "").trim() : v));
            }
            // C6a 增量 3：自动写入默认状态（schema 显式声明优先，否则枚举首值；D11）
            const statusCol = (plugin.schemaCatalog?.[active]?.columns ?? []).find((c: any) => c.key === "status");
            if (statusCol?.options?.length) await tryCell(t("field.status"), cols.status, { type: "select", select: { content: statusCol.default ?? statusCol.options[0] } });
            if (failed.length > 0) {
                // 输入与 itemID 均保留：再次保存补写同一行（同键 60s 合并，重试不重复轰炸——17 组）
                saveError = t("ledger.savePartial").replace("${fields}", failed.join("、"));
                const { coalescedNotify } = await import("@/libs/notify-queue");
                coalescedNotify("ledger-save-error", () => showMessage(saveError, 6000, "error"));
            } else {
                resetForm();
                // C6b 保存回执：模块去向 + "保存并查看"入口（短暂展示，不打断录入）
                savedModule = active;
                setTimeout(() => { savedModule = ""; }, 8000);
            }
            await load();
            await plugin.refreshHub([active]); // PF06：只重扫本模块（新行可能产生提醒）
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
</script>

<div class="lv-hero"><h1>{t("ledger.title")}</h1><p>{t("ledger.subtitle")}</p></div>

<div style="display:flex;gap:10px;align-items:center;margin:14px 0;flex-wrap:wrap">
    <select class="b3-select" bind:value={active} onchange={() => (plugin.activeLedger = active)}>
        {#each ledgers as l (l.id)}
            <option value={l.id}>{t(`module.${l.id}`)}{l.ref?.avId ? "" : `（${t("diag.missing")}）`}</option>
        {/each}
    </select>
    <span class="fn__flex-1"></span>
    {#if rebuilding}
        <span class="lv-caption">{t("diag.rebuilding")}</span>
    {:else if !ref?.avId}
        <button class="b3-button" onclick={rebuildLedger}>{t("ledger.rebuild")}</button>
    {:else}
        <input class="b3-text-field" style="width:150px" type="search" placeholder={t("ledger.search")}
            bind:value={searchText} title={t("ledger.search")} />
        <button class="b3-button b3-button--outline" title={t("ledger.exportCsvTip")}
            disabled={filteredRows.length === 0} onclick={exportCsv}>{t("ledger.exportCsv")}</button>
        <button class="b3-button b3-button--outline" onclick={() => plugin.showTabDocs(ref?.docId)}>{t("ledger.openDoc")} ↗</button>
    {/if}
</div>

<div class="lv-card" style="padding:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    {#each supportableCols as e (e.key)}
        {#if e.type === "select"}
            <select class="b3-select" bind:value={form[e.key]} title={t(`field.${e.key}`)}>
                <option value="">{t(`field.${e.key}`)}</option>
                {#each e.options ?? [] as opt (opt)}
                    <option value={opt}>{t(`field.${e.key}.opt.${opt}`) !== `field.${e.key}.opt.${opt}` ? t(`field.${e.key}.opt.${opt}`) : opt}</option>
                {/each}
            </select>
        {:else if e.type === "relation"}
            <select class="b3-select" bind:value={form[e.key]} title={t(`field.${e.key}`)}>
                <option value="">{t(`field.${e.key}`)}: {t("members.all")}</option>
                {#each plugin.settings.members ?? [] as m (m.avItemId ?? m.id)}
                    <option value={m.avItemId}>{m.name}</option>
                {/each}
            </select>
        {:else if e.type === "date"}
            <input class="b3-text-field" type="date" title={t(`field.${e.key}`)} bind:value={form[e.key]} />
        {:else if e.type === "number"}
            <input class="b3-text-field" type="number" style="width:90px" placeholder={t(`field.${e.key}`)} bind:value={form[e.key]} />
        {:else if e.type === "url"}
            <input class="b3-text-field" style="min-width:140px" type="url" placeholder={t(`field.${e.key}`)} bind:value={form[e.key]} />
        {:else if e.type === "checkbox"}
            <label style="display:flex;gap:5px;align-items:center;font-size:12.5px;cursor:pointer">
                <input type="checkbox" class="b3-switch" bind:checked={form[e.key]} />{t(`field.${e.key}`)}
            </label>
        {:else if e.key === "name"}
            <input class="b3-text-field fn__flex-1" style="min-width:160px" placeholder={t("ledger.newName")} bind:value={form[e.key]} />
        {:else}
            <input class="b3-text-field" style="min-width:140px" placeholder={t(`field.${e.key}`)} bind:value={form[e.key]} />
        {/if}
    {/each}
    {#if unsupportedCount > 0}
        <span class="lv-caption" title={t("ledger.unsupportedInForm")}>ⓘ {t("ledger.unsupportedInForm")}</span>
    {/if}
    {#if savedModule}
        <div class="lv-caption" role="status" style="color:var(--lv-accent);flex-basis:100%">
            ✓ {t("ledger.savedTo").replace("${module}", t(`module.${savedModule}`) !== `module.${savedModule}` ? t(`module.${savedModule}`) : savedModule)}
            <button class="b3-button b3-button--text" style="padding:0 4px" onclick={() => plugin.showTabDocs(ref?.docId)}>{t("ledger.openDoc")} ↗</button>
        </div>
    {/if}
    {#if saveError}
        <div class="lv-caption" role="alert" style="color:var(--lv-danger);flex-basis:100%">⚠ {saveError}</div>
        <button class="b3-button b3-button--text" onclick={resetForm}>{t("ledger.reset")}</button>
    {/if}
    <button class="b3-button b3-button--text" onclick={createRow} disabled={!ref?.avId || saving || identityPending || !hasAnyInput}>
        {saving ? t("ledger.saving") : `＋ ${t("ledger.add")}`}
    </button>
</div>

{#if loading}
    <div class="lv-card" style="padding:20px"><div class="lv-skel" style="height:16px;width:60%"></div></div>
{:else if filteredRows.length === 0}
    {#if !ref?.avId}
        <div class="lv-card"><div class="lv-empty" role="status"><div class="eic">🚧</div><b>{t("ledger.notProvisioned")}</b><span>{t("ledger.notProvisionedHint")}</span></div></div>
    {:else if rows.length > 0}
        <!-- 搜索无命中 ≠ 台账为空（UI16/34 组空态语义） -->
        <div class="lv-card"><div class="lv-empty" role="status"><div class="eic">🔍</div><b>{t("ledger.searchEmpty")}</b><span>{t("ledger.searchEmptyHint").replace("${q}", searchText.trim())}</span></div></div>
    {:else}
        <div class="lv-card"><div class="lv-empty" role="status"><div class="eic">🗂</div><b>{t("ledger.empty")}</b><span>{t("ledger.emptyHint")}</span></div></div>
    {/if}
{:else}
    <div class="lv-card lv-table-wrap lv-table" style="margin-top:12px">
        <table>
            <thead><tr>
                {#each schemaKeys.filter((k) => ["name", "status", "expiry", "due"].includes(k)) as k (k)}
                    <th>
                        <button class="b3-button b3-button--text" style="padding:0 2px;font-weight:600" title={t("ledger.sortTip")}
                            onclick={() => toggleSort(k)}>
                            {t(`field.${k}`)}{sortKey === k ? (sortAsc ? " ↑" : " ↓") : ""}
                        </button>
                    </th>
                {/each}
            </tr></thead>
            <tbody>
                {#each filteredRows as r (r.itemID)}
                    <tr class="lv-row-link" role="button" tabindex="0"
                        onkeydown={(e: KeyboardEvent) => e.key === "Enter" && openDetail(r)}
                        onclick={() => openDetail(r)} title={t("ledger.detail")}>
                        {#each schemaKeys.filter((k) => ["name", "status", "expiry", "due"].includes(k)) as k (k)}
                            {@const v = r.cells[ref.columns[k]]}
                            <td class="lv-num">
                                {cellText(v)}
                            </td>
                        {/each}
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
{/if}
