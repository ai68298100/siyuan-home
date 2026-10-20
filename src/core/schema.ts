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
    /** select 默认值（D11：显式声明，调整枚举顺序不改变新行状态；缺省 = options[0]） */
    default?: string;
    required?: boolean;
    /** 表单提示的 i18n 键；只在字段语义需要额外说明时配置。 */
    placeholderKey?: string;
    helpKey?: string;
    /** 数值字段的单位 i18n 键，例如元、公里、件。 */
    unitKey?: string;
    /** 表单数值边界；约束由业务字段显式声明，不对未知数字字段臆测范围。 */
    min?: number;
    max?: number;
    step?: number | "any";
    /** 视图默认宽度占比（相对） */
    width?: number;
}

export interface ViewDef {
    key: string;
    /** i18n 键：view.<module>.<key> */
    type: "table" | "gallery";
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
    /** 活动时间线中的事项日期声明。禁止使用到期日、提醒日或其他预计日期。 */
    activity?: { dateField: string; detailFields?: string[] };
    /** 数值阈值规则（H15）：值列 ≤ 阈值列时生成即时提醒（如药品/囤货低库存）。
     * 语义定案：值 ≤ 阈值触发（降到阈值即提醒）；值或阈值缺列/缺值不提醒（0 算有值）；
     * 补货到阈值之上自动解除（每次扫描重算）；忽略/恢复由运行态 mute/restore 管理。 */
    numericRules?: NumericRuleSpec[];
}

/** 数值阈值规则声明（H15）：field=数量列，thresholdField=逐行阈值列 */
export interface NumericRuleSpec {
    key: string;
    field: string;
    thresholdField: string;
}

// ── 字段定义与声明工厂函数 ────────────────────────────────────

const txt = (key: string): ColumnDef => ({ key, type: "text", labelKey: `field.${key}` });
const dat = (key: string): ColumnDef => ({ key, type: "date", labelKey: `field.${key}` });
const ast = (key: string): ColumnDef => ({ key, type: "mAsset", labelKey: `field.${key}` });
const num = (key: string, extra?: Partial<ColumnDef>): ColumnDef => ({ key, type: "number", labelKey: `field.${key}`, ...extra });
const sel = (key: string, options?: string[], def?: string): ColumnDef => ({ key, type: "select", labelKey: `field.${key}`, ...(options ? { options } : {}), ...(def ? { default: def } : {}) });
const chk = (key: string): ColumnDef => ({ key, type: "checkbox", labelKey: `field.${key}` });
const rem = (key: string, field: string, leadDays = 30, kind: "oneoff" | "recurring" | "anniversary" | "after" = "oneoff", extra?: Partial<ReminderRuleSpec>): ReminderRuleSpec => ({ key, field, kind, leadDays, ...extra });

// ── 字段字典（02 §2）────────────────────────────────────────

export const FIELD_DICT: Record<string, ColumnDef> = {
    name:          { key: "name", type: "text", required: true },
    member:        { key: "member", type: "relation", labelKey: "field.member" }, // → members 库（Spike R2 定案）
    category:      sel("category"),
    status:        sel("status"),
    date:          dat("date"),
    expiry:        dat("expiry"),
    remind_before: num("remind_before"),
    amount:        num("amount", { min: 0, step: 0.01, unitKey: "capture.unitCny" }),
    cycle:         sel("cycle", ["day", "week", "month", "quarter", "year"]),
    location:      txt("location"),
    attachments:   ast("attachments"),
    url:           { key: "url", type: "url", labelKey: "field.url" },
    /** EC13：外部联系人快照（人脉 docId），文本列存 `名称 [docId]`——快照可见可搜，不做跨插件 relation（v2 再议） */
    contact:       txt("contact"),
    tags:          { key: "tags", type: "mSelect", labelKey: "field.tags" },
    note:          txt("note"),
    due:           dat("due"), // 中枢写回的下次发生日
};

const d = (...keys: string[]): ColumnDef[] => keys.map((k) => FIELD_DICT[k]);
const cat = (options: string[]): ColumnDef => ({ ...FIELD_DICT.category, options });
const sta = (options: string[], def = options[0]): ColumnDef => ({ ...FIELD_DICT.status, options, default: def });
const tbl = (key: string, extra?: Partial<ViewDef>): ViewDef => ({ key, type: "table", ...extra });

// ── certs 证件管理（02 §4.2①）──────────────────────────────

/**
 * 证件分类值。
 *
 * Existing values (`permit`/`license`) are intentionally retained so old rows
 * keep their meaning after upgrading. New, more specific values are additive.
 */
