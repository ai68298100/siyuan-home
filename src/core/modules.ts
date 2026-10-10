/**
 * 内置模块注册表：小驴管家的全部模块在此声明。
 * 新模块 = 在 BUILT_IN_MODULES 加一行 + i18n 加 module.<id> / group.<gid> 文案。
 */
import type { HomeModule, ModuleGroupId } from "@/types";

export const MODULE_GROUPS: ModuleGroupId[] = ["people", "assets", "living", "kids", "travel", "media"];

export const BUILT_IN_MODULES: HomeModule[] = [
    // ── 人员档案 ──
    { id: "members",      group: "people", defaultEnabled: true,  alwaysOn: true, devStatus: "ready" },
    { id: "certs",        group: "people", defaultEnabled: true,  devStatus: "skeleton" },
    { id: "health",       group: "people", defaultEnabled: true,  devStatus: "skeleton" },
    { id: "social",       group: "people", defaultEnabled: false, devStatus: "skeleton" },
    { id: "insurance",    group: "people", defaultEnabled: false, devStatus: "skeleton" },
    { id: "exams",        group: "people", defaultEnabled: false, devStatus: "skeleton" },
    { id: "pets",         group: "people", defaultEnabled: false, devStatus: "skeleton" },
    // ── 资产购物 ──
    { id: "assets-real",  group: "assets", defaultEnabled: true,  devStatus: "skeleton" },
    { id: "assets-virtual", group: "assets", defaultEnabled: false, devStatus: "skeleton" },
    { id: "shopping",     group: "assets", defaultEnabled: false, devStatus: "skeleton" },
    { id: "memberships",  group: "assets", defaultEnabled: false, devStatus: "skeleton" },
    { id: "contracts",    group: "assets", defaultEnabled: false, devStatus: "skeleton" },
    // ── 生活服务 ──
    { id: "medicine",     group: "living", defaultEnabled: true,  devStatus: "skeleton" },
    { id: "stock",        group: "living", defaultEnabled: false, devStatus: "skeleton" },
    { id: "favors",       group: "living", defaultEnabled: false, devStatus: "skeleton" },
    { id: "chores",       group: "living", defaultEnabled: false, devStatus: "skeleton" },
    { id: "food",         group: "living", defaultEnabled: false, devStatus: "skeleton" },
    { id: "address",      group: "living", defaultEnabled: false, devStatus: "skeleton" },
    { id: "bookmarks",    group: "living", defaultEnabled: false, devStatus: "skeleton" },
    { id: "snippets",     group: "living", defaultEnabled: false, devStatus: "skeleton" },
    { id: "house",        group: "living", defaultEnabled: false, devStatus: "skeleton" },
    // ── 育儿上学 ──
    { id: "parenting",    group: "kids",   defaultEnabled: false, suggestRoles: ["child"], devStatus: "skeleton" },
    { id: "schooling",    group: "kids",   defaultEnabled: false, suggestRoles: ["child"], devStatus: "skeleton" },
    { id: "allowance",    group: "kids",   defaultEnabled: false, suggestRoles: ["child"], devStatus: "skeleton" },
    // ── 出行旅行 ──
    { id: "vehicles",     group: "travel", defaultEnabled: false, devStatus: "ready" },
    { id: "transit",      group: "travel", defaultEnabled: false, devStatus: "skeleton" },
    { id: "travel-plan",  group: "travel", defaultEnabled: false, devStatus: "skeleton" },
    { id: "travel-booking", group: "travel", defaultEnabled: false, devStatus: "skeleton" },
    { id: "travel-packing", group: "travel", defaultEnabled: false, devStatus: "skeleton" },
    { id: "travel-log",   group: "travel", defaultEnabled: false, devStatus: "skeleton" },
    // ── 影音书库 ──
    { id: "media",        group: "media",  defaultEnabled: false, devStatus: "skeleton" },
];

const moduleMap = new Map(BUILT_IN_MODULES.map((m) => [m.id, m]));

export const getModule = (id: string): HomeModule | undefined => moduleMap.get(id);

export const modulesByGroup = (group: ModuleGroupId): HomeModule[] =>
    BUILT_IN_MODULES.filter((m) => m.group === group);

/** B2（94 波走查）：模块图标——总览/提醒行共用；新模块记得补一行，moduleIcon 覆盖测试钉住 */
export const MODULE_ICONS: Record<string, string> = {
    members: "👪", certs: "🪪", health: "🩺", insurance: "🛡️", exams: "📝", pets: "🐾", social: "👥",
    "assets-real": "🏠", "assets-virtual": "🏦", shopping: "🛒", memberships: "🔁", contracts: "📄",
    medicine: "💊", stock: "📦", favors: "🧧", chores: "🧹", food: "🍚", address: "📍",
    snippets: "📎", house: "🏡", parenting: "🧸", schooling: "🎒", allowance: "💰", bookmarks: "🔖",
    vehicles: "🚗", transit: "🚌", "travel-plan": "✈️", "travel-booking": "🎫",
    "travel-packing": "🧳", "travel-log": "📷", media: "🎬",
};

export const moduleIcon = (mid: string): string => MODULE_ICONS[mid] ?? "🗂";

/** 249 波（UI 质感对齐）：模块 → 色调砖 class（t-blue/t-green/t-warn/t-rose/t-amber），
 *  图标磁贴按模块着色（对齐原型模块色砖）；未映射模块回退 t-blue。 */
const MODULE_TONES: Record<string, string> = {
    members: "t-rose", certs: "t-blue", health: "t-green", insurance: "t-blue", exams: "t-amber",
    pets: "t-green", social: "t-rose", "assets-real": "t-amber", "assets-virtual": "t-blue",
    shopping: "t-rose", memberships: "t-blue", contracts: "t-blue", medicine: "t-rose",
    stock: "t-green", favors: "t-rose", chores: "t-green", food: "t-amber", address: "t-blue",
    snippets: "t-amber", house: "t-green", parenting: "t-amber", schooling: "t-blue",
    allowance: "t-green", bookmarks: "t-amber", vehicles: "t-blue", transit: "t-green",
    "travel-plan": "t-blue", "travel-booking": "t-amber", "travel-packing": "t-green",
    "travel-log": "t-rose", media: "t-rose",
};

export const moduleTone = (mid: string): string => MODULE_TONES[mid] ?? "t-blue";

