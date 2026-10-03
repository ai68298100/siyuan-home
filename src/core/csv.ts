/**
 * CSV 导出纯逻辑（第八十四轮自组件抽出可单测）：RFC 4180 转义 + UTF-8 BOM + CRLF 行结束。
 * 组件侧只负责表头文案（i18n/列键回退）与单元格取文本。
 */

/** RFC 4180 转义：含 逗号/引号/换行 任一则整体加引号，内部引号翻倍 */
export function csvEscape(v: string): string {
    return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** 组装 CSV 文件内容：表头 + 数据行，CRLF 行结束，前缀 UTF-8 BOM（Excel 兼容） */
export function buildCsv(head: string[], rows: string[][]): string {
    const lines = [head.map(csvEscape), ...rows.map((r) => r.map(csvEscape))];
    return "\uFEFF" + lines.map((l) => l.join(",")).join("\r\n");
}
