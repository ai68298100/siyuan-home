/**
 * DataProvider：模块 → 提醒的派生管道（03 §2/§3）。
 * 每个 provider 声明自己的规则与行读取方式；扫描器只认接口，不写死模块。
 */
import type { Reminder, ReminderRuleSpec } from "@/types";
import { buildReminder, localDateKey, type LedgerRowDates } from "./rule";
import { renderLedgerAll, type AvRow } from "../siyuan";
import { CERTS_SCHEMA, MEMBERS_SCHEMA, type ModuleSchema, type NumericRuleSpec } from "../schema";
import type { DbRef, HomeSettings } from "@/types";
import { getEntries, type RowLogs } from "../rowlog";
import { normalizeMaintenanceRecords, type MaintenanceRecord } from "../vehicle";

export interface DataProvider {
    readonly moduleId: string;
    collect(today: Date): Promise<Reminder[]>;
}

/** 提前量合并（33.3 语义）：行级 remind_before > 用户 leadOverrides > schema 默认（行级由表单层写入 overrides，此处只合并用户级）。
 * H14：无效值（NaN/Infinity/负数）回退 schema 默认，上限 3650 天。 */
export function leadFor(settings: HomeSettings, moduleId: string, rule: ReminderRuleSpec): number {
    const key = `${moduleId}.${rule.key}`;
    const v = settings.leadOverrides?.[key];
    return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(v, 3650) : rule.leadDays;
}

/** H04：提醒规则依赖的列缺失 → 显式报错（进诊断+保留快照），不得静默跳过规则装作无事项 */
export function requireReminderColumns(columns: Record<string, string>, schema: ModuleSchema): void {
    const missing = (schema.reminders ?? [])
        .filter((rule) => !columns[rule.field])
        .map((rule) => `${rule.field}(${rule.key})`);
    if (missing.length) throw new Error(`missing reminder column(s): ${missing.join(", ")}`);
}

/** H14 行级提前量：remind_before 列值 > 用户 leadOverrides > schema 默认。无效值（NaN/负数/超大）回退，clamp 0–3650 */
export function rowLeadDays(v: any): number | undefined {
    const n = numberFromValue(v);
    return n === undefined ? undefined : Math.min(3650, Math.max(0, n));
}

/** 从 av 行 value 提取日期（date 列 content 为 ms 时间戳） */
function dateFromValue(v: any): string | undefined {
    const d = v?.date;
    if (!d || !d.isNotEmpty || !d.content) return undefined;
    const dt = new Date(d.content);
    if (isNaN(dt.getTime())) return undefined;
    return localDateKey(dt);
}

function textFromValue(v: any): string | undefined {
    const t = v?.text?.content;
    return typeof t === "string" && t.trim() ? t.trim() : undefined;
}

/** select 单选值（certs status 过滤用） */
function selectFromValue(v: any): string | undefined {
    return v?.select?.content ?? v?.mSelect?.[0]?.content ?? undefined;
}

/** number 列值（H15）：0 算有值；缺列/缺值（isNotEmpty false）返回 undefined */
function numberFromValue(v: any): number | undefined {
    const n = v?.number;
    if (!n || !n.isNotEmpty || typeof n.content !== "number" || isNaN(n.content)) return undefined;
    return n.content;
}

export interface ProviderDeps {
    settings: HomeSettings;
    /** 取模块 dbRef（avId + columns 映射） */
    getDbRef: (moduleId: string) => DbRef | undefined;
    /** 264 波：行数口径上报——providers 本就全量读表，顺手上报台账行数与成员行分布，
     * 供模块卡主数字 / 成员卡统计格（原型层次）；扫描成功才计入（失败沿用旧快照） */
    onStats?: (moduleId: string, stats: { rowCount: number; memberCounts: Record<string, number> }) => void;
    /** 可选的行日志读取器；车辆 provider 用它派生维护/维修提醒。 */
    loadRowLogs?: () => Promise<RowLogs>;
    /** 可选的界面文案读取器；提醒标题需跟随当前语言。 */
    t?: (key: string) => string;
}

