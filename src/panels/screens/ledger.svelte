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

    // 第七十四轮：生长曲线（parenting）——身高/体重时间线 SVG；WHO 参考带待核实数据源后加入
    function openGrowthChart() {
        import("@/core/growth").then(({ collectGrowthSeries, whoBand }) => {
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
            // D23：参考带性别——自动（面板内全部系列同性别时启用）/手选/关闭
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
                o.textContent = t(key); // i18n 文案走 textContent（19 组安全）
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
                    // 参考带：裁剪到 0–60 月与数据窗口的交集；带值并入 y 域防裁剪
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
                    const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
                    // 轴与端点标注（数值轴 min/max；月龄轴 first/last）
                    svg.appendChild(el("line", { x1: PAD, y1: H - PAD, x2: W - PAD / 2, y2: H - PAD, stroke: "var(--b3-border-color)" }));
                    svg.appendChild(el("line", { x1: PAD, y1: PAD / 2, x2: PAD, y2: H - PAD, stroke: "var(--b3-border-color)" }));
                    svg.appendChild(el("text", { x: PAD - 6, y: PAD / 2 + 4, "text-anchor": "end", "font-size": 10 }, String(Math.round(yMax * 10) / 10)));
                    svg.appendChild(el("text", { x: PAD - 6, y: H - PAD + 4, "text-anchor": "end", "font-size": 10 }, String(Math.round(yMin * 10) / 10)));
                    svg.appendChild(el("text", { x: PAD, y: H - PAD + 14, "font-size": 10 }, String(xMin)));
                    svg.appendChild(el("text", { x: W - PAD / 2, y: H - PAD + 14, "text-anchor": "end", "font-size": 10 }, `${xMax}${xs.some((x) => x > 0) ? "月龄" : ""}`));
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
                        if (pts.length === 1) {
                            svg.appendChild(el("circle", { cx: sx(pts[0].ageMonths ?? 0), cy: sy(pts[0].value), r: 3, fill: color }));
                        } else {
                            svg.appendChild(el("polyline", {
                                points: pts.map((p) => `${sx(p.ageMonths ?? 0)},${sy(p.value)}`).join(" "),
                                fill: "none", stroke: color, "stroke-width": 2,
                            }));
                            for (const p of pts) svg.appendChild(el("circle", { cx: sx(p.ageMonths ?? 0), cy: sy(p.value), r: 2.5, fill: color }));
                        }
                        const legend = el("text", { x: PAD + 4, y: PAD / 2 + 16 + i * 14, "font-size": 11, fill: color });
                        legend.textContent = s.memberName; // 用户内容走 textContent（19 组安全）
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
        });
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
    // UI05：name 必填——为空但有其他字段时阻止提交（不允许"（未命名）"兜底）
    const nameMissing = $derived(hasAnyInput && !(form.name && String(form.name).trim()));

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
        // 子记录模型（2026-10-04 定案）：行日志时间线分区通用构造器（rowlogs.json；行删除联动清理）
        async function addRowLogSection(opts: {
            title: string;
            emptyText: string;
            addLabel: string;
            fields: { key: string; type: "date" | "number" | "text"; placeholder: string; width: number }[];
            load: () => Promise<Record<string, any>[]>;
            add: (vals: Record<string, string>) => Promise<boolean>;
            remove: (entry: Record<string, any>) => Promise<void>;
            format: (entry: Record<string, any>) => string;
        }) {
            const section = document.createElement("div");
            let loaded: Record<string, any>[] = [];
            const render = () => {
                section.replaceChildren();
                for (const e of loaded) {
                    const line = document.createElement("div");
                    line.style.cssText = "padding:2px 0;font-size:12.5px;display:flex;gap:6px;align-items:center";
                    const text = document.createElement("span");
                    text.textContent = opts.format(e);
                    const del = document.createElement("button");
                    del.className = "b3-button b3-button--text";
                    del.style.cssText = "padding:0 4px;font-size:12px";
                    del.textContent = "✕";
                    del.onclick = async () => {
                        await opts.remove(e);
                        loaded = await opts.load();
                        render();
                    };
                    line.append(text, del);
                    section.appendChild(line);
                }
                if (loaded.length === 0) {
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
                const vals = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
                if (!vals.date) {
                    showMessage(t("ledger.logInvalid"), 3000, "error");
                    return;
                }
                if (await opts.add(vals)) {
                    for (const i of Object.values(inputs)) i.value = "";
                    loaded = await opts.load();
                    render();
                }
            };
            form.appendChild(addBtn);
            body.appendChild(form);
            loaded = await opts.load();
            render();
        }

        addHistorySection();
        addAttachmentsSection();
        // 各模块时间线分区（只读通道共用 rowlogs.json；估值=口径日覆盖，其余=追加去重）
        (async () => {
            const rl = await import("@/core/rowlog");
            const at = () => new Date().toISOString();
            const fresh = () => rl.loadRowLogs(plugin as any);
            if (active === "assets") {
                await addRowLogSection({
                    title: t("ledger.valuations"), emptyText: t("ledger.noValuations"), addLabel: t("ledger.valAdd"),
                    fields: [
                        { key: "date", type: "date", placeholder: "", width: 130 },
                        { key: "value", type: "number", placeholder: t("ledger.valValue"), width: 100 },
                    ],
                    load: () => fresh().then((l) => rl.getValuations(l, ref!.avId!, row.itemID)),
                    add: async (v) => {
                        if (!Number.isFinite(Number(v.value))) { showMessage(t("ledger.logInvalid"), 3000, "error"); return false; }
                        await rl.saveRowLogs(plugin as any, rl.appendValuation(await fresh(), ref!.avId!, row.itemID, v.date, Number(v.value), at()));
                        return true;
                    },
                    remove: async (e) => { await rl.saveRowLogs(plugin as any, rl.removeValuation(await fresh(), ref!.avId!, row.itemID, e.date)); },
                    format: (e) => `${e.date} · ${e.value}`,
                });
                await addRowLogSection({
                    title: t("ledger.moves"), emptyText: t("ledger.noMoves"), addLabel: t("ledger.valAdd"),
                    fields: [
                        { key: "date", type: "date", placeholder: "", width: 130 },
                        { key: "from", type: "text", placeholder: t("ledger.moveFrom"), width: 90 },
                        { key: "to", type: "text", placeholder: t("ledger.moveTo"), width: 90 },
                    ],
                    load: () => fresh().then((l) => rl.getEntries<any>(l, ref!.avId!, row.itemID, "moves")),
                    add: async (v) => {
                        if (!v.from || !v.to) { showMessage(t("ledger.logInvalid"), 3000, "error"); return false; }
                        await rl.saveRowLogs(plugin as any, rl.appendEntry(await fresh(), ref!.avId!, row.itemID, "moves", { date: v.date, from: v.from, to: v.to, at: at() }));
                        return true;
                    },
                    remove: async (e) => { await rl.saveRowLogs(plugin as any, rl.removeEntry(await fresh(), ref!.avId!, row.itemID, "moves", e)); },
                    format: (e) => `${e.date} · ${e.from} → ${e.to}`,
                });
            } else if (active === "shopping") {
                await addRowLogSection({
                    title: t("ledger.prices"), emptyText: t("ledger.noPrices"), addLabel: t("ledger.valAdd"),
                    fields: [
                        { key: "date", type: "date", placeholder: "", width: 130 },
                        { key: "price", type: "number", placeholder: t("ledger.priceValue"), width: 90 },
                        { key: "channel", type: "text", placeholder: t("ledger.priceChannel"), width: 100 },
                    ],
                    load: () => fresh().then((l) => rl.getEntries<any>(l, ref!.avId!, row.itemID, "prices")),
                    add: async (v) => {
                        if (!Number.isFinite(Number(v.price))) { showMessage(t("ledger.logInvalid"), 3000, "error"); return false; }
                        await rl.saveRowLogs(plugin as any, rl.appendEntry(await fresh(), ref!.avId!, row.itemID, "prices", { date: v.date, price: Number(v.price), channel: v.channel, at: at() }));
                        return true;
                    },
                    remove: async (e) => { await rl.saveRowLogs(plugin as any, rl.removeEntry(await fresh(), ref!.avId!, row.itemID, "prices", e)); },
                    format: (e) => `${e.date} · ${e.price}${e.channel ? ` · ${e.channel}` : ""}`,
                });
            } else if (active === "schooling") {
                await addRowLogSection({
                    title: t("ledger.transfers"), emptyText: t("ledger.noTransfers"), addLabel: t("ledger.valAdd"),
                    fields: [
                        { key: "date", type: "date", placeholder: "", width: 130 },
                        { key: "from", type: "text", placeholder: t("ledger.transferFrom"), width: 90 },
                        { key: "to", type: "text", placeholder: t("ledger.transferTo"), width: 90 },
                    ],
                    load: () => fresh().then((l) => rl.getEntries<any>(l, ref!.avId!, row.itemID, "transfers")),
                    add: async (v) => {
                        if (!v.from || !v.to) { showMessage(t("ledger.logInvalid"), 3000, "error"); return false; }
                        await rl.saveRowLogs(plugin as any, rl.appendEntry(await fresh(), ref!.avId!, row.itemID, "transfers", { date: v.date, from: v.from, to: v.to, at: at() }));
                        return true;
                    },
                    remove: async (e) => { await rl.saveRowLogs(plugin as any, rl.removeEntry(await fresh(), ref!.avId!, row.itemID, "transfers", e)); },
                    format: (e) => `${e.date} · ${e.from} → ${e.to}`,
                });
            }
        })();

        // 模板基建（第七十轮）：有模板的模块给"生成文档"按钮——行字段注入模板 → 台账笔记本内建文档
        (async () => {
            const tplList = ((plugin.schemaCatalog?.[active] as any)?.templates ?? []) as { key: string; nameKey: string; file: string }[];
            for (const tp of tplList) {
                const label = t(tp.nameKey) !== tp.nameKey ? t(tp.nameKey) : tp.key;
                const btn = document.createElement("button");
                btn.className = "b3-button b3-button--outline";
                btn.style.cssText = "margin-top:8px;font-size:12px";
                btn.textContent = `${t("ledger.genDoc")}：${label}`;
                btn.onclick = async () => {
                    try {
                        const { getTemplate, renderTemplate } = await import("@/core/templates");
                        const { sql, createDocWithMd } = await import("@/core/siyuan");
                        const file = getTemplate(tp.file);
                        if (!file) throw new Error("template missing: " + tp.file);
                        const rows = await sql<{ box: string }>(`SELECT box FROM blocks WHERE id='${ref!.docId}' LIMIT 1`);
                        const notebook = rows[0]?.box;
                        if (!notebook) throw new Error("notebook not found for " + ref!.docId);
                        const vars: Record<string, string> = { name: String(cellText(row.cells[ref!.columns.name])), date: localDateKey(new Date()) };
                        for (const c of schemaCols) vars[c.key] = cellText(row.cells[ref!.columns[c.key]]);
                        const title = `${vars.name} · ${label} · ${vars.date}`;
                        const docId = await createDocWithMd(notebook, `/${title}`, renderTemplate(file, vars));
                        showMessage(t("ledger.genDocDone").replace("${title}", title), 3000, "info");
                        dlg.destroy();
                        plugin.showTabDocs(docId);
                    } catch (e) {
                        showMessage(t("ledger.genDocFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                    }
                };
                body.appendChild(btn);
            }
        })();
        // 16 组联动：health 处方/用药记录 → 药箱建行（category=rx、成员 relation 复制；未建库不出现按钮）
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
            btn.onclick = () => {
                confirm(t("ledger.rxToMedicine"), t("ledger.rxToMedicineBody").replace("${name}", name), async () => {
                    try {
                        const { addDetachedRow, setCell } = await import("@/core/siyuan");
                        const itemID = await addDetachedRow(medRef.avId!, name);
                        const catKey = medRef.columns?.category;
                        if (catKey) await setCell(medRef.avId!, catKey, itemID, { type: "select", select: { content: "rx" } });
                        const memKey = medRef.columns?.member;
                        const relBlock = row.cells[ref!.columns.member]?.relation?.blockIDs?.[0];
                        if (memKey && relBlock) await setCell(medRef.avId!, memKey, itemID, { type: "relation", relation: { blockIDs: [relBlock], contents: null } });
                        showMessage(t("ledger.rxToMedicineDone").replace("${name}", name), 3000, "info");
                        btn.disabled = true;
                    } catch (e) {
                        showMessage(t("ledger.rxToMedicineFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                    }
                });
            };
            body.appendChild(btn);
        }
        addRxToMedicineButton();

        // 16 组联动：shopping 购入 → 囤货库存（同名药箱行 stock_qty 增量；无匹配新建囤货行；数量缺省 1）
        function addStockInButton() {
            if (active !== "shopping") return;
            const medRef = plugin.settings.dbRefs?.["medicine"];
            if (!medRef?.avId) return;
            const name = String(cellText(row.cells[ref!.columns.name]));
            if (!name || name === "—") return;
            const qtyRaw = cellText(row.cells[ref!.columns.qty]);
            const qty = qtyRaw !== "—" && qtyRaw !== "" && Number.isFinite(Number(qtyRaw)) ? Number(qtyRaw) : 1;
            const btn = document.createElement("button");
            btn.className = "b3-button b3-button--outline";
            btn.style.cssText = "margin-top:8px;font-size:12px";
            btn.textContent = t("ledger.stockIn");
            btn.onclick = async () => {
                try {
                    const { renderLedger, addDetachedRow, setCell } = await import("@/core/siyuan");
                    const read = await renderLedger(medRef.avId!);
                    const nameKey = medRef.columns?.name;
                    const stockKey = medRef.columns?.stock_qty;
                    const matches = nameKey
                        ? read.rows.filter((r) => String(r.cells[nameKey]?.text?.content ?? "").trim() === name)
                        : [];
                    confirm(
                        t("ledger.stockIn"),
                        t("ledger.stockInBody").replace("${name}", name).replace("${qty}", String(qty)).replace("${n}", String(matches.length)),
                        async () => {
                            try {
                                if (matches[0] && stockKey) {
                                    const cur = matches[0].cells[stockKey]?.number;
                                    const curVal = cur?.isNotEmpty && typeof cur.content === "number" ? cur.content : 0;
                                    await setCell(medRef.avId!, stockKey, matches[0].itemID, { type: "number", number: { content: curVal + qty, isNotEmpty: true } });
                                } else {
                                    const itemID = await addDetachedRow(medRef.avId!, name);
                                    if (stockKey) await setCell(medRef.avId!, stockKey, itemID, { type: "number", number: { content: qty, isNotEmpty: true } });
                                }
                                showMessage(t("ledger.stockInDone").replace("${qty}", String(qty)).replace("${name}", name), 3000, "info");
                                btn.disabled = true;
                                await plugin.refreshHub?.(["medicine"]); // 低库存提醒即时重算
                            } catch (e) {
                                showMessage(t("ledger.stockInFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                            }
                        },
                    );
                } catch (e) {
                    showMessage(t("ledger.stockInFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
                }
            };
            body.appendChild(btn);
        }
        addStockInButton();

        // 16 组：certs 换证链——renewed_to relation 正向（新证）/反向（旧证）展示 + 关联新证行内选择器
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
                            try {
                                const { setCell } = await import("@/core/siyuan");
                                await setCell(ref!.avId!, relKey, row.itemID, { type: "relation", relation: { blockIDs: [r.itemID], contents: null } });
                                picker.destroy();
                                dlg.destroy();
                                showMessage(t("ledger.linked").replace("${name}", String(cellText(r.cells[ref!.columns.name]))), 2500, "info");
                                await load();
                                const fresh = rows.find((x) => x.itemID === row.itemID);
                                if (fresh) openDetail(fresh);
                            } catch (e) {
                                showMessage(t("ledger.renewLinkFailed").replace("${msg}", e instanceof Error ? e.message : String(e)), 6000, "error");
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
                line.textContent = `→ ${nameOf(id)}（${t("ledger.newCert")}）`;
                body.appendChild(line);
            }
            for (const r of backward) {
                const line = document.createElement("div");
                line.style.cssText = "padding:2px 0;font-size:12.5px";
                line.textContent = `← ${String(cellText(r.cells[ref!.columns.name]))}（${t("ledger.oldCert")}）`;
                body.appendChild(line);
            }
            body.appendChild(linkBtn());
        }
        addRenewChainSection();

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
                    const { removeLedgerRows, } = await import("@/core/siyuan");
                    await removeLedgerRows(ref!.avId!, [row.itemID]);
                    // 行删除后清理孤儿运行态数据（handled/handledYear/handledUntil/snoozed/renewHistory/favorSyncs）
                    const { cleanupRowRuntimeData } = await import("@/core/hub/runtime");
                    const dirty = cleanupRowRuntimeData(plugin.runtime, row.itemID);
                    if (dirty) {
                        await saveRuntime(plugin, plugin.runtime);
                    }
                    // 子记录模型：行日志（估值时间线等）一并清理
                    const { loadRowLogs, saveRowLogs, removeRowLog } = await import("@/core/rowlog");
                    const logs = removeRowLog(await loadRowLogs(plugin as any), ref!.avId!, row.itemID);
                    await saveRowLogs(plugin as any, logs);
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
        // UI05：name 必填——有其他输入但姓名为空时阻止建行（避免产生"（未命名）"行）
        if (nameMissing) {
            saveError = t("ledger.nameRequired");
            showMessage(saveError, 4000, "error");
            return;
        }
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
        {#if active === "parenting"}
            <button class="b3-button b3-button--outline" onclick={openGrowthChart}>{t("ledger.growthChart")}</button>
        {/if}
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
    {:else if nameMissing}
        <div class="lv-caption" role="status" style="color:var(--lv-warn);flex-basis:100%">{t("ledger.nameRequired")}</div>
    {/if}
    <button class="b3-button b3-button--text" onclick={createRow} disabled={!ref?.avId || saving || identityPending || !hasAnyInput || nameMissing}>
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
