/**
 * 内置模块注册表：小驴管家的全部模块在此声明。
 * 新模块 = 在 BUILT_IN_MODULES 加一行 + i18n 加 module.<id> / group.<gid> 文案。
 */
import type { HomeModule, ModuleGroupId } from "@/types";

export const MODULE_GROUPS: ModuleGroupId[] = ["people", "assets", "living", "kids", "travel", "media"];

export const BUILT_IN_MODULES: HomeModule[] = [
    // ── 人员档案 ──
    { id: "members",      group: "people", defaultEnabled: true,  alwaysOn: true, devStatus: "skeleton" },
    { id: "certs",        group: "people", defaultEnabled: true,  devStatus: "planned" },
    { id: "health",       group: "people", defaultEnabled: true,  devStatus: "planned" },
    { id: "social",       group: "people", defaultEnabled: false, devStatus: "planned" },
    { id: "insurance",    group: "people", defaultEnabled: false, devStatus: "planned" },
    { id: "exams",        group: "people", defaultEnabled: false, devStatus: "planned" },
    { id: "pets",         group: "people", defaultEnabled: false, devStatus: "planned" },
    // ── 资产购物 ──
    { id: "assets-real",  group: "assets", defaultEnabled: true,  devStatus: "planned" },
    { id: "assets-virtual", group: "assets", defaultEnabled: false, devStatus: "planned" },
    { id: "shopping",     group: "assets", defaultEnabled: false, devStatus: "planned" },
    { id: "memberships",  group: "assets", defaultEnabled: false, devStatus: "planned" },
    { id: "contracts",    group: "assets", defaultEnabled: false, devStatus: "planned" },
    // ── 生活服务 ──
    { id: "medicine",     group: "living", defaultEnabled: true,  devStatus: "planned" },
    { id: "stock",        group: "living", defaultEnabled: false, devStatus: "planned" },
    { id: "favors",       group: "living", defaultEnabled: false, devStatus: "planned" },
    { id: "chores",       group: "living", defaultEnabled: false, devStatus: "planned" },
    { id: "food",         group: "living", defaultEnabled: false, devStatus: "planned" },
    { id: "address",      group: "living", defaultEnabled: false, devStatus: "planned" },
    { id: "bookmarks",    group: "living", defaultEnabled: false, devStatus: "planned" },
    { id: "snippets",     group: "living", defaultEnabled: false, devStatus: "planned" },
    { id: "house",        group: "living", defaultEnabled: false, devStatus: "planned" },
    // ── 育儿上学 ──
    { id: "parenting",    group: "kids",   defaultEnabled: false, suggestRoles: ["child"], devStatus: "planned" },
    { id: "schooling",    group: "kids",   defaultEnabled: false, suggestRoles: ["child"], devStatus: "planned" },
    { id: "allowance",    group: "kids",   defaultEnabled: false, suggestRoles: ["child"], devStatus: "planned" },
    // ── 出行旅行 ──
    { id: "vehicles",     group: "travel", defaultEnabled: false, devStatus: "planned" },
    { id: "transit",      group: "travel", defaultEnabled: false, devStatus: "planned" },
    { id: "travel-plan",  group: "travel", defaultEnabled: false, devStatus: "planned" },
    { id: "travel-booking", group: "travel", defaultEnabled: false, devStatus: "planned" },
    { id: "travel-packing", group: "travel", defaultEnabled: false, devStatus: "planned" },
    { id: "travel-log",   group: "travel", defaultEnabled: false, devStatus: "planned" },
    // ── 影音书库 ──
    { id: "media",        group: "media",  defaultEnabled: false, devStatus: "planned" },
];

const moduleMap = new Map(BUILT_IN_MODULES.map((m) => [m.id, m]));

export const getModule = (id: string): HomeModule | undefined => moduleMap.get(id);

export const modulesByGroup = (group: ModuleGroupId): HomeModule[] =>
    BUILT_IN_MODULES.filter((m) => m.group === group);
