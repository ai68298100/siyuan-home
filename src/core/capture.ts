import { selectCellValue } from "@/core/avcell";
import type { ColumnDef, ModuleSchema } from "@/core/schema";

export type CaptureInputError = "required" | "number" | "min" | "max" | "step" | "date" | "url" | "option";

export const CAPTURE_INPUT_TYPES = new Set([
    "text", "number", "date", "select", "relation", "url", "checkbox",
]);

export function getCaptureFields(schema?: Pick<ModuleSchema, "columns" | "capture">): ColumnDef[] {
    if (!schema?.capture?.length) return [];
    return schema.capture
        .map((key) => schema.columns.find((column) => column.key === key))
        .filter((column): column is ColumnDef => !!column && CAPTURE_INPUT_TYPES.has(column.type));
}

/** Full scalar form set; capture remains only the compact, high-frequency subset. */
export function getFormFields(schema?: Pick<ModuleSchema, "columns">): ColumnDef[] {
    return schema?.columns.filter((column) => CAPTURE_INPUT_TYPES.has(column.type)) ?? [];
}

function isEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === "" || (typeof value === "string" && value.trim() === "");
}

function isValidDateKey(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const date = new Date(0);
    date.setFullYear(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function validateCaptureInput(field: ColumnDef, value: unknown): CaptureInputError | undefined {
    if (field.required && (isEmpty(value) || (field.type === "checkbox" && value !== true))) return "required";
    if (isEmpty(value)) return undefined;

    if (field.type === "number") {
        const number = Number(value);
        if (!Number.isFinite(number)) return "number";
        if (field.min !== undefined && number < field.min) return "min";
        if (field.max !== undefined && number > field.max) return "max";
        if (typeof field.step === "number") {
            const origin = field.min ?? 0;
            const steps = (number - origin) / field.step;
            if (Math.abs(steps - Math.round(steps)) > 1e-8) return "step";
        }
    }
    if (field.type === "date" && !isValidDateKey(String(value))) return "date";
    if (field.type === "url") {
        try {
            const url = new URL(String(value));
            if (url.protocol !== "http:" && url.protocol !== "https:") return "url";
        } catch {
            return "url";
        }
    }
    if (field.type === "select" && field.options?.length && !field.options.includes(String(value))) return "option";
    return undefined;
}

export function captureCellValue(field: ColumnDef, value: unknown): unknown | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    switch (field.type) {
        case "select": return selectCellValue(String(value));
        case "relation": {
            const id = String(value).trim();
            return id ? { type: "relation", relation: { blockIDs: [id], contents: null } } : undefined;
        }
        case "date": {
            const date = new Date(`${String(value)}T00:00:00`);
            return { type: "date", date: { content: date.getTime(), isNotEmpty: true, isNotTime: true } };
        }
        case "number": return { type: "number", number: { content: Number(value), isNotEmpty: true } };
        case "url": return { type: "url", url: { content: String(value) } };
        case "checkbox": return { type: "checkbox", checkbox: { checked: value === true } };
        default: return { type: "text", text: { content: String(value) } };
    }
}
