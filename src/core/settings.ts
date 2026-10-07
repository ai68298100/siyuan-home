/**
 * 设置存取：模块开关、家庭成员、提醒提前量覆盖、台账落点。
 * 走 loadData/saveData（data/storage/petal/siyuan-home/），随思源同步走。
 * 结构与 docs/design/01 ADR-7 一致：业务数据一律在思源侧，这里只放设置与运行态。
 */
import type { Plugin } from "siyuan";
import type { HomeSettings, FamilyMember, MemberRole, CheckinBinding } from "@/types";
import { BUILT_IN_MODULES } from "./modules";

const SETTINGS_NAME = "settings.json";

export function defaultSettings(): HomeSettings {
    return {
        enabledModules: BUILT_IN_MODULES.filter((m) => m.defaultEnabled).map((m) => m.id),
        members: [],
        leadOverrides: {},
        notifyHour: 8,
        silentFrom: 22,
        silentTo: 8,
        dbRefs: {},
        onboarded: false,
        webhookEnabled: false,
        webhookUrl: "",
        webhookMode: "bark",
    };
}

/** 15 组：坏文件容错——loadData 抛错或返回非对象时备份标记并回退默认值，不让 onload 崩溃 */
export async function loadDataSafe(plugin: Plugin, name: string): Promise<{ data: any; corrupted: boolean }> {
    try {
        const data = await plugin.loadData(name);
        if (data !== null && data !== undefined && !isPlainObject(data)) {
            // 非 JSON 对象（手工改坏/老版本残留）→ 视为损坏
            await backupCorruptMarker(plugin, name, `non-object: ${Array.isArray(data) ? "array" : typeof data}`);
            return { data: null, corrupted: true };
        }
        return { data, corrupted: false };
    } catch (e) {
        await backupCorruptMarker(plugin, name, e instanceof Error ? e.message : String(e));
        return { data: null, corrupted: true };
    }
}

async function backupCorruptMarker(plugin: Plugin, name: string, reason: string): Promise<void> {
    try {
        // 只存标记（时间/原因），不改写原文件——原始内容留给用户与思源备份处理
        await plugin.saveData(`${name}.corrupted.json`, { corruptedAt: new Date().toISOString(), source: name, reason });
    } catch {
        // 备份失败也不阻断启动
    }
}

const MEMBER_ROLES = new Set<MemberRole>(["self", "spouse", "partner", "child", "elder", "kin", "other"]);

