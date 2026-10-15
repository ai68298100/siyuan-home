/**
 * 单条记录脱敏格式化（MOD-04 / §17 详情复制脱敏）：
 * 提供用于复制、分享场景的文本脱敏转换。
 * 覆盖证件号、手机号、银行卡/保单号、邮箱、密码口令等敏感信息，支持精确 key 白名单及通用正则特征启发识别。
 */

import { maskCredentialNumber, maskIdNumber } from "./idcard";

const CREDENTIAL_KEYS = new Set([
    "holder_no",
    "x_cert_birth_registration_no_last4",
    "x_cert_vocational_registration_last4",
    "x_cert_professional_registration_last4",
    "x_cert_graduation_no_last4",
    "x_cert_degree_no_last4",
]);

const SECRET_KEYS = new Set([
    "password",
    "pin",
    "secret",
    "token",
    "security_code",
    "cvv",
]);

const PHONE_KEYS = new Set([
    "phone",
    "mobile",
    "tel",
    "emergency_phone",
    "contact_phone",
]);

const CARD_KEYS = new Set([
    "card_no",
    "bank_card",
    "bank_account",
    "account_no",
    "policy_no",
]);

/**
 * 对单元格文本值进行脱敏转换
 */
export function desensitizeValue(key: string | undefined, value: string): string {
    if (!value || value === "—") return value;
    const str = String(value).trim();
    if (!str) return value;

    const lowerKey = (key ?? "").toLowerCase();

    // 1. 密码/密钥/PIN
    if (SECRET_KEYS.has(lowerKey)) {
        return "******";
    }

    // 2. 居民身份证
    if (lowerKey === "x_cert_id_number" || /^\d{17}[\dX]$/i.test(str)) {
        return maskIdNumber(str);
    }

    // 3. 通用证件与登记证书号
    if (CREDENTIAL_KEYS.has(lowerKey)) {
        return maskCredentialNumber(str);
    }

    // 4. 手机与电话
    if (PHONE_KEYS.has(lowerKey) || /^1[3-9]\d{9}$/.test(str)) {
        if (/^1[3-9]\d{9}$/.test(str)) {
            return `${str.slice(0, 3)}****${str.slice(7)}`;
        }
        if (str.length >= 7) {
            return `${str.slice(0, 3)}****${str.slice(-4)}`;
        }
        return maskCredentialNumber(str);
    }

    // 5. 银行卡/账号/保单号
    if (CARD_KEYS.has(lowerKey)) {
        if (str.length > 8) {
            return `${str.slice(0, 4)}****${str.slice(-4)}`;
        }
        return maskCredentialNumber(str);
    }

    // 6. 邮箱启发识别
    if (lowerKey === "email" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
        const atIdx = str.indexOf("@");
        if (atIdx > 0) {
            const user = str.slice(0, atIdx);
            const domain = str.slice(atIdx);
            if (user.length <= 2) {
                return `${user[0]}*${domain}`;
            }
            return `${user[0]}***${user.slice(-1)}${domain}`;
        }
    }

    return str;
}

export interface DesensitizedRecordField {
    key?: string;
    label: string;
    value: string;
}

/**
 * 将整条台账记录格式化为脱敏多行文本，供剪贴板分享使用
 */
export function formatDesensitizedRecord(title: string, rows: DesensitizedRecordField[]): string {
    const lines = rows.map((r) => {
        const masked = desensitizeValue(r.key, r.value);
        return `${r.label}：${masked}`;
    });
    return `${title}（已脱敏）\n${lines.join("\n")}`;
}
