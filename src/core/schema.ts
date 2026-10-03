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
    /** EC13：外部联系人快照（人脉 docId），文本列存 `名称 [docId]`——快照可见可搜，不做跨插件 relation（v2 再议） */
    contact:       { key: "contact", type: "text", labelKey: "field.contact" },
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
        { ...FIELD_DICT.status, options: ["valid", "expired", "renewed", "void"], default: "valid" },
        ...d("date"),
        ...CERT_PRIVATE,
        ...d("expiry", "due", "remind_before", "location", "attachments", "note"),
        { key: "copy_location", type: "text", labelKey: "field.copy_location" }, // 16 组：复印件/电子版存放位置
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
        { ...FIELD_DICT.status, options: ["active", "archived"], default: "active" },
        ...d("note"),
    ],
    capture: ["name", "role", "birthday", "lunar"],
    views: [{ key: "by_role", type: "table", groupBy: "role" }],
    // 生日周年提醒由 members provider 声明（lunarField 指向 lunar 列）
    reminders: [
        { key: "birthday", field: "birthday", kind: "anniversary", leadDays: 7, lunarField: "lunar" },
    ],
};

// ── v0.3 模块 schema（02 §4.3，SchemaLedgerProvider 通用派生）──────────

export const MEDICINE_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["rx", "otc", "external", "device", "supplement"] },
        { ...FIELD_DICT.status, options: ["inuse", "standby", "med_expired", "discarded"], default: "inuse" },
        ...d("expiry", "remind_before"),
        { key: "stock_qty", type: "number", labelKey: "field.stock_qty" },
        { key: "low_stock_at", type: "number", labelKey: "field.low_stock_at" },
        ...d("location", "note"),
    ],
    capture: ["name", "category", "expiry", "stock_qty", "location"],
    views: [{ key: "expiring", type: "table", sortBy: { key: "expiry", asc: true } }],
    reminders: [{ key: "expiry", field: "expiry", kind: "oneoff", leadDays: 30 }],
    // H15：低库存双规则之数值侧（效期侧由 expiry 规则承担；阈值逐行 low_stock_at）
    numericRules: [{ key: "low_stock", field: "stock_qty", thresholdField: "low_stock_at" }],
};

export const MEMBERSHIPS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["member_card", "prepaid", "subscription", "coupon", "points"] },
        { ...FIELD_DICT.status, options: ["active", "m_expired", "refunded"], default: "active" },
        ...d("expiry", "cycle", "amount", "note"),
        { key: "next_pay", type: "date", labelKey: "field.next_pay" },
        { key: "trial_end", type: "date", labelKey: "field.trial_end" },
        { key: "auto_renew", type: "checkbox", labelKey: "field.auto_renew" },
        { key: "credentials_note", type: "text", labelKey: "field.credentials_note" },
        { key: "seat_role", type: "select", labelKey: "field.seat_role", options: ["holder", "member"], default: "holder" }, // 16 组：家庭共享账号主卡/成员位
        { key: "cancel_guide", type: "url", labelKey: "field.cancel_guide" }, // 16 组：取消自动续费指引链接
    ],
    capture: ["name", "category", "amount", "cycle", "next_pay"],
    views: [{ key: "renewing", type: "table", sortBy: { key: "next_pay", asc: true } }],
    reminders: [
        { key: "next_pay", field: "next_pay", kind: "recurring", leadDays: 14, cycleField: "cycle", autoRenewField: "auto_renew" },
        { key: "trial_end", field: "trial_end", kind: "oneoff", leadDays: 3 },
        { key: "expiry", field: "expiry", kind: "oneoff", leadDays: 14 },
    ],
};