export const CERTIFICATE_CATEGORY_OPTIONS = [
    "id", "hukou", "passport", "visa", "permit", "hkmo_permit", "tw_permit",
    "license", "driver_license", "vehicle_lic", "birth_cert", "vocational_qualification",
    "professional_qualification", "graduation_cert", "degree_cert", "professional_title", "other",
] as const;

export type CertificateCategory = typeof CERTIFICATE_CATEGORY_OPTIONS[number];

/** Category-specific fields. All keys use the x_cert_ prefix so they are
 * clearly module-private and can be added without changing the shared field
 * dictionary. The UI can use this profile to render only relevant fields. */
export interface CertificateProfile {
    category: CertificateCategory;
    fieldKeys: readonly string[];
    columns: readonly ColumnDef[];
}

const CERTIFICATE_PROFILE_COLUMNS: Record<CertificateCategory, readonly ColumnDef[]> = {
    id: [
        txt("x_cert_id_number"),
        txt("x_cert_id_address"),
        txt("x_cert_id_authority"),
        sel("x_cert_id_gender", ["male", "female"]),
        ast("x_cert_id_front"),
        ast("x_cert_id_back"),
    ],
    hukou: [
        txt("x_cert_hukou_location"),
        txt("x_cert_hukou_head_name"),
        ast("x_cert_hukou_scan"),
    ],
    passport: [
        txt("x_cert_passport_name_pinyin"),
        txt("x_cert_passport_nationality"),
        txt("x_cert_passport_birth_place"),
        txt("x_cert_passport_authority"),
        ast("x_cert_passport_scan"),
    ],
    visa: [
        txt("x_cert_visa_country"),
        txt("x_cert_visa_type"),
        ast("x_cert_visa_scan"),
    ],
    permit: [
        txt("x_cert_permit_region"),
        txt("x_cert_permit_endorsement"),
        dat("x_cert_permit_endorsement_expiry"),
        ast("x_cert_permit_scan"),
    ],
    hkmo_permit: [
        sel("x_cert_hkmo_region", ["hong_kong", "macao"]),
        txt("x_cert_hkmo_endorsement"),
        dat("x_cert_hkmo_endorsement_expiry"),
        ast("x_cert_hkmo_scan"),
    ],
    tw_permit: [
        txt("x_cert_tw_endorsement"),
        dat("x_cert_tw_endorsement_expiry"),
        ast("x_cert_tw_scan"),
    ],
    /** Legacy value retained for rows created when this option meant a generic license. */
    license: [
        txt("x_cert_legacy_type"),
        txt("x_cert_legacy_issuer"),
        ast("x_cert_legacy_scan"),
    ],
    driver_license: [
        txt("x_cert_driver_class"),
        txt("x_cert_driver_authority"),
        dat("x_cert_driver_first_issue_date"),
        dat("x_cert_driver_review_due"),
        ast("x_cert_driver_scan"),
    ],
    vehicle_lic: [
        txt("x_cert_vehicle_plate"),
        txt("x_cert_vehicle_owner"),
        ast("x_cert_vehicle_scan"),
    ],
    birth_cert: [
        txt("x_cert_birth_place"),
        txt("x_cert_birth_registration_no_last4"),
        ast("x_cert_birth_scan"),
    ],
    vocational_qualification: [
        txt("x_cert_vocational_name"),
        txt("x_cert_vocational_level"),
        txt("x_cert_vocational_issuer"),
        txt("x_cert_vocational_registration_last4"),
        dat("x_cert_vocational_education_due"),
        ast("x_cert_vocational_scan"),
    ],
    professional_qualification: [
        txt("x_cert_professional_name"),
        txt("x_cert_professional_level"),
        txt("x_cert_professional_issuer"),
        txt("x_cert_professional_registration_last4"),
        dat("x_cert_professional_education_due"),
        ast("x_cert_professional_scan"),
    ],
    graduation_cert: [
        txt("x_cert_school"),
        txt("x_cert_major"),
        txt("x_cert_education_level"),
        dat("x_cert_admission_date"),
        dat("x_cert_graduation_date"),
        txt("x_cert_graduation_no_last4"),
        ast("x_cert_graduation_scan"),
    ],
    degree_cert: [
        txt("x_cert_degree"),
        txt("x_cert_degree_school"),
        dat("x_cert_degree_award_date"),
        txt("x_cert_degree_no_last4"),
        ast("x_cert_degree_scan"),
    ],
    professional_title: [
        txt("x_cert_title_level"),
        txt("x_cert_title_specialty"),
        txt("x_cert_title_issuer"),
        dat("x_cert_title_review_due"),
        ast("x_cert_title_scan"),
    ],
    other: [
        txt("x_cert_other_type"),
        txt("x_cert_other_issuer"),
        ast("x_cert_other_scan"),
    ],
};