/** relation 成员列 → settings 成员 id 的行计数（模块卡/成员卡统计共用口径） */
export function memberCountsFrom(rows: { cells: Record<string, any> }[], ref: DbRef, members: { id: string; avItemId?: string }[]): Record<string, number> {
    const key = ref.columns?.member;
    const counts: Record<string, number> = {};
    if (!key) return counts;
    const byAv = new Map(members.filter((m) => m.avItemId).map((m) => [m.avItemId as string, m.id]));
    for (const row of rows) {
        const rel: string[] | undefined = row.cells[key]?.relation?.blockIDs ?? undefined;
        const memberId = rel?.[0] ? byAv.get(rel[0]) : undefined;
        if (memberId) counts[memberId] = (counts[memberId] ?? 0) + 1;
    }
    return counts;
}

/** certs 证件管理：expiry（效期）+ due（签注/审验）双规则；expired/renewed/void 行不提醒（33.3） */
export class CertsProvider implements DataProvider {
    readonly moduleId = "certs";
    constructor(private deps: ProviderDeps) {}

    async collect(today: Date): Promise<Reminder[]> {
        const ref = this.deps.getDbRef("certs");
        if (!ref?.avId || !ref.columns) return [];
        const schema = CERTS_SCHEMA;
        const out: Reminder[] = [];
        const read = await renderLedgerAll(ref.avId);
        if (!read.complete) throw new Error(`ledger read incomplete (${read.rows.length}/${read.rowCount} rows)`);
        // `expiry` and shared `due` are the stable columns required by every
        // existing certs database. Type-specific deadline columns are additive
        // and may be absent on older databases; those rules are skipped until
        // provisioning has added the column or the row has a value.
        requireReminderColumns(ref.columns!, {
            ...schema,
            reminders: (schema.reminders ?? []).filter((rule) => rule.field === "expiry" || rule.field === "due"),
        });
        const { rows } = read;
        // relation 列（成员）→ 行 itemID → settings.members（avItemId 反查，成员过滤键）
        const members = this.deps.settings.members ?? [];
        for (const row of rows) {
            const cell = (key: string) => row.cells[ref.columns![key]];
            const status = selectFromValue(cell("status"));
            if (status && status !== "valid") continue;
            const name = textFromValue(cell("name")) ?? "未命名证件";
            const relBlockIDs: string[] | undefined = cell("member")?.relation?.blockIDs ?? undefined;
            const member = relBlockIDs?.[0]
                ? members.find((m) => m.avItemId === relBlockIDs[0])
                : undefined;
            const rowDates: LedgerRowDates = {
                rowId: row.itemID,
                title: name,
                memberId: member?.id,
            };
            for (const rule of schema.reminders ?? []) {
                if (!ref.columns[rule.field]) continue;
                const v = cell(rule.field);
                const fieldValue = v?.type === "date" ? dateFromValue(v) : textFromValue(v);
                if (!fieldValue) continue;
                const r = await buildReminder(rule, this.moduleId, { ...rowDates, fieldValue }, {
                    today,
                    leadOverride: rowLeadDays(cell("remind_before")) ?? leadFor(this.deps.settings, this.moduleId, rule),
                });
                if (r) out.push(r);
            }
        }
        // 264 波：行数口径（本模块全部行 + 成员分布；仅成功路径上报）
        this.deps.onStats?.(this.moduleId, { rowCount: rows.length, memberCounts: memberCountsFrom(rows, ref, members) });
        return out;
    }
}

/** 通用 schema 驱动 provider（05 §1"新模块=数据"）：按 schema.reminders 逐列派生，relation 成员反查同 certs */
export class SchemaLedgerProvider implements DataProvider {
    readonly moduleId: string;
    constructor(
        moduleId: string,
        protected schema: ModuleSchema,
        protected deps: ProviderDeps,
    ) {
        this.moduleId = moduleId;
    }

    /** 读取一次主表并校验 schema 列；车辆 provider 会复用此结果追加 rowlogs 提醒。 */
    protected async readLedger(): Promise<{ ref: DbRef; rows: AvRow[] } | undefined> {
        const ref = this.deps.getDbRef(this.moduleId);
        if (!ref?.avId || !ref.columns) return undefined;
        const read = await renderLedgerAll(ref.avId);
        if (!read.complete) throw new Error(`ledger read incomplete (${read.rows.length}/${read.rowCount} rows)`);
        requireReminderColumns(ref.columns!, this.schema);
        return { ref, rows: read.rows };
    }

