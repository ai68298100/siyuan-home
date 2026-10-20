/**
 * 家庭应急物资储备清单与囤货台账联动（§16/§17 302波）：
 * 解析家庭应急包推荐清单，与 stock 囤货台账进行比对，
 * 支持一键将未建档物资映射生成 stock 台账行（category=emergency_st），
 * 补齐家庭安全底线与物资储备自查闭环。
 * 纯函数，100% 可单元测试。
 */

import { getTemplate } from "./templates";

export interface EmergencyKitItem {
    name: string;
    section: string;
    note?: string;
    checked?: boolean;
}

export interface StockCreationRow {
    name: string;
    category: string;
    qty: number;
    low_stock_at: number;
    note?: string;
}

/**
 * 解析家庭应急物资模板文档或自由清单
 */
export function parseEmergencyKitItems(markdownContent?: string): EmergencyKitItem[] {
    const content = markdownContent ?? getTemplate("stock/emergency-kit.tpl") ?? "";
    const lines = content.split(/[\r\n]+/);
    const items: EmergencyKitItem[] = [];

    let currentSection = "基础应急物资";

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith("## ")) {
            currentSection = line.replace(/^##\s+/, "").replace(/^[一二三四五六七八九十]+[、.\s]*/, "").trim();
            continue;
        }

        // 匹配待办清单行: - [ ] 物资名称 (说明/规格)
        const match = line.match(/^-\s*\[([ xX])\]\s*(.+)$/);
        if (match) {
            const checked = match[1].toLowerCase() === "x";
            const fullTitle = match[2].trim();

            // 分离说明信息（如括号中的规格）
            const descMatch = fullTitle.match(/^([^(（]+)[(（]([^)）]+)[)）]$/);
            const name = descMatch ? descMatch[1].trim() : fullTitle;
            const note = descMatch ? descMatch[2].trim() : undefined;

            items.push({
                name,
                section: currentSection,
                note,
                checked,
            });
        }
    }

    return items;
}

/**
 * 将应急物资条目与既有台账对比，映射为新待建行
 */
export function mapEmergencyKitToStockRows(
    items: EmergencyKitItem[],
    existingStockNames: string[] = [],
): {
    newRows: StockCreationRow[];
    skippedCount: number;
} {
    const existingSet = new Set(
        existingStockNames.map((n) => (n ?? "").trim().toLowerCase()).filter(Boolean),
    );

    const newRows: StockCreationRow[] = [];
    let skippedCount = 0;

    for (const item of items) {
        const normalized = item.name.trim().toLowerCase();
        if (!normalized || existingSet.has(normalized)) {
            skippedCount++;
            continue;
        }

        existingSet.add(normalized); // 批内去重
        newRows.push({
            name: item.name,
            category: "emergency_st",
            qty: item.checked ? 1 : 0,
            low_stock_at: 1,
            note: item.note ? `[${item.section}] ${item.note}` : `[${item.section}]`,
        });
    }

    return { newRows, skippedCount };
}

/**
 * 格式化应急储备清单自查报告文本（支持一键复制到剪贴板）
 */
export function formatEmergencyKitReportText(
    items: EmergencyKitItem[],
    existingStockNames: string[] = [],
): string {
    const existingSet = new Set(
        existingStockNames.map((n) => (n ?? "").trim().toLowerCase()).filter(Boolean),
    );

    const readyItems: EmergencyKitItem[] = [];
    const missingItems: EmergencyKitItem[] = [];

    for (const item of items) {
        const normalized = item.name.trim().toLowerCase();
        if (item.checked || existingSet.has(normalized)) {
            readyItems.push(item);
        } else {
            missingItems.push(item);
        }
    }

    const lines: string[] = [
        "📦 家庭应急物资储备自查报告",
        `盘点状态：共 ${items.length} 项（已备足 ${readyItems.length} 项，缺口 ${missingItems.length} 项）`,
        "──────────────────────",
    ];

    if (missingItems.length > 0) {
        lines.push("🔴 待补充储备缺口：");
        for (const item of missingItems) {
            lines.push(`• [${item.section}] ${item.name}${item.note ? `（${item.note}）` : ""}`);
        }
    } else {
        lines.push("🟢 全项备齐：所有基础应急物资均已入库或检查就绪！");
    }

    if (readyItems.length > 0) {
        lines.push("");
        lines.push("🟢 已在库/就绪：");
        for (const item of readyItems) {
            lines.push(`✔ ${item.name}`);
        }
    }

    return lines.join("\n");
}

export interface EmergencyKitDialogOptions {
    stockRows: Array<{ id?: string; cells: Record<string, import("./avcell").AvCellLike> }>;
    ref: { avId: string; columns?: Record<string, string> };
    t: (k: string) => string;
    DialogCls: new (options: { title: string; content: string; width?: string }) => { element: HTMLElement; destroy: () => void };
    showMessageFn: (message: string, timeout?: number, type?: "info" | "error") => void;
    cellTextFn: (v: import("./avcell").AvCellLike | null | undefined, k?: string) => string;
    addDetachedRowFn: (avId: string, name: string) => Promise<string>;
    setCellFn: (avId: string, colId: string, itemId: string, val: unknown) => Promise<unknown>;
    isGuestReadOnly?: boolean;
    onCreatedCallback?: () => Promise<void> | void;
}

/**
 * 组装并弹出应急物资储备与台账联动对话框
 */
