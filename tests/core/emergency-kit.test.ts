import { describe, it, expect } from "vitest";
import {
    parseEmergencyKitItems,
    mapEmergencyKitToStockRows,
    formatEmergencyKitReportText,
} from "@/core/emergency-kit";

describe("core/emergency-kit 应急物资清单与囤货联动（302波）", () => {
    describe("parseEmergencyKitItems", () => {
        it("默认从内置 emergency-kit.tpl 解析全部基础条目", () => {
            const items = parseEmergencyKitItems();
            expect(items.length).toBeGreaterThanOrEqual(15);

            const flashlight = items.find((i) => i.name.includes("手电筒"));
            expect(flashlight).toBeDefined();
            expect(flashlight?.section).toBe("应急工具与防护");

            const water = items.find((i) => i.name.includes("饮用水"));
            expect(water).toBeDefined();
            expect(water?.section).toBe("应急饮水与食品");
            expect(water?.note).toContain("储备3天");
        });

        it("解析自定义 Markdown 清单内容", () => {
            const customMd = `
## 应急药具
- [ ] 碘伏消毒液 (500ml)
- [x] 医用无菌纱布
`;
            const items = parseEmergencyKitItems(customMd);
            expect(items).toHaveLength(2);
            expect(items[0]).toEqual({
                name: "碘伏消毒液",
                section: "应急药具",
                note: "500ml",
                checked: false,
            });
            expect(items[1].checked).toBe(true);
        });

        it("空文本稳健回退为空数组", () => {
            expect(parseEmergencyKitItems("")).toEqual([]);
        });
    });

    describe("mapEmergencyKitToStockRows", () => {
        it("正确将应急物资映射为待新建 stock 行，已存在的条目自动跳过", () => {
            const items = [
                { name: "应急手电筒", section: "工具", checked: true },
                { name: "瓶装饮用水", section: "食品", checked: false },
                { name: "灭火器", section: "工具", checked: false },
            ];

            const existing = ["瓶装饮用水"];
            const { newRows, skippedCount } = mapEmergencyKitToStockRows(items, existing);

            expect(skippedCount).toBe(1);
            expect(newRows).toHaveLength(2);
            expect(newRows[0]).toEqual({
                name: "应急手电筒",
                category: "emergency_st",
                qty: 1,
                low_stock_at: 1,
                note: "[工具]",
            });
            expect(newRows[1].name).toBe("灭火器");
            expect(newRows[1].qty).toBe(0);
        });

        it("批内重复条目自动去重", () => {
            const items = [
                { name: "救生绳", section: "工具" },
                { name: "救生绳", section: "重复项" },
            ];
            const { newRows, skippedCount } = mapEmergencyKitToStockRows(items);
            expect(newRows).toHaveLength(1);
            expect(skippedCount).toBe(1);
        });
    });

    describe("formatEmergencyKitReportText", () => {
        it("生成包含缺口与已备齐条目的格式化自查文本", () => {
            const items = [
                { name: "应急手电筒", section: "工具", checked: true },
                { name: "救生绳", section: "工具", checked: false },
            ];
            const text = formatEmergencyKitReportText(items, ["应急手电筒"]);
            expect(text).toContain("家庭应急物资储备自查报告");
            expect(text).toContain("已备足 1 项");
            expect(text).toContain("缺口 1 项");
            expect(text).toContain("救生绳");
        });
    });
});
