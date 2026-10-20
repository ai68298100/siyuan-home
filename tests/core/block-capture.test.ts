import { describe, it, expect } from "vitest";
import {
    inferModuleFromText,
    extractDateFromText,
    extractAmountFromText,
    smartParseNoteContent,
} from "@/core/block-capture";

describe("core/block-capture 思源块内容与笔记智能速记（301波）", () => {
    describe("inferModuleFromText 模块关键词语义推断", () => {
        it("推断药品模块", () => {
            const res = inferModuleFromText("买了布洛芬缓释胶囊，每日2次饭后温水送服");
            expect(res).toBeDefined();
            expect(res?.moduleId).toBe("medicine");
            expect(res?.confidence).toBeGreaterThanOrEqual(0.7);
        });

        it("推断合同模块", () => {
            const res = inferModuleFromText("和房东签了房屋租赁合同，押金 4000元，自动续约条款已确认");
            expect(res?.moduleId).toBe("contracts");
        });

        it("推断车辆模块", () => {
            const res = inferModuleFromText("今天给机动车做基础保养，换了机油，里程 45000公里");
            expect(res?.moduleId).toBe("vehicles");
        });

        it("推断证件模块", () => {
            const res = inferModuleFromText("港澳通行证签注即将到期，需要去出入境大厅换证");
            expect(res?.moduleId).toBe("certs");
        });

        it("推断人情往来模块", () => {
            const res = inferModuleFromText("老李家孩子满月红包 1000元");
            expect(res?.moduleId).toBe("favors");
        });

        it("无特征文本返回 undefined", () => {
            expect(inferModuleFromText("今天天气真好，出去散步了一会儿")).toBeUndefined();
            expect(inferModuleFromText("")).toBeUndefined();
        });
    });

    describe("extractDateFromText 日期智能抽取", () => {
        it("抽取标准 YYYY-MM-DD 格式", () => {
            const res = extractDateFromText("合同截止到 2026-11-20 请注意续约");
            expect(res.date).toBe("2026-11-20");
            expect(res.cleanText).toBe("合同截止到   请注意续约");
        });

        it("抽取中文年月日格式", () => {
            const res = extractDateFromText("2026年10月05日 参加朋友婚礼");
            expect(res.date).toBe("2026-10-05");
        });

        it("无日期文本返回原内容", () => {
            const res = extractDateFromText("纯文本不带时间");
            expect(res.date).toBeUndefined();
            expect(res.cleanText).toBe("纯文本不带时间");
        });
    });

    describe("extractAmountFromText 金额智能抽取", () => {
        it("抽取人民币符号金额", () => {
            const res = extractAmountFromText("买了一台吸尘器 ¥1299.00");
            expect(res.amount).toBe(1299.0);
        });

        it("抽取带元单位金额", () => {
            const res = extractAmountFromText("随礼份子钱 500元 送给张三");
            expect(res.amount).toBe(500);
        });

        it("抽取押金/费用关键字金额", () => {
            const res = extractAmountFromText("租房押金 3500 务必保留收据");
            expect(res.amount).toBe(3500);
        });
    });

    describe("smartParseNoteContent 结构化智能速记全景解析", () => {
        it("从一句话中提炼标题、模块、金额、到期日与备注", () => {
            const raw = "购买了九号电动车 3800元，保修到 2028-10-15，发票存在抽屉里";
            const parsed = smartParseNoteContent(raw);

            expect(parsed.suggestedModule).toBe("vehicles");
            expect(parsed.confidence).toBeGreaterThanOrEqual(0.6);
            expect(parsed.amount).toBe(3800);
            expect(parsed.date).toBe("2028-10-15");
            expect(parsed.title).toContain("九号电动车");
            expect(parsed.note).toContain("发票存在抽屉里");
        });

        it("空文本稳健回退", () => {
            const parsed = smartParseNoteContent("");
            expect(parsed.title).toBe("");
            expect(parsed.confidence).toBe(0);
        });
    });
});
