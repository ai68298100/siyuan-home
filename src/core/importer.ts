/**
 * CSV 批量导入映射（16 组/191 波：assets 列映射向导）。
 * 纯逻辑：CSV 行 × 列映射 → 逐行单元格值与错误报告；类型改写交由 UI 层既有 cellValue。
 * 语义：无名称的行跳过（UI05 同款）；非法数字/日期记入该行错误并剔除该单元格（不整行废弃）。
 */

export interface ImportCell {
    key: string;
    type: string;
    /** 交由 UI cellValue(type, value) 构造内核写值 */
    value: string | boolean;
}

export interface PlannedRow {
    name: string;
    cells: ImportCell[];
    /** 该行被剔除的单元格原因（行仍导入，缺列诚实缺失） */
    warnings: { key: string; message: string }[];
}

export interface ImportPlan {
    rows: PlannedRow[];
    /** 整行跳过数（名称为空） */
    skipped: number;
}

const DATE_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;

function normalizeDate(raw: string): string | undefined {
    const match = DATE_RE.exec(raw.trim());
    if (!match) return undefined;
    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const daysInMonth = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) return undefined;
    return `${yearText}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function coerce(type: string, raw: string, options?: string[]): { value?: string | boolean; error?: string } {
    const v = raw.trim();
    switch (type) {
        case "number": {
            if (v === "") return { value: "" };
            const n = Number(v.replace(/,/g, "")); // 容忍千分位
            return Number.isFinite(n) ? { value: String(n) } : { error: `「${raw}」不是数字` };
        }
        case "date": {
            if (v === "") return { value: "" };
            const normalized = normalizeDate(v);
            return normalized ? { value: normalized } : { error: `「${raw}」不是有效日期` };
        }
        case "checkbox":
            if (/^(true|1|yes|y|✓|是)$/i.test(v)) return { value: true };
            if (/^(false|0|no|n|✗|否|—)$/i.test(v)) return { value: false };
            return { error: `「${raw}」不是有效的是/否值` };
        case "select":
            return !options || options.includes(v) ? { value: v } : { error: `「${raw}」不是该字段的有效选项` };
        default:
            return { value: raw };
    }
}

export function planImport(
    csv: string[][],
    /** CSV 列索引 → schema 列 key（undefined = 跳过该列） */
    mapping: Record<number, string | undefined>,
    schemaColumns: { key: string; type: string; options?: string[] }[],
    nameKey: string,
): ImportPlan {
    const columnOf = new Map(schemaColumns.map((c) => [c.key, c]));
    const supported = new Set(["text", "number", "date", "checkbox", "select"]);
    const plan: ImportPlan = { rows: [], skipped: 0 };
    const dataRows = csv.slice(1);
    for (const row of dataRows) {
        const nameCell = Object.entries(mapping).find(([, key]) => key === nameKey);
        const name = nameCell ? (row[Number(nameCell[0])] ?? "").trim() : "";
        if (!name) { plan.skipped++; continue; }
        const cells: ImportCell[] = [];
        const warnings: { key: string; message: string }[] = [];
        const seenKeys = new Set<string>();
        for (const [idx, key] of Object.entries(mapping)) {
            if (!key || key === nameKey) continue;
            if (seenKeys.has(key)) {
                warnings.push({ key, message: "多个 CSV 列映射到同一字段，已忽略后续列" });
                continue;
            }
            seenKeys.add(key);
            const column = columnOf.get(key);
            if (!column) continue; // 映射目标不在 schema（防御：UI 只列 schema 列）
            const { type } = column;
            const raw = row[Number(idx)] ?? "";
            if (raw.trim() === "") continue;
            if (!supported.has(type)) {
                warnings.push({ key, message: "该字段类型暂不支持 CSV 导入" });
                continue;
            }
            const res = coerce(type, raw, column.options);
            if (res.error) { warnings.push({ key, message: res.error }); continue; }
            cells.push({ key, type, value: res.value as string | boolean });
        }
        plan.rows.push({ name, cells, warnings });
    }
    return plan;
}

/** 从 CSV 首列表头猜测映射：表头等于列 key 或其 i18n 标签（不区分大小写）→ 该列；否则 undefined（跳过） */
export function guessMapping(
    headers: string[],
    schemaColumns: { key: string; type: string; options?: string[] }[],
    labelOf: (key: string) => string,
): Record<number, string | undefined> {
    const map: Record<number, string | undefined> = {};
    for (let i = 0; i < headers.length; i++) {
        const h = headers[i].trim().toLowerCase();
        const hit = schemaColumns.find((c) => c.key.toLowerCase() === h || labelOf(c.key).toLowerCase() === h);
        map[i] = hit?.key;
    }
    return map;
}
