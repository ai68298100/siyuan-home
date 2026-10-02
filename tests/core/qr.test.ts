/**
 * QR 工具层单测：dataURL 生成与块深链格式。
 */
import { describe, it, expect } from "vitest";
import { generateQRDataUrl, blockDeepLink } from "@/core/qr";

describe("qr.generateQRDataUrl", () => {
    it("返回 PNG data URL", async () => {
        const url = await generateQRDataUrl("siyuan://blocks/test-123");
        expect(url.startsWith("data:image/png;base64,")).toBe(true);
    });
    it("尺寸参数影响输出大小（大图非更小）", async () => {
        const small = await generateQRDataUrl("hello", 128);
        const large = await generateQRDataUrl("hello", 512);
        expect(large.length).toBeGreaterThanOrEqual(small.length);
    });
});

describe("qr.blockDeepLink", () => {
    it("生成思源块深链", () => {
        expect(blockDeepLink("20260101120000-abc1234")).toBe("siyuan://blocks/20260101120000-abc1234");
    });
});