export const INSURANCE_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["health", "critical", "accident", "life", "vehicle", "property", "other_ins"] },
        { ...FIELD_DICT.status, options: ["in_force", "paying", "ins_expired", "surrendered"], default: "in_force" },
        { key: "insurer", type: "text", labelKey: "field.insurer" },
        { key: "contact", type: "text", labelKey: "field.contact" }, // EC13：对接人（人脉快照）
        { key: "policy_no", type: "text", labelKey: "field.policy_no" },
        { key: "premium", type: "number", labelKey: "field.premium" },
        { key: "pay_cycle", type: "select", labelKey: "field.cycle", options: ["month", "quarter", "year"] },
        { key: "next_pay", type: "date", labelKey: "field.next_pay" },
        { key: "coverage", type: "number", labelKey: "field.coverage" },
        // 16 组：理赔记录状态机（报案→材料→到账；无日期驱动，v1 仅记录）
        { key: "claim_status", type: "select", labelKey: "field.claim_status", options: ["none", "filing", "docs", "paid"], default: "none" },
        { key: "claim_date", type: "date", labelKey: "field.claim_date" },
        { key: "claim_amount", type: "number", labelKey: "field.claim_amount" },
        ...d("expiry", "attachments", "note"),
    ],
    capture: ["name", "category", "insurer", "premium", "next_pay"],
    views: [{ key: "paying", type: "table", groupBy: "member" }],
    reminders: [
        { key: "next_pay", field: "next_pay", kind: "recurring", leadDays: 30, cycleField: "pay_cycle" },
        { key: "expiry", field: "expiry", kind: "oneoff", leadDays: 30 },
    ],
};

// ── v0.4/v0.6 批量 schema（02 §4.3 紧凑规格落地）─────────────────

export const ASSETS_REAL_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["appliance", "furniture", "digital", "toy", "apparel", "jewelry", "collection", "sports", "other_ar"] },
        { ...FIELD_DICT.status, options: ["inuse", "idle", "lent", "repairing", "disposed"], default: "inuse" },
        ...d("date", "amount", "expiry", "location", "attachments", "tags", "note"),
        { key: "brand_model", type: "text", labelKey: "field.brand_model" },
        { key: "warranty_expiry", type: "date", labelKey: "field.warranty_expiry" },
        { key: "channel", type: "text", labelKey: "field.channel" },
    ],
    capture: ["name", "category", "amount", "date", "attachments"],
    views: [{ key: "by_location", type: "table", groupBy: "location" }],
    reminders: [{ key: "warranty", field: "warranty_expiry", kind: "oneoff", leadDays: 30 }],
};

export const HEALTH_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["visit", "report", "vaccine", "medication", "allergy", "checkup"] },
        { ...FIELD_DICT.status, options: ["following", "closed"], default: "following" },
        ...d("date", "attachments", "note"),
        { key: "hospital", type: "text", labelKey: "field.hospital" },
        { key: "department", type: "text", labelKey: "field.department" },
        { key: "diagnosis", type: "text", labelKey: "field.diagnosis" },
        { key: "followup_date", type: "date", labelKey: "field.followup_date" },
    ],
    capture: ["name", "member", "category", "date", "attachments"],
    views: [{ key: "by_member", type: "table", groupBy: "member" }],
    reminders: [{ key: "followup", field: "followup_date", kind: "oneoff", leadDays: 7 }],
};

export const SHOPPING_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["daily", "digital", "apparel", "food_sh", "other_sh"] },
        ...d("date", "amount", "url", "note"),
        { key: "channel", type: "text", labelKey: "field.channel" },
        { key: "tracking_no", type: "text", labelKey: "field.tracking_no" },
        { key: "pickup_code", type: "text", labelKey: "field.pickup_code" },
        // 16 组：退货/退款记录
        { key: "return_status", type: "select", labelKey: "field.return_status", options: ["none", "requested", "returned", "refunded"], default: "none" },
        { key: "return_date", type: "date", labelKey: "field.return_date" },
        { key: "refund_amount", type: "number", labelKey: "field.refund_amount" },
    ],
    capture: ["name", "amount", "date", "channel"],
};

export const CONTRACTS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["rent", "renovation", "purchase", "labor", "property_ct", "other_ct"] },
        { ...FIELD_DICT.status, options: ["ct_active", "ct_expired", "terminated"], default: "ct_active" },
        ...d("date", "expiry", "remind_before", "attachments", "note"),
        { key: "party", type: "text", labelKey: "field.party" },
        { key: "contact", type: "text", labelKey: "field.contact" }, // EC13：对接人（人脉快照）
        { key: "deposit", type: "number", labelKey: "field.deposit" },
        { key: "auto_renew", type: "checkbox", labelKey: "field.auto_renew" }, // 16 组：自动续约条款 → 到期升级为续约决策提醒
        { key: "deposit_returned", type: "checkbox", labelKey: "field.deposit_returned" }, // 16 组：押金退还记录
        { key: "deposit_return_date", type: "date", labelKey: "field.deposit_return_date" },
    ],
    capture: ["name", "category", "expiry", "attachments"],
    reminders: [{ key: "expiry", field: "expiry", kind: "oneoff", leadDays: 30, autoRenewField: "auto_renew" }],
};