export function openEmergencyKitDialog(options: EmergencyKitDialogOptions): void {
    const {
        stockRows,
        ref,
        t,
        DialogCls,
        showMessageFn,
        cellTextFn,
        addDetachedRowFn,
        setCellFn,
        isGuestReadOnly,
        onCreatedCallback,
    } = options;

    const items = parseEmergencyKitItems();
    const existingNames: string[] = [];
    const nameCol = ref.columns?.name;
    if (nameCol) {
        for (const row of stockRows) {
            const name = cellTextFn(row.cells[nameCol]);
            if (name) existingNames.push(name);
        }
    }

    const { newRows } = mapEmergencyKitToStockRows(items, existingNames);
    const existingSet = new Set(existingNames.map((n) => n.trim().toLowerCase()));

    const dlg = new DialogCls({
        title: t("ledger.emergencyKitTitle"),
        content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-em-body"></div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" id="lv-em-close">${t("close")}</button>
  <button class="b3-button b3-button--outline" id="lv-em-copy">${t("ledger.emergencyKitCopy")}</button>
  <button class="b3-button" id="lv-em-import" ${newRows.length === 0 ? "disabled" : ""}>${t("ledger.emergencyKitImport").replace("${n}", String(newRows.length))}</button>
</div>`,
        width: "560px",
    });

    const body = dlg.element.querySelector("#lv-em-body") as HTMLElement;
    const copyBtn = dlg.element.querySelector("#lv-em-copy") as HTMLButtonElement;
    const importBtn = dlg.element.querySelector("#lv-em-import") as HTMLButtonElement;
    (dlg.element.querySelector("#lv-em-close") as HTMLButtonElement).onclick = () => dlg.destroy();

    // 1. 顶部统计
    const metrics = document.createElement("div");
    metrics.style.cssText = "display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin-bottom:12px";

    const makeBox = (label: string, val: number, color?: string) => {
        const b = document.createElement("div");
        b.className = "lv-metric-item";
        b.innerHTML = `<span class="lv-caption">${label}</span><b class="lv-num" style="font-size:18px;${color ? `color:${color}` : ""}">${val}</b>`;
        return b;
    };
    metrics.append(
        makeBox(t("ledger.emergencyKitTotal"), items.length),
        makeBox(t("ledger.emergencyKitReady"), items.length - newRows.length, "var(--lv-accent)"),
        makeBox(t("ledger.emergencyKitDeficit"), newRows.length, newRows.length > 0 ? "var(--lv-warn)" : undefined),
    );
    body.appendChild(metrics);

    // 2. 清单列表
    const listSec = document.createElement("div");
    listSec.style.cssText = "display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto";

    for (const item of items) {
        const row = document.createElement("div");
        row.className = "lv-metric-item";
        row.style.cssText = "flex-direction:row;align-items:center;justify-content:space-between;padding:6px 10px;font-size:12px";

        const left = document.createElement("div");
        left.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0;flex:1";

        const isReady = existingSet.has(item.name.trim().toLowerCase());
        const badge = document.createElement("span");
        badge.className = isReady ? "lv-badge green" : "lv-badge yellow";
        badge.textContent = isReady ? t("ledger.emergencyKitInStock") : t("ledger.emergencyKitMissing");

        const nameSpan = document.createElement("b");
        nameSpan.style.cssText = "color:var(--lv-tx)";
        nameSpan.textContent = item.name;

        const secSpan = document.createElement("span");
        secSpan.className = "lv-caption";
        secSpan.textContent = `[${item.section}]`;

        left.append(badge, nameSpan, secSpan);

        const right = document.createElement("div");
        right.className = "lv-caption";
        right.textContent = item.note || "";

        row.append(left, right);
        listSec.appendChild(row);
    }
    body.appendChild(listSec);

    // 3. 复制自查报告
    copyBtn.onclick = async () => {
        const text = formatEmergencyKitReportText(items, existingNames);
        try {
            await navigator.clipboard.writeText(text);
            showMessageFn(t("overview.lifeIndexCopied"), 2500, "info");
        } catch {
            showMessageFn(t("ledger.copyAsImageFail"), 4000, "error");
        }
    };

    // 4. 一键建档全部缺口
    importBtn.onclick = async () => {
        if (isGuestReadOnly) {
            showMessageFn(t("guest.writeBlocked"), 3500, "error");
            return;
        }
        if (newRows.length === 0) return;

        importBtn.disabled = true;
        let created = 0;
        try {
            const { selectCellValue } = await import("./avcell");
            for (const r of newRows) {
                const rowId = await addDetachedRowFn(ref.avId, r.name);
                if (!rowId) continue;
                if (ref.columns?.category) await setCellFn(ref.avId, ref.columns.category, rowId, selectCellValue(r.category));
                if (ref.columns?.qty) await setCellFn(ref.avId, ref.columns.qty, rowId, r.qty);
                if (ref.columns?.low_stock_at) await setCellFn(ref.avId, ref.columns.low_stock_at, rowId, r.low_stock_at);
                if (r.note && ref.columns?.note) await setCellFn(ref.avId, ref.columns.note, rowId, r.note);
                created++;
            }
            showMessageFn(t("ledger.emergencyKitImportSuccess").replace("${n}", String(created)), 3000, "info");
            dlg.destroy();
            onCreatedCallback?.();
        } catch (e) {
            showMessageFn(t("capture.failed").replace("${msg}", e instanceof Error ? e.message : String(e)), 5000, "error");
        }
    };
}
