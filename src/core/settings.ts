/**
 * 设置存取：模块开关、家庭成员、提醒提前量覆盖、台账落点。
 * 走 loadData/saveData（data/storage/petal/siyuan-home/），随思源同步走。
 * 结构与 docs/design/01 ADR-7 一致：业务数据一律在思源侧，这里只放设置与运行态。
 */
import type { Plugin } from "siyuan";
import type { HomeSettings, FamilyMember, MemberRole } from "@/types";
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
    };
}

export async function loadSettings(plugin: Plugin): Promise<HomeSettings> {
    const data = await plugin.loadData(SETTINGS_NAME);
    const defaults = defaultSettings();
    if (!data) {
        return defaults;
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
        members: Array.isArray(data.members) ? data.members : [],
        leadOverrides: isPlainObject(data.leadOverrides) ? data.leadOverrides : defaults.leadOverrides,
        dbRefs: isPlainObject(data.dbRefs) ? data.dbRefs : defaults.dbRefs,
    };
}

export async function saveSettings(plugin: Plugin, settings: HomeSettings): Promise<void> {
    await plugin.saveData(SETTINGS_NAME, settings);
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
