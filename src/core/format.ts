import { maskIdNumber, maskCredentialNumber } from "@/core/idcard";

/**
 * 金额显示格式化（提案 B/210 波，定案实施）：千分位分隔 + 最多两位小数（去尾零）。
 * 仅抽屉 kv 显示层使用——CSV/导入保持机器可读原始值；不加币种符号（多币种不猜货币）。
 * 范围白名单：字段字典中"金额语义"列的 key——其他数字列（year/rating 等）绝不误伤。
 */
export const AMOUNT_KEYS: ReadonlySet<string> = new Set([
    "amount", "price", "refund_amount", "deposit", "target_amount",
]);

export function formatAmount(n: number): string {
    if (!Number.isFinite(n)) return "—";
    // Avoid multiplying very large values into Infinity and keep diagnostic
    // cards usable when imported data contains an accidental huge amount.
    if (Math.abs(n) >= 1e15) return n.toExponential(4).replace(/\.?(0+)e/, "e");
    const rounded = Math.round(n * 100) / 100;
    const [int, dec] = String(rounded).split(".");
    const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return dec ? `${intFmt}.${dec}` : intFmt;
}

/** 枚举值 → i18n 标签（211 波抽核心可单测）：field.<colKey>.opt.<value> 族；
 * 缺键回退原值（schema 新增选项先于翻译上线时不裸键）。t 由调用方注入——核心层无 i18n 依赖。 */
export function optLabel(t: (k: string) => string, colKey: string, value: string): string {
    if (!value || value === "—") return value;
    const k = `field.${colKey}.opt.${value}`;
    const label = t(k);
    return label === k ? value : label;
}

/** mSelect 串（、分隔）逐值翻译 */
export function optLabelText(t: (k: string) => string, colKey: string, joined: string): string {
    if (!joined || joined === "—") return joined;
    return joined.split("、").map((x) => optLabel(t, colKey, x)).join("、");
}

/** 成员头像稳定色相（0-359）：id 哈希 → 同一成员恒定色相（总览 chips / 成员卡共用） */
export function memberHue(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return h;
}

export const SENSITIVE_ID_KEYS: ReadonlySet<string> = new Set([
    "x_cert_id_number",
]);

export const SENSITIVE_CREDENTIAL_KEYS: ReadonlySet<string> = new Set([
    "holder_no",
    "x_cert_birth_registration_no_last4",
    "x_cert_vocational_registration_last4",
    "x_cert_professional_registration_last4",
    "x_cert_graduation_no_last4",
    "x_cert_degree_no_last4",
]);

/** 手机号/电话正则（脱敏中间 4 位） */
const PHONE_REGEX = /(?:(?:\+|00)86)?1[3-9]\d{9}/g;
/** 邮箱正则（脱敏用户名后半部分） */
const EMAIL_REGEX = /([a-zA-Z0-9_.+-]+)@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g;

/** 对单列字段值按敏感类型执行脱敏遮罩 */
export function maskSensitiveFieldValue(key: string | undefined, value: string): string {
    if (!value || value === "—") return value;
    const trimmed = value.trim();
    if (key && SENSITIVE_ID_KEYS.has(key)) {
        return maskIdNumber(trimmed);
    }
    if (key && SENSITIVE_CREDENTIAL_KEYS.has(key)) {
        return maskCredentialNumber(trimmed);
    }
    // 若原内容已包含脱敏星号，直接保留
    if (trimmed.includes("*")) return trimmed;

    // 手机号脱敏（前 3 后 4，中间 4 位星号）
    let masked = trimmed.replace(PHONE_REGEX, (phone) => {
        const digits = phone.slice(-11);
        const prefix = phone.slice(0, -11);
        return `${prefix}${digits.slice(0, 3)}****${digits.slice(7)}`;
    });

    // 邮箱脱敏（保留用户名首字符或前两位，其余替换为 ***）
    masked = masked.replace(EMAIL_REGEX, (_match, user, domain) => {
        const visible = user.length <= 2 ? user[0] : user.slice(0, 2);
        return `${visible}***@${domain}`;
    });

    return masked;
}

/** 格式化整条记录为脱敏文本（用于安全复制分享） */
export function formatMaskedRecordText(
    title: string,
    rows: Array<{ key?: string; label: string; value: string }>,
): string {
    const lines = rows.map((r) => {
        const maskedVal = maskSensitiveFieldValue(r.key, r.value);
        return `${r.label}: ${maskedVal}`;
    });
    return title ? `${title}\n${lines.join("\n")}` : lines.join("\n");
}

