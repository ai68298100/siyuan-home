/**
 * 书签链接健康巡检（MOD-23 / §17 line 510 Raindrop 印证）：
 * 对 bookmarks 台账的网址列执行格式、协议与合法性静态校验，
 * 筛查空链接、非 HTTP/HTTPS 协议与非法 URL 结构。
 * 纯函数、零网络副作用、本地执行。
 */

export type UrlValidationStatus = "valid" | "empty" | "invalid_protocol" | "malformed";

export interface UrlValidationResult {
    status: UrlValidationStatus;
    normalized?: string;
    reason?: string;
}

/**
 * 校验单条书签 URL 格式与协议
 */
export function validateBookmarkUrl(rawUrl: unknown): UrlValidationResult {
    if (rawUrl === null || rawUrl === undefined) {
        return { status: "empty", reason: "URL 为空" };
    }
    const str = typeof rawUrl === "string" ? rawUrl.trim() : String(rawUrl).trim();
    if (!str || str === "—") {
        return { status: "empty", reason: "URL 为空" };
    }

    if (!/^https?:\/\//i.test(str)) {
        return { status: "invalid_protocol", reason: "缺少 http:// 或 https:// 协议头" };
    }

    try {
        const parsed = new URL(str);
        if (!parsed.hostname || !parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
            return { status: "malformed", reason: "域名主机名不完整" };
        }
        return { status: "valid", normalized: parsed.href };
    } catch {
        return { status: "malformed", reason: "URL 语法不合法" };
    }
}

export interface BookmarkItemIssue {
    id: string;
    name: string;
    url: string;
    status: UrlValidationStatus;
    reason: string;
}

export interface BookmarkHealthSummary {
    totalCount: number;
    validCount: number;
    issueCount: number;
    emptyCount: number;
    invalidProtocolCount: number;
    malformedCount: number;
    issues: BookmarkItemIssue[];
}

/**
 * 批量巡检书签台账行健康状况
 */
export function checkBookmarkHealth(
    rows: any[],
    columns: { name?: string; url?: string },
): BookmarkHealthSummary {
    const nameCol = columns.name ?? "name";
    const urlCol = columns.url ?? "url";

    let validCount = 0;
    let emptyCount = 0;
    let invalidProtocolCount = 0;
    let malformedCount = 0;
    const issues: BookmarkItemIssue[] = [];

    for (const r of rows) {
        const id = r.itemID || r.id || "";
        const nameVal = r.cells?.[nameCol]?.text?.content ?? r.name ?? "未命名书签";
        const urlVal = r.cells?.[urlCol]?.url?.content ?? r.cells?.[urlCol]?.text?.content ?? r.url ?? "";

        const result = validateBookmarkUrl(urlVal);
        if (result.status === "valid") {
            validCount++;
        } else {
            if (result.status === "empty") emptyCount++;
            else if (result.status === "invalid_protocol") invalidProtocolCount++;
            else if (result.status === "malformed") malformedCount++;

            issues.push({
                id,
                name: String(nameVal).trim() || "未命名书签",
                url: String(urlVal).trim(),
                status: result.status,
                reason: result.reason || "未知异常",
            });
        }
    }

    return {
        totalCount: rows.length,
        validCount,
        issueCount: issues.length,
        emptyCount,
        invalidProtocolCount,
        malformedCount,
        issues,
    };
}

/**
 * 格式化书签巡检报告文本
 */
export function formatBookmarkHealthReport(
    summary: BookmarkHealthSummary,
    t: (k: string) => string,
): string {
    const lines: string[] = [];
    lines.push(`【${t("bookmarks.reportTitle")}】`);
    lines.push(`${t("bookmarks.summaryTotal")}：${summary.totalCount} · ${t("bookmarks.summaryValid")}：${summary.validCount} · ${t("bookmarks.summaryIssues")}：${summary.issueCount}`);

    if (summary.issues.length > 0) {
        lines.push(`\n--- ${t("bookmarks.issuesHeader")} ---`);
        for (const item of summary.issues) {
            lines.push(`· [${t(`bookmarks.status_${item.status}`)}] ${item.name} (${item.url || t("bookmarks.noUrl")}) - ${item.reason}`);
        }
    } else {
        lines.push(`\n✓ ${t("bookmarks.allHealthy")}`);
    }

    return lines.join("\n");
}
