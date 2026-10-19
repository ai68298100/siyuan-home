import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CAPTURE_INPUT_TYPES, captureCellValue, getCaptureFields, getFormFields, validateCaptureInput } from "@/core/capture";
import { SCHEMA_CATALOG, validateSchema } from "@/core/schema";

describe("快速记录字段契约", () => {
    const zh = JSON.parse(readFileSync(fileURLToPath(new URL("../../public/i18n/zh-CN.json", import.meta.url)), "utf8")) as Record<string, string>;
    const en = JSON.parse(readFileSync(fileURLToPath(new URL("../../public/i18n/en.json", import.meta.url)), "utf8")) as Record<string, string>;

    it("全部模块显式配置快速录入字段并以名称开头", () => {
        for (const [id, schema] of Object.entries(SCHEMA_CATALOG)) {
            expect(validateSchema(id, schema), id).toEqual([]);
            expect(schema.capture[0], id).toBe("name");
        }
    });

    it("每个 schema 字段和字段选项均有中文标签", () => {
        const missing: string[] = [];
        for (const [id, schema] of Object.entries(SCHEMA_CATALOG)) {
            for (const field of schema.columns) {
                const labelKey = field.labelKey ?? `field.${field.key}`;
                if (!zh[labelKey] || !en[labelKey]) missing.push(`${id}.${labelKey}`);
                if (field.placeholderKey && (!zh[field.placeholderKey] || !en[field.placeholderKey])) missing.push(`${id}.${field.placeholderKey}`);
                if (field.helpKey && (!zh[field.helpKey] || !en[field.helpKey])) missing.push(`${id}.${field.helpKey}`);
                if (field.unitKey && (!zh[field.unitKey] || !en[field.unitKey])) missing.push(`${id}.${field.unitKey}`);
                for (const option of field.options ?? []) {
                    const optionKey = `field.${field.key}.opt.${option}`;
                    if (!zh[optionKey] || !en[optionKey]) missing.push(`${id}.${optionKey}`);
                }
            }
        }
        expect(missing).toEqual([]);
    });

    it("新字段只允许快速表单已实现的真实控件类型", () => {
        expect([...CAPTURE_INPUT_TYPES]).toEqual([
            "text", "number", "date", "select", "relation", "url", "checkbox",
        ]);
    });

    it("完整新建表单覆盖快速字段之外的实际 schema 字段", () => {
        for (const [id, schema] of Object.entries(SCHEMA_CATALOG)) {
            const fullKeys = new Set(getFormFields(schema).map((field) => field.key));
            for (const field of getCaptureFields(schema)) expect(fullKeys.has(field.key), `${id}.${field.key}`).toBe(true);
        }
        const vehicleKeys = new Set(getFormFields(SCHEMA_CATALOG.vehicles).map((field) => field.key));
        for (const key of ["vin", "purchase_date", "purchase_price", "current_value", "inspection_due", "insurance_company", "insurance_due", "vehicle_tax_due", "battery_capacity", "battery_due", "violations"]) {
            expect(vehicleKeys.has(key), `vehicles.${key}`).toBe(true);
        }
        expect(vehicleKeys.has("attachments")).toBe(false);
    });

    it("按字段声明校验必填、数值范围、精度、日期、网址和选项", () => {
        expect(validateCaptureInput({ key: "name", type: "text", required: true }, "  ")).toBe("required");
        expect(validateCaptureInput({ key: "amount", type: "number", min: 0, step: 0.01 }, "-1")).toBe("min");
        expect(validateCaptureInput({ key: "amount", type: "number", min: 0, step: 0.01 }, "2.001")).toBe("step");
        expect(validateCaptureInput({ key: "date", type: "date" }, "2026-02-30")).toBe("date");
        expect(validateCaptureInput({ key: "url", type: "url" }, "javascript:alert(1)")).toBe("url");
        expect(validateCaptureInput({ key: "category", type: "select", options: ["food"] }, "other")).toBe("option");
        expect(validateCaptureInput({ key: "date", type: "date" }, "2026-02-28")).toBeUndefined();
    });

    it("按思源列类型编码，不把复选框和关系误存成文本", () => {
        expect(captureCellValue({ key: "lunar", type: "checkbox" }, true)).toEqual({ type: "checkbox", checkbox: { checked: true } });
        expect(captureCellValue({ key: "member", type: "relation" }, "member-row")).toEqual({
            type: "relation", relation: { blockIDs: ["member-row"], contents: null },
        });
        expect(captureCellValue({ key: "amount", type: "number" }, "12.5")).toEqual({
            type: "number", number: { content: 12.5, isNotEmpty: true },
        });
    });
});