const certificateProfiles = CERTIFICATE_CATEGORY_OPTIONS.reduce((profiles, category) => {
    const columns = CERTIFICATE_PROFILE_COLUMNS[category];
    profiles[category] = { category, fieldKeys: columns.map((column) => column.key), columns };
    return profiles;
}, {} as Record<CertificateCategory, CertificateProfile>);

export const CERTIFICATE_PROFILES: Readonly<Record<CertificateCategory, CertificateProfile>> = certificateProfiles;

/** Unknown/legacy category values deliberately fall back to `other`; callers
 * can still preserve and display the raw category value separately. */
export function getCertificateProfile(category: string | undefined): CertificateProfile {
    return CERTIFICATE_PROFILES[category as CertificateCategory] ?? CERTIFICATE_PROFILES.other;
}

/** Type-specific deadline fields already registered as their own reminder rules. */
const CERTIFICATE_REMINDER_FIELDS: Partial<Record<CertificateCategory, string>> = {
    permit: "x_cert_permit_endorsement_expiry",
    hkmo_permit: "x_cert_hkmo_endorsement_expiry",
    tw_permit: "x_cert_tw_endorsement_expiry",
    driver_license: "x_cert_driver_review_due",
    vocational_qualification: "x_cert_vocational_education_due",
    professional_qualification: "x_cert_professional_education_due",
    professional_title: "x_cert_title_review_due",
};

export function getCertificateReminderField(category: string | undefined): string | undefined {
    return CERTIFICATE_REMINDER_FIELDS[category as CertificateCategory];
}

const CERT_PROFILE_COLUMNS: ColumnDef[] = Object.values(CERTIFICATE_PROFILE_COLUMNS).flatMap((columns) => [...columns]);

const CERT_PRIVATE: ColumnDef[] = [
    txt("x_cert_holder_name"),
    txt("holder_no"), // 完整证件号码，界面默认脱敏展示
    dat("issue_date"),
    dat("x_cert_valid_from"),
    sel("issuance_rule", ["y6", "y10", "longterm", "endorsement"]),
    txt("store_place"),
];

export const CERTS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat([...CERTIFICATE_CATEGORY_OPTIONS]),
        sta(["valid", "expired", "renewed", "void"]),
        ...d("date"),
        ...CERT_PRIVATE,
        ...d("expiry", "due", "remind_before", "location", "attachments", "note"),
        txt("copy_location"), // 16 组：复印件/电子版存放位置
        { key: "renewed_to", type: "relation", labelKey: "field.renewed_to" }, // 16 组：换证链——旧证行 → 新证行
        ...CERT_PROFILE_COLUMNS,
    ],
    capture: ["name", "member", "category", "expiry", "attachments"],
    views: [
        tbl("by_member", { groupBy: "member" }),
        tbl("expiring", { sortBy: { key: "expiry", asc: true } }),
    ],
    reminders: [
        rem("expiry", "expiry", 90),
        // 签注/下次审验日（港澳台通行证签注另计）——due 列已在 columns 中（契约 33.2）
        rem("endorsement", "due", 60),
        rem("permit_endorsement", "x_cert_permit_endorsement_expiry", 60),
        rem("hkmo_endorsement", "x_cert_hkmo_endorsement_expiry", 60),
        rem("tw_endorsement", "x_cert_tw_endorsement_expiry", 60),
        rem("driver_review", "x_cert_driver_review_due", 60),
        rem("vocational_education", "x_cert_vocational_education_due", 60),
        rem("professional_education", "x_cert_professional_education_due", 60),
        rem("title_review", "x_cert_title_review_due", 60),
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
    // 192 波 E14：内核 addAttributeViewKey 不支持 asset 单资源列（思源只有多资源 mAsset）——头像用 mAsset 单值承载
    { key: "avatar", type: "mAsset" },
];

export const MEMBERS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name"),
        ...MEMBERS_PRIVATE,
        sta(["active", "archived"]),
        ...d("note"),
    ],
    capture: ["name", "role", "birthday", "lunar"],
    views: [tbl("by_role", { groupBy: "role" })],
    // 生日周年提醒由 members provider 声明（lunarField 指向 lunar 列）
    reminders: [
        rem("birthday", "birthday", 7, "anniversary", { lunarField: "lunar" }),
    ],
};

// ── v0.3 模块 schema（02 §4.3，SchemaLedgerProvider 通用派生）──────────

