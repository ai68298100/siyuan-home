import { describe, expect, it } from "vitest";
import {
    validateBookmarkUrl,
    checkBookmarkHealth,
    formatBookmarkHealthReport,
} from "../../src/core/bookmarks";

describe("validateBookmarkUrl (MOD-23 书签 URL 格式与协议校验)", () => {
    it("合法 HTTP/HTTPS 网址验证通过", () => {
        expect(validateBookmarkUrl("https://b3log.org/siyuan")).toEqual({
            status: "valid",
            normalized: "https://b3log.org/siyuan",
        });
        expect(validateBookmarkUrl("http://localhost:6806/")).toEqual({
            status: "valid",
            normalized: "http://localhost:6806/",
        });
        expect(validateBookmarkUrl("https://github.com/ai68298100/siyuan-home?tab=readme-ov-file#quickstart")).toEqual({
            status: "valid",
            normalized: "https://github.com/ai68298100/siyuan-home?tab=readme-ov-file#quickstart",
        });
    });

    it("空值或破折号占位符正确识别为 empty", () => {
        expect(validateBookmarkUrl("")).toEqual({ status: "empty", reason: "URL 为空" });
        expect(validateBookmarkUrl("   ")).toEqual({ status: "empty", reason: "URL 为空" });
        expect(validateBookmarkUrl(null)).toEqual({ status: "empty", reason: "URL 为空" });
        expect(validateBookmarkUrl(undefined)).toEqual({ status: "empty", reason: "URL 为空" });
        expect(validateBookmarkUrl("—")).toEqual({ status: "empty", reason: "URL 为空" });
    });

    it("非法协议（缺少 http/https）识别为 invalid_protocol", () => {
        expect(validateBookmarkUrl("ftp://files.example.com")).toEqual({
            status: "invalid_protocol",
            reason: "缺少 http:// 或 https:// 协议头",
        });
        expect(validateBookmarkUrl("www.example.com")).toEqual({
            status: "invalid_protocol",
            reason: "缺少 http:// 或 https:// 协议头",
        });
        expect(validateBookmarkUrl("javascript:alert(1)")).toEqual({
            status: "invalid_protocol",
            reason: "缺少 http:// 或 https:// 协议头",
        });
    });

    it("残缺或语法错误网址识别为 malformed", () => {
        expect(validateBookmarkUrl("https://")).toEqual({
            status: "malformed",
            reason: "URL 语法不合法",
        });
        expect(validateBookmarkUrl("https://foo")).toEqual({
            status: "malformed",
            reason: "域名主机名不完整",
        });
        expect(validateBookmarkUrl("https://[invalid-host")).toEqual({
            status: "malformed",
            reason: "URL 语法不合法",
        });
    });
});

describe("checkBookmarkHealth (MOD-23 批量巡检书签健康度)", () => {
    it("综合汇总有效链接与各类异常", () => {
        const rows = [
            {
                itemID: "b1",
                cells: {
                    col_name: { text: { content: "思源笔记官网" } },
                    col_url: { url: { content: "https://b3log.org/siyuan" } },
                },
            },
            {
                itemID: "b2",
                cells: {
                    col_name: { text: { content: "缺失网址项" } },
                    col_url: { url: { content: "" } },
                },
            },
            {
                itemID: "b3",
                cells: {
                    col_name: { text: { content: "非安全未补协议" } },
                    col_url: { url: { content: "ftp://mirror.kernel.org" } },
                },
            },
            {
                itemID: "b4",
                cells: {
                    col_name: { text: { content: "语法残缺网址" } },
                    col_url: { url: { content: "https://" } },
                },
            },
        ];

        const summary = checkBookmarkHealth(rows, { name: "col_name", url: "col_url" });
        expect(summary.totalCount).toBe(4);
        expect(summary.validCount).toBe(1);
        expect(summary.issueCount).toBe(3);
        expect(summary.emptyCount).toBe(1);
        expect(summary.invalidProtocolCount).toBe(1);
        expect(summary.malformedCount).toBe(1);
        expect(summary.issues).toHaveLength(3);
        expect(summary.issues[0].name).toBe("缺失网址项");
        expect(summary.issues[0].status).toBe("empty");
    });
});

describe("formatBookmarkHealthReport", () => {
    it("格式化可读健康报告文本", () => {
        const summary = {
            totalCount: 3,
            validCount: 2,
            issueCount: 1,
            emptyCount: 1,
            invalidProtocolCount: 0,
            malformedCount: 0,
            issues: [
                {
                    id: "b2",
                    name: "暂无网址",
                    url: "",
                    status: "empty" as const,
                    reason: "URL 为空",
                },
            ],
        };

        const t = (k: string) => k;
        const text = formatBookmarkHealthReport(summary, t);
        expect(text).toContain("bookmarks.reportTitle");
        expect(text).toContain("3");
        expect(text).toContain("暂无网址");
    });
});
