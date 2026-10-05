/**
 * 金额显示格式化（提案 B/210 波，定案实施）：千分位分隔 + 最多两位小数（去尾零）。
 * 仅抽屉 kv 显示层使用——CSV/导入保持机器可读原始值；不加币种符号（多币种不猜货币）。
 * 范围白名单：字段字典中"金额语义"列的 key——其他数字列（year/rating 等）绝不误伤。
 */
export const AMOUNT_KEYS: ReadonlySet<string> = new Set([
    "amount", "price", "refund_amount", "deposit", "target_amount",
]);

export function formatAmount(n: number): string {
    if (!Number.isFinite(n)) return String(n);
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