export const MEDICINE_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["rx", "otc", "external", "device", "supplement"]),
        sta(["inuse", "standby", "med_expired", "discarded"]),
        ...d("expiry", "remind_before"),
        num("stock_qty", { min: 0, unitKey: "capture.unitCount" }),
        num("low_stock_at", { min: 0, unitKey: "capture.unitCount" }),
        ...d("location", "note"),
    ],
    capture: ["name", "category", "expiry", "stock_qty", "location"],
    views: [tbl("expiring", { sortBy: { key: "expiry", asc: true } })],
    reminders: [rem("expiry", "expiry", 30)],
    // H15：低库存双规则之数值侧（效期侧由 expiry 规则承担；阈值逐行 low_stock_at）
    numericRules: [{ key: "low_stock", field: "stock_qty", thresholdField: "low_stock_at" }],
};

export const MEMBERSHIPS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["member_card", "prepaid", "subscription", "coupon", "points"]),
        sta(["active", "m_expired", "refunded"]),
        ...d("expiry", "cycle", "amount", "note"),
        dat("next_pay"),
        dat("trial_end"),
        chk("auto_renew"),
        txt("credentials_note"),
        sel("seat_role", ["holder", "member"], "holder"), // 16 组：家庭共享账号主卡/成员位
        { key: "cancel_guide", type: "url", labelKey: "field.cancel_guide" }, // 16 组：取消自动续费指引链接
    ],
    capture: ["name", "category", "amount", "cycle", "next_pay"],
    views: [tbl("renewing", { sortBy: { key: "next_pay", asc: true } })],
    reminders: [
        rem("next_pay", "next_pay", 14, "recurring", { cycleField: "cycle", autoRenewField: "auto_renew" }),
        rem("trial_end", "trial_end", 3),
        rem("expiry", "expiry", 14),
    ],
};

export const INSURANCE_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["health", "critical", "accident", "life", "vehicle", "property", "other_ins"]),
        sta(["in_force", "paying", "ins_expired", "surrendered"]),
        txt("insurer"),
        txt("contact"), // EC13：对接人（人脉快照）
        txt("policy_no"),
        num("premium"),
        sel("pay_cycle", ["month", "quarter", "year"]),
        dat("next_pay"),
        num("coverage"),
        // 16 组：理赔记录状态机（报案→材料→到账；无日期驱动，v1 仅记录）
        sel("claim_status", ["none", "filing", "docs", "paid"], "none"),
        dat("claim_date"),
        num("claim_amount"),
        ...d("expiry", "attachments", "note"),
    ],
    capture: ["name", "category", "insurer", "premium", "next_pay"],
    activity: { dateField: "claim_date", detailFields: ["claim_status", "claim_amount", "insurer"] },
    views: [tbl("paying", { groupBy: "member" })],
    reminders: [
        rem("next_pay", "next_pay", 30, "recurring", { cycleField: "pay_cycle" }),
        rem("expiry", "expiry", 30),
    ],
};

// ── v0.4/v0.6 批量 schema（02 §4.3 紧凑规格落地）─────────────────

export const ASSETS_REAL_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["appliance", "furniture", "digital", "toy", "apparel", "jewelry", "collection", "sports", "other_ar"]),
        sta(["inuse", "idle", "lent", "repairing", "disposed"]),
        ...d("date", "amount", "expiry", "location", "attachments", "tags", "note"),
        txt("brand_model"),
        dat("warranty_expiry"),
        txt("channel"),
    ],
    capture: ["name", "category", "amount", "date", "attachments"],
    activity: { dateField: "date", detailFields: ["category", "amount", "location"] },
    views: [tbl("by_location", { groupBy: "location" })],
    reminders: [rem("warranty", "warranty_expiry", 30)],
};

export const HEALTH_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["visit", "report", "vaccine", "medication", "allergy", "checkup"]),
        sta(["following", "closed"]),
        ...d("date", "attachments", "note"),
        txt("hospital"),
        txt("department"),
        txt("diagnosis"),
        dat("followup_date"),
    ],
    capture: ["name", "member", "category", "date", "attachments"],
    activity: { dateField: "date", detailFields: ["category", "hospital", "department", "diagnosis"] },
    templates: [{ key: "checkup_plan", nameKey: "tpl.checkupPlan", file: "health/checkup-plan.tpl" }],
    views: [tbl("by_member", { groupBy: "member" })],
    reminders: [rem("followup", "followup_date", 7)],
};

export const SHOPPING_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["daily", "digital", "apparel", "food_sh", "other_sh", "wish"]),
        ...d("date", "amount", "url", "note"),
        txt("channel"),
        txt("tracking_no"),
        txt("pickup_code"),
        num("qty", { min: 0, unitKey: "capture.unitCount" }), // 16 组：数量（购入→囤货联动用）
        // 提案 A/210 波：愿望（wish 类别行）的目标金额——存钱流水在 rowlog deposits，进度在抽屉分区
        num("target_amount"),
        // 16 组：退货/退款记录
        sel("return_status", ["none", "requested", "returned", "refunded"], "none"),
        dat("return_date"),
        num("refund_amount"),
    ],
    capture: ["name", "amount", "date", "channel"],
    activity: { dateField: "date", detailFields: ["category", "amount", "channel", "qty"] },
};

