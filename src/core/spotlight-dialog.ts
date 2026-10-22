/**
 * 全景生活检索对话框（Spotlight Dialog）：
 * 跨所有已启用模块实时并发检索家庭数据，支持键盘上下导航、回车直达或点击直达对应台账。
 * 独立模块，按需延迟加载。
 */
import { searchSpotlight, type SpotlightItem } from "./spotlight";
import { moduleIcon } from "./modules";
import { showMessage } from "siyuan";

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export interface SpotlightDialogOptions {
    t: (k: string) => string;
    plugin: {
        settings: {
            enabledModules?: string[];
            dbRefs: Record<string, { avId?: string; columns?: Record<string, string> }>;
            members?: Array<{ id: string; name: string; avItemId?: string }>;
        };
        schemaCatalog?: Record<string, any>;
    };
    DialogCls: new (options: { title?: string; content: string; width?: string; destroy?: () => void }) => {
        element: HTMLElement;
        destroy: () => void;
    };
    renderLedgerAllFn: (avId: string) => Promise<{ complete: boolean; rows: any[] }>;
    cellTextFn: (cell: any, key?: string) => string;
    onNavigateToTarget: (target: { moduleId: string; rowId: string }) => void;
}

export async function openSpotlightDialog(options: SpotlightDialogOptions): Promise<void> {
    const { t, plugin, DialogCls, renderLedgerAllFn, cellTextFn, onNavigateToTarget } = options;

    const enabled = (plugin.settings.enabledModules ?? []).filter((id) => id !== "adhoc");
    const modLabel = (m: string) => (t(`module.${m}`) !== `module.${m}` ? t(`module.${m}`) : m);
    const memberNameMap = new Map((plugin.settings.members ?? []).map((m) => [m.avItemId ?? m.id, m.name]));

    const dlg = new DialogCls({
        title: "",
        content: `
            <div class="b3-dialog__content" style="padding:16px;display:flex;flex-direction:column;gap:12px;max-height:75vh">
                <div style="position:relative;display:flex;align-items:center">
                    <span style="position:absolute;left:12px;font-size:16px;color:var(--lv-tx-3);pointer-events:none">🔍</span>
                    <input class="b3-text-field" id="lv-spotlight-input"
                        placeholder="${t("spotlight.placeholder") || "输入生活记录、物品、证件、存放位置或备注..."}"
                        style="width:100%;font-size:14px;padding:9px 12px 9px 36px;border-radius:8px;border:1px solid var(--lv-line-strong);background:var(--lv-surface-2)" />
                </div>
                <div id="lv-spotlight-status" class="lv-caption" style="display:flex;justify-content:space-between;align-items:center;color:var(--lv-tx-3)">
                    <span>${t("spotlight.loading") || "正在索引家庭数据..."}</span>
                </div>
                <div id="lv-spotlight-list" class="lv-dialog-scroll-body" style="overflow-y:auto;display:flex;flex-direction:column;gap:6px;max-height:48vh;min-height:120px"></div>
            </div>
        `,
        width: "600px",
    });

    const inp = dlg.element.querySelector("#lv-spotlight-input") as HTMLInputElement;
    const statusEl = dlg.element.querySelector("#lv-spotlight-status") as HTMLElement;
    const listEl = dlg.element.querySelector("#lv-spotlight-list") as HTMLElement;

    inp.focus();

    // 1. 并发拉取全部模块数据
    const allItems: SpotlightItem[] = [];
    const loadPromises = enabled.map(async (modId) => {
        const ref = plugin.settings.dbRefs?.[modId];
        if (!ref?.avId || !ref.columns) return;
        try {
            const data = await renderLedgerAllFn(ref.avId);
            const cols = ref.columns;
            for (const r of data.rows ?? []) {
                const title = String(cellTextFn(r.cells?.[cols.name], "name") ?? "").trim();
                if (!title || title === "—") continue;

                let memberName = "";
                if (cols.member && r.cells?.[cols.member]?.relation?.blockIDs?.length) {
                    const mId = r.cells[cols.member].relation.blockIDs[0];
                    memberName = memberNameMap.get(mId) || "";
                }

                const locKey = cols.location || cols.store_place || cols.copy_location;
                const locVal = locKey ? String(cellTextFn(r.cells?.[locKey], "location") ?? "").trim() : "";
                const catVal = cols.category ? String(cellTextFn(r.cells?.[cols.category], "category") ?? "").trim() : "";
                const dueKey = cols.expiry || cols.due || cols.date;
                const dueVal = dueKey ? String(cellTextFn(r.cells?.[dueKey], "date") ?? "").trim() : "";
                const amountVal = cols.amount ? Number(r.cells?.[cols.amount]?.number?.content) : undefined;
                const noteVal = cols.note ? String(cellTextFn(r.cells?.[cols.note], "note") ?? "").trim() : "";

                allItems.push({
                    rowId: r.itemID,
                    moduleId: modId,
                    title,
                    location: locVal && locVal !== "—" ? locVal : undefined,
                    category: catVal && catVal !== "—" ? catVal : undefined,
                    memberName: memberName || undefined,
                    dueDate: dueVal && dueVal !== "—" ? dueVal : undefined,
                    amount: Number.isFinite(amountVal) ? amountVal : undefined,
                    note: noteVal && noteVal !== "—" ? noteVal : undefined,
                });
            }
        } catch { /* skip unreadable modules */ }
    });

    await Promise.all(loadPromises);

    const renderResults = (query: string) => {
        const matched = searchSpotlight(allItems, query, 30);
        statusEl.innerHTML = `
            <span>${query ? `找到 ${matched.length} 项生活记录` : `已聚合 ${allItems.length} 项生活记录`}</span>
            <span style="font-size:11px">Esc 退出 · 点击直达</span>
        `;
        listEl.innerHTML = "";

        if (matched.length === 0) {
            const safeQ = escapeHtml(query);
            listEl.innerHTML = `
                <div style="text-align:center;padding:32px 0;color:var(--lv-tx-3);font-size:13px">
                    未找到与 "${safeQ}" 匹配的生活记录
                </div>
            `;
            return;
        }

        for (const item of matched) {
            const card = document.createElement("div");
            card.className = "lv-card";
            card.style.cssText = "padding:10px 14px;border:1px solid var(--lv-line);border-radius:8px;background:var(--lv-surface);cursor:pointer;display:flex;flex-direction:column;gap:4px;transition:border-color 0.15s, background 0.15s";
            card.tabIndex = 0;

            const top = document.createElement("div");
            top.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px";

            const left = document.createElement("div");
            left.style.cssText = "display:inline-flex;align-items:center;gap:6px;min-width:0";
            const safeTitle = escapeHtml(item.title);
            left.innerHTML = `
                <span style="font-size:15px">${moduleIcon(item.moduleId)}</span>
                <b style="font-size:13.5px;color:var(--lv-tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeTitle}</b>
            `;

            const rightOps = document.createElement("div");
            rightOps.style.cssText = "display:inline-flex;align-items:center;gap:6px;flex-shrink:0";

            const copyRef = document.createElement("button");
            copyRef.className = "b3-button b3-button--text";
            copyRef.style.cssText = "font-size:11px;padding:1px 6px;line-height:1;color:var(--lv-tx-3)";
            copyRef.title = "复制思源块引用 ((id \"title\")) (Alt+C)";
            copyRef.textContent = "🔗 引用";
            copyRef.onclick = async (e) => {
                e.stopPropagation();
                const blockRefText = `((${item.rowId} "${item.title}"))`;
                try {
                    await navigator.clipboard.writeText(blockRefText);
                    showMessage("已复制思源块引用", 2500, "info");
                } catch { /* soft fallback */ }
            };

            const badge = document.createElement("span");
            badge.className = "lv-badge";
            badge.style.cssText = "font-size:11px;padding:1px 6px;flex-shrink:0";
            badge.textContent = modLabel(item.moduleId);

            rightOps.append(copyRef, badge);
            top.append(left, rightOps);

            const meta = document.createElement("div");
            meta.className = "lv-caption";
            meta.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--lv-tx-3)";

            const metaParts: string[] = [];
            if (item.memberName) metaParts.push(`👤 ${item.memberName}`);
            if (item.location) metaParts.push(`📍 ${item.location}`);
            if (item.dueDate) metaParts.push(`📅 ${item.dueDate}`);
            if (item.amount !== undefined) metaParts.push(`💰 ¥${item.amount}`);
            if (item.note) metaParts.push(`📝 ${item.note.slice(0, 24)}`);
            meta.innerHTML = metaParts.map((p) => `<span>${p}</span>`).join("");

            card.append(top, meta);

            card.onmouseenter = () => { card.style.borderColor = "var(--lv-accent)"; card.style.background = "var(--lv-surface-2)"; };
            card.onmouseleave = () => { card.style.borderColor = "var(--lv-line)"; card.style.background = "var(--lv-surface)"; };
            card.onfocus = () => { card.style.borderColor = "var(--lv-accent)"; card.style.background = "var(--lv-surface-2)"; card.style.outline = "2px solid var(--lv-accent)"; };
            card.onblur = () => { card.style.borderColor = "var(--lv-line)"; card.style.background = "var(--lv-surface)"; card.style.outline = "none"; };
            card.onkeydown = (e) => {
                if (e.key === "Enter") {
                    dlg.destroy();
                    onNavigateToTarget({ moduleId: item.moduleId, rowId: item.rowId });
                } else if ((e.key === "c" || e.key === "C") && (e.altKey || e.metaKey)) {
                    e.preventDefault();
                    copyRef.click();
                }
            };
            card.onclick = () => {
                dlg.destroy();
                onNavigateToTarget({ moduleId: item.moduleId, rowId: item.rowId });
            };

            listEl.appendChild(card);
        }
    };

    renderResults("");

    let debounceTimer: number | undefined;
    inp.oninput = () => {
        if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
            renderResults(inp.value);
        }, 120);
    };

    inp.onkeydown = (e) => {
        if (e.key === "Escape") {
            dlg.destroy();
        }
    };
}
