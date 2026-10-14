/**
 * 行级子记录日志单测（子记录模型定案 2026-10-04）：append 同日期覆盖/remove 空 key 清理/排序/行删除清理。
 */
import { describe, it, expect } from "vitest";
import {
    logKey, getValuations, appendValuation, removeValuation, removeRowLog,
    getEntries, appendEntry, removeEntry,
    getMeterReadings, appendMeterReading, removeMeterReading,
    updateRowLogs,
    type RowLogs,
} from "@/core/rowlog";

const AT = "2026-10-04T10:00:00Z";

describe("rowlog（行级子记录模型）", () => {
    it("appendValuation：追加 + 同日期覆盖（快照语义）", () => {
        let logs: RowLogs = {};
        logs = appendValuation(logs, "av1", "r1", "2026-01-01", 1000, AT);
        logs = appendValuation(logs, "av1", "r1", "2026-06-01", 1200, AT);
        logs = appendValuation(logs, "av1", "r1", "2026-01-01", 1100, AT); // 同口径日覆盖
        const vals = getValuations(logs, "av1", "r1");
        expect(vals).toHaveLength(2);
        expect(vals[0]).toEqual({ date: "2026-01-01", value: 1100, at: AT });
        expect(vals[1].value).toBe(1200);
    });

    it("getValuations 按日期升序；非法输入不落盘", () => {
        let logs: RowLogs = {};
        logs = appendValuation(logs, "av1", "r1", "2026-06-01", 100, AT);
        logs = appendValuation(logs, "av1", "r1", "2026-01-01", 50, AT);
        expect(getValuations(logs, "av1", "r1").map((v) => v.date)).toEqual(["2026-01-01", "2026-06-01"]);
        // 非法：空日期/非数值 → 原样返回（不可变约定）
        expect(appendValuation(logs, "av1", "r1", "", 10, AT)).toBe(logs);
        expect(appendValuation(logs, "av1", "r1", "2026-07-01", NaN, AT)).toBe(logs);
        expect(getValuations(logs, "av1", "r1")).toHaveLength(2);
    });

    it("removeValuation：删指定口径日；删空后清 key", () => {
        let logs: RowLogs = {};
        logs = appendValuation(logs, "av1", "r1", "2026-01-01", 100, AT);
        logs = appendValuation(logs, "av1", "r1", "2026-06-01", 120, AT);
        logs = removeValuation(logs, "av1", "r1", "2026-01-01");
        expect(getValuations(logs, "av1", "r1")).toHaveLength(1);
        logs = removeValuation(logs, "av1", "r1", "2026-06-01");
        expect(logs[logKey("av1", "r1")]).toBeUndefined(); // key 清理
        expect(removeValuation(logs, "av1", "r1", "2099-01-01")).toBe(logs); // 不存在安静返回
    });

    it("removeRowLog：行删除清整行；隔离性（不同行/库互不影响）", () => {
        let logs: RowLogs = {};
        logs = appendValuation(logs, "av1", "r1", "2026-01-01", 100, AT);
        logs = appendValuation(logs, "av1", "r2", "2026-01-01", 200, AT);
        logs = appendValuation(logs, "av2", "r1", "2026-01-01", 300, AT);
        logs = removeRowLog(logs, "av1", "r1");
        expect(getValuations(logs, "av1", "r2")).toHaveLength(1);
        expect(getValuations(logs, "av2", "r1")).toHaveLength(1);
        expect(removeRowLog(logs, "av1", "ghost")).toBe(logs);
    });

    it("泛型 appendEntry：追加 + 完全重复去重（同日不同值合法并存）", () => {
        let logs: RowLogs = {};
        logs = appendEntry(logs, "av1", "r1", "prices", { date: "2026-01-01", price: 99, channel: "A", at: AT });
        logs = appendEntry(logs, "av1", "r1", "prices", { date: "2026-01-01", price: 89, channel: "B", at: AT }); // 同日不同价并存
        logs = appendEntry(logs, "av1", "r1", "prices", { date: "2026-01-01", price: 99, channel: "A", at: "其他时刻" }); // 完全重复（忽略 at）去重
        const prices = getEntries<{ date: string; price: number }>(logs, "av1", "r1", "prices");
        expect(prices).toHaveLength(2);
        expect(prices.map((p) => p.price).sort()).toEqual([89, 99]);
    });

    it("泛型 removeEntry：删空清 key；类型间互不影响（moves/prices/transfers 隔离）", () => {
        let logs: RowLogs = {};
        logs = appendEntry(logs, "av1", "r1", "moves", { date: "2026-01-01", from: "A", to: "B", at: AT });
        logs = appendEntry(logs, "av1", "r1", "transfers", { date: "2026-02-01", from: "甲", to: "乙", at: AT });
        logs = removeEntry(logs, "av1", "r1", "moves", { date: "2026-01-01", from: "A", to: "B", at: "无所谓" });
        expect(getEntries(logs, "av1", "r1", "moves")).toHaveLength(0);
        expect(getEntries(logs, "av1", "r1", "transfers")).toHaveLength(1);
        expect(logs[logKey("av1", "r1")]).toBeDefined(); // transfers 仍在，key 保留
        logs = removeEntry(logs, "av1", "r1", "transfers", { date: "2026-02-01", from: "甲", to: "乙", at: AT });
        expect(logs[logKey("av1", "r1")]).toBeUndefined(); // 全空清 key
    });
});

