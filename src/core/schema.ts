/**
 * 字段字典与模块 Schema（docs/design/02 §2/§4）。
 * 字段字典列 key 一经发布即冻结：只增不改；模块私有列前缀 x_。
 */
import type { ReminderRuleSpec } from "@/types";

/** 思源数据库列类型（3.8.x） */
export type ColumnType =
    | "text" | "block" | "number" | "date"
    | "select" | "mSelect"
    | "url" | "email" | "phone"
    | "checkbox" | "asset" | "mAsset"
    | "relation" | "rollup"
    | "createdTime" | "updatedTime" | "line" | "template";

export interface ColumnDef {
    /** 字段字典 key（冻结）；思源列名用 i18n 渲染 */
    key: string;
    type: ColumnType;
    /** i18n 键：field.<key> */
    labelKey?: string;
    /** select 枚举（i18n 键：field.<key>.opt.<value>） */
    options?: string[];
    required?: boolean;
    /** 视图默认宽度占比（相对） */
    width?: number;
}

export interface ViewDef {
    key: string;
    /** i18n 键：view.<module>.<key> */
    type: "table";
    /** 按 key 过滤/分组的声明式描述（provisioner 建视图用） */
    groupBy?: string;
    sortBy?: { key: string; asc: boolean };
}

export interface DocTemplate {
    key: string;
    /** 生成的文档名 i18n 键 */
    nameKey: string;
    /** 模板文件 public/templates/<module>/<key>.tpl */
    file: string;
}

export interface ModuleSchema {
    /** 台账数据库列（首列 name 自动） */
    columns: ColumnDef[];
    /** 快速录入列集（≤5，按序；docs/design/02 §4.1） */
    capture: string[];
    views?: ViewDef[];
    templates?: DocTemplate[];
    /** 参与提醒中枢的日期列声明（docs/design/03 §2） */
    reminders?: ReminderRuleSpec[];
}

// ── 字段字典（02 §2）────────────────────────────────────────

export const FIELD_DICT: Record<string, ColumnDef> = {
    name:          { key: "name", type: "text", required: true },
    member:        { key: "member", type: "relation", labelKey: "field.member" }, // → members 库（Spike R2 定案）
    category:      { key: "category", type: "select", labelKey: "field.category" },
    status:        { key: "status", type: "select", labelKey: "field.status" },
    date:          { key: "date", type: "date", labelKey: "field.date" },
    expiry:        { key: "expiry", type: "date", labelKey: "field.expiry" },
    remind_before: { key: "remind_before", type: "number", labelKey: "field.remind_before" },
    amount:        { key: "amount", type: "number", labelKey: "field.amount" },
    cycle:         { key: "cycle", type: "select", labelKey: "field.cycle", options: ["day", "week", "month", "quarter", "year"] },
    location:      { key: "location", type: "text", labelKey: "field.location" },
    attachments:   { key: "attachments", type: "mAsset", labelKey: "field.attachments" },
    url:           { key: "url", type: "url", labelKey: "field.url" },
    tags:          { key: "tags", type: "mSelect", labelKey: "field.tags" },
    note:          { key: "note", type: "text", labelKey: "field.note" },
    due:           { key: "due", type: "date", labelKey: "field.due" }, // 中枢写回的下次发生日
};

const d = (...keys: string[]): ColumnDef[] => keys.map((k) => FIELD_DICT[k]);

// ── certs 证件管理（02 §4.2①）──────────────────────────────

const CERT_PRIVATE: ColumnDef[] = [
    { key: "holder_no", type: "text", labelKey: "field.holder_no" },      // 证件号后四位，脱敏
    { key: "issue_date", type: "date", labelKey: "field.issue_date" },
    { key: "issuance_rule", type: "select", labelKey: "field.issuance_rule",
      options: ["y6", "y10", "longterm", "endorsement"] },
    { key: "store_place", type: "text", labelKey: "field.store_place" },
];

export const CERTS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["id", "hukou", "passport", "visa", "permit", "license", "vehicle_lic", "birth_cert", "other"] },
        { ...FIELD_DICT.status, options: ["valid", "expired", "renewed", "void"] },
        ...d("date"),
        ...CERT_PRIVATE,
        ...d("expiry", "due", "remind_before", "location", "attachments", "note"),
    ],
    capture: ["name", "member", "category", "expiry", "attachments"],
    views: [
        { key: "by_member", type: "table", groupBy: "member" },
        { key: "expiring", type: "table", sortBy: { key: "expiry", asc: true } },
    ],
    reminders: [
        { key: "expiry", field: "expiry", kind: "oneoff", leadDays: 90 },
        // 签注/下次审验日（港澳台通行证签注另计）——due 列已在 columns 中（契约 33.2）
        { key: "endorsement", field: "due", kind: "oneoff", leadDays: 60 },
    ],
};

// ── members 家庭成员库（02 §3）──────────────────────────────

const MEMBERS_PRIVATE: ColumnDef[] = [
    { key: "role", type: "select", required: true,
      options: ["self", "spouse", "partner", "child", "elder", "kin", "other"] },
    { key: "birthday", type: "date" },
    { key: "lunar", type: "checkbox" },
    { key: "relation_note", type: "text" },
    { key: "size_top", type: "text" },
    { key: "size_bottom", type: "text" },
    { key: "size_shoe", type: "text" },
    { key: "dislike", type: "text" },
    { key: "avatar", type: "asset" },
];

export const MEMBERS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name"),
        ...MEMBERS_PRIVATE,
        { ...FIELD_DICT.status, options: ["active", "archived"] },
        ...d("note"),
    ],
    capture: ["name", "role", "birthday", "lunar"],
    views: [{ key: "by_role", type: "table", groupBy: "role" }],
    // 生日周年提醒由 members provider 声明（lunarField 指向 lunar 列）
    reminders: [
        { key: "birthday", field: "birthday", kind: "anniversary", leadDays: 7, lunarField: "lunar" },
    ],
};

// ── schema 契约校验（33.2 门禁）─────────────────────────────

/** 契约：capture/views/reminders 引用的列必须都在 columns 中；违规时开发期抛错。 */
export function validateSchema(id: string, schema: ModuleSchema): string[] {
    const keys = new Set(schema.columns.map((c) => c.key));
    const errors: string[] = [];
    for (const k of schema.capture ?? []) {
        if (!keys.has(k)) errors.push(`[${id}] capture 引用未知列 "${k}"`);
    }
    for (const v of schema.views ?? []) {
        if (v.groupBy && !keys.has(v.groupBy)) errors.push(`[${id}] view ${v.key} groupBy 未知列 "${v.groupBy}"`);
        if (v.sortBy && !keys.has(v.sortBy.key)) errors.push(`[${id}] view ${v.key} sortBy 未知列 "${v.sortBy.key}"`);
    }
    for (const r of schema.reminders ?? []) {
        if (!keys.has(r.field)) errors.push(`[${id}] reminder ${r.key} field 未知列 "${r.field}"`);
        if (r.cycleField && !keys.has(r.cycleField)) errors.push(`[${id}] reminder ${r.key} cycleField 未知列`);
        if (r.lunarField && !keys.has(r.lunarField)) errors.push(`[${id}] reminder ${r.key} lunarField 未知列`);
    }
    return errors;
}
