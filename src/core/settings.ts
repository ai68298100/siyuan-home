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
        if (data !== null && data !== undefined && typeof data !== "object") {
            // 非 JSON 对象（手工改坏/老版本残留）→ 视为损坏
            await backupCorruptMarker(plugin, name, `non-object: ${typeof data}`);
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

/** D23：成员 sex 可选字段清洗——仅 male/female 合法，其余移除（加载迁移与导入归一化共用） */
function sanitizeMemberSex(m: any): any {
    if (m.sex !== "male" && m.sex !== "female") delete m.sex;
    return m;
}

export async function loadSettings(plugin: Plugin): Promise<HomeSettings> {
    const { data, corrupted } = await loadDataSafe(plugin, SETTINGS_NAME);
    const defaults = defaultSettings();
    if (!data) {
        // corrupted=true 时保留标记供 onload 弹警告（设置页诊断亦可见 corrupted 文件）
        return corrupted ? { ...defaults, corruptedSettings: true } : defaults;
    }
    // 用户显式管理模块开关：已有 enabledModules 时完全尊重（含关闭默认模块）；
    // 新增模块的默认启用只走版本化迁移（33.1），运行时不强制回填。
    const known = new Set(BUILT_IN_MODULES.map((m) => m.id));
    const enabled = Array.isArray(data.enabledModules)
        ? data.enabledModules.filter((id: string) => known.has(id))
        : defaults.enabledModules;
    return {
        ...defaults,
        ...data,
        enabledModules: enabled,
        members: Array.isArray(data.members) ? data.members.map(sanitizeMemberSex) : [],
        leadOverrides: isPlainObject(data.leadOverrides) ? data.leadOverrides : defaults.leadOverrides,
        dbRefs: isPlainObject(data.dbRefs) ? data.dbRefs : defaults.dbRefs,
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
export function normalizeImportedSettings(data: Record<string, any>): NormalizedImport {
    const defaults = defaultSettings();
    const known = new Set(BUILT_IN_MODULES.map((m) => m.id));
    const rawEnabled: string[] = Array.isArray(data.enabledModules) ? data.enabledModules.filter((x: any) => typeof x === "string") : [];
    const enabled = rawEnabled.filter((id) => known.has(id));
    const droppedModules = [...new Set(rawEnabled.filter((id) => !known.has(id)))];

    let repairedMembers = 0;
    const roles = new Set(["self", "spouse", "partner", "child", "elder", "kin", "other"]);
    const members = (Array.isArray(data.members) ? data.members : []).map((m: any) => {
        const fixed = { ...m };
        if (!fixed.id || typeof fixed.id !== "string") { fixed.id = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; repairedMembers++; }
        if (typeof fixed.name !== "string" || !fixed.name.trim()) { fixed.name = "?"; repairedMembers++; }
        if (!roles.has(fixed.role)) { fixed.role = "other"; repairedMembers++; }
        return sanitizeMemberSex(fixed);
    });

    const settings: HomeSettings = {
        ...defaults,
        ...data,
        enabledModules: enabled,
        members,
        leadOverrides: isPlainObject(data.leadOverrides) ? (data.leadOverrides as Record<string, number>) : defaults.leadOverrides,
        dbRefs: isPlainObject(data.dbRefs) ? data.dbRefs : defaults.dbRefs,
        checkinBindings: normalizeCheckinBindings(data.checkinBindings),
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
        if (!b || typeof b !== "object") continue;
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

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