    /** 根据已读取的主表行派生 schema 声明的提醒。 */
    protected async collectLedgerReminders(today: Date, loaded: { ref: DbRef; rows: AvRow[] }): Promise<Reminder[]> {
        const { ref, rows } = loaded;
        const out: Reminder[] = [];
        const members = this.deps.settings.members ?? [];
        // 通用终态过滤：状态命中即跳过（字典 status 枚举的非活跃值）
        const skip = new Set(["archived", "void", "expired", "renewed", "refunded", "discarded", "surrendered", "ins_expired", "med_expired", "m_expired"]);
        for (const row of rows) {
            const cell = (key: string) => row.cells[ref.columns![key]];
            if (skip.has(selectFromValue(cell("status")) ?? "")) continue;
            const name = textFromValue(cell("name")) ?? this.moduleId;
            const rel: string[] | undefined = cell("member")?.relation?.blockIDs ?? undefined;
            const member = rel?.[0] ? members.find((m) => m.avItemId === rel[0]) : undefined;
            for (const rule of this.schema.reminders ?? []) {
                // onlyIf（190 波）：仅当指定 select 列值匹配时才派生（favors 只对收礼 direction=in 回礼）
                if (rule.onlyIf) {
                    const actual = selectFromValue(cell(rule.onlyIf.field)) ?? "";
                    if (actual !== rule.onlyIf.equals) continue;
                }
                const v = cell(rule.field);
                const fieldValue = v?.type === "date" ? dateFromValue(v) : textFromValue(v);
                if (!fieldValue) continue;
                const cycleKey = rule.cycleField ?? "cycle";
                const r = await buildReminder(rule, this.moduleId, {
                    rowId: row.itemID, title: name, memberId: member?.id, fieldValue,
                    cycle: rule.kind === "recurring" ? (selectFromValue(cell(cycleKey)) ?? textFromValue(cell(cycleKey))) : undefined,
                    lunar: !!cell(rule.lunarField ?? "lunar")?.checkbox?.checked,
                    ...(rule.autoRenewField ? { autoRenew: !!cell(rule.autoRenewField)?.checkbox?.checked } : {}),
                }, { today, leadOverride: leadFor(this.deps.settings, this.moduleId, rule) });
                if (r) out.push(r);
            }
        }
        return out;
    }

    async collect(today: Date): Promise<Reminder[]> {
        const loaded = await this.readLedger();
        if (!loaded) return [];
        const out = await this.collectLedgerReminders(today, loaded);
        const members = this.deps.settings.members ?? [];
        // 264 波：行数口径（同 certs）
        this.deps.onStats?.(this.moduleId, { rowCount: loaded.rows.length, memberCounts: memberCountsFrom(loaded.rows, loaded.ref, members) });
        return out;
    }
}

/**
 * 车辆专属提醒 provider：复用车辆主表扫描，同时读取 rowlogs maintenance，
 * 将按日期和按里程的下次保养提醒汇入全局提醒中心。
 */
export class VehiclesProvider extends SchemaLedgerProvider {
    readonly moduleId = "vehicles";

    constructor(schema: ModuleSchema, deps: ProviderDeps) {
        super("vehicles", schema, deps);
    }

