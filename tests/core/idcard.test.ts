import { describe, expect, it } from "vitest";
import { idCheckDigit, maskIdNumber, parseIdNumber } from "../../src/core/idcard";

/** 构造一个校验位合法的测试号码（避免使用真实存在者的号码） */
function makeValidId(overrides?: { region?: string; birth?: string; seq?: string }): string {
    const region = overrides?.region ?? "110101";
    const birth = overrides?.birth ?? "19900908";
    const seq = overrides?.seq ?? "001"; // 顺序码第 17 位奇数 → 男
    const body = `${region}${birth}${seq}`;
    return body + idCheckDigit(body);
}

describe("parseIdNumber（GB 11643 校验识别）", () => {
    it("合法号码：校验通过并解析出出生/性别/区划", () => {
        const r = parseIdNumber(makeValidId());
        expect(r.ok).toBe(true);
        expect(r.birth).toBe("1990-09-08");
        expect(r.sex).toBe("male");
        expect(r.region).toBe("11");
        // 女（顺序码偶数）
        const f = parseIdNumber(makeValidId({ seq: "050" })); // 末位偶 → 女
        expect(f.sex).toBe("female");
    });

    it("小写 x 校验位归一化为大写后通过", () => {
        // 构造一个校验位为 X 的号码（不是真实号码）：小写输入应被解析器归一化接受
        const id = "11010119900908019X";
        expect(idCheckDigit(id.slice(0, 17))).toBe("X");
        const lower = id.toLowerCase();
        expect(parseIdNumber(lower).ok).toBe(true);
        expect(parseIdNumber(lower).number).toBe(id);
    });

    it("格式：非 18 位 / 非法字符 / 15 位旧号 → format 不支持", () => {
        expect(parseIdNumber("12345").reason).toBe("format");
        expect(parseIdNumber(makeValidId().slice(0, 15)).reason).toBe("format");
        expect(parseIdNumber(makeValidId().slice(0, 17) + "G").reason).toBe("format");
        expect(parseIdNumber("").reason).toBe("format");
    });

    it("区划：省级前缀不存在 → region", () => {
        expect(parseIdNumber(makeValidId({ region: "990101" })).reason).toBe("region");
    });

    it("出生日期：2 月 30 日 / 未来日期 → birth", () => {
        expect(parseIdNumber(makeValidId({ birth: "19900230" })).reason).toBe("birth");
        const future = new Date(Date.now() + 365 * 86400000);
        const fb = `${future.getFullYear()}${String(future.getMonth() + 1).padStart(2, "0")}${String(future.getDate()).padStart(2, "0")}`;
        expect(parseIdNumber(makeValidId({ birth: fb })).reason).toBe("birth");
    });

    it("校验位：改动一位 → checksum", () => {
        const id = makeValidId();
        const flipped = id.slice(0, 17) + (id[17] === "0" ? "1" : "0");
        expect(parseIdNumber(flipped).reason).toBe("checksum");
    });

    it("idCheckDigit：已知向量（GB 标准示例推导自洽）", () => {
        // 自洽性：任意 17 位本体算出的校验位放回后 parseIdNumber 必须 ok
        for (const body of ["11010119900908002", "44030119800101001", "33010619700101002"]) {
            expect(parseIdNumber(body + idCheckDigit(body)).ok).toBe(true);
        }
    });
});

describe("maskIdNumber（展示掩码）", () => {
    it("保留前 6 后 4，中间掩蔽", () => {
        expect(maskIdNumber("110101199009080021")).toBe("110101********0021");
    });
    it("过短串全掩蔽（不泄结构）", () => {
        expect(maskIdNumber("1234")).toBe("****");
    });
    it("空串安全", () => {
        expect(maskIdNumber("")).toBe("");
    });
});
