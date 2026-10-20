import { describe, it, expect } from "vitest";
import {
    buildArchiveManifest,
    formatArchiveManifestMarkdown,
    type ArchiveRecordItem,
} from "@/core/archive";

describe("core/archive 重要凭据与合同附件离线归档（303波）", () => {
    const mockRecords: ArchiveRecordItem[] = [
        {
            id: "row-1",
            module: "certs",
            title: "李明普通护照",
            memberName: "爸爸",
            date: "2020-05-10",
            expiry: "2030-05-10",
            attachments: [
                { name: "护照信息页.jpg", content: "assets/passport-front.jpg" },
                { name: "签注页.jpg", content: "assets/visa-page.jpg" },
            ],
        },
        {
            id: "row-2",
            module: "contracts",
            title: "融创房屋租赁合同",
            memberName: "妈妈",
            date: "2025-01-01",
            expiry: "2026-12-31",
            attachments: [
                { name: "租房合同签字版.pdf", content: "assets/rent-contract.pdf" },
            ],
        },
        {
            id: "row-3",
            module: "assets-real",
            title: "索尼电视机",
            memberName: "全家",
            attachments: [], // 无附件，应自动过滤
        },
    ];

    describe("buildArchiveManifest", () => {
        it("正确聚合过滤有效附件，按模块分类归集", () => {
            const manifest = buildArchiveManifest(mockRecords, { generatedAt: "2026-10-20" });

            expect(manifest.totalRecords).toBe(2);
            expect(manifest.totalFiles).toBe(3);
            expect(manifest.members).toContain("爸爸");
            expect(manifest.members).toContain("妈妈");
            expect(manifest.members).not.toContain("全家");
            expect(manifest.categories).toHaveLength(2);

            const certsCat = manifest.categories.find((c) => c.module === "certs");
            expect(certsCat).toBeDefined();
            expect(certsCat?.records).toHaveLength(1);
            expect(certsCat?.records[0].attachments).toHaveLength(2);
        });

        it("敏感信息掩码支持", () => {
            const manifest = buildArchiveManifest(mockRecords, { maskSensitive: true });
            const title = manifest.categories[0].records[0].title;
            expect(title).toContain("***");
        });

        it("空记录稳健回退", () => {
            const manifest = buildArchiveManifest([]);
            expect(manifest.totalRecords).toBe(0);
            expect(manifest.totalFiles).toBe(0);
            expect(manifest.categories).toHaveLength(0);
        });
    });

    describe("formatArchiveManifestMarkdown", () => {
        it("输出结构规范的 Markdown 索引文本", () => {
            const manifest = buildArchiveManifest(mockRecords, { generatedAt: "2026-10-20" });
            const md = formatArchiveManifestMarkdown(manifest);

            expect(md).toContain("# 📑 家庭重要凭据与合同附件归档索引");
            expect(md).toContain("生成日期：2026-10-20");
            expect(md).toContain("李明普通护照");
            expect(md).toContain("[护照信息页.jpg](assets/passport-front.jpg)");
            expect(md).toContain("融创房屋租赁合同");
            expect(md).toContain("[租房合同签字版.pdf](assets/rent-contract.pdf)");
        });

        it("空记录输出友好的空态提示", () => {
            const manifest = buildArchiveManifest([]);
            const md = formatArchiveManifestMarkdown(manifest);
            expect(md).toContain("当前范围无带附件的凭据或合同记录");
        });
    });
});