    async collect(today: Date): Promise<Reminder[]> {
        const loaded = await this.readLedger();
        if (!loaded) return [];
        const out = await this.collectLedgerReminders(today, loaded);
        const members = this.deps.settings.members ?? [];
        this.deps.onStats?.(this.moduleId, {
            rowCount: loaded.rows.length,
            memberCounts: memberCountsFrom(loaded.rows, loaded.ref, members),
        });
        if (!this.deps.loadRowLogs) return out;

        const logs = await this.deps.loadRowLogs();
        const todayKey = localDateKey(today);
        const categoryLabels: Record<string, string> = {
            routine: "保养", repair: "维修", tires: "轮胎", battery: "电池",
            inspection: "年检", cleaning: "清洁", other: "其他",
        };
        const dateRule: ReminderRuleSpec = { key: "maintenance_date", field: "nextDate", kind: "oneoff", leadDays: 30 };
        const skip = new Set(["archived", "void", "expired", "renewed", "refunded", "discarded", "surrendered", "ins_expired", "med_expired", "m_expired"]);
        for (const row of loaded.rows) {
            const cell = (key: string) => row.cells[loaded.ref.columns![key]];
            if (skip.has(selectFromValue(cell("status")) ?? "")) continue;
            const name = textFromValue(cell("name")) ?? "车辆";
            const relation: string[] | undefined = cell("member")?.relation?.blockIDs ?? undefined;
            const memberId = relation?.[0] ? members.find((m) => m.avItemId === relation[0])?.id : undefined;
            const currentMileage = numberFromValue(cell("mileage"));
            const records = normalizeMaintenanceRecords(getEntries<MaintenanceRecord>(logs, loaded.ref.avId!, row.itemID, "maintenance"));
            for (const record of records) {
                const category = this.deps.t?.(`vehicle.maintenance.category.${record.category}`)
                    || categoryLabels[record.category]
                    || record.category;
                const titleTemplate = this.deps.t?.("vehicle.maintenance.reminderTitle");
                const title = titleTemplate && titleTemplate !== "vehicle.maintenance.reminderTitle"
                    ? titleTemplate.replace("${vehicle}", name).replace("${category}", category)
                    : `${name} · ${category}`;
                const stableSuffix = [record.date, record.odometer, record.nextDate ?? "", record.nextOdometer ?? "", record.category, record.at ?? ""]
                    .map((part) => String(part).replace(/[^a-zA-Z0-9._-]/g, "_"))
                    .join(".");
                if (record.nextDate) {
                    const reminder = await buildReminder(dateRule, this.moduleId, {
                        rowId: row.itemID,
                        title,
                        memberId,
                        fieldValue: record.nextDate,
                    }, { today, leadOverride: leadFor(this.deps.settings, this.moduleId, dateRule) });
                    if (reminder) {
                        out.push({ ...reminder, id: `${row.itemID}::vehicles.maintenance_date.${stableSuffix}`, ruleKey: dateRule.key });
                    }
                }
                if (record.nextOdometer !== undefined && currentMileage !== undefined && currentMileage >= record.nextOdometer) {
                    const odometerTemplate = this.deps.t?.("vehicle.maintenance.odometerReminderTitle");
                    const odometerTitle = odometerTemplate && odometerTemplate !== "vehicle.maintenance.odometerReminderTitle"
                        ? odometerTemplate.replace("${title}", title).replace("${odometer}", String(record.nextOdometer))
                        : `${title} · ${record.nextOdometer} km`;
                    out.push({
                        id: `${row.itemID}::vehicles.maintenance_odometer.${stableSuffix}`,
                        moduleId: this.moduleId,
                        ruleKey: "maintenance_odometer",
                        rowId: row.itemID,
                        memberId,
                        title: odometerTitle,
                        dueDate: todayKey,
                        daysLeft: -1,
                        level: "overdue",
                        kind: "oneoff",
                    });
                }
            }
        }
        return out;
    }
}

/** members 家庭成员：生日周年（lunar 列参与农历判定）；archived 成员不提醒。
 * H08：memberId 按 avItemId 反查 settings.members——成员过滤能选中其生日；
 * 农历标记读独立 lunar 列（与 members.ts 写入一致；旧数据 birthday 复选框形态兜底）。 */
export class MembersProvider implements DataProvider {
    readonly moduleId = "members";
    constructor(private deps: ProviderDeps) {}

