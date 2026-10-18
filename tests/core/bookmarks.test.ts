import { describe, it, expect } from "vitest";
import {
    checkBookmarksHealth,
    formatBookmarkHealthReportText,
    type LinkProbe,
} from "@/core/bookmarks";
import type { AvRow } from "@/core/siyuan";

describe("bookmarks.checkBookmarksHealth（书签链接健康检测）", () => {
    const cols = {
        name: "b-name",
        url: "b-url",
        category: "b-cat",
    };

    const makeRow = (id: string, name: string, url: string, category = "gov"): AvRow => ({
        itemID: id,
        cells: {
            "b-name": { type: "text", text: { content: name } },
            "b-url": { type: "url", url: { content: url } },
            "b-cat": { type: "select", select: { content: category } },
        },
    });

    it("检测正常、404错误、超时与格式错误链接", async () => {
        const rows: AvRow[] = [
            makeRow("1", "政务平台", "https://example.gov.cn"),
            makeRow("2", "失效服务", "https://broken.example.com/404"),
            makeRow("3", "网络超时", "https://timeout.example.com"),
            makeRow("4", "非法格式", "not-a-valid-url"),
            makeRow("5", "空链接", ""),
        ];

        const mockProbe: LinkProbe = async (url: string) => {
            if (url === "https://example.gov.cn") return { ok: true, status: 200 };
            if (url === "https://broken.example.com/404") return { ok: false, status: 404, error: "HTTP 404" };
            if (url === "https://timeout.example.com") return { ok: false, error: "timeout" };
            return { ok: true, status: 200 };
        };

        const report = await checkBookmarksHealth(rows, cols, mockProbe);
        expect(report.total).toBe(5);
        expect(report.healthyCount).toBe(1);
        expect(report.brokenCount).toBe(4);

        expect(report.items[0].status).toBe("healthy");
        expect(report.items[1].status).toBe("broken");
        expect(report.items[1].statusCode).toBe(404);
        expect(report.items[2].status).toBe("timeout");
        expect(report.items[3].status).toBe("invalid_url");
        expect(report.items[4].status).toBe("invalid_url");
    });

    it("生成结构化报告文本用于复制分享", async () => {
        const rows: AvRow[] = [
            makeRow("1", "社保官网", "https://12333.gov.cn"),
            makeRow("2", "旧办事指南", "https://old.service.com", "gov"),
        ];

        const mockProbe: LinkProbe = async (url: string) => {
            if (url === "https://12333.gov.cn") return { ok: true, status: 200 };
            return { ok: false, status: 404, error: "HTTP 404" };
        };

        const report = await checkBookmarksHealth(rows, cols, mockProbe);
        const text = formatBookmarkHealthReportText(report);
        expect(text).toContain("【书签链接健康检测报告】");
        expect(text).toContain("· 检测总数：2 个");
        expect(text).toContain("· 正常链接：1 个");
        expect(text).toContain("· 异常链接：1 个");
        expect(text).toContain("· 旧办事指南：https://old.service.com (HTTP 404)");
    });
});
