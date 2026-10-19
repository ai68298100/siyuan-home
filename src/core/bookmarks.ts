/**
 * 书签台账链接有效性检测（§17/285波）：
 * 周期性或手动探测书签 URL 有效性，识别失效链接（404/500/格式错误/超时/网络不可达），
 * 并提供汇总报告与结构化文本导出。
 */
import type { AvRow } from "@/core/siyuan";

export type BookmarkLinkStatus = "healthy" | "broken" | "invalid_url" | "timeout" | "unreachable";

export interface BookmarkHealthItem {
    id: string;
    name: string;
    url: string;
    category?: string;
    status: BookmarkLinkStatus;
    statusCode?: number;
    error?: string;
}

export interface BookmarkHealthReport {
    total: number;
    healthyCount: number;
    brokenCount: number;
    items: BookmarkHealthItem[];
    brokenItems: BookmarkHealthItem[];
}

export type LinkProbe = (url: string) => Promise<{ ok: boolean; status?: number; error?: string }>;

function isValidHttpUrl(str: string): boolean {
    try {
        const u = new URL(str);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

function cellString(row: AvRow, keyID?: string): string | undefined {
    if (!keyID) return undefined;
    const cell = row.cells?.[keyID];
    if (!cell) return undefined;
    if (cell.type === "url" && cell.url?.content) return String(cell.url.content).trim();
    if (cell.type === "text" && cell.text?.content) return String(cell.text.content).trim();
    if (cell.type === "block" && cell.block?.content) return String(cell.block.content).trim();
    if (cell.type === "select" && cell.select?.content) return String(cell.select.content).trim();
    return undefined;
}

/**
 * 默认浏览器/前端链接探测器（5秒超时，CORS 容错）
 */
export async function defaultLinkProbe(url: string): Promise<{ ok: boolean; status?: number; error?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        // 先尝试 HEAD 请求，减少载荷
        let res: Response;
        try {
            res = await fetch(url, { method: "HEAD", signal: controller.signal, mode: "no-cors" });
        } catch {
            // HEAD 不支持或拦截时尝试 GET
            res = await fetch(url, { method: "GET", signal: controller.signal, mode: "no-cors" });
        }
        // mode: "no-cors" 返回 opaque response 时 status 为 0，但未抛网络错误即代表网络连通、服务在线
        if (res.type === "opaque") {
            return { ok: true, status: 200 };
        }
        if (res.ok || (res.status >= 200 && res.status < 400)) {
            return { ok: true, status: res.status };
        }
        return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            return { ok: false, error: "timeout" };
        }
        return { ok: false, error: err instanceof Error ? err.message : "unreachable" };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 批量检测书签台账中的链接健康状态
 */
export async function checkBookmarksHealth(
    rows: AvRow[],
    cols: Record<string, string>,
    probe: LinkProbe = defaultLinkProbe,
): Promise<BookmarkHealthReport> {
    const items: BookmarkHealthItem[] = [];

    for (const row of rows) {
        const name = cellString(row, cols.name) || "未命名书签";
        const url = cellString(row, cols.url) || "";
        const category = cellString(row, cols.category);

        if (!url) {
            items.push({
                id: row.itemID,
                name,
                url,
                category,
                status: "invalid_url",
                error: "空链接",
            });
            continue;
        }

        if (!isValidHttpUrl(url)) {
            items.push({
                id: row.itemID,
                name,
                url,
                category,
                status: "invalid_url",
                error: "URL 格式不合法",
            });
            continue;
        }

        const res = await probe(url);
        if (res.ok) {
            items.push({
                id: row.itemID,
                name,
                url,
                category,
                status: "healthy",
                statusCode: res.status,
            });
        } else {
            let status: BookmarkLinkStatus = "broken";
            if (res.error === "timeout") status = "timeout";
            else if (res.error === "unreachable" || (res.error && res.error.includes("Failed to fetch"))) status = "unreachable";

            items.push({
                id: row.itemID,
                name,
                url,
                category,
                status,
                statusCode: res.status,
                error: res.error,
            });
        }
    }

    const brokenItems = items.filter((item) => item.status !== "healthy");
    const healthyCount = items.length - brokenItems.length;

    return {
        total: items.length,
        healthyCount,
        brokenCount: brokenItems.length,
        items,
        brokenItems,
    };
}

/**
 * 将失效书签报告格式化为易于复制和核对的纯文本
 */
export function formatBookmarkHealthReportText(report: BookmarkHealthReport): string {
    const lines: string[] = [
        `【书签链接健康检测报告】`,
        `· 检测总数：${report.total} 个`,
        `· 正常链接：${report.healthyCount} 个`,
        `· 异常链接：${report.brokenCount} 个`,
    ];

    if (report.brokenItems.length > 0) {
        lines.push("---------------------------");
        lines.push("【异常链接清单】");
        for (const item of report.brokenItems) {
            const errDetail = item.error ? ` (${item.error})` : item.statusCode ? ` (HTTP ${item.statusCode})` : "";
            lines.push(`· ${item.name}：${item.url}${errDetail}`);
        }
    }

    return lines.join("\n");
}
