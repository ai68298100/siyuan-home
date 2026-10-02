/**
 * schema 黄金快照测试（21 组）：31 个模块 schema 的序列化快照，防止无意识变更破坏契约。
 * 有意的 schema 变更：pnpm test -- -u 更新快照，并在 CHANGELOG/TODO 记录原因。
 */
import { describe, it, expect } from "vitest";
import {
    MEMBERS_SCHEMA, CERTS_SCHEMA, MEDICINE_SCHEMA, MEMBERSHIPS_SCHEMA, INSURANCE_SCHEMA,
    SHOPPING_SCHEMA, CONTRACTS_SCHEMA, EXAMS_SCHEMA, ALLOWANCE_SCHEMA, FAVORS_SCHEMA,
    STOCK_SCHEMA, CHORES_SCHEMA, HOUSE_SCHEMA, MEDIA_SCHEMA, PETS_SCHEMA, VEHICLES_SCHEMA,
    TRANSIT_SCHEMA, TRAVEL_PLAN_SCHEMA, TRAVEL_BOOKING_SCHEMA, TRAVEL_PACKING_SCHEMA,
    TRAVEL_LOG_SCHEMA, ASSETS_VIRTUAL_SCHEMA, ASSETS_REAL_SCHEMA, HEALTH_SCHEMA,
    FOOD_SCHEMA, ADDRESS_SCHEMA, BOOKMARKS_SCHEMA, SNIPPETS_SCHEMA, PARENTING_SCHEMA,
    SCHOOLING_SCHEMA, SOCIAL_SCHEMA,
} from "@/core/schema";

const ALL: Record<string, unknown> = {
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

describe("31 模块 schema 契约快照（21 组）", () => {
    it("恰好 31 个模块 schema", () => {
        expect(Object.keys(ALL)).toHaveLength(31);
    });

    it("每个 schema 的结构快照（有意变更时用 -u 更新并记录原因）", () => {
        for (const [id, schema] of Object.entries(ALL)) {
            expect(schema, `module: ${id}`).toMatchSnapshot();
        }
    });
});
