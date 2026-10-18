import { describe, it, expect } from "vitest";
import { buildFavorsReport, formatFavorsReportText } from "@/core/favors";
import type { AvRow } from "@/core/siyuan";

describe("favors.buildFavorsReport（年度人情报告统计）", () => {
    const cols = {
        name: "f-name",
        category: "f-cat",
        direction: "f-dir",
        person: "f-person",
        amount: "f-amount",
        date: "f-date",
    };

    const makeRow = (
        id: string,
        name: string,
        direction: "in" | "out",
        person: string,
        amount: number,
        date: string,
        category = "wedding",
    ): AvRow => ({
        itemID: id,
        cells: {
            "f-name": { type: "text", text: { content: name } },
            "f-dir": { type: "select", select: { content: direction } },
            "f-person": { type: "text", text: { content: person } },
            "f-amount": { type: "number", number: { content: amount } },
            "f-date": { type: "date", date: { content: date } },
            "f-cat": { type: "select", select: { content: category } },
        },
    });

    const rows: AvRow[] = [
        makeRow("1", "小李结婚贺礼", "out", "小李", 2000, "2026-05-01", "wedding"),
        makeRow("2", "表妹生子满月礼", "out", "表妹", 1000, "2026-06-15", "full_moon"),
        makeRow("3", "三叔公寿宴", "out", "三叔公", 800, "2026-08-08", "birthday_fv"),
        makeRow("4", "自家乔迁小李送礼", "in", "小李", 1000, "2026-09-10", "housewarming"),
        makeRow("5", "自家乔迁三叔公送礼", "in", "三叔公", 3000, "2026-09-10", "housewarming"),
        makeRow("6", "去年贺礼", "out", "小李", 500, "2025-12-01", "wedding"),
    ];

    it("正确过滤指定年份并计算收、送及净人情差额", () => {
        const report = buildFavorsReport(rows, cols, 2026);
        expect(report.year).toBe(2026);
        expect(report.totalOut).toBe(3800); // 2000 + 1000 + 800
        expect(report.totalIn).toBe(4000);  // 1000 + 3000
        expect(report.netAmount).toBe(200); // 4000 - 3800
        expect(report.countOut).toBe(3);
        expect(report.countIn).toBe(2);
        expect(report.availableYears).toEqual([2026, 2025]);
    });

    it("支持全量累计（all）统计", () => {
        const report = buildFavorsReport(rows, cols, "all");
        expect(report.totalOut).toBe(4300); // 3800 + 500
        expect(report.totalIn).toBe(4000);
        expect(report.netAmount).toBe(-300);
    });

    it("按往来总金额排序 Top 亲友", () => {
        const report = buildFavorsReport(rows, cols, 2026);
        expect(report.topPersons).toHaveLength(3);
        // 三叔公: 3000 + 800 = 3800 (排第 1)
        expect(report.topPersons[0].person).toBe("三叔公");
        expect(report.topPersons[0].inAmount).toBe(3000);
        expect(report.topPersons[0].outAmount).toBe(800);
        expect(report.topPersons[0].net).toBe(2200);

        // 小李: 1000 + 2000 = 3000 (排第 2)
        expect(report.topPersons[1].person).toBe("小李");
    });

    it("formatFavorsReportText 生成格式化简报文本", () => {
        const report = buildFavorsReport(rows, cols, 2026);
        const text = formatFavorsReportText(report, (cat) => cat === "wedding" ? "婚嫁喜事" : cat);
        expect(text).toContain("【2026 年度人情往来简报】");
        expect(text).toContain("· 收礼总额：¥4,000 (2 笔)");
        expect(text).toContain("· 送礼总额：¥3,800 (3 笔)");
        expect(text).toContain("· 净人情差额：+¥200 (净盈余)");
        expect(text).toContain("三叔公");
    });
});
