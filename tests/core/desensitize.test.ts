import { describe, expect, it } from "vitest";
import { desensitizeValue, formatDesensitizedRecord } from "../../src/core/desensitize";

describe("desensitizeValue (MOD-04 单条记录脱敏转换)", () => {
    it("空值或占位符保持原样", () => {
        expect(desensitizeValue("phone", "")).toBe("");
        expect(desensitizeValue("phone", "—")).toBe("—");
        expect(desensitizeValue(undefined, "")).toBe("");
    });

    it("密码与安全凭证直接遮蔽为 ******", () => {
        expect(desensitizeValue("password", "MyPassword123")).toBe("******");
        expect(desensitizeValue("pin", "1234")).toBe("******");
        expect(desensitizeValue("token", "secret_token_abc")).toBe("******");
    });

    it("身份证号码脱敏：保留前6与后4位", () => {
        expect(desensitizeValue("x_cert_id_number", "110101199003072345")).toBe("110101********2345");
        // 正则启发识别（无 key 或未知 key）
        expect(desensitizeValue("custom_col", "110101199003072345")).toBe("110101********2345");
    });

    it("证件号/准驾车型号等通用编号脱敏", () => {
        expect(desensitizeValue("holder_no", "粤B1234567")).toBe("粤B***4567");
        expect(desensitizeValue("x_cert_graduation_no_last4", "202306010099")).toBe("20******0099");
    });

    it("11位手机号码脱敏：前3后4，中间4位星号", () => {
        expect(desensitizeValue("phone", "13800138000")).toBe("138****8000");
        expect(desensitizeValue("custom_tel", "13912345678")).toBe("139****5678");
    });

    it("银行卡/账号脱敏", () => {
        expect(desensitizeValue("bank_card", "6222021234567890123")).toBe("6222****0123");
    });

    it("邮箱脱敏", () => {
        expect(desensitizeValue("email", "john.doe@example.com")).toBe("j***e@example.com");
        expect(desensitizeValue("email", "ab@example.com")).toBe("a*@example.com");
    });

    it("普通字段（如姓名、金额、备注）不被误伤", () => {
        expect(desensitizeValue("name", "李小明")).toBe("李小明");
        expect(desensitizeValue("amount", "128.50")).toBe("128.50");
        expect(desensitizeValue("note", "家中备用钥匙")).toBe("家中备用钥匙");
    });
});

describe("formatDesensitizedRecord", () => {
    it("整条记录格式化为带已脱敏标题的多行文本", () => {
        const rows = [
            { key: "name", label: "证件名称", value: "居民身份证" },
            { key: "x_cert_id_number", label: "证件号码", value: "110101199003072345" },
            { key: "phone", label: "关联手机", value: "13800138000" },
            { key: "note", label: "备注", value: "常备证件" },
        ];
        const res = formatDesensitizedRecord("李小明的身份证", rows);
        expect(res).toContain("李小明的身份证（已脱敏）");
        expect(res).toContain("证件名称：居民身份证");
        expect(res).toContain("证件号码：110101********2345");
        expect(res).toContain("关联手机：138****8000");
        expect(res).toContain("备注：常备证件");
    });
});
