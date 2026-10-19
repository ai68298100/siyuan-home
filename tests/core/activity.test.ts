import { describe, expect, it } from "vitest";
import { projectLedgerActivity, projectRowLogActivities } from "@/core/activity";
import { HEALTH_SCHEMA, type ModuleSchema, validateSchema } from "@/core/schema";
import type { RowLogs } from "@/core/rowlog";

describe("活动记录投影", () => {
    const columns = { name: "name-col", date: "date-col", member: "member-col", category: "category-col", hospital: "hospital-col" };
    const schema: ModuleSchema = {
        ...HEALTH_SCHEMA,
        activity: { dateField: "date", detailFields: ["category", "hospital"] },
    };

    it("保留事项日期、成员关系和字段摘要", () => {
        const row = {
            itemID: "row-a",
            cells: {
                "name-col": { text: { content: "年度体检" } },
                "date-col": { date: { content: Date.UTC(2026, 4, 8, 12), isNotEmpty: true } },
                "member-col": { relation: { blockIDs: ["member-row"] } },
                "category-col": { select: { content: "checkup" } },
                "hospital-col": { text: { content: "市中心医院\n体检中心" } },
            },
        };
        const result = projectLedgerActivity({
            moduleId: "health", avId: "av-health", row, schema, columns,
            memberByAvItem: new Map([["member-row", "member-1"]]),
        });
        expect(result).toMatchObject({
            moduleId: "health", rowId: "row-a", title: "年度体检", eventDate: "2026-05-08",
            memberId: "member-1", source: "ledger",
            details: [
                { key: "category", value: "checkup", valueKey: "field.category.opt.checkup" },
                { key: "hospital", value: "市中心医院 体检中心" },
            ],
        });
    });

    it("只有存在真实系统创建时间或已声明的事项日期才纳入", () => {
        const noDate = projectLedgerActivity({
            moduleId: "health", avId: "av-health", row: { itemID: "row-empty", cells: { "name-col": { text: { content: "旧记录" } } } }, schema, columns,
        });
        expect(noDate).toBeUndefined();

        const createdAt = Date.UTC(2026, 4, 9, 6);
        const created = projectLedgerActivity({
            moduleId: "health", avId: "av-health", row: {
                itemID: "row-created",
                cells: { "name-col": { text: { content: "已录入档案" }, createdAt } },
            }, schema, columns,
        });
        expect(created?.recordedAt).toBe(new Date(createdAt).toISOString());
        expect(created?.eventDate).toBeUndefined();
    });

    it("忽略非法日期，不把空值转成时间戳", () => {
        const result = projectLedgerActivity({
            moduleId: "health", avId: "av-health", row: {
                itemID: "row-invalid",
                cells: {
                    "name-col": { text: { content: "日期无效" } },
                    "date-col": { date: { content: Number.NaN, isNotEmpty: true } },
                },
            }, schema, columns,
        });
        expect(result).toBeUndefined();
    });

    it("schema 活动日期契约必须引用 date 列，摘要字段必须存在", () => {
        expect(validateSchema("health", schema)).toEqual([]);
        expect(validateSchema("bad", {
            ...schema,
            activity: { dateField: "followup_date_missing", detailFields: ["hospital_missing"] },
        })).toEqual(expect.arrayContaining([
            expect.stringContaining("activity.dateField 未知列"),
            expect.stringContaining("activity.detailFields 引用未知列"),
        ]));
        expect(validateSchema("bad-type", {
            ...schema,
            activity: { dateField: "hospital" },
        })).toEqual(expect.arrayContaining([expect.stringContaining("必须是 date 列")]));
    });

    it("车辆流水按父车辆关系投影，缺失时间不造录入时分，孤立数据可见计数", () => {
        const logs: RowLogs = {
            "av-vehicle|car-1": {
                fuelings: [
                    { kind: "fuel", date: "2026-05-08", at: "2026-05-08T12:34:56.000Z", fuelGrade: "95", quantity: 30, odometer: 68420, totalCost: 240 },
                    { kind: "fuel", date: "2026-05-07", fuelGrade: "92", quantity: 20, odometer: 68000 },
                ],
            },
            "av-vehicle|deleted-car": { maintenance: [{ date: "2026-05-02", category: "routine" }] },
        };
        const projected = projectRowLogActivities({
            moduleId: "vehicles", avId: "av-vehicle",
            rows: [{ itemID: "car-1", cells: {
                "name-col": { text: { content: "通勤车" } },
                "member-col": { relation: { blockIDs: ["member-row"] } },
            } }],
            columns,
            memberByAvItem: new Map([["member-row", "member-1"]]),
            logs,
        });
        expect(projected.records).toHaveLength(2);
        expect(projected.records[0]).toMatchObject({
            moduleId: "vehicles", rowId: "car-1", title: "通勤车", memberId: "member-1",
            eventDate: "2026-05-08", recordedAt: "2026-05-08T12:34:56.000Z", logKind: "fuelings",
            details: expect.arrayContaining([
                { key: "fuelGrade", value: "95", valueKey: "activity.value.fuelGrade.95" },
                { key: "quantity", value: "30" },
                { key: "totalCost", value: "240" },
            ]),
        });
        expect(projected.records[1]?.recordedAt).toBeUndefined();
        expect(projected.records[1]?.eventDate).toBe("2026-05-07");
        expect(projected.orphaned).toBe(1);
    });
});
