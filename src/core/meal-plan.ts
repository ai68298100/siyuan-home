/**
 * 家庭周餐单与食材缺口自动转采购（§16/§17 295波）：
 * 聚合周一至周日餐单所选菜谱食材，比对 stock 囤货库存，计算食材缺口并生成采购清单。
 * 纯函数，无思源/DOM 强依赖，100% 可单元测试。
 */
import type { AvRow } from "./siyuan";

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealPlanDayItem {
    /** 所属星期几 */
    day: DayOfWeek;
    /** 餐次，默认 dinner */
    mealType?: MealType;
    /** 菜品名称 */
    recipeName: string;
    /** 原始食材文本（如 "鸡蛋 4个\n西红柿 2个"） */
    ingredientsRaw: string;
    /** 计划份数，默认为 1 */
    servings?: number;
}

export interface ParsedIngredient {
    name: string;
    qty: number;
    unit: string;
}

export interface AggregatedIngredient {
    name: string;
    totalQty: number;
    unit: string;
    recipes: string[];
}

export interface StockItemInfo {
    name: string;
    qty: number;
}

export type GroceryDeficitStatus = "sufficient" | "deficit" | "missing";

export interface GroceryDeficitItem {
    name: string;
    requiredQty: number;
    unit: string;
    stockQty: number;
    deficitQty: number;
    status: GroceryDeficitStatus;
    recipes: string[];
}

export interface MealPlanAnalysisResult {
    totalRecipesCount: number;
    totalIngredientsCount: number;
    sufficientCount: number;
    deficitCount: number;
    missingCount: number;
    items: GroceryDeficitItem[];
    deficitsOnly: GroceryDeficitItem[];
}

