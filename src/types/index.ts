/**
 * 小驴管家（Lv Home）核心类型定义
 * 与 docs/design/ 对齐：数据模型 02、提醒中枢 03。
 */

/** 成员角色：家庭、伴侣、亲属等维度 */
export type MemberRole = "self" | "spouse" | "partner" | "child" | "elder" | "kin" | "other";

/** 家庭成员：所有模块共用的组织维度（台账本体在思源数据库，此为设置侧引用） */
export interface FamilyMember {
    id: string;
    name: string;
    role: MemberRole;
    /** 公历生日 ISO 日期 */
    birthday?: string;
    /** 生日是否按农历记 */
    lunarBirthday?: boolean;
    /** members 台账行的 itemID（addMember 建行后回填；成员过滤/下钻的关联键） */
    avItemId?: string;
    /** 最近一次台账行同步失败的摘要（D05：可见可重试；成功后清除） */
    syncError?: string;
    /** EC14：人脉联系人绑定快照（`名称 [docId]`）；仅引用快照，不改写人脉数据 */
    contactSnapshot?: string;
    notes?: string;
    createdAt: string;
}

/** 模块分组 */
export type ModuleGroupId = "people" | "assets" | "living" | "kids" | "travel" | "media";

export interface ModuleGroup {
    id: ModuleGroupId;
    /** i18n key: group.<id> */
}

/** 模块开发状态（33.1 能力矩阵）：ready=有数据管理入口 / skeleton=有 schema 与壳 / planned=路线图 */
export type DevStatus = "ready" | "skeleton" | "planned";

/** 内置模块定义 */
export interface HomeModule {
    id: string;
    group: ModuleGroupId;
    /** 默认是否启用 */
    defaultEnabled: boolean;
    /** 始终开启，不可关闭（如家庭成员） */
    alwaysOn?: boolean;
    /** 建议存在的成员角色：开启前给出引导 */
    suggestRoles?: MemberRole[];
    devStatus: DevStatus;
}

// ── 提醒中枢（docs/design/03）──────────────────────────────

/** 规则类型：一次性效期 / 周期 / 周年（支持农历） */
export type ReminderKind = "oneoff" | "recurring" | "anniversary";

/** 模块 schema 声明的提醒规则（数据驱动，中枢不写死模块） */
export interface ReminderRuleSpec {
    key: string;
    /** 参与扫描的日期列（字段字典 key，如 expiry/next_pay/due） */
    field: string;
    kind: ReminderKind;
    /** 默认提前提醒天数（用户可在 leadOverrides 按 `${moduleId}.${key}` 覆盖） */
    leadDays: number;
    /** recurring：周期列 key（字段字典 cycle） */
    cycleField?: string;
    /** anniversary：农历标记列 key */
    lunarField?: string;
}

/** 紧急级别：🔴 已逾期 / 🟠 7 天内 / 🟡 提前量内 / ⚪ 更远 */
export type ReminderLevel = "overdue" | "soon" | "lead" | "later";

/** 运行态提醒：从台账派生，不落业务库 */
export interface Reminder {
    /** `${rowId}::${moduleId}.${ruleKey}` */
    id: string;
    moduleId: string;
    ruleKey: string;
    /** 台账行块 ID（定位/续期都作用于它） */
    rowId: string;
    memberId?: string;
    title: string;
    /** 下次发生日 ISO */
    dueDate: string;
    daysLeft: number;
    level: ReminderLevel;
    /** 规则类型（H05 完成语义分派；adhoc 备忘视为 oneoff。旧缓存可能缺失） */
    kind?: ReminderKind;
    /** anniversary 农历标记（dueDate 为下次农历对应的公历日期；卡片显示 🌙） */
    lunar?: boolean;
}

/** 扫描结果聚合（内存 + kernel storage 缓存） */
export interface HubState {
    scannedAt: string;
    reminders: Reminder[];
    counts: { overdue: number; soon: number; lead: number };
}

// ── 设置（docs/design/01 ADR-7：只放设置与运行态）───────────

/** 模块台账落点映射（provisioner 维护，幂等）；provisional=等 Spike 的占位建库（C7） */
export interface DbRef {
    docId?: string;
    /** av 实体 ID（Spike 定案 = av 块 ID） */
    avId?: string;
    notebook?: string;
    provisional?: boolean;
    /** 字典列 key → av 列 keyID（provisioner 建列时记录；读取行的唯一稳定依据） */
    columns?: Record<string, string>;
    /** 最近一次建库/补列失败的摘要（33.2 journal 最小版；成功后清除） */
    provisionError?: string;
}

/** 插件设置（持久化到 data/storage/petal/siyuan-home/settings.json） */
export interface HomeSettings {
    /** 已启用模块 id 列表 */
    enabledModules: string[];
    members: FamilyMember[];
    /** 提前量覆盖，key = `${moduleId}.${ruleKey}`，值为天数；空 = 用 schema 默认 */
    leadOverrides: Record<string, number>;
    /** 每日摘要通知时刻（0-23，默认 8） */
    notifyHour: number;
    /** 静默时段起止（小时，默认 22 → 8） */
    silentFrom: number;
    silentTo: number;
    /** moduleId → 台账文档/数据库映射 */
    dbRefs: Record<string, DbRef>;
    /** 首次引导的家庭构成快照（C7 向导写入；真实成员在成员页维护） */
    household?: { roles: MemberRole[]; children: number };
    /** 首次运行引导是否已完成 */
    onboarded?: boolean;
    /** 示例数据生成清单（24 组：moduleId → 行 itemID；一键清除用） */
    demoRows?: Record<string, string[]>;
    /** 示例成员 id 清单（一键清除移除引用） */
    demoMemberIds?: string[];
    /** 15 组：settings.json 损坏已回退默认（onload 弹警告；marker 文件 settings.json.corrupted.json 可查） */
    corruptedSettings?: boolean;
}