export const CONTRACTS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["rent", "renovation", "purchase", "labor", "property_ct", "other_ct"]),
        sta(["ct_active", "ct_expired", "terminated"]),
        ...d("date", "expiry", "remind_before", "attachments", "note"),
        txt("party"),
        txt("contact"), // EC13：对接人（人脉快照）
        num("deposit"),
        chk("auto_renew"), // 16 组：自动续约条款 → 到期升级为续约决策提醒
        chk("deposit_returned"), // 16 组：押金退还记录
        dat("deposit_return_date"),
    ],
    capture: ["name", "category", "expiry", "attachments"],
    activity: { dateField: "date", detailFields: ["category", "party", "deposit"] },
    reminders: [rem("expiry", "expiry", 30, "oneoff", { autoRenewField: "auto_renew" })],
};

export const EXAMS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["vocational", "title", "language", "academic", "other_ex"]),
        sta(["preparing", "passed", "ex_expired"]),
        ...d("expiry", "attachments", "note"),
        txt("issuer"),
        txt("contact"), // EC13：对接人（人脉快照）
        dat("exam_date"),
    ],
    capture: ["name", "member", "exam_date", "expiry"],
    activity: { dateField: "exam_date", detailFields: ["category", "status", "issuer"] },
    reminders: [rem("expiry", "expiry", 60)],
};

export const ALLOWANCE_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["lucky", "allowance_al", "reward", "interest_al"]),
        sel("direction", ["in", "out"]),
        ...d("amount", "date", "note"),
        txt("source"),
    ],
    capture: ["name", "category", "amount", "direction", "date"],
    activity: { dateField: "date", detailFields: ["category", "direction", "amount", "source"] },
    views: [tbl("by_member", { groupBy: "member" })],
};

export const FAVORS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name"),
        cat(["wedding", "full_moon", "housewarming", "graduation", "birthday_fv", "other_fv"]),
        sel("direction", ["in", "out"]),
        txt("person"),
        ...d("amount", "date", "note"),
    ],
    capture: ["name", "direction", "person", "amount", "date"],
    activity: { dateField: "date", detailFields: ["category", "direction", "person", "amount"] },
    // 16 组/190 波：回礼提醒——收礼（direction=in）30 天后一次性（leadDays 0=到期当天起提醒）；提醒卡带「回礼」标记（rule.reciprocate）
    reminders: [rem("reciprocate", "date", 0, "after", { offsetDays: 30, onlyIf: { field: "direction", equals: "in" } })],
    views: [tbl("by_person", { groupBy: "person" })],
};

export const STOCK_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["food_st", "daily_chem", "paper", "medical_st", "emergency_st", "other_st"]),
        ...d("expiry", "location", "note"),
        num("qty", { min: 0, unitKey: "capture.unitCount" }),
        num("low_stock_at", { min: 0, unitKey: "capture.unitCount" }),
    ],
    capture: ["name", "qty", "low_stock_at", "expiry"],
    // 品类分区（Apple Reminders Grocery 印证，26.6）：囤货按品类自动归组
    views: [
        tbl("by_category", { groupBy: "category" }),
        tbl("expiring", { sortBy: { key: "expiry", asc: true } }),
    ],
    templates: [{ key: "emergency_kit", nameKey: "tpl.emergencyKit", file: "stock/emergency-kit.tpl" }],
    reminders: [rem("expiry", "expiry", 30)],
    // H15：囤货低库存（阈值逐行 low_stock_at）
    numericRules: [{ key: "low_stock", field: "qty", thresholdField: "low_stock_at" }],
};

export const CHORES_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["housework", "maintenance", "care", "other_ch"]),
        ...d("cycle", "due", "note"),
        dat("last_done"),
    ],
    capture: ["name", "member", "cycle", "due"],
    activity: { dateField: "last_done", detailFields: ["category"] },
    // v0.2：due 作为一次性提醒；周期写回（中枢重算）见 03 §5 recurring 完整版
    reminders: [rem("due", "due", 7)],
};

export const HOUSE_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["payment", "maintenance_h", "anniversary", "emergency"]),
        ...d("cycle", "note"),
        dat("pay_day"),
        chk("lunar"),
    ],
    capture: ["name", "category", "pay_day", "cycle"],
    reminders: [rem("pay_day", "pay_day", 7, "anniversary", { lunarField: "lunar" })],
};

// ── 最后一批轻模块（31/31 全覆盖）────────────────────────────