/** 成员记录迁移：不让损坏的单条记录拖垮整份设置，同时补齐下游必需字段。 */
function normalizeMember(raw: unknown): FamilyMember | undefined {
    if (!isPlainObject(raw)) return undefined;
    const m = { ...raw } as Record<string, unknown>;
    const id = typeof m.id === "string" && m.id.trim() ? m.id : `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const name = typeof m.name === "string" && m.name.trim() ? m.name : "?";
    const role = typeof m.role === "string" && MEMBER_ROLES.has(m.role as MemberRole) ? m.role as MemberRole : "other";
    const createdAt = typeof m.createdAt === "string" && m.createdAt ? m.createdAt : new Date().toISOString();
    const out: Record<string, unknown> = { ...m, id, name, role, createdAt };
    for (const key of ["birthday", "avItemId", "syncError", "contactSnapshot", "notes"] as const) {
        if (out[key] !== undefined && typeof out[key] !== "string") delete out[key];
    }
    if (out.lunarBirthday !== undefined && typeof out.lunarBirthday !== "boolean") delete out.lunarBirthday;
    // D23：仅 male/female 合法；复制后清洗，避免改写 loadData 返回的对象。
    if (out.sex !== "male" && out.sex !== "female") delete out.sex;
    return out as unknown as FamilyMember;
}

function clampHour(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.min(23, Math.max(0, Math.round(value)))
        : fallback;
}

function normalizeDbRefs(raw: unknown, fallback: HomeSettings["dbRefs"]): HomeSettings["dbRefs"] {
    if (!isPlainObject(raw)) return fallback;
    const out: HomeSettings["dbRefs"] = {};
    for (const [moduleId, value] of Object.entries(raw)) {
        if (!isPlainObject(value)) continue;
        const ref = { ...value } as Record<string, unknown>;
        for (const key of ["docId", "avId", "notebook", "provisionError"] as const) {
            if (ref[key] !== undefined && typeof ref[key] !== "string") delete ref[key];
        }
        if (ref.provisional !== undefined && typeof ref.provisional !== "boolean") delete ref.provisional;
        if (ref.columns !== undefined) {
            ref.columns = isPlainObject(ref.columns)
                ? Object.fromEntries(Object.entries(ref.columns).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
                : undefined;
            if (ref.columns === undefined) delete ref.columns;
        }
        out[moduleId] = ref as HomeSettings["dbRefs"][string];
    }
    return out;
}

export async function loadSettings(plugin: Plugin): Promise<HomeSettings> {
    const { data, corrupted } = await loadDataSafe(plugin, SETTINGS_NAME);
    const defaults = defaultSettings();
    if (!isPlainObject(data)) {
        // corrupted=true 时保留标记供 onload 弹警告（设置页诊断亦可见 corrupted 文件）
        return corrupted ? { ...defaults, corruptedSettings: true } : defaults;
    }
    // 用户显式管理模块开关：已有 enabledModules 时完全尊重（含关闭默认模块）；
    // 新增模块的默认启用只走版本化迁移（33.1），运行时不强制回填。
    const known = new Set(BUILT_IN_MODULES.map((m) => m.id));
    const enabled = Array.isArray(data.enabledModules)
        ? data.enabledModules.filter((id: unknown): id is string => typeof id === "string" && known.has(id))
        : defaults.enabledModules;
    const members = Array.isArray(data.members)
        ? data.members.map(normalizeMember).filter((member): member is FamilyMember => !!member)
        : defaults.members;
    const overrides = isPlainObject(data.leadOverrides)
        ? Object.fromEntries(Object.entries(data.leadOverrides).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0))
        : defaults.leadOverrides;
    const household = isPlainObject(data.household) ? data.household : undefined;
    const validRoles = Array.isArray(household?.roles)
        ? household.roles.filter((role: unknown): role is MemberRole => typeof role === "string" && MEMBER_ROLES.has(role as MemberRole))
        : undefined;
    const validHousehold = household && validRoles && typeof household.children === "number" && Number.isFinite(household.children)
        ? { roles: validRoles, children: Math.max(0, Math.floor(household.children)) }
        : undefined;
    const demoRows = isPlainObject(data.demoRows)
        ? Object.fromEntries(Object.entries(data.demoRows).filter((entry): entry is [string, string[]] => Array.isArray(entry[1])).map(([id, rows]) => [id, rows.filter((row): row is string => typeof row === "string")]))
        : undefined;
    return {
        ...defaults,
        ...data,
        enabledModules: enabled,
        members,
        leadOverrides: overrides,
        dbRefs: normalizeDbRefs(data.dbRefs, defaults.dbRefs),
        notifyHour: clampHour(data.notifyHour, defaults.notifyHour),
        silentFrom: clampHour(data.silentFrom, defaults.silentFrom),
        silentTo: clampHour(data.silentTo, defaults.silentTo),
        onboarded: typeof data.onboarded === "boolean" ? data.onboarded : defaults.onboarded,
        household: validHousehold,
        demoRows,
        demoMemberIds: Array.isArray(data.demoMemberIds) ? data.demoMemberIds.filter((id: unknown): id is string => typeof id === "string") : undefined,
        webhookEnabled: typeof data.webhookEnabled === "boolean" ? data.webhookEnabled : defaults.webhookEnabled,
        webhookUrl: typeof data.webhookUrl === "string" ? data.webhookUrl : defaults.webhookUrl,
        webhookMode: data.webhookMode === "ntfy" ? "ntfy" : "bark",
        checkinBindings: normalizeCheckinBindings(data.checkinBindings),
    };
}

export async function saveSettings(plugin: Plugin, settings: HomeSettings): Promise<void> {
    // §15：写入失败重试一次（瞬时内核忙/工作区切换等）；仍失败抛带原始信息的错误，由调用方上报
    try {
        await plugin.saveData(SETTINGS_NAME, settings);
    } catch (e1) {
        await new Promise((r) => setTimeout(r, 300));
        try {
            await plugin.saveData(SETTINGS_NAME, settings);
        } catch {
            throw new Error(`settings save failed after retry: ${e1 instanceof Error ? e1.message : String(e1)}`);
        }
    }
}

export interface NormalizedImport {
    settings: HomeSettings;
    /** 未知模块 id（已从 enabledModules 剔除并进报告，不再静默丢弃） */
    droppedModules: string[];
    /** 成员记录修复数（缺 id 补 id、缺名补 ?、非法角色归 other） */
    repairedMembers: number;
}

/**
 * 导入归一化（设置导入/24 组）：在合并前把导入数据校正到合法形状。
 * - enabledModules 只保留已知模块 id（未知 = 版本差/手改 → 剔除并报告）；
 * - members 逐条修复（id/name/role），不给 downstream 留脏形状。
 */
export function normalizeImportedSettings(input: unknown): NormalizedImport {
    const data = isPlainObject(input) ? input : {};
    const defaults = defaultSettings();
    const known = new Set(BUILT_IN_MODULES.map((m) => m.id));
    const rawEnabled: string[] = Array.isArray(data.enabledModules) ? data.enabledModules.filter((x: any) => typeof x === "string") : [];
    const enabled = rawEnabled.filter((id) => known.has(id));
    const droppedModules = [...new Set(rawEnabled.filter((id) => !known.has(id)))];

    let repairedMembers = 0;
    const members = (Array.isArray(data.members) ? data.members : []).flatMap((raw: unknown) => {
        if (!isPlainObject(raw)) return [];
        const fixed = normalizeMember(raw)!;
        if (raw.id !== fixed.id) repairedMembers++;
        if (raw.name !== fixed.name) repairedMembers++;
        if (raw.role !== fixed.role) repairedMembers++;
        return [fixed];
    });

    const settings: HomeSettings = {
        ...defaults,
        ...data,
        enabledModules: enabled,
        members,
        leadOverrides: isPlainObject(data.leadOverrides) ? Object.fromEntries(Object.entries(data.leadOverrides).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0)) : defaults.leadOverrides,
        dbRefs: normalizeDbRefs(data.dbRefs, defaults.dbRefs),
        checkinBindings: normalizeCheckinBindings(data.checkinBindings),
        // 229 波恢复 e2e：导入路径钳制时刻（敌意/手改文件曾可把摘要时刻设为 99 → 摘要永不触发）
        notifyHour: clampHour(data.notifyHour, defaults.notifyHour),
        silentFrom: clampHour(data.silentFrom, defaults.silentFrom),
        silentTo: clampHour(data.silentTo, defaults.silentTo),
        onboarded: typeof data.onboarded === "boolean" ? data.onboarded : defaults.onboarded,
        webhookEnabled: typeof data.webhookEnabled === "boolean" ? data.webhookEnabled : defaults.webhookEnabled,
        webhookUrl: typeof data.webhookUrl === "string" ? data.webhookUrl : defaults.webhookUrl,
        webhookMode: data.webhookMode === "ntfy" ? "ntfy" : "bark",
    };
    return { settings, droppedModules, repairedMembers };
}

const CHECKIN_METRICS = new Set(["count", "quantity", "duration"]);

/** EC09（D20）：打卡绑定清洗——缺 id/成员/metric 非法剔除；同 itemId+memberId 去重（首见保留） */
export function normalizeCheckinBindings(raw: unknown): CheckinBinding[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: CheckinBinding[] = [];
    for (const b of raw as Record<string, any>[]) {
        if (!isPlainObject(b)) continue;
        if (typeof b.itemId !== "string" || !b.itemId) continue;
        if (typeof b.memberId !== "string" || !b.memberId) continue;
        if (typeof b.metric !== "string" || !CHECKIN_METRICS.has(b.metric)) continue;
        const key = `${b.itemId}|${b.memberId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            itemId: b.itemId,
            itemName: typeof b.itemName === "string" && b.itemName.trim() ? b.itemName : b.itemId,
            memberId: b.memberId,
            metric: b.metric as CheckinBinding["metric"],
        });
    }
    return out;
}

export function newMember(name: string, role: MemberRole, birthday?: string, lunarBirthday?: boolean): FamilyMember {
    return {
        id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        role,
        birthday,
        lunarBirthday,
        createdAt: new Date().toISOString(),
    };
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
    const prototype = Object.getPrototypeOf(v);
    return prototype === Object.prototype || prototype === null;
}
