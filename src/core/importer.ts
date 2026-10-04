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
    warnings: string[];
}

export interface ImportPlan {
    rows: PlannedRow[];
    /** 整行跳过数（名称为空） */
    skipped: number;
}

const DATE_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/;

function coerce(type: string, raw: string): { value?: string | boolean; error?: string } {
    const v = raw.trim();
    switch (type) {
        case "number": {
            if (v === "") return { value: "" };
            const n = Number(v.replace(/,/g, "")); // 容忍千分位
            return Number.isFinite(n) ? { value: String(n) } : { error: `「${raw}」不是数字` };
        }
        case "date": {
            if (v === "") return { value: "" };
            return DATE_RE.test(v) ? { value: v.replace(/\//g, "-") } : { error: `「${raw}」不是 yyyy-MM-dd 日期` };
        }
        case "checkbox":
            return { value: /^(true|1|yes|y|✓|是)$/i.test(v) };
        default:
            return { value: raw };
    }
}

export function planImport(
    csv: string[][],
    /** CSV 列索引 → schema 列 key（undefined = 跳过该列） */
    mapping: Record<number, string | undefined>,
    schemaColumns: { key: string; type: string }[],
    nameKey: string,
): ImportPlan {
    const typeOf = new Map(schemaColumns.map((c) => [c.key, c.type]));
    const plan: ImportPlan = { rows: [], skipped: 0 };
    const dataRows = csv.slice(1);
    for (const row of dataRows) {
        const nameCell = Object.entries(mapping).find(([, key]) => key === nameKey);
        const name = nameCell ? (row[Number(nameCell[0])] ?? "").trim() : "";
        if (!name) { plan.skipped++; continue; }
        const cells: ImportCell[] = [];
        const warnings: string[] = [];
        for (const [idx, key] of Object.entries(mapping)) {
            if (!key || key === nameKey) continue;
            const type = typeOf.get(key);
            if (!type) continue; // 映射目标不在 schema（防御：UI 只列 schema 列）
            const raw = row[Number(idx)] ?? "";
            if (raw.trim() === "") continue;
            const res = coerce(type, raw);
            if (res.error) { warnings.push(res.error); continue; }
            cells.push({ key, type, value: res.value as string | boolean });
        }
        plan.rows.push({ name, cells, warnings });
    }
    return plan;
}

/** 从 CSV 首列表头猜测映射：表头等于列 key 或其 i18n 标签（不区分大小写）→ 该列；否则 undefined（跳过） */
export function guessMapping(
    headers: string[],
    schemaColumns: { key: string; type: string }[],
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