export const FOOD_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["home_cook", "restaurant", "takeout"]),
        num("rating", { min: 0, max: 5, step: 0.5 }),
        ...d("date", "url", "note"),
        chk("dislike_safe"),
        // grocy 印证（26.6）：食材摘要（换行分隔）——采购时可对照 stock 采购建议手动补货；自动联动留 v0.8
        txt("ingredients"),
    ],
    capture: ["name", "category", "rating", "date"],
    activity: { dateField: "date", detailFields: ["category", "rating"] },
};

export const ADDRESS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["home", "shipping", "id_addr", "org"]),
        txt("address_full"),
        ...d("url", "note"),
    ],
    capture: ["name", "category", "address_full"],
};

export const BOOKMARKS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name"),
        cat(["gov", "payment_bm", "shopping_bm", "learning", "work", "other_bm"]),
        ...d("url", "note"),
        { key: "account_note", type: "text", labelKey: "field.account_name" },
    ],
    capture: ["name", "category", "url"],
};

export const SNIPPETS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name"),
        cat(["greeting", "address_sn", "intro", "reply", "other_sn"]),
        txt("content"),
        ...d("tags"),
    ],
    capture: ["name", "content"],
};

export const PARENTING_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["vaccine_p", "growth", "feeding", "milestone"]),
        // due 必备：next_visit 规则引用此列（缺列会令 requireReminderColumns 抛错——第六十五轮修复）
        ...d("date", "due", "attachments", "note"),
        txt("vaccine_name"),
        num("dose_no"),
        txt("vaccine_batch"), // 16 组：接种追溯
        txt("vaccine_site"), // 16 组：接种点
        sel("metric_type", ["height", "weight"], "height"), // 生长曲线：指标类型
        num("metric_value"),
    ],
    capture: ["name", "member", "category", "date"],
    activity: { dateField: "date", detailFields: ["category", "vaccine_name", "dose_no", "metric_type", "metric_value"] },
    reminders: [rem("next_visit", "due", 7)],
};

export const SCHOOLING_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["kindergarten", "primary", "junior", "senior", "college", "grad_school", "extracurricular"]),
        sta(["applying", "enrolled", "graduated"]),
        txt("school"),
        txt("grade"),
        txt("teacher"),
        txt("contact"), // EC13：对接人（人脉快照）
        ...d("amount", "due", "note"),
        num("enroll_year"),
        dat("exam_date"), // 16 组：考试/重要日程（exams 模块管备考，这里管校内日程）
    ],
    capture: ["name", "school", "category", "amount", "due"],
    activity: { dateField: "exam_date", detailFields: ["school", "category", "status"] },
    templates: [{ key: "parent_meeting", nameKey: "tpl.parentMeeting", file: "schooling/parent-meeting.tpl" }],
    reminders: [
        rem("tuition", "due", 14),
        rem("exam_date", "exam_date", 3),
    ],
};

export const SOCIAL_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["shebao", "gongjijin", "yibao", "resident_pension", "commercial_pension"]),
        ...d("note"),
        txt("account_no"),
        chk("retire_check"),
        num("retire_age"),
        num("balance_snapshot"),
        dat("snapshot_date"),
        dat("base_adjust_date"), // 16 组：缴费基数年度调整
    ],
    capture: ["name", "member", "category", "account_no"],
    reminders: [rem("base_adjust", "base_adjust_date", 14, "anniversary")],
};

export const MEDIA_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["movie", "tv", "variety", "book", "comic", "novel"]),
        sta(["wishlist", "consuming", "done", "dropped"]),
        num("rating"),
        txt("progress"),
        // 16 组/189 波：追更提醒——更新日手动登记，提醒中枢派生（oneoff，当天提醒）
        dat("next_update"),
        ...d("url", "date", "note"),
    ],
    capture: ["name", "category", "status", "next_update"],
    reminders: [rem("next_update", "next_update", 0)],
    // 海报墙（seerr 印证，26.6）：画廊视图以封面卡片呈现；思源 gallery 视图类型原生支持
    views: [
        { key: "wall", type: "gallery" },
        tbl("consuming", { groupBy: "status" }),
    ],
};

export const PETS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name"),
        sel("species", ["cat", "dog", "other_pet"]),
        txt("breed"),
        dat("vaccine_due"),
        dat("deworm_due"),
        ...d("cycle"), // deworm recurring 的周期来源（缺失时规则按 oneoff 降级；旧库由补列续跑补齐）
        ...d("note"),
    ],
    capture: ["name", "species", "vaccine_due", "deworm_due", "cycle"],
    reminders: [
        rem("vaccine", "vaccine_due", 14),
        rem("deworm", "deworm_due", 7, "recurring", { cycleField: "cycle" }),
    ],
};

