/**
 * 中文日期解析单测（16 组/214 波，滴答清单规格基准）：相对日/周几/下周X/M月D日/N天后/ISO 透传/
 * 剥离与空白收敛/已过日期进明年/非法日期拒绝。TODAY 锚定 2026-10-05（周一）。
 */
import { describe, it, expect } from "vitest";
import { parseNaturalDate } from "@/core/dateparse";

const TODAY = new Date(2026, 9, 5); // 2026-10-05 周一
const parse = (text: string) => parseNaturalDate(text, TODAY);

describe("parseNaturalDate（214 波）", () => {
    it("今天/明天/后天/大后天", () => {
        expect(parse("交物业费 今天")?.date).toBe("2026-10-05");
        expect(parse("交物业费 明天")?.date).toBe("2026-10-06");
        expect(parse("后天复诊")?.date).toBe("2026-10-07");
        expect(parse("大后天取件")?.date).toBe("2026-10-08");
    });

    it("N 天后（含剥离）", () => {
        const r = parse("3天后复诊");
        expect(r?.date).toBe("2026-10-08");
        expect(r?.rest).toBe("复诊");
    });

    it("周X 取最近未来含今天；剥离后空白收敛", () => {
        expect(parse("周三买菜")?.date).toBe("2026-10-07"); // 今天即周三
        expect(parse("周五交作业")?.date).toBe("2026-10-09");
        const r = parse("周末  周五  交作业"); // 命中第一个（周五）；剥离后多空白收敛
        expect(r?.date).toBe("2026-10-09");
        expect(r?.rest).not.toMatch(/\s{2,}/);
    });

    it("下周X 按下周一起算（周一锚点 + 7 + target）", () => {
        // 今天周一(5)：下周三 = 本周一 + 7 + 2 = 10-14
        expect(parse("下周三开会")?.date).toBe("2026-10-14");
        expect(parse("下周一启动")?.date).toBe("2026-10-12");
    });

    it("M月D日：今年未过原样；已过进明年；2/30 拒绝", () => {
        expect(parse("10月15日换证")?.date).toBe("2026-10-15");
        expect(parse("3月1日体检")?.date).toBe("2027-03-01");
        expect(parse("2月30日交表")).toBeNull();
    });

    it("ISO 透传（- 与 /）", () => {
        expect(parse("2026-12-31 年终结算")?.date).toBe("2026-12-31");
        expect(parse("2026/12/31 年终结算")?.date).toBe("2026-12-31");
    });

    it("无日期表达式 → null；空串 → null", () => {
        expect(parse("买牛奶")).toBeNull();
        expect(parse("")).toBeNull();
    });

    it("剥离后 rest 为空 → 调用方回退原标题（此处只验证 rest）", () => {
        expect(parse("明天")?.rest).toBe("");
    });
});
