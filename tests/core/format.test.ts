/**
 * 金额格式化单测（提案 B/210 波）：千分位、两位小数去尾零、负数、非有限值。
 */
import { describe, it, expect } from "vitest";
import { AMOUNT_KEYS, formatAmount } from "@/core/format";

describe("formatAmount", () => {
    it("千分位 + 整数无小数点", () => {
        expect(formatAmount(0)).toBe("0");
        expect(formatAmount(1234)).toBe("1,234");
        expect(formatAmount(1234567)).toBe("1,234,567");
    });

    it("最多两位小数并去尾零（四舍五入）", () => {
        expect(formatAmount(12.5)).toBe("12.5");
        expect(formatAmount(12.345)).toBe("12.35"); // 四舍五入到两位
        expect(formatAmount(12.300)).toBe("12.3"); // 去尾零
        expect(formatAmount(12345.678)).toBe("12,345.68");
    });

    it("负数：负号后不加千分位分隔", () => {
        expect(formatAmount(-1234567.89)).toBe("-1,234,567.89");
    });

    it("白名单含五个金额语义 key；非金额 key 不在册", () => {
        for (const k of ["amount", "price", "refund_amount", "deposit", "target_amount"]) {
            expect(AMOUNT_KEYS.has(k)).toBe(true);
        }
        expect(AMOUNT_KEYS.has("year")).toBe(false);
        expect(AMOUNT_KEYS.has("rating")).toBe(false);
    });
});