export const VEHICLES_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        txt("plate"),
        txt("brand_model"),
        txt("vin"),
        txt("color"),
        sel("energy_type", ["gasoline", "diesel", "hybrid", "electric", "other"], "gasoline"),
        ...d("expiry", "note", "attachments"),
        num("mileage", { min: 0, step: 1, unitKey: "capture.unitKm" }),
        dat("purchase_date"),
        num("purchase_price"),
        num("current_value"),
        dat("inspection_due"),
        txt("insurance_company"),
        dat("insurance_due"),
        dat("vehicle_tax_due"),
        num("battery_capacity"),
        // 电池更换（grocy 印证：铅酸 1.5-2 年/锂 5-8 年——用户按实际记录下次更换日）
        dat("battery_due"),
        // 违章手动记录（12123 功能面：日期/地点/行为/罚款 摘要，多条例以换行分隔；官方数据不做对接）
        txt("violations"),
    ],
    // Keep the quick form within the schema contract's five-field limit.
    // The vehicle attachment is surfaced by the dedicated photo control.
    capture: ["name", "plate", "brand_model", "energy_type", "mileage"],
    activity: { dateField: "purchase_date", detailFields: ["plate", "brand_model", "energy_type", "mileage"] },
    reminders: [
        rem("expiry", "expiry", 30),
        rem("inspection", "inspection_due", 30),
        rem("insurance", "insurance_due", 30),
        rem("vehicle_tax", "vehicle_tax_due", 30),
        rem("battery", "battery_due", 30),
    ],
};

export const TRANSIT_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["etc", "transit_card", "monthly", "senior"]),
        ...d("expiry", "note"),
        txt("card_no"),
    ],
    capture: ["name", "category", "expiry"],
    reminders: [rem("expiry", "expiry", 30)],
};

export const TRAVEL_PLAN_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        sta(["planning", "ongoing", "finished"]),
        ...d("date", "expiry", "amount", "note"),
        txt("destination"),
    ],
    capture: ["name", "destination", "date", "expiry"],
    activity: { dateField: "date", detailFields: ["destination", "status"] },
    reminders: [rem("date", "date", 7)],
};

export const TRAVEL_BOOKING_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name"),
        cat(["flight", "hotel", "train", "ticket", "rental"]),
        ...d("date", "amount", "attachments", "note"),
        txt("order_no"),
    ],
    capture: ["name", "category", "date", "order_no"],
    activity: { dateField: "date", detailFields: ["category", "amount"] },
};

export const TRAVEL_PACKING_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name"),
        sta(["draft", "packed"]),
        ...d("date", "note"),
        txt("checklist_doc"),
    ],
    capture: ["name", "date", "status"],
    activity: { dateField: "date", detailFields: ["status"] },
};

export const TRAVEL_LOG_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        ...d("date", "amount", "attachments", "note"),
        txt("cities"),
    ],
    capture: ["name", "date", "amount"],
    activity: { dateField: "date", detailFields: ["cities", "amount"] },
};

export const ASSETS_VIRTUAL_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        cat(["account", "domain", "game", "nft", "license", "other_v"]),
        ...d("expiry", "note"),
        txt("platform"),
        txt("account_name"),
        txt("cred_loc"),
        txt("inherit_note"),
    ],
    capture: ["name", "category", "platform", "account_name", "cred_loc"],
    reminders: [rem("expiry", "expiry", 30)],
};

// ── schema 契约校验（33.2 门禁）─────────────────────────────

