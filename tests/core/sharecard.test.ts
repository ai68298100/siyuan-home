import { describe, it, expect } from "vitest";
import {
    buildFamilyYearlyCardData,
    formatYearlyCardText,
    blockDeepLink,
} from "@/core/sharecard";

describe("core/sharecard 家庭生活年度回顾与分享卡片（320波）", () => {
    describe("buildFamilyYearlyCardData", () => {
        it("正确组装年度卡片数据并截断大事记与亮点", () => {
            const milestones = Array.from({ length: 12 }, (_, i) => ({
                date: `2026-0${(i % 9) + 1}-01`,
                title: `大事记 ${i + 1}`,
                icon: "📌",
                memberName: "成员",
            }));
            const highlights = ["成就1", "成就2", "成就3", "成就4", "成就5"];

            const data = buildFamilyYearlyCardData({
                year: 2026,
                familyScore: 92,
                levelLabel: "幸福和谐",
                memberCount: 4,
                choresCompleted: 156,
                mediaFinished: 48,
                milestones,
                highlights,
                generatedAt: "2026-10-20",
            });

            expect(data.year).toBe(2026);
            expect(data.familyScore).toBe(92);
            expect(data.levelLabel).toBe("幸福和谐");
            expect(data.milestoneCount).toBe(12);
            expect(data.milestones).toHaveLength(8); // 限制前 8 条
            expect(data.highlights).toHaveLength(4); // 限制前 4 条
            expect(data.generatedAt).toBe("2026-10-20");
        });

        it("空数据安全回退", () => {
            const data = buildFamilyYearlyCardData({
                year: 2026,
                familyScore: 80,
                levelLabel: "良好",
                memberCount: 1,
                choresCompleted: 0,
                mediaFinished: 0,
            });
            expect(data.milestones).toEqual([]);
            expect(data.highlights).toEqual([]);
            expect(data.milestoneCount).toBe(0);
        });
    });

    describe("formatYearlyCardText", () => {
        it("生成完整的纯文本年度回顾简报", () => {
            const data = buildFamilyYearlyCardData({
                year: 2026,
                familyScore: 95,
                levelLabel: "卓越幸福",
                memberCount: 3,
                choresCompleted: 80,
                mediaFinished: 25,
                milestones: [
                    { date: "2026-06-20", title: "幼升小录取", icon: "🎓", memberName: "大宝" },
                ],
                highlights: ["家庭年度生活指数达标", "定期体检全员完成"],
            });

            const text = formatYearlyCardText(data);
            expect(text).toContain("2026 家庭生活年度回顾卡");
            expect(text).toContain("综合幸福生活指数：95分（卓越幸福）");
            expect(text).toContain("家庭成员：3 人 · 家务完成：80 次 · 书影音达成：25 部");
            expect(text).toContain("大事记里程碑：共 1 个高光时刻");
            expect(text).toContain("幼升小录取（大宝）");
            expect(text).toContain("家庭年度生活指数达标");
            expect(text).toContain("由小驴管家本地生成 · 私密家庭数据绝不离端");
        });
    });

    describe("blockDeepLink", () => {
        it("生成 siyuan:// 块深链协议", () => {
            expect(blockDeepLink("20261020120000-abc1234")).toBe("siyuan://blocks/20261020120000-abc1234");
        });
    });
});