const U_PAT = "(?:个|只|支|头|根|条|块|袋|包|盒|瓶|罐|斤|两|克|千克|g|kg|ml|毫升|升|l|勺|茶匙|汤匙|瓣|片|段|份|把|束)";
const RE_PREFIX = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${U_PAT})?\\s*(?:[xX*×]\\s*)?(.+)$`);
const RE_SUFFIX = new RegExp(`^(.+?)\\s*(?:[:：*×xX/\\-\\s]+)\\s*(\\d+(?:\\.\\d+)?)\\s*(${U_PAT})?$`);
const RE_COMPACT = new RegExp(`^([\\u4e00-\\u9fa5a-zA-Z]+?)(\\d+(?:\\.\\d+)?)\\s*(${U_PAT})?$`);

/**
 * 标准化单项食材条目，提取食材名、数量与单位
 */
export function parseIngredientWithQty(itemStr: string): ParsedIngredient {
    const raw = (itemStr ?? "").trim();
    if (!raw) return { name: "", qty: 0, unit: "" };

    const p = raw.match(RE_PREFIX);
    if (p) {
        const name = p[3].trim().replace(/^[:：\-*·\s]+/, "");
        if (name) return { name, qty: parseFloat(p[1]) || 1, unit: p[2] || "份" };
    }

    const s = raw.match(RE_SUFFIX);
    if (s) {
        const name = s[1].trim().replace(/^[:：\-*·\s]+/, "");
        if (name) return { name, qty: parseFloat(s[2]) || 1, unit: s[3] || "个" };
    }

    const c = raw.match(RE_COMPACT);
    if (c) {
        const name = c[1].trim();
        if (name) return { name, qty: parseFloat(c[2]) || 1, unit: c[3] || "个" };
    }

    return { name: raw.replace(/^[:：\-*·\s]+/, "").trim(), qty: 1, unit: "份" };
}

/**
 * 分割多行或分隔符组成的食材文本
 */
export function splitIngredientLines(rawText: string): string[] {
    if (!rawText || typeof rawText !== "string") return [];
    return rawText
        .split(/[\n\r,，;；+]+/g)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s !== "—");
}

/**
 * 汇总周餐单中的所有食材条目（相同食材按同名合并，累计总量与来源菜谱）
 */
export function aggregateMealPlanIngredients(plans: MealPlanDayItem[]): AggregatedIngredient[] {
    const map = new Map<string, AggregatedIngredient>();

    for (const plan of plans) {
        const recipeName = (plan.recipeName ?? "").trim() || "未命名菜品";
        const servings = Math.max(1, plan.servings ?? 1);
        const lines = splitIngredientLines(plan.ingredientsRaw);

        for (const line of lines) {
            const parsed = parseIngredientWithQty(line);
            if (!parsed.name) continue;

            const key = parsed.name.toLowerCase();
            const existing = map.get(key);
            const actualQty = parsed.qty * servings;

            if (existing) {
                existing.totalQty = Math.round((existing.totalQty + actualQty) * 100) / 100;
                if (!existing.recipes.includes(recipeName)) {
                    existing.recipes.push(recipeName);
                }
                // 若原单位是通用的 "份" 而新条目有明确度量衡单位，优先采纳明确单位
                if (existing.unit === "份" && parsed.unit !== "份") {
                    existing.unit = parsed.unit;
                }
            } else {
                map.set(key, {
                    name: parsed.name,
                    totalQty: Math.round(actualQty * 100) / 100,
                    unit: parsed.unit,
                    recipes: [recipeName],
                });
            }
        }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function nameOfCell(v: any): string {
    return String(v?.text?.content ?? v?.block?.content ?? "").trim();
}

function numOfCell(v: any): number | undefined {
    return v?.number?.isNotEmpty && typeof v.number.content === "number" ? v.number.content : undefined;
}

/**
 * 从 stock（囤货）台账的 AvRow[] 中提取可用库存记录
 */
export function extractStockItemsFromRows(
    rows: AvRow[],
    cols: { nameCol?: string; qtyCol?: string },
): StockItemInfo[] {
    if (!rows || !Array.isArray(rows) || !cols.nameCol) return [];
    const result: StockItemInfo[] = [];

    for (const r of rows) {
        const name = nameOfCell(r.cells[cols.nameCol]);
        if (!name) continue;
        const qtyVal = cols.qtyCol ? numOfCell(r.cells[cols.qtyCol]) : undefined;
        result.push({
            name,
            qty: qtyVal !== undefined ? Math.max(0, qtyVal) : 0,
        });
    }

    return result;
}

/**
 * 比较聚合食材与当前囤货库存，计算缺口与满足情况
 */
export function analyzeGroceryDeficit(
    aggregated: AggregatedIngredient[],
    stockItems: StockItemInfo[],
): MealPlanAnalysisResult {
    const items: GroceryDeficitItem[] = [];

    for (const ing of aggregated) {
        const ingNameLower = ing.name.toLowerCase();

        // 查找匹配的库存项（支持精确匹配或主要词包含）
        let matchedStock = stockItems.find((s) => s.name.toLowerCase() === ingNameLower);
        if (!matchedStock) {
            matchedStock = stockItems.find((s) => {
                const sname = s.name.toLowerCase();
                return (sname.length >= 2 && ingNameLower.includes(sname)) ||
                       (ingNameLower.length >= 2 && sname.includes(ingNameLower));
            });
        }

        const stockQty = matchedStock ? matchedStock.qty : 0;
        let status: GroceryDeficitStatus;
        let deficitQty: number;

        if (!matchedStock) {
            status = "missing";
            deficitQty = ing.totalQty;
        } else if (stockQty >= ing.totalQty) {
            status = "sufficient";
            deficitQty = 0;
        } else {
            status = "deficit";
            deficitQty = Math.round((ing.totalQty - stockQty) * 100) / 100;
        }

        items.push({
            name: ing.name,
            requiredQty: ing.totalQty,
            unit: ing.unit,
            stockQty,
            deficitQty,
            status,
            recipes: ing.recipes,
        });
    }

    // 按状态排序：缺货/缺失排在前，充裕排在后
    const sorted = [...items].sort((a, b) => {
        const rank = (s: GroceryDeficitStatus) => (s === "missing" ? 0 : s === "deficit" ? 1 : 2);
        const rDiff = rank(a.status) - rank(b.status);
        if (rDiff !== 0) return rDiff;
        return a.name.localeCompare(b.name, "zh-CN");
    });

    const deficitsOnly = sorted.filter((i) => i.status !== "sufficient");
    const sufficientCount = sorted.filter((i) => i.status === "sufficient").length;
    const deficitCount = sorted.filter((i) => i.status === "deficit").length;
    const missingCount = sorted.filter((i) => i.status === "missing").length;

    // 统计不重复菜品总数
    const recipeSet = new Set<string>();
    for (const it of aggregated) {
        for (const r of it.recipes) recipeSet.add(r);
    }

    return {
        totalRecipesCount: recipeSet.size,
        totalIngredientsCount: aggregated.length,
        sufficientCount,
        deficitCount,
        missingCount,
        items: sorted,
        deficitsOnly,
    };
}

/**
 * 一站式计算餐单食材缺口
 */
export function calculateMealPlanDeficits(
    plans: MealPlanDayItem[],
    stockItems: StockItemInfo[],
): MealPlanAnalysisResult {
    const aggregated = aggregateMealPlanIngredients(plans);
    return analyzeGroceryDeficit(aggregated, stockItems);
}

/**
 * 将周餐单缺口分析结果格式化为易于发送和分享的文本清单
 */
export function formatMealPlanShoppingText(
    result: MealPlanAnalysisResult,
    options?: {
        planTitle?: string;
        includeSufficient?: boolean;
    },
): string {
    const title = options?.planTitle || "【家庭周餐单食材采购清单】";
    const lines: string[] = [title];

    lines.push(`📊 规划：${result.totalRecipesCount} 道菜谱 | 共需 ${result.totalIngredientsCount} 种食材`);
    lines.push(`🛒 需采购：${result.deficitsOnly.length} 项（${result.missingCount} 项无库存，${result.deficitCount} 项库存不足）`);
    if (result.sufficientCount > 0) {
        lines.push(`✅ 已充足：${result.sufficientCount} 项已有囤货`);
    }
    lines.push("──────────────────");

    if (result.deficitsOnly.length === 0) {
        lines.push("🎉 太棒了！本周餐单所需全部食材家庭囤货均充足，无需额外采购！");
    } else {
        lines.push("【待采购食材缺口】");
        for (const item of result.deficitsOnly) {
            const prefix = item.status === "missing" ? "❌ 缺" : "⚠️ 补";
            const stockInfo = item.stockQty > 0 ? `（库存仅 ${item.stockQty}${item.unit}，缺 ${item.deficitQty}${item.unit}）` : `（需 ${item.deficitQty}${item.unit}）`;
            const recipeInfo = item.recipes.length > 0 ? ` ← 用于：${item.recipes.join("、")}` : "";
            lines.push(`${prefix} ${item.name} ×${item.deficitQty}${item.unit} ${stockInfo}${recipeInfo}`);
        }
    }

    if (options?.includeSufficient && result.sufficientCount > 0) {
        lines.push("");
        lines.push("【库存充裕食材（无需采购）】");
        const sufficientItems = result.items.filter((i) => i.status === "sufficient");
        for (const item of sufficientItems) {
            lines.push(`✔ ${item.name}（需 ${item.requiredQty}${item.unit} / 现有 ${item.stockQty}${item.unit}）`);
        }
    }

    return lines.join("\n");
}

/**
 * 将缺口食材映射为待写入 shopping（购物清单）台账的记录载荷
 */
export function mapDeficitsToShoppingRows(
    deficits: GroceryDeficitItem[],
): Array<{ name: string; qty: number; note: string; category: string }> {
    return deficits.map((item) => ({
        name: item.name,
        qty: item.deficitQty > 0 ? item.deficitQty : 1,
        category: "food_sh",
        note: `周餐单所需（${item.recipes.join("、")}）`,
    }));
}

export interface MealPlanDialogOptions {
    allFoodRows: AvRow[];
    stockItems: StockItemInfo[];
    ref: any;
    plugin: any;
    t: (k: string) => string;
    DialogCls: any;
    showMessageFn: any;
    cellTextFn: (v: any, k?: string) => string;
    addDetachedRowFn: (avId: string, name: string) => Promise<string>;
    setCellFn: (avId: string, colId: string, itemId: string, val: any) => Promise<any>;
    cellValueFn: (type: string, val: any) => any;
}

export function openMealPlanDialog(options: MealPlanDialogOptions): void {
    const { allFoodRows, stockItems, ref, plugin, t, DialogCls, showMessageFn, cellTextFn, addDetachedRowFn, setCellFn, cellValueFn } = options;

    interface RecipeCandidate {
        id: string;
        name: string;
        ingredientsRaw: string;
        selected: boolean;
        servings: number;
    }

    const candidates: RecipeCandidate[] = allFoodRows.map((r) => {
        const name = (ref.columns?.name && cellTextFn(r.cells[ref.columns.name])) || "";
        const ingredientsRaw = (ref.columns?.ingredients && cellTextFn(r.cells[ref.columns.ingredients])) || "";
        return {
            id: r.itemID,
            name: name === "—" ? "" : name,
            ingredientsRaw: ingredientsRaw === "—" ? "" : ingredientsRaw,
            selected: true,
            servings: 1,
        };
    }).filter((c) => c.name.length > 0);

    const dlg = new DialogCls({
        title: t("ledger.mealPlanTitle"),
        content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-mealplan-body"></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-mealplan-close">${t("close")}</button><button class="b3-button b3-button--outline" id="lv-mealplan-copy">${t("ledger.mealPlanCopyShopping")}</button><button class="b3-button" id="lv-mealplan-add">${t("ledger.mealPlanAddToShopping")}</button></div>`,
        width: "620px",
    });

    const body = dlg.element.querySelector("#lv-mealplan-body") as HTMLElement;
    const copyBtn = dlg.element.querySelector("#lv-mealplan-copy") as HTMLButtonElement;
    const addBtn = dlg.element.querySelector("#lv-mealplan-add") as HTMLButtonElement;
    (dlg.element.querySelector("#lv-mealplan-close") as HTMLButtonElement).onclick = () => dlg.destroy();

    const render = () => {
        body.replaceChildren();

        const topBar = document.createElement("div");
        topBar.style.cssText = "display:flex;justify-content:space-between;align-items:center";
        const hint = document.createElement("span");
        hint.className = "lv-caption";
        hint.textContent = t("ledger.mealPlanSelectHint");

        const btnGroup = document.createElement("div");
        btnGroup.style.cssText = "display:flex;gap:6px";
        const selectAllBtn = document.createElement("button");
        selectAllBtn.className = "b3-button b3-button--text";
        selectAllBtn.style.cssText = "font-size:11.5px;padding:2px 6px";
        selectAllBtn.textContent = "全选";
        selectAllBtn.onclick = () => { for (const c of candidates) c.selected = true; render(); };
        const selectNoneBtn = document.createElement("button");
        selectNoneBtn.className = "b3-button b3-button--text";
        selectNoneBtn.style.cssText = "font-size:11.5px;padding:2px 6px";
        selectNoneBtn.textContent = "清空";
        selectNoneBtn.onclick = () => { for (const c of candidates) c.selected = false; render(); };
        btnGroup.append(selectAllBtn, selectNoneBtn);
        topBar.append(hint, btnGroup);
        body.appendChild(topBar);

        const recipeBox = document.createElement("div");
        recipeBox.style.cssText = "display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto;padding:8px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-line)";

        for (const c of candidates) {
            const rowEl = document.createElement("div");
            rowEl.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px";

            const left = document.createElement("label");
            left.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;min-width:0";
            const chk = document.createElement("input");
            chk.type = "checkbox";
            chk.checked = c.selected;
            chk.onchange = () => { c.selected = chk.checked; render(); };
            const nameSpan = document.createElement("span");
            nameSpan.style.cssText = "font-weight:500;color:var(--lv-tx)";
            nameSpan.textContent = c.name;
            const ingSpan = document.createElement("span");
            ingSpan.className = "lv-caption";
            ingSpan.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px";
            ingSpan.textContent = c.ingredientsRaw || "（未录食材）";
            left.append(chk, nameSpan, ingSpan);

            const right = document.createElement("div");
            right.style.cssText = "display:flex;align-items:center;gap:4px;flex-shrink:0";
            const servLabel = document.createElement("span");
            servLabel.className = "lv-caption";
            servLabel.textContent = "份数:";
            const servInput = document.createElement("input");
            servInput.type = "number";
            servInput.min = "1";
            servInput.max = "10";
            servInput.value = String(c.servings);
            servInput.className = "b3-text-field";
            servInput.style.cssText = "width:44px;padding:2px 4px;font-size:11px;text-align:center";
            servInput.onchange = () => {
                c.servings = Math.max(1, parseInt(servInput.value, 10) || 1);
                render();
            };
            right.append(servLabel, servInput);
            rowEl.append(left, right);
            recipeBox.appendChild(rowEl);
        }
        body.appendChild(recipeBox);

        const selectedList = candidates.filter((c) => c.selected);
        if (selectedList.length === 0) {
            const emptyHint = document.createElement("div");
            emptyHint.className = "lv-caption";
            emptyHint.style.cssText = "text-align:center;padding:16px 0";
            emptyHint.textContent = t("ledger.mealPlanNoSelected");
            body.appendChild(emptyHint);
            copyBtn.disabled = true;
            addBtn.disabled = true;
            return;
        }

        copyBtn.disabled = false;
        addBtn.disabled = false;

        const dayItems: MealPlanDayItem[] = selectedList.map((c) => ({
            day: "mon",
            recipeName: c.name,
            ingredientsRaw: c.ingredientsRaw,
            servings: c.servings,
        }));

        const result = calculateMealPlanDeficits(dayItems, stockItems);

        const metrics = document.createElement("div");
        metrics.style.cssText = "display:grid;grid-template-columns:repeat(4, 1fr);gap:8px";
        const makeBox = (cap: string, v: string | number, sub?: string, color?: string) => {
            const d = document.createElement("div");
            d.className = "lv-metric-item";
            d.innerHTML = `<span class="lv-caption">${cap}</span><b class="lv-num" style="font-size:16px;${color ? `color:${color}` : ""}">${v}</b>${sub ? `<span class="lv-caption">${sub}</span>` : ""}`;
            return d;
        };

        metrics.append(
            makeBox(t("ledger.mealPlanTotalRecipes"), result.totalRecipesCount),
            makeBox(t("ledger.mealPlanTotalIngredients"), result.totalIngredientsCount),
            makeBox(t("ledger.mealPlanDeficitItems"), result.deficitsOnly.length, undefined, "var(--lv-warn)"),
            makeBox(t("ledger.mealPlanSufficientItems"), result.sufficientCount, undefined, "var(--lv-accent)"),
        );
        body.appendChild(metrics);

        const listSec = document.createElement("div");
        listSec.style.cssText = "display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto";

        for (const item of result.items) {
            const row = document.createElement("div");
            row.className = "lv-metric-item";
            row.style.cssText = "flex-direction:row;align-items:center;justify-content:space-between;padding:6px 10px;font-size:12px";

            const left = document.createElement("div");
            left.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0;flex:1";

            const badge = document.createElement("span");
            badge.className = item.status === "missing" ? "lv-badge red" : item.status === "deficit" ? "lv-badge yellow" : "lv-badge green";
            badge.textContent = item.status === "missing" ? t("ledger.mealPlanStatusMissing") : item.status === "deficit" ? t("ledger.mealPlanStatusDeficit") : t("ledger.mealPlanStatusSufficient");

            const nameSpan = document.createElement("b");
            nameSpan.style.cssText = "color:var(--lv-tx)";
            nameSpan.textContent = item.name;

            const recipeSpan = document.createElement("span");
            recipeSpan.className = "lv-caption";
            recipeSpan.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px";
            recipeSpan.textContent = t("ledger.mealPlanFromRecipes").replace("${recipes}", item.recipes.join("、"));

            left.append(badge, nameSpan, recipeSpan);

            const right = document.createElement("div");
            right.style.cssText = "text-align:right;flex-shrink:0";
            const deficitInfo = item.deficitQty > 0 ? `<b style="color:var(--lv-warn)">缺 ${item.deficitQty}${item.unit}</b> · ` : "";
            right.innerHTML = `<span class="lv-caption">${deficitInfo}需 ${item.requiredQty}${item.unit} / 存 ${item.stockQty}${item.unit}</span>`;

            row.append(left, right);
            listSec.appendChild(row);
        }

        body.appendChild(listSec);

        copyBtn.onclick = async () => {
            const text = formatMealPlanShoppingText(result, { includeSufficient: true });
            try {
                await navigator.clipboard.writeText(text);
                showMessageFn(t("ledger.mealPlanCopied"), 2500, "info");
            } catch {
                showMessageFn(t("ledger.copyAsImageFail"), 4000, "error");
            }
        };

        addBtn.onclick = async () => {
            if (result.deficitsOnly.length === 0) {
                showMessageFn(t("ledger.mealPlanSufficientItems"), 3000, "info");
                return;
            }
            const shoppingRef = plugin.settings.dbRefs?.shopping;
            if (!shoppingRef?.avId || !shoppingRef.columns?.name) {
                showMessageFn(t("ledger.mealPlanStockNone"), 4000, "info");
                copyBtn.click();
                return;
            }

            addBtn.disabled = true;
            try {
                const deficitsPayload = mapDeficitsToShoppingRows(result.deficitsOnly);
                let addedCount = 0;
                for (const rowData of deficitsPayload) {
                    const newId = await addDetachedRowFn(shoppingRef.avId, rowData.name);
                    if (shoppingRef.columns.qty) {
                        await setCellFn(shoppingRef.avId, shoppingRef.columns.qty, newId, cellValueFn("number", rowData.qty));
                    }
                    if (shoppingRef.columns.category) {
                        await setCellFn(shoppingRef.avId, shoppingRef.columns.category, newId, cellValueFn("select", "food_sh"));
                    }
                    if (shoppingRef.columns.note) {
                        await setCellFn(shoppingRef.avId, shoppingRef.columns.note, newId, cellValueFn("text", rowData.note));
                    }
                    addedCount++;
                }
                showMessageFn(t("ledger.mealPlanAddedToShopping").replace("${n}", String(addedCount)), 3500, "info");
                dlg.destroy();
            } catch (err: any) {
                showMessageFn(t("ledger.saveFailed") + ` (${err?.message || String(err)})`, 5000, "error");
                addBtn.disabled = false;
            }
        };
    };

    render();
}
