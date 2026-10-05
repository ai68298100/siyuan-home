import { describe, it, expect, beforeEach } from "vitest";
import { setPinyinDict, searchMatch, pinyinIndex, pinyinReady, ensurePinyin } from "@/core/pinyin";

const DICT = {
    小: ["xiao", "x"],
    驴: ["lv", "l"],
    管: ["guan", "g"],
    家: ["jia", "j"],
    证: ["zheng", "z"],
    身: ["shen", "s"],
    份: ["fen", "f"],
};

beforeEach(() => setPinyinDict(DICT));

describe("拼音检索（提案 C）", () => {
    it("直接包含优先命中", () => {
        expect(searchMatch("小驴管家", "管家")).toBe(true);
        expect(searchMatch("小驴管家", "不存在")).toBe(false);
    });

    it("全拼包含（含 ü→v）", () => {
        expect(searchMatch("小驴管家", "xiaolu")).toBe(true);
        expect(searchMatch("小驴管家", "guanjia")).toBe(true);
        expect(searchMatch("小驴", "lv")).toBe(true);
    });

    it("首字母串包含", () => {
        expect(searchMatch("小驴管家", "xlgj")).toBe(true);
        expect(searchMatch("小驴管家", "xlg")).toBe(true);
    });

    it("混合文本：字母原样并入索引", () => {
        expect(searchMatch("身份证 id123", "sfz")).toBe(true);
        expect(searchMatch("身份证 id123", "id123")).toBe(true);
    });

    it("字典缺字保守不误配（浩 不在字典）", () => {
        expect(searchMatch("小浩", "xh")).toBe(false);
        expect(searchMatch("浩浩", "hh")).toBe(false);
    });

    it("pinyinIndex 形态：全拼|首字母", () => {
        expect(pinyinIndex("小驴管家")).toBe("xiaoluguanjia|xlgj");
    });

    it("ensurePinyin 幂等且注入后即 ready", async () => {
        expect(pinyinReady()).toBe(true);
        await ensurePinyin();
        expect(pinyinReady()).toBe(true);
    });

    it("空查询恒真（退化为不过滤）", () => {
        expect(searchMatch("任意", "")).toBe(true);
    });
});