export const EXAMS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["vocational", "title", "language", "academic", "other_ex"] },
        { ...FIELD_DICT.status, options: ["preparing", "passed", "ex_expired"], default: "preparing" },
        ...d("expiry", "attachments", "note"),
        { key: "issuer", type: "text", labelKey: "field.issuer" },
        { key: "contact", type: "text", labelKey: "field.contact" }, // EC13：对接人（人脉快照）
        { key: "exam_date", type: "date", labelKey: "field.exam_date" },
    ],
    capture: ["name", "member", "exam_date", "expiry"],
    reminders: [{ key: "expiry", field: "expiry", kind: "oneoff", leadDays: 60 }],
};

export const ALLOWANCE_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["lucky", "allowance_al", "reward", "interest_al"] },
        { key: "direction", type: "select", labelKey: "field.direction", options: ["in", "out"] },
        ...d("amount", "date", "note"),
        { key: "source", type: "text", labelKey: "field.source" },
    ],
    capture: ["name", "category", "amount", "direction", "date"],
    views: [{ key: "by_member", type: "table", groupBy: "member" }],
};

export const FAVORS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name"),
        { ...FIELD_DICT.category, options: ["wedding", "full_moon", "housewarming", "graduation", "birthday_fv", "other_fv"] },
        { key: "direction", type: "select", labelKey: "field.direction", options: ["in", "out"] },
        { key: "person", type: "text", labelKey: "field.person" },
        ...d("amount", "date", "note"),
    ],
    capture: ["name", "direction", "person", "amount", "date"],
    views: [{ key: "by_person", type: "table", groupBy: "person" }],
};

export const STOCK_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["food_st", "daily_chem", "paper", "medical_st", "other_st"] },
        ...d("expiry", "location", "note"),
        { key: "qty", type: "number", labelKey: "field.qty" },
        { key: "low_stock_at", type: "number", labelKey: "field.low_stock_at" },
    ],
    capture: ["name", "qty", "low_stock_at", "expiry"],
    // 品类分区（Apple Reminders Grocery 印证，26.6）：囤货按品类自动归组
    views: [
        { key: "by_category", type: "table", groupBy: "category" },
        { key: "expiring", type: "table", sortBy: { key: "expiry", asc: true } },
    ],
    reminders: [{ key: "expiry", field: "expiry", kind: "oneoff", leadDays: 30 }],
    // H15：囤货低库存（阈值逐行 low_stock_at）
    numericRules: [{ key: "low_stock", field: "qty", thresholdField: "low_stock_at" }],
};

export const CHORES_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["housework", "maintenance", "care", "other_ch"] },
        ...d("cycle", "due", "note"),
        { key: "last_done", type: "date", labelKey: "field.last_done" },
    ],
    capture: ["name", "member", "cycle", "due"],
    // v0.2：due 作为一次性提醒；周期写回（中枢重算）见 03 §5 recurring 完整版
    reminders: [{ key: "due", field: "due", kind: "oneoff", leadDays: 7 }],
};

export const HOUSE_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["payment", "maintenance_h", "anniversary", "emergency"] },
        ...d("cycle", "note"),
        { key: "pay_day", type: "date", labelKey: "field.pay_day" },
        { key: "lunar", type: "checkbox", labelKey: "field.lunar" },
    ],
    capture: ["name", "category", "pay_day", "cycle"],
    reminders: [{ key: "pay_day", field: "pay_day", kind: "anniversary", leadDays: 7, lunarField: "lunar" }],
};

// ── 最后一批轻模块（31/31 全覆盖）────────────────────────────

export const FOOD_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["home_cook", "restaurant", "takeout"] },
        { key: "rating", type: "number", labelKey: "field.rating" },
        ...d("date", "url", "note"),
        { key: "dislike_safe", type: "checkbox", labelKey: "field.dislike_safe" },
        // grocy 印证（26.6）：食材摘要（换行分隔）——采购时可对照 stock 采购建议手动补货；自动联动留 v0.8
        { key: "ingredients", type: "text", labelKey: "field.ingredients" },
    ],
    capture: ["name", "category", "rating", "date"],
};

export const ADDRESS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["home", "shipping", "id_addr", "org"] },
        { key: "address_full", type: "text", labelKey: "field.address_full" },
        ...d("url", "note"),
    ],
    capture: ["name", "category", "address_full"],
};

