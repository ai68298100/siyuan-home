/**
 * 行级子记录日志单测（子记录模型定案 2026-10-04）：append 同日期覆盖/remove 空 key 清理/排序/行删除清理。
 */
import { describe, it, expect } from "vitest";
import {
    logKey, getValuations, appendValuation, removeValuation, removeRowLog,
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
});