describe("rowlog 持久化并发", () => {
    it("两个弹层并发追加会从队列内最新快照合并，不互相覆盖", async () => {
        const store: Record<string, unknown> = {};
        const plugin = {
            loadData: async (name: string) => store[name] ?? null,
            saveData: async (name: string, value: unknown) => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                store[name] = JSON.parse(JSON.stringify(value));
            },
        } as any;
        await Promise.all([
            updateRowLogs(plugin, (current) => appendEntry(current, "av", "vehicle", "fuelings", { date: "2026-10-14", quantity: 20, at: "one" })),
            updateRowLogs(plugin, (current) => appendEntry(current, "av", "vehicle", "fuelings", { date: "2026-10-14", quantity: 30, at: "two" })),
        ]);
        const saved = store["rowlogs.json"] as RowLogs;
        expect(getEntries<{ quantity: number }>(saved, "av", "vehicle", "fuelings").map((entry) => entry.quantity).sort()).toEqual([20, 30]);
    });

    it("落盘失败会回传错误且不污染已保存快照，后续更新仍可继续", async () => {
        const store: Record<string, unknown> = {};
        let failNext = true;
        const plugin = {
            loadData: async (name: string) => store[name] ?? null,
            saveData: async (name: string, value: unknown) => {
                if (failNext) {
                    failNext = false;
                    throw new Error("disk full");
                }
                store[name] = JSON.parse(JSON.stringify(value));
            },
        } as any;
        await expect(updateRowLogs(plugin, (current) => appendEntry(current, "av", "vehicle", "fuelings", { date: "2026-10-14", quantity: 20, at: "failed" })))
            .rejects.toThrow("disk full");
        expect(store["rowlogs.json"]).toBeUndefined();
        await expect(updateRowLogs(plugin, (current) => appendEntry(current, "av", "vehicle", "fuelings", { date: "2026-10-14", quantity: 30, at: "retry" })))
            .resolves.toMatchObject({ ["av|vehicle"]: { fuelings: [{ quantity: 30 }] } });
        expect(getEntries<{ quantity: number }>(store["rowlogs.json"] as RowLogs, "av", "vehicle", "fuelings").map((entry) => entry.quantity)).toEqual([30]);
    });
});

describe("rowlog 抄表（16 组/187 波：house 水电煤）", () => {
    it("首表无用量；顺序读数记差值；回填旧日期按日期序与前值计差", () => {
        let logs: RowLogs = {};
        logs = appendMeterReading(logs, "av1", "r1", "2026-01-01", 100, AT);
        logs = appendMeterReading(logs, "av1", "r1", "2026-02-01", 130, AT);
        expect(getMeterReadings(logs, "av1", "r1").map((m) => m.usage)).toEqual([undefined, 30]);
        logs = appendMeterReading(logs, "av1", "r1", "2026-01-15", 115, AT); // 回填中间读数
        const readings = getMeterReadings(logs, "av1", "r1");
        expect(readings.map((m) => m.date)).toEqual(["2026-01-01", "2026-01-15", "2026-02-01"]);
        expect(readings[1].usage).toBe(15); // 与 01-01 的差
        expect(readings[2].usage).toBe(30); // 02-01 的差不受回填影响（append 时已定，不重算）
    });

    it("同日期覆盖；负差（换表/倒转）不记用量；非法输入安静返回", () => {
        let logs: RowLogs = {};
        logs = appendMeterReading(logs, "av1", "r1", "2026-01-01", 100, AT);
        logs = appendMeterReading(logs, "av1", "r1", "2026-01-01", 105, AT); // 同口径日覆盖
        expect(getMeterReadings(logs, "av1", "r1")).toHaveLength(1);
        logs = appendMeterReading(logs, "av1", "r1", "2026-02-01", 90, AT); // 负差
        expect(getMeterReadings(logs, "av1", "r1")[1].usage).toBeUndefined();
        expect(appendMeterReading(logs, "av1", "r1", "", 10, AT)).toBe(logs);
        expect(appendMeterReading(logs, "av1", "r1", "2026-03-01", NaN, AT)).toBe(logs);
    });

    it("删除口径日；全空清 key", () => {
        let logs: RowLogs = {};
        logs = appendMeterReading(logs, "av1", "r1", "2026-01-01", 100, AT);
        logs = appendMeterReading(logs, "av1", "r1", "2026-02-01", 130, AT);
        logs = removeMeterReading(logs, "av1", "r1", "2026-01-01");
        expect(getMeterReadings(logs, "av1", "r1")).toHaveLength(1);
        logs = removeMeterReading(logs, "av1", "r1", "2026-02-01");
        expect(logs[logKey("av1", "r1")]).toBeUndefined();
    });
});
