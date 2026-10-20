import { describe, it, expect } from "vitest";
import {
    buildReminderDigest,
    formatDigestMarkdown,
    type DigestReminder,
} from "@/core/reminder-digest";

const rem = (id: string, moduleId: string, level: string, daysLeft: number, title = id): DigestReminder => ({
    id,
    moduleId,
    title,
    level,
    daysLeft,
    dueDate: `2026-10-${String(Math.min(28, Math.max(1, 20 + daysLeft))).padStart(2, "0")}`,
});

describe("core/reminder-digest 家庭提醒周报/月报摘要（306波）", () => {
    const sample: DigestReminder[] = [
        rem("r1", "certs", "overdue", -5, "护照到期"),
        rem("r2", "certs", "soon", 3, "驾照年检"),
        rem("r3", "medicine", "lead", 20, "布洛芬过期"),
        rem("r4", "contracts", "overdue", -1, "租房合约到期"),
        rem("r5", "contracts", "lead", 40, "物业合同"),
    ];

    describe("buildReminderDigest", () => {
        it("正确统计三级分组与总数", () => {
            const d = buildReminderDigest(sample, { today: "2026-10-20" });
            expect(d.counts.total).toBe(5);
            expect(d.counts.overdue).toBe(2);
            expect(d.counts.soon).toBe(1);
            expect(d.counts.lead).toBe(2);
        });

        it("按模块归集并按紧急度排序", () => {
            const d = buildReminderDigest(sample, { today: "2026-10-20" });
            expect(d.modules).toHaveLength(3);
            // certs 与 contracts 各有 1 项逾期，比 medicine 靠前
            expect(d.modules[0].moduleId).not.toBe("medicine");
            const certs = d.modules.find((m) => m.moduleId === "certs")!;
            expect(certs).toMatchObject({ overdue: 1, soon: 1, lead: 0, total: 2 });
        });

        it("topUrgent 按 level 与 daysLeft 排序并截断", () => {
            const d = buildReminderDigest(sample, { today: "2026-10-20", topN: 2 });
            expect(d.topUrgent).toHaveLength(2);
            expect(d.topUrgent[0].title).toBe("护照到期"); // 逾期且更早（-5 天）
            expect(d.topUrgent[1].title).toBe("租房合约到期");
        });

        it("计算与上期对比的逾期差值", () => {
            expect(buildReminderDigest(sample, { previousOverdue: 1 }).overdueDelta).toBe(1);
            expect(buildReminderDigest(sample, { previousOverdue: 5 }).overdueDelta).toBe(-3);
            expect(buildReminderDigest(sample).overdueDelta).toBeNull();
        });

        it("范围日期与自定义周期标签", () => {
            const d = buildReminderDigest(sample, { today: "2026-10-20", periodLabel: "本月" });
            expect(d.generatedAt).toBe("2026-10-20");
            expect(d.rangeStart).toBe("2026-10-20");
            expect(d.rangeEnd).toBe("2026-10-27");
            expect(d.periodLabel).toBe("本月");
        });

        it("空提醒列表稳健返回", () => {
            const d = buildReminderDigest([]);
            expect(d.counts).toEqual({ overdue: 0, soon: 0, lead: 0, total: 0 });
            expect(d.modules).toEqual([]);
            expect(d.topUrgent).toEqual([]);
        });

        it("过滤无效条目", () => {
            const d = buildReminderDigest([null as never, { id: "" } as never, rem("ok", "certs", "soon", 1)]);
            expect(d.counts.total).toBe(1);
        });
    });

    describe("formatDigestMarkdown", () => {
        it("输出标题、总览、最紧急事项与模块分布", () => {
            const d = buildReminderDigest(sample, { today: "2026-10-20", previousOverdue: 1 });
            const md = formatDigestMarkdown(d, (id) => `模块-${id}`);
            expect(md).toContain("# 🗓 家庭提醒本周摘要");
            expect(md).toContain("已逾期：**2** 项（较上期增加 1 项）");
            expect(md).toContain("## 最紧急事项");
            expect(md).toContain("租房合约到期");
            expect(md).toContain("逾期 1 天");
            expect(md).toContain("模块-certs");
            expect(md).toContain("## 模块分布");
        });

        it("无提醒时输出轻松提示", () => {
            const md = formatDigestMarkdown(buildReminderDigest([]));
            expect(md).toContain("当前没有需要处理的提醒");
        });

        it("逾期差值为 0 与负值时文案正确", () => {
            const flat = formatDigestMarkdown(
                buildReminderDigest(sample, { previousOverdue: 2 }),
            );
            expect(flat).toContain("与上期持平");
            const down = formatDigestMarkdown(
                buildReminderDigest(sample, { previousOverdue: 5 }),
            );
            expect(down).toContain("较上期减少 3 项");
        });
    });
});
