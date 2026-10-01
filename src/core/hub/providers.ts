/**
 * DataProvider：模块 → 提醒的派生管道（03 §2/§3）。
 * 每个 provider 声明自己的规则与行读取方式；扫描器只认接口，不写死模块。
 */
import type { Reminder, ReminderRuleSpec } from "@/types";
import { buildReminder, localDateKey, type LedgerRowDates } from "./rule";
import { renderLedger } from "../siyuan";
import { CERTS_SCHEMA, MEMBERS_SCHEMA } from "../schema";
import type { DbRef, HomeSettings } from "@/types";

export interface DataProvider {
    readonly moduleId: string;
    collect(today: Date): Promise<Reminder[]>;
}

/** 提前量合并（33.3 语义）：行级 remind_before > 用户 leadOverrides > schema 默认（行级由表单层写入 overrides，此处只合并用户级） */
export function leadFor(settings: HomeSettings, moduleId: string, rule: ReminderRuleSpec): number {
    const key = `${moduleId}.${rule.key}`;
    const v = settings.leadOverrides?.[key];
    return typeof v === "number" ? v : rule.leadDays;
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

interface ProviderDeps {
    settings: HomeSettings;
    /** 取模块 dbRef（avId + columns 映射） */
    getDbRef: (moduleId: string) => DbRef | undefined;
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
        const { rows } = await renderLedger(ref.avId);
        for (const row of rows) {
            const cell = (key: string) => row.cells[ref.columns![key]];
            const status = selectFromValue(cell("status"));
            if (status && status !== "valid") continue;
            const name = textFromValue(cell("name")) ?? "未命名证件";
            const rowDates: LedgerRowDates = {
                rowId: row.itemID,
                title: name,
            };
            for (const rule of schema.reminders ?? []) {
                const v = cell(rule.field);
                const fieldValue = v?.type === "date" ? dateFromValue(v) : textFromValue(v);
                if (!fieldValue) continue;
                const r = await buildReminder(rule, this.moduleId, { ...rowDates, fieldValue }, {
                    today,
                    leadOverride: leadFor(this.deps.settings, this.moduleId, rule),
                });
                if (r) out.push(r);
            }
        }
        return out;
    }
}

/** members 家庭成员：生日周年（lunar 列参与农历判定）；archived 成员不提醒 */
export class MembersProvider implements DataProvider {
    readonly moduleId = "members";
    constructor(private deps: ProviderDeps) {}

    async collect(today: Date): Promise<Reminder[]> {
        const ref = this.deps.getDbRef("members");
        if (!ref?.avId || !ref.columns) return [];
        const schema = MEMBERS_SCHEMA;
        const out: Reminder[] = [];
        const { rows } = await renderLedger(ref.avId);
        for (const row of rows) {
            const cell = (key: string) => row.cells[ref.columns![key]];
            const status = selectFromValue(cell("status"));
            if (status === "archived") continue;
            const name = textFromValue(cell("name")) ?? "未命名成员";
            const birthday = cell("birthday");
            const fieldValue = dateFromValue(birthday);
            if (!fieldValue) continue;
            const lunar = !!birthday?.checkbox?.checked;
            for (const rule of schema.reminders ?? []) {
                const r = await buildReminder(rule, this.moduleId, { rowId: row.itemID, title: name, fieldValue, lunar }, {
                    today,
                    leadOverride: leadFor(this.deps.settings, this.moduleId, rule),
                });
                if (r) out.push(r);
            }
        }
        return out;
    }
}
