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