export const BOOKMARKS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name"),
        { ...FIELD_DICT.category, options: ["gov", "payment_bm", "shopping_bm", "learning", "work", "other_bm"] },
        ...d("url", "note"),
        { key: "account_note", type: "text", labelKey: "field.account_name" },
    ],
    capture: ["name", "category", "url"],
};

export const SNIPPETS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name"),
        { ...FIELD_DICT.category, options: ["greeting", "address_sn", "intro", "reply", "other_sn"] },
        { key: "content", type: "text", labelKey: "field.content" },
        ...d("tags"),
    ],
    capture: ["name", "content"],
};

export const PARENTING_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["vaccine_p", "growth", "feeding", "milestone"] },
        // due 必备：next_visit 规则引用此列（缺列会令 requireReminderColumns 抛错——第六十五轮修复）
        ...d("date", "due", "attachments", "note"),
        { key: "vaccine_name", type: "text", labelKey: "field.vaccine_name" },
        { key: "dose_no", type: "number", labelKey: "field.dose_no" },
        { key: "vaccine_batch", type: "text", labelKey: "field.vaccine_batch" }, // 16 组：接种追溯
        { key: "vaccine_site", type: "text", labelKey: "field.vaccine_site" }, // 16 组：接种点
        { key: "metric_value", type: "number", labelKey: "field.metric_value" },
    ],
    capture: ["name", "member", "category", "date"],
    reminders: [{ key: "next_visit", field: "due", kind: "oneoff", leadDays: 7 }],
};

export const SCHOOLING_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["kindergarten", "primary", "junior", "senior", "college", "grad_school", "extracurricular"] },
        { ...FIELD_DICT.status, options: ["applying", "enrolled", "graduated"], default: "applying" },
        { key: "school", type: "text", labelKey: "field.school" },
        { key: "grade", type: "text", labelKey: "field.grade" },
        { key: "teacher", type: "text", labelKey: "field.teacher" },
        { key: "contact", type: "text", labelKey: "field.contact" }, // EC13：对接人（人脉快照）
        ...d("amount", "due", "note"),
        { key: "enroll_year", type: "number", labelKey: "field.enroll_year" },
        { key: "exam_date", type: "date", labelKey: "field.exam_date" }, // 16 组：考试/重要日程（exams 模块管备考，这里管校内日程）
    ],
    capture: ["name", "school", "category", "amount", "due"],
    templates: [{ key: "parent_meeting", nameKey: "tpl.parentMeeting", file: "schooling/parent-meeting.tpl" }],
    reminders: [
        { key: "tuition", field: "due", kind: "oneoff", leadDays: 14 },
        { key: "exam_date", field: "exam_date", kind: "oneoff", leadDays: 3 },
    ],
};

export const SOCIAL_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["shebao", "gongjijin", "yibao", "resident_pension", "commercial_pension"] },
        ...d("note"),
        { key: "account_no", type: "text", labelKey: "field.account_no" },
        { key: "retire_check", type: "checkbox", labelKey: "field.retire_check" },
        { key: "retire_age", type: "number", labelKey: "field.retire_age" },
        { key: "balance_snapshot", type: "number", labelKey: "field.balance_snapshot" },
        { key: "snapshot_date", type: "date", labelKey: "field.snapshot_date" },
        { key: "base_adjust_date", type: "date", labelKey: "field.base_adjust_date" }, // 16 组：缴费基数年度调整
    ],
    capture: ["name", "member", "category", "account_no"],
    reminders: [{ key: "base_adjust", field: "base_adjust_date", kind: "anniversary", leadDays: 14 }],
};

export const MEDIA_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["movie", "tv", "variety", "book", "comic", "novel"] },
        { ...FIELD_DICT.status, options: ["wishlist", "consuming", "done", "dropped"], default: "wishlist" },
        { key: "rating", type: "number", labelKey: "field.rating" },
        { key: "progress", type: "text", labelKey: "field.progress" },
        ...d("url", "date", "note"),
    ],
    capture: ["name", "category", "status", "rating"],
    // 海报墙（seerr 印证，26.6）：画廊视图以封面卡片呈现；思源 gallery 视图类型原生支持
    views: [
        { key: "wall", type: "gallery" },
        { key: "consuming", type: "table", groupBy: "status" },
    ],
};

