import { describe, expect, it } from "vitest";
import { compactUserMessage, sameOriginReturnPath } from "@/core/auth";

describe("auth recovery boundaries", () => {
    const origin = "https://siyuan.local";

    it("normalizes same-origin absolute and relative return targets", () => {
        expect(sameOriginReturnPath("/plugins/siyuan-home?screen=ledger#row-1", origin, "/")).toBe("/plugins/siyuan-home?screen=ledger#row-1");
        expect(sameOriginReturnPath("https://siyuan.local/plugins/siyuan-home?screen=ledger", origin, "/")).toBe("/plugins/siyuan-home?screen=ledger");
    });

    it("rejects external, login and malformed targets without changing the fallback", () => {
        expect(sameOriginReturnPath("https://evil.example/steal", origin, "/workspace")).toBe("/workspace");
        expect(sameOriginReturnPath("//evil.example/steal", origin, "/workspace")).toBe("/workspace");
        expect(sameOriginReturnPath("/check-auth?returnTo=%2Fworkspace", origin, "/workspace")).toBe("/workspace");
        expect(sameOriginReturnPath("http://[bad", origin, "/workspace")).toBe("/workspace");
        expect(sameOriginReturnPath(null, origin, "/workspace")).toBe("/workspace");
        expect(sameOriginReturnPath(null, origin, "/check-auth")).toBe("/");
    });

    it("keeps user-facing errors single-line and bounded", () => {
        expect(compactUserMessage("  网络\n失败\t请重试  ", "备用")).toBe("网络 失败 请重试");
        expect(compactUserMessage("", "备用")).toBe("备用");
        expect(compactUserMessage("123456", "备用", 4)).toBe("1234");
        expect(compactUserMessage({ message: "bad" }, "备用")).toBe("备用");
    });
});