/** 契约：capture/views/reminders 引用的列必须都在 columns 中；违规时开发期抛错。 */
export function validateSchema(id: string, schema: ModuleSchema): string[] {
    const keys = new Set(schema.columns.map((c) => c.key));
    const errors: string[] = [];
    // D11：重复列 key（建列映射会互相覆盖）
    const seen = new Set<string>();
    for (const c of schema.columns) {
        if (seen.has(c.key)) errors.push(`[${id}] 重复列 key "${c.key}"`);
        seen.add(c.key);
    }
    // D11：capture ≤5（02 §4.1 快速录入上限）
    if ((schema.capture ?? []).length > 5) errors.push(`[${id}] capture 超过 5 列（02 §4.1）`);
    if (!schema.capture?.length) errors.push(`[${id}] 必须明确声明快速录入字段`);
    if (schema.capture?.[0] !== "name") errors.push(`[${id}] 快速录入首字段必须是 name`);
    const captureSeen = new Set<string>();
    for (const k of schema.capture ?? []) {
        if (!keys.has(k)) errors.push(`[${id}] capture 引用未知列 "${k}"`);
        if (captureSeen.has(k)) errors.push(`[${id}] capture 重复字段 "${k}"`);
        captureSeen.add(k);
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
    const byKey = new Map(schema.columns.map((c) => [c.key, c]));
    if (schema.activity) {
        const activityDate = byKey.get(schema.activity.dateField);
        if (!activityDate) errors.push(`[${id}] activity.dateField 未知列 "${schema.activity.dateField}"`);
        else if (activityDate.type !== "date") errors.push(`[${id}] activity.dateField "${schema.activity.dateField}" 必须是 date 列`);
        for (const key of schema.activity.detailFields ?? []) {
            if (!keys.has(key)) errors.push(`[${id}] activity.detailFields 引用未知列 "${key}"`);
        }
    }
    // D11：数值阈值规则的两列必须存在且为 number 类型（阈值语义依赖数值比较）
    for (const n of schema.numericRules ?? []) {
        const f = byKey.get(n.field);
        const th = byKey.get(n.thresholdField);
        if (!f) errors.push(`[${id}] numericRule ${n.key} field 未知列 "${n.field}"`);
        else if (f.type !== "number") errors.push(`[${id}] numericRule ${n.key} field "${n.field}" 非number列`);
        if (!th) errors.push(`[${id}] numericRule ${n.key} thresholdField 未知列 "${n.thresholdField}"`);
        else if (th.type !== "number") errors.push(`[${id}] numericRule ${n.key} thresholdField "${n.thresholdField}" 非number列`);
    }
    // D11：select 默认值必须命中枚举（显式声明的默认不随枚举顺序漂移）
    for (const c of schema.columns) {
        if (c.default !== undefined && !(c.options ?? []).includes(c.default)) {
            errors.push(`[${id}] 列 "${c.key}" default "${c.default}" 不在 options 内`);
        }
        if (c.type !== "number" && (c.min !== undefined || c.max !== undefined || c.step !== undefined)) {
            errors.push(`[${id}] 非数值列 "${c.key}" 不能声明数值边界`);
        }
        if (c.min !== undefined && c.max !== undefined && c.min > c.max) {
            errors.push(`[${id}] 列 "${c.key}" min 大于 max`);
        }
        if (typeof c.step === "number" && c.step <= 0) {
            errors.push(`[${id}] 列 "${c.key}" step 必须大于 0`);
        }
    }
    return errors;
}

/** 31 模块 schema 单源目录（193 波：index.ts 两份手工清单收口于此——12 波"清单漂移"教训的同类结构；
 * 消费方：schemaCatalog、ensureCoreLedgers 契约门禁、活体 IT-12 列类型矩阵） */
export const SCHEMA_CATALOG: Record<string, ModuleSchema> = {
    members: MEMBERS_SCHEMA, certs: CERTS_SCHEMA,
    "assets-real": ASSETS_REAL_SCHEMA, health: HEALTH_SCHEMA,
    medicine: MEDICINE_SCHEMA, memberships: MEMBERSHIPS_SCHEMA, insurance: INSURANCE_SCHEMA,
    shopping: SHOPPING_SCHEMA, contracts: CONTRACTS_SCHEMA, exams: EXAMS_SCHEMA,
    allowance: ALLOWANCE_SCHEMA, favors: FAVORS_SCHEMA, stock: STOCK_SCHEMA,
    chores: CHORES_SCHEMA, house: HOUSE_SCHEMA,
    media: MEDIA_SCHEMA, pets: PETS_SCHEMA, vehicles: VEHICLES_SCHEMA, transit: TRANSIT_SCHEMA,
    "travel-plan": TRAVEL_PLAN_SCHEMA, "travel-booking": TRAVEL_BOOKING_SCHEMA,
    "travel-packing": TRAVEL_PACKING_SCHEMA, "travel-log": TRAVEL_LOG_SCHEMA,
    "assets-virtual": ASSETS_VIRTUAL_SCHEMA,
    food: FOOD_SCHEMA, address: ADDRESS_SCHEMA, bookmarks: BOOKMARKS_SCHEMA, snippets: SNIPPETS_SCHEMA,
    parenting: PARENTING_SCHEMA, schooling: SCHOOLING_SCHEMA, social: SOCIAL_SCHEMA,
};

/** 列类型白名单（192 波 E14 教训：内核不支持的类型会让该模块建库失败）。
 * 活体 IT-12 以真机核验本清单；schema 声明新类型前必须先入白名单并过 IT-12。
 * mSelect（FIELD_DICT.tags）193 波 IT-12 真机核验通过。 */
export const KERNEL_COLUMN_TYPES: ReadonlySet<string> = new Set([
    "text", "number", "date", "select", "mSelect", "checkbox", "url", "relation", "mAsset",
]);
