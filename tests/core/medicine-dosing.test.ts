import { describe, it, expect } from "vitest";
import {
    parseDosingInstructions,
    calculateMedicineSupply,
    evaluateMedicineSupplyReport,
    formatMedicineSupplyReportText,
    diffCalendarDays,
    addDaysToDate,
} from "@/core/medicine-dosing";
import type { AvRow } from "@/core/siyuan";

describe("core/medicine-dosing 家庭用药剂量追踪与断药预警（298波）", () => {
    describe("diffCalendarDays & addDaysToDate 日期工具纯函数", () => {
        it("正确计算相隔天数与累加日期", () => {
            expect(diffCalendarDays("2026-10-30", "2026-10-20")).toBe(10);
            expect(addDaysToDate("2026-10-20", 10)).toBe("2026-10-30");
            expect(addDaysToDate("2026-10-30", 5)).toBe("2026-11-04");
        });
    });

    describe("parseDosingInstructions 医嘱文本智能解析", () => {
        it("解析早晚各 X 粒/片", () => {
            const res = parseDosingInstructions("早晚各1粒，饭后温水送服");
            expect(res).toBeDefined();
            expect(res?.timesPerDay).toBe(2);
            expect(res?.amountPerTime).toBe(1);
            expect(res?.unit).toBe("粒");
            expect(res?.dailyConsumption).toBe(2);
        });

        it("解析一日 X 次，每次 Y 片", () => {
            const res = parseDosingInstructions("一日3次，每次2片");
            expect(res).toBeDefined();
            expect(res?.timesPerDay).toBe(3);
            expect(res?.amountPerTime).toBe(2);
            expect(res?.unit).toBe("片");
            expect(res?.dailyConsumption).toBe(6);
        });

        it("解析每日一次，每次 10ml", () => {
            const res = parseDosingInstructions("每日一次，每次10ml");
            expect(res).toBeDefined();
            expect(res?.timesPerDay).toBe(1);
            expect(res?.amountPerTime).toBe(10);
            expect(res?.unit).toBe("ml");
            expect(res?.dailyConsumption).toBe(10);
        });

        it("解析每 8 小时一次，每次 1 粒", () => {
            const res = parseDosingInstructions("每8小时一次，每次1粒");
            expect(res).toBeDefined();
            expect(res?.timesPerDay).toBe(3);
            expect(res?.amountPerTime).toBe(1);
            expect(res?.dailyConsumption).toBe(3);
        });

        it("解析隔日一次", () => {
            const res = parseDosingInstructions("隔日一次，每次服1片");
            expect(res).toBeDefined();
            expect(res?.timesPerDay).toBe(0.5);
            expect(res?.dailyConsumption).toBe(0.5);
        });

        it("未识别出有效用量格式返回 undefined", () => {
            expect(parseDosingInstructions("外用涂抹患处")).toBeUndefined();
            expect(parseDosingInstructions("")).toBeUndefined();
        });
    });

    describe("calculateMedicineSupply 剩余药量可用天数推算与倒挂判定", () => {
        const today = "2026-10-20";

        it("库存为 0 判定缺药", () => {
            const res = calculateMedicineSupply(0, undefined, { today });
            expect(res.status).toBe("out_of_stock");
            expect(res.daysRemaining).toBe(0);
        });

        it("库存充足推算可用天数与耗尽日期", () => {
            const dosing = {
                timesPerDay: 2,
                amountPerTime: 1,
                unit: "片",
                dailyConsumption: 2,
                raw: "早晚各1片",
            };
            // 库存 60 片，每日 2 片 -> 30 天可用 -> 2026-11-19 耗尽
            const res = calculateMedicineSupply(60, dosing, {
                today,
                expiryDate: "2027-10-20",
            });

            expect(res.daysRemaining).toBe(30);
            expect(res.estimatedRunoutDate).toBe("2026-11-19");
            expect(res.status).toBe("warning"); // <= 30天为预警
            expect(res.isExpiringBeforeRunout).toBe(false);
        });

        it("效期早于耗尽日判定效期倒挂", () => {
            const dosing = {
                timesPerDay: 1,
                amountPerTime: 1,
                unit: "片",
                dailyConsumption: 1,
                raw: "每日1片",
            };
            // 库存 100 片（可用 100 天），但 20 天后就过期（2026-11-09）
            const res = calculateMedicineSupply(100, dosing, {
                today,
                expiryDate: "2026-11-09",
            });

            expect(res.daysRemaining).toBe(100);
            expect(res.daysUntilExpiry).toBe(20);
            expect(res.isExpiringBeforeRunout).toBe(true);
        });
    });

    describe("evaluateMedicineSupplyReport 批量报表与格式化简报", () => {
        const today = "2026-10-20";
        const cols = {
            name: "col_name",
            stock_qty: "col_stock",
            expiry: "col_expiry",
            note: "col_note",
        };

        const rows: AvRow[] = [
            // 1. 紧迫断药（库存 5 片，日服 2 片 -> 2 天）
            {
                id: "m1",
                cells: {
                    col_name: { text: { content: "缬沙坦氨氯地平片" } },
                    col_stock: { number: { isNotEmpty: true, content: 5 } },
                    col_note: { text: { content: "早晚各1粒" } },
                },
            },
            // 2. 缺药（库存 0）
            {
                id: "m2",
                cells: {
                    col_name: { text: { content: "阿莫西林胶囊" } },
                    col_stock: { number: { isNotEmpty: true, content: 0 } },
                },
            },
            // 3. 效期倒挂（库存 60 片，日服 1 片 -> 60 天，但 15 天后到期）
            {
                id: "m3",
                cells: {
                    col_name: { text: { content: "复合维生素咀嚼片" } },
                    col_stock: { number: { isNotEmpty: true, content: 60 } },
                    col_expiry: { text: { content: "2026-11-04" } }, // 15 天到期
                    col_note: { text: { content: "每日一次，每次1片" } },
                },
            },
        ];

        it("准确汇总各类指标并排序", () => {
            const report = evaluateMedicineSupplyReport(rows, cols, { today });

            expect(report.totalActiveCount).toBe(3);
            expect(report.outOfStockCount).toBe(1);
            expect(report.criticalCount).toBe(1); // 2 天 <= 7 天
            expect(report.expiringBeforeRunoutCount).toBe(1);

            // 缺药和紧迫排前
            expect(report.items[0].name).toBe("阿莫西林胶囊");
            expect(report.items[1].name).toBe("缬沙坦氨氯地平片");
            expect(report.items[2].name).toBe("复合维生素咀嚼片");
        });

        it("格式化简报文本包含关键预警信息", () => {
            const report = evaluateMedicineSupplyReport(rows, cols, { today });
            const text = formatMedicineSupplyReportText(report);

            expect(text).toContain("【用药供给预警】");
            expect(text).toContain("缺药/紧迫:2");
            expect(text).toContain("先过期");
            expect(text).toContain("缬沙坦氨氯地平片");
        });
    });
});