export const PETS_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name"),
        { key: "species", type: "select", labelKey: "field.species", options: ["cat", "dog", "other_pet"] },
        { key: "breed", type: "text", labelKey: "field.breed" },
        { key: "vaccine_due", type: "date", labelKey: "field.vaccine_due" },
        { key: "deworm_due", type: "date", labelKey: "field.deworm_due" },
        ...d("note"),
    ],
    capture: ["name", "species", "vaccine_due", "deworm_due"],
    reminders: [
        { key: "vaccine", field: "vaccine_due", kind: "oneoff", leadDays: 14 },
        { key: "deworm", field: "deworm_due", kind: "recurring", leadDays: 7, cycleField: "cycle" },
    ],
};

export const VEHICLES_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { key: "plate", type: "text", labelKey: "field.plate" },
        ...d("expiry", "note"),
        { key: "mileage", type: "number", labelKey: "field.mileage" },
        { key: "inspection_due", type: "date", labelKey: "field.inspection_due" },
        // 电池更换（grocy 印证：铅酸 1.5-2 年/锂 5-8 年——用户按实际记录下次更换日）
        { key: "battery_due", type: "date", labelKey: "field.battery_due" },
        // 违章手动记录（12123 功能面：日期/地点/行为/罚款 摘要，多条例以换行分隔；官方数据不做对接）
        { key: "violations", type: "text", labelKey: "field.violations" },
    ],
    capture: ["name", "plate", "expiry", "inspection_due"],
    reminders: [
        { key: "expiry", field: "expiry", kind: "oneoff", leadDays: 30 },
        { key: "inspection", field: "inspection_due", kind: "oneoff", leadDays: 30 },
        { key: "battery", field: "battery_due", kind: "oneoff", leadDays: 30 },
    ],
};

export const TRANSIT_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["etc", "transit_card", "monthly", "senior"] },
        ...d("expiry", "note"),
        { key: "card_no", type: "text", labelKey: "field.card_no" },
    ],
    capture: ["name", "category", "expiry"],
    reminders: [{ key: "expiry", field: "expiry", kind: "oneoff", leadDays: 30 }],
};

export const TRAVEL_PLAN_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.status, options: ["planning", "ongoing", "finished"], default: "planning" },
        ...d("date", "expiry", "amount", "note"),
        { key: "destination", type: "text", labelKey: "field.destination" },
    ],
    capture: ["name", "destination", "date", "expiry"],
    reminders: [{ key: "date", field: "date", kind: "oneoff", leadDays: 7 }],
};

export const TRAVEL_BOOKING_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name"),
        { ...FIELD_DICT.category, options: ["flight", "hotel", "train", "ticket", "rental"] },
        ...d("date", "amount", "attachments", "note"),
        { key: "order_no", type: "text", labelKey: "field.order_no" },
    ],
    capture: ["name", "category", "date", "order_no"],
};

export const TRAVEL_PACKING_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name"),
        { ...FIELD_DICT.status, options: ["draft", "packed"], default: "draft" },
        ...d("date", "note"),
        { key: "checklist_doc", type: "text", labelKey: "field.checklist_doc" },
    ],
    capture: ["name", "date", "status"],
};

export const TRAVEL_LOG_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        ...d("date", "amount", "attachments", "note"),
        { key: "cities", type: "text", labelKey: "field.cities" },
    ],
    capture: ["name", "date", "amount"],
};

export const ASSETS_VIRTUAL_SCHEMA: ModuleSchema = {
    columns: [
        ...d("name", "member"),
        { ...FIELD_DICT.category, options: ["account", "domain", "game", "nft", "license", "other_v"] },
        ...d("expiry", "note"),
        { key: "platform", type: "text", labelKey: "field.platform" },
        { key: "account_name", type: "text", labelKey: "field.account_name" },
        { key: "cred_loc", type: "text", labelKey: "field.cred_loc" },
        { key: "inherit_note", type: "text", labelKey: "field.inherit_note" },
    ],
    capture: ["name", "category", "platform", "account_name", "cred_loc"],
    reminders: [{ key: "expiry", field: "expiry", kind: "oneoff", leadDays: 30 }],
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
    // D11：数值阈值规则的两列必须存在且为 number 类型（阈值语义依赖数值比较）
    const byKey = new Map(schema.columns.map((c) => [c.key, c]));
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
    }
    return errors;
}
