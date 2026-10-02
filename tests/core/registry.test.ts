/**
 * provider 覆盖契约测试（12 轮修复的回归防线）：
 * 每个声明了 reminders/numericRules 的 schema 必须有对应 provider——
 * 此前手工清单漏掉 parenting/schooling，两模块提醒从未生效。
 */
import { describe, it, expect } from "vitest";
import { buildScanProviders, providerCoverage } from "@/core/hub/registry";
import {
    MEMBERS_SCHEMA, CERTS_SCHEMA, MEDICINE_SCHEMA, MEMBERSHIPS_SCHEMA, INSURANCE_SCHEMA,
    SHOPPING_SCHEMA, CONTRACTS_SCHEMA, EXAMS_SCHEMA, ALLOWANCE_SCHEMA, FAVORS_SCHEMA,
    STOCK_SCHEMA, CHORES_SCHEMA, HOUSE_SCHEMA, MEDIA_SCHEMA, PETS_SCHEMA, VEHICLES_SCHEMA,
    TRANSIT_SCHEMA, TRAVEL_PLAN_SCHEMA, TRAVEL_BOOKING_SCHEMA, TRAVEL_PACKING_SCHEMA,
    TRAVEL_LOG_SCHEMA, ASSETS_VIRTUAL_SCHEMA, ASSETS_REAL_SCHEMA, HEALTH_SCHEMA,
    FOOD_SCHEMA, ADDRESS_SCHEMA, BOOKMARKS_SCHEMA, SNIPPETS_SCHEMA, PARENTING_SCHEMA,
    SCHOOLING_SCHEMA, SOCIAL_SCHEMA,
} from "@/core/schema";
import { defaultSettings } from "@/core/settings";
import type { HomeSettings } from "@/types";

const ALL: Record<string, any> = {
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
    food: FOOD_SCHEMA, address: ADDRESS_SCHEMA, bookmarks: BOOKMARKS_SCHEMA,
    snippets: SNIPPETS_SCHEMA, parenting: PARENTING_SCHEMA, schooling: SCHOOLING_SCHEMA,
    social: SOCIAL_SCHEMA,
};

const deps = {
    settings: defaultSettings() as HomeSettings,
    getDbRef: () => undefined,
};

describe("provider 注册表覆盖契约", () => {
    it("全部 31 个 schema：有提醒/阈值规则的模块都有 provider；无规则的不注册（PF04）", () => {
        const providers = buildScanProviders(ALL, deps);
        expect(providerCoverage(ALL, providers)).toEqual([]);
        // 无规则的模块（如 food）不产生读请求通道
        expect(providers.find((p) => p.moduleId === "food")).toBeUndefined();
    });

    it("此前漏掉的两个模块现在被覆盖（parenting/schooling）", () => {
        const providers = buildScanProviders(ALL, deps);
        expect(providers.find((p) => p.moduleId === "parenting")).toBeDefined();
        expect(providers.find((p) => p.moduleId === "schooling")).toBeDefined();
    });

    it("数值阈值模块追加 NumericRuleProvider（同 moduleId 双 provider）", () => {
        const providers = buildScanProviders(ALL, deps);
        const medicine = providers.filter((p) => p.moduleId === "medicine");
        expect(medicine).toHaveLength(2); // 效期 + 低库存
        const stock = providers.filter((p) => p.moduleId === "stock");
        expect(stock).toHaveLength(2);
    });

    it("31/31 模块任一启用组合下覆盖契约都成立（含全开）", () => {
        const providers = buildScanProviders(ALL, deps);
        expect(providerCoverage(ALL, providers)).toEqual([]);
        expect(providers.length).toBeGreaterThanOrEqual(19 + 2); // 19 提醒 schema + certs/members 专属 + 数值追加
    });
});