    async collect(today: Date): Promise<Reminder[]> {
        const ref = this.deps.getDbRef("members");
        if (!ref?.avId || !ref.columns) return [];
        const schema = MEMBERS_SCHEMA;
        const out: Reminder[] = [];
        const read = await renderLedgerAll(ref.avId);
        if (!read.complete) throw new Error(`ledger read incomplete (${read.rows.length}/${read.rowCount} rows)`);
        requireReminderColumns(ref.columns!, schema);
        const { rows } = read;
        const members = this.deps.settings.members ?? [];
        for (const row of rows) {
            const cell = (key: string) => row.cells[ref.columns![key]];
            const status = selectFromValue(cell("status"));
            if (status === "archived") continue;
            const name = textFromValue(cell("name")) ?? "未命名成员";
            const birthday = cell("birthday");
            const fieldValue = dateFromValue(birthday);
            if (!fieldValue) continue;
            const lunar = !!cell("lunar")?.checkbox?.checked || !!birthday?.checkbox?.checked;
            // H08：生日行 = 成员行本身，按 avItemId 关联 settings 成员 id（成员过滤键）
            const memberId = members.find((m) => m.avItemId === row.itemID)?.id;
            for (const rule of schema.reminders ?? []) {
                const r = await buildReminder(rule, this.moduleId, { rowId: row.itemID, title: name, fieldValue, lunar, memberId }, {
                    today,
                    leadOverride: rowLeadDays(cell("remind_before")) ?? leadFor(this.deps.settings, this.moduleId, rule),
                });
                if (r) out.push(r);
            }
        }
        // 264 波：成员台账行数（成员数口径；无成员分布语义）
        this.deps.onStats?.(this.moduleId, { rowCount: rows.length, memberCounts: {} });
        return out;
    }
}

/**
 * 数值阈值规则 provider（H15）：值列 ≤ 逐行阈值列 → 即时提醒（due=今天，level=soon）。
 * 语义：缺值/缺列不提醒；0 算有值；补货到阈值之上自动解除（扫描重算）；
 * 终态行（status 命中 skip 集）不提醒；行级规则列缺失抛错（同 H04）。
 */
export class NumericRuleProvider implements DataProvider {
    readonly moduleId: string;
    constructor(
        moduleId: string,
        private schema: ModuleSchema,
        private deps: ProviderDeps,
    ) {
        this.moduleId = moduleId;
    }

    async collect(today: Date): Promise<Reminder[]> {
        const ref = this.deps.getDbRef(this.moduleId);
        if (!ref?.avId || !ref.columns) return [];
        const rules = this.schema.numericRules ?? [];
        if (rules.length === 0) return [];
        const missing = rules.flatMap((r) => [r.field, r.thresholdField]).filter((f) => !ref.columns![f]);
        if (missing.length) throw new Error(`missing numeric rule column(s): ${[...new Set(missing)].join(", ")}`);
        const read = await renderLedgerAll(ref.avId);
        if (!read.complete) throw new Error(`ledger read incomplete (${read.rows.length}/${read.rowCount} rows)`);
        const out: Reminder[] = [];
        const members = this.deps.settings.members ?? [];
        const skip = new Set(["archived", "void", "expired", "renewed", "refunded", "discarded", "surrendered", "ins_expired", "med_expired", "m_expired"]);
        const todayKey = localDateKey(today);
        for (const row of read.rows) {
            const cell = (key: string) => row.cells[ref.columns![key]];
            if (skip.has(selectFromValue(cell("status")) ?? "")) continue;
            const name = textFromValue(cell("name")) ?? this.moduleId;
            const rel: string[] | undefined = cell("member")?.relation?.blockIDs ?? undefined;
            const memberId = rel?.[0] ? members.find((m) => m.avItemId === rel[0])?.id : undefined;
            for (const rule of rules as NumericRuleSpec[]) {
                const qty = numberFromValue(cell(rule.field));
                const threshold = numberFromValue(cell(rule.thresholdField));
                if (qty === undefined || threshold === undefined) continue; // 缺值不评估（0 算有值）
                if (qty > threshold) continue; // 高于阈值：无事项（补货自动解除）
                out.push({
                    id: `${row.itemID}::${this.moduleId}.${rule.key}`,
                    moduleId: this.moduleId,
                    ruleKey: rule.key,
                    rowId: row.itemID,
                    memberId,
                    title: `${name} · ${qty}/${threshold}`,
                    dueDate: todayKey,
                    daysLeft: 0,
                    level: "soon",
                    kind: "oneoff",
                });
            }
        }
        // 264 波：行数口径（同 schema 通用）
        this.deps.onStats?.(this.moduleId, { rowCount: read.rows.length, memberCounts: memberCountsFrom(read.rows, ref, members) });
        return out;
    }
}
