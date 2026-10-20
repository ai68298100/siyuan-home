import { describe, it, expect } from "vitest";
import {
    extractBlockId,
    buildBlockDeepLink,
    parseBlockToLedgerRow,
    formatBlockIngestSnippet,
} from "@/core/block-ingest";

describe("core/block-ingest 思源文档块收录入台账（319波）", () => {
    describe("extractBlockId 提取", () => {
        it("从 siyuan://blocks/ 协议深链中提取 ID", () => {
            const url = "siyuan://blocks/20261020120000-abc1234";
            expect(extractBlockId(url)).toBe("20261020120000-abc1234");
        });

        it("从 ((id)) 块引用语法中提取 ID", () => {
            const ref = "((20261020120000-abc1234))";
            expect(extractBlockId(ref)).toBe("20261020120000-abc1234");
        });

        it("从 ((id \"锚文本\")) 语法中提取 ID", () => {
            const ref = '((20261020120000-abc1234 "参考这段笔记"))';
            expect(extractBlockId(ref)).toBe("20261020120000-abc1234");
        });

        it("直接传入 22 位块 ID", () => {
            expect(extractBlockId("20261020120000-abc1234")).toBe("20261020120000-abc1234");
        });

        it("从混合文本中嗅探块 ID", () => {
            const text = "这段内容见 20261020120000-abc1234 ，请查收";
            expect(extractBlockId(text)).toBe("20261020120000-abc1234");
        });

        it("无效文本返回 undefined", () => {
            expect(extractBlockId("普通文本不含块ID")).toBeUndefined();
            expect(extractBlockId("")).toBeUndefined();
        });
    });

    describe("buildBlockDeepLink", () => {
        it("组装 siyuan://blocks/ 深链", () => {
            expect(buildBlockDeepLink("20261020120000-abc1234")).toBe("siyuan://blocks/20261020120000-abc1234");
        });
    });

    describe("parseBlockToLedgerRow", () => {
        it("结合块内容智能提取标题、金额、日期并附加块深链", () => {
            const blockContent = "今天去医院做了胃镜检查，门诊挂号化验花费 ¥350.00，复查日 2026-11-05，诊断正常";
            const blockId = "20261020120000-abc1234";

            const result = parseBlockToLedgerRow({
                blockId,
                content: blockContent,
            });

            expect(result.blockId).toBe(blockId);
            expect(result.suggestedModule).toBe("health");
            expect(result.rowPayload.amount).toBe(350);
            expect(result.rowPayload.date).toBe("2026-11-05");
            expect(result.rowPayload.note).toContain("siyuan://blocks/20261020120000-abc1234");
        });

        it("允许显式指定目标模块", () => {
            const result = parseBlockToLedgerRow({
                blockId: "20261020120000-abc1234",
                content: "购买了蓝牙耳机 299元",
                targetModule: "shopping",
            });
            expect(result.suggestedModule).toBe("shopping");
            expect(result.rowPayload.amount).toBe(299);
        });

        it("空内容或纯空白块安全降级", () => {
            const result = parseBlockToLedgerRow({
                blockId: "20261020120000-abc1234",
                content: "   ",
            });
            expect(result.rowPayload.name).toBe("收录块记录");
            expect(result.suggestedModule).toBe("adhoc");
        });

        it("无金额无日期的普通备忘块收录", () => {
            const result = parseBlockToLedgerRow({
                blockId: "20261020120000-abc1234",
                content: "提醒周末去给小猫打疫苗",
            });
            expect(result.suggestedModule).toBe("pets");
            expect(result.rowPayload.amount).toBeUndefined();
            expect(result.rowPayload.date).toBeUndefined();
        });
    });

    describe("formatBlockIngestSnippet", () => {
        it("生成反向收录标注文本", () => {
            const snippet = formatBlockIngestSnippet("购物台账", "蓝牙耳机", "2026-10-20");
            expect(snippet).toContain("> 🏠 已收录至小驴管家【购物台账】· 2026-10-20 · 蓝牙耳机");
        });

        it("默认使用当天日期", () => {
            const snippet = formatBlockIngestSnippet("备忘", "测试");
            expect(snippet).toContain("> 🏠 已收录至小驴管家【备忘】");
        });
    });
});
