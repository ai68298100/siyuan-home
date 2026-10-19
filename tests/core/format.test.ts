/**
 * 金额格式化单测（提案 B/210 波）：千分位、两位小数去尾零、负数、非有限值。
 */
import { describe, it, expect } from "vitest";
import {
    AMOUNT_KEYS,
    formatAmount,
    optLabel,
    optLabelText,
    maskSensitiveFieldValue,
    formatMaskedRecordText,
} from "@/core/format";

const zh: Record<string, string> = {
    "field.category.opt.food_st": "食品",
    "field.direction.opt.in": "收",
    "field.direction.opt.out": "支",
};
const t = (k: string) => zh[k] ?? k;

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

    it("非有限值和极大数不会渲染 Infinity 或撑破卡片", () => {
        expect(formatAmount(Number.NaN)).toBe("—");
        expect(formatAmount(Number.POSITIVE_INFINITY)).toBe("—");
        expect(formatAmount(Number.MAX_VALUE)).toMatch(/^1\.7977e\+308$/);
    });

    it("白名单含五个金额语义 key；非金额 key 不在册", () => {
        for (const k of ["amount", "price", "refund_amount", "deposit", "target_amount"]) {
            expect(AMOUNT_KEYS.has(k)).toBe(true);
        }
        expect(AMOUNT_KEYS.has("year")).toBe(false);
        expect(AMOUNT_KEYS.has("rating")).toBe(false);
    });
});

describe("optLabel / optLabelText（211 波：枚举值 i18n）", () => {
    it("命中键 → 标签；缺键 → 原值回退（schema 新选项先于翻译上线不裸键）", () => {
        expect(optLabel(t, "category", "food_st")).toBe("食品");
        expect(optLabel(t, "category", "future_opt")).toBe("future_opt");
    });

    it("空值与 — 原样透传", () => {
        expect(optLabel(t, "category", "")).toBe("");
        expect(optLabel(t, "category", "—")).toBe("—");
    });

    it("mSelect 串逐值翻译；非分隔串原样", () => {
        expect(optLabelText(t, "direction", "in、out")).toBe("收、支");
        expect(optLabelText(t, "direction", "—")).toBe("—");
        expect(optLabelText(t, "direction", "")).toBe("");
    });
});

describe("maskSensitiveFieldValue & formatMaskedRecordText（脱敏文本复制）", () => {
    it("身份证号列按 18 位规则脱敏（保留前 6 后 4）", () => {
        expect(maskSensitiveFieldValue("x_cert_id_number", "110101199003072345"))
            .toBe("110101********2345");
    });

    it("证件号列按通用编号规则脱敏", () => {
        expect(maskSensitiveFieldValue("holder_no", "EB12345678"))
            .toBe("EB****5678");
    });

    it("文本中包含手机号时脱敏中间 4 位", () => {
        expect(maskSensitiveFieldValue("contact", "联系电话：13812345678"))
            .toBe("联系电话：138****5678");
        expect(maskSensitiveFieldValue("emergency_phone", "+8613987654321"))
            .toBe("+86139****4321");
    });

    it("文本中包含邮箱时脱敏用户名后半部分", () => {
        expect(maskSensitiveFieldValue("email", "support@example.com"))
            .toBe("su***@example.com");
    });

    it("空值、横杠或已有掩码保持原样", () => {
        expect(maskSensitiveFieldValue(undefined, "—")).toBe("—");
        expect(maskSensitiveFieldValue(undefined, "")).toBe("");
        expect(maskSensitiveFieldValue("holder_no", "G1****5678")).toBe("G1****5678");
    });

    it("formatMaskedRecordText 输出标题与逐行脱敏键值", () => {
        const rows = [
            { key: "name", label: "姓名", value: "张三" },
            { key: "x_cert_id_number", label: "身份证号", value: "110101199003072345" },
            { key: "phone", label: "联系电话", value: "13800001111" },
            { label: "备注", value: "紧急联系人：13911112222" },
        ];
        const res = formatMaskedRecordText("张三的证件档案", rows);
        expect(res).toBe([
            "张三的证件档案",
            "姓名: 张三",
            "身份证号: 110101********2345",
            "联系电话: 138****1111",
            "备注: 紧急联系人：139****2222",
        ].join("\n"));
    });
});

