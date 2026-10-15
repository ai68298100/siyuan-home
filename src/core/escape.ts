/**
 * 用户输入内容与面板渲染 HTML 安全转义（SEC-01 / §19 安全加固）：
 * 统一收口 XSS 防护，确保所有用户输入的台账行名称、备注、诊断、成员名在拼接 HTML 时得到严密转义。
 * 纯函数、零外部依赖、本地执行。
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "`": "&#96;",
};

const HTML_ESCAPE_REGEX = /[&<>"'`]/g;

/**
 * 转义任意文本中的 HTML 敏感字符
 */
export function escapeHtml(input: unknown): string {
    if (input === null || input === undefined) return "";
    const str = typeof input === "string" ? input : String(input);
    if (!str) return "";
    return str.replace(HTML_ESCAPE_REGEX, (match) => HTML_ESCAPE_MAP[match] ?? match);
}

/**
 * 属性值转义并收敛空白
 */
export function escapeAttr(input: unknown): string {
    return escapeHtml(input).replace(/[\r\n\t]/g, " ");
}

/**
 * 净化用户输入的单行或短文本（剥离控制字符并转义）
 */
export function sanitizeUserText(input: unknown): string {
    if (input === null || input === undefined) return "";
    const str = typeof input === "string" ? input : String(input);
    // 过滤 ASCII 0-31 控制字符（保留换行与制表符）
    const stripped = str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    return escapeHtml(stripped.trim());
}
