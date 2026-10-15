import { describe, expect, it, vi } from "vitest";
import {
    assetHref, downloadAsset, isEncryptedNotebookAsset, isImageAsset, safeDownloadName,
    isPdfAsset, isDangerousAsset, getAssetPreviewKind,
} from "@/core/assets";

describe("assetHref", () => {
    it("resolves kernel relative paths on the supplied origin", () => {
        expect(assetHref("assets/siyuan-home/id-front.png", "https://notes.example/"))
            .toBe("https://notes.example/assets/siyuan-home/id-front.png");
        expect(assetHref("/assets/siyuan-home/护照.pdf", "https://notes.example/"))
            .toBe("https://notes.example/assets/siyuan-home/%E6%8A%A4%E7%85%A7.pdf");
    });

    it("rejects external, non-assets, and traversal paths", () => {
        expect(() => assetHref("https://evil.example/file.png", "https://notes.example/")).toThrow(/same-origin/);
        expect(() => assetHref("/api/file/get", "https://notes.example/")).toThrow(/same-origin/);
        expect(() => assetHref("assets/../secret.txt", "https://notes.example/")).toThrow(/traverse/);
        expect(() => assetHref("assets/siyuan-home/%2e%2e/secret.txt", "https://notes.example/")).toThrow(/traverse/);
        expect(() => assetHref("assets/siyuan-home/%252e%252e/secret.txt", "https://notes.example/")).toThrow(/traverse/);
        expect(() => assetHref("assets/siyuan-home/%5csecret.txt", "https://notes.example/")).toThrow(/traverse/);
        expect(() => assetHref("assets\\siyuan-home\\file.png", "https://notes.example/")).toThrow(/separators/);
    });
});

describe("safeDownloadName", () => {
    it("keeps a filename leaf and removes unsafe characters", () => {
        expect(safeDownloadName("/assets/siyuan-home/身份证:正面?.png")).toBe("身份证_正面_.png");
        expect(safeDownloadName("../")).toBe("attachment");
        expect(safeDownloadName("", "证件副本.pdf")).toBe("证件副本.pdf");
    });
});

describe("isImageAsset", () => {
    it("accepts local image formats and rejects PDFs, traversal, and external URLs", () => {
        expect(isImageAsset("assets/siyuan-home/id-front.png")).toBe(true);
        expect(isImageAsset("/assets/siyuan-home/护照.HEIC?box=nb-1")).toBe(true);
        expect(isImageAsset("assets/siyuan-home/scan.pdf")).toBe(false);
        expect(isImageAsset("assets/../outside.png")).toBe(false);
        expect(isImageAsset("https://outside.example/photo.png")).toBe(false);
    });
});

describe("isPdfAsset & isDangerousAsset (SEC-02 附件安全处理边界)", () => {
    it("isPdfAsset 识别同源 PDF 附件", () => {
        expect(isPdfAsset("assets/siyuan-home/contract.pdf")).toBe(true);
        expect(isPdfAsset("/assets/siyuan-home/护照.PDF?box=nb-1")).toBe(true);
        expect(isPdfAsset("assets/siyuan-home/photo.png")).toBe(false);
        expect(isPdfAsset("assets/siyuan-home/script.js")).toBe(false);
    });

    it("isDangerousAsset 阻断可执行与脚本等高风险格式", () => {
        expect(isDangerousAsset("malicious.exe")).toBe(true);
        expect(isDangerousAsset("payload.bat")).toBe(true);
        expect(isDangerousAsset("script.sh")).toBe(true);
        expect(isDangerousAsset("run.vbs")).toBe(true);
        expect(isDangerousAsset("hack.js")).toBe(true);
        expect(isDangerousAsset("cmd.ps1")).toBe(true);

        expect(isDangerousAsset("photo.png")).toBe(false);
        expect(isDangerousAsset("document.pdf")).toBe(false);
        expect(isDangerousAsset("data.txt")).toBe(false);
    });

    it("getAssetPreviewKind 分流仅允许图片与PDF安全预览，危险与未知文件仅供下载", () => {
        expect(getAssetPreviewKind("assets/siyuan-home/pic.jpg")).toBe("image");
        expect(getAssetPreviewKind("assets/siyuan-home/doc.pdf")).toBe("pdf");
        expect(getAssetPreviewKind("assets/siyuan-home/app.exe")).toBe("download_only");
        expect(getAssetPreviewKind("assets/siyuan-home/archive.zip")).toBe("download_only");
    });
});

describe("isEncryptedNotebookAsset", () => {
    it("recognizes encrypted notebook asset references", () => {
        const notebooks = [{ id: "private-box", encrypted: true }, { id: "open-box", encrypted: false }];
        expect(isEncryptedNotebookAsset("assets/private.png?box=private-box", notebooks)).toBe(true);
        expect(isEncryptedNotebookAsset("assets/open.png?box=open-box", notebooks)).toBe(false);
        expect(isEncryptedNotebookAsset("assets/plain.png", notebooks)).toBe(false);
    });
});

describe("downloadAsset", () => {
    it("fetches a same-origin asset and clicks a named download link", async () => {
        const click = vi.fn();
        const remove = vi.fn();
        const anchor = { href: "", download: "", style: {}, click, remove } as unknown as HTMLAnchorElement;
        const appendChild = vi.fn();
        const documentRef = {
            body: { appendChild },
            createElement: vi.fn(() => anchor),
        } as unknown as Document;
        const fetchImpl = vi.fn(async () => new Response("pdf", { status: 200 })) as unknown as typeof fetch;
        const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:asset");
        const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

        await downloadAsset(
            { name: "护照.pdf", content: "assets/siyuan-home/passport.pdf" },
            { origin: "https://notes.example/", fetchImpl, documentRef },
        );

        expect(fetchImpl).toHaveBeenCalledWith("https://notes.example/assets/siyuan-home/passport.pdf", {
            credentials: "same-origin", signal: expect.any(AbortSignal),
        });
        expect(anchor.href).toBe("blob:asset");
        expect(anchor.download).toBe("护照.pdf");
        expect(appendChild).toHaveBeenCalledWith(anchor);
        expect(click).toHaveBeenCalledOnce();
        expect(remove).toHaveBeenCalledOnce();
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:asset");
        createObjectURL.mockRestore();
        revokeObjectURL.mockRestore();
    });

    it("reports a failed HTTP response", async () => {
        const fetchImpl = vi.fn(async () => new Response("missing", { status: 404 })) as unknown as typeof fetch;
        await expect(downloadAsset(
            { name: "missing.pdf", content: "assets/siyuan-home/missing.pdf" },
            { origin: "https://notes.example/", fetchImpl },
        )).rejects.toThrow("HTTP 404");
    });
});
