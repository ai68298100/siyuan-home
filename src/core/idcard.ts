/**
 * 居民身份证号码解析与校验（GB 11643-1999，18 位）。
 * 纯函数、本地计算、零网络——识别即校验：行政区划 → 出生日期 → 顺序码 → ISO 7064 MOD 11-2 校验位。
 * 15 位旧证号不在支持范围（升位需补行政区划历史表，收益低），明确报不支持。
 */

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECK_DIGITS = "10X98765432";
/** 省级行政区划代码首位段（GB/T 2260 一级，命中 11–65 的省级前缀即认） */
const PROVINCE_PREFIXES = new Set([
    "11", "12", "13", "14", "15",
    "21", "22", "23",
    "31", "32", "33", "34", "35", "36", "37",
    "41", "42", "43", "44", "45", "46",
    "50", "51", "52", "53", "54",
    "61", "62", "63", "64", "65",
]);

export interface ParsedIdNumber {
    ok: boolean;
    /** 失败原因（本地化键的参数侧由调用方拼接，这里返回稳定英文键） */
    reason?: "format" | "region" | "birth" | "checksum";
    /** 归一化后的号码（去空格、X 大写） */
    number?: string;
    /** 出生日期（yyyy-MM-dd，自号码 7–14 位） */
    birth?: string;
    /** 性别（自顺序码第 17 位奇偶） */
    sex?: "male" | "female";
    /** 省级行政区划代码（前两位） */
    region?: string;
}

/** 校验位计算（对 17 位本体）——导出供测试与升位工具复用 */
export function idCheckDigit(body17: string): string {
    let sum = 0;
    for (let i = 0; i < 17; i++) sum += Number(body17[i]) * WEIGHTS[i];
    return CHECK_DIGITS[sum % 11];
}

/** 18 位居民身份证号码解析；非大陆格式（护照/港澳台等）返回 ok=false + reason=format，调用方按普通文本放行 */
export function parseIdNumber(input: string): ParsedIdNumber {
    const id = String(input ?? "").trim().toUpperCase().replace(/\s+/g, "");
    if (!/^\d{17}[\dX]$/.test(id)) return { ok: false, reason: "format" };
    const region = id.slice(0, 2);
    if (!PROVINCE_PREFIXES.has(region)) return { ok: false, reason: "region", number: id };
    const birth = `${id.slice(6, 10)}-${id.slice(10, 12)}-${id.slice(12, 14)}`;
    const bd = new Date(`${birth}T00:00:00`);
    if (Number.isNaN(bd.getTime()) || bd.getFullYear() !== Number(id.slice(6, 10)) || bd.getMonth() + 1 !== Number(id.slice(10, 12)) || bd.getDate() !== Number(id.slice(12, 14))) {
        return { ok: false, reason: "birth", number: id };
    }
    if (bd.getTime() > Date.now()) return { ok: false, reason: "birth", number: id };
    if (idCheckDigit(id.slice(0, 17)) !== id[17]) return { ok: false, reason: "checksum", number: id };
    const seq = Number(id.slice(14, 17));
    if (seq === 0) return { ok: false, reason: "format", number: id };
    return { ok: true, number: id, birth, sex: seq % 2 === 1 ? "male" : "female", region };
}

/** 展示掩码：保留前 6（行政区划可读）与后 4，中间以 * 遮蔽——表格/抽屉默认态用 */
export function maskIdNumber(input: string): string {
    const id = String(input ?? "").trim();
    if (id.length < 10) return id.replace(/./g, "*");
    return `${id.slice(0, 6)}${"*".repeat(id.length - 10)}${id.slice(-4)}`;
}

/**
 * 展示证件类通用编号的掩码。证件号在存储和编辑时保留完整内容，
 * 列表/详情默认只露出少量首尾字符，避免侧窥泄露。
 */
export function maskCredentialNumber(input: string): string {
    const value = String(input ?? "").trim();
    if (!value) return "";
    if (value.length <= 4) return "*".repeat(value.length);
    if (value.length <= 8) return `${value.slice(0, 2)}${"*".repeat(value.length - 4)}${value.slice(-2)}`;
    return `${value.slice(0, 2)}${"*".repeat(value.length - 6)}${value.slice(-4)}`;
}
