import { describe, it, expect } from "vitest";
import {
    calculateMemberRewardPoints,
    mapPointsToAllowanceRow,
    formatRewardsSummaryText,
    type RewardRecordItem,
} from "@/core/rewards-ledger";

const RECORDS: RewardRecordItem[] = [
    { choreName: "倒垃圾", memberId: "m1", date: "2026-10-18", points: 10, settled: true },
    { choreName: "洗碗", memberId: "m1", date: "2026-10-19", points: 20, settled: false },
    { choreName: "扫地", memberId: "m1", date: "2026-10-20", points: 15, settled: false },
    { choreName: "整理书架", memberId: "m2", date: "2026-10-20", points: 30, settled: false },
];

describe("core/rewards-ledger 儿童激励积分与零花钱账本联动（317波）", () => {
    describe("calculateMemberRewardPoints", () => {
        it("正确统计全家总积分与各成员已结算/待结算积分", () => {
            const report = calculateMemberRewardPoints(RECORDS, ["m1", "m2", "m3"]);
            expect(report.totalPointsAll).toBe(75);
            expect(report.unsettledPointsAll).toBe(65);
            expect(report.settleableAmountAll).toBe(6.5); // 65 / 10 = 6.5

            const m1 = report.members.find((m) => m.memberId === "m1")!;
            expect(m1.totalEarned).toBe(45);
            expect(m1.totalSettled).toBe(10);
            expect(m1.unsettledPoints).toBe(35);
            expect(m1.settleableAmount).toBe(3.5);
            expect(m1.unsettledChores).toEqual(["洗碗", "扫地"]);

            const m2 = report.members.find((m) => m.memberId === "m2")!;
            expect(m2.unsettledPoints).toBe(30);
            expect(m2.settleableAmount).toBe(3.0);

            const m3 = report.members.find((m) => m.memberId === "m3")!;
            expect(m3.totalEarned).toBe(0);
            expect(m3.unsettledPoints).toBe(0);
        });

        it("自定义兑换比例支持（如 5 积分 = 1 元）", () => {
            const report = calculateMemberRewardPoints(RECORDS, [], { pointsPerYuan: 5 });
            expect(report.pointsPerYuan).toBe(5);
            expect(report.settleableAmountAll).toBe(13); // 65 / 5 = 13
        });

        it("空数据或无效数据稳健返回", () => {
            const report = calculateMemberRewardPoints([]);
            expect(report.totalPointsAll).toBe(0);
            expect(report.unsettledPointsAll).toBe(0);
            expect(report.members).toEqual([]);
        });
    });

    describe("mapPointsToAllowanceRow", () => {
        it("正确生成写入 allowance 账本的合规载荷", () => {
            const report = calculateMemberRewardPoints(RECORDS, ["m1"]);
            const m1 = report.members.find((m) => m.memberId === "m1")!;
            const payload = mapPointsToAllowanceRow(m1, "小明", { date: "2026-10-20" });

            expect(payload).not.toBeNull();
            expect(payload?.name).toBe("小明家务积分兑换零花钱");
            expect(payload?.memberId).toBe("m1");
            expect(payload?.category).toBe("reward");
            expect(payload?.direction).toBe("in");
            expect(payload?.amount).toBe(3.5);
            expect(payload?.date).toBe("2026-10-20");
            expect(payload?.note).toContain("结算 35 积分");
            expect(payload?.note).toContain("洗碗、扫地");
            expect(payload?.source).toBe("家务激励");
        });

        it("支持自定义兑换汇率生成对应金额载荷", () => {
            const report = calculateMemberRewardPoints(RECORDS, ["m1"], { pointsPerYuan: 5 });
            const m1 = report.members.find((m) => m.memberId === "m1")!;
            const payload = mapPointsToAllowanceRow(m1, "小明", { pointsPerYuan: 5 });
            expect(payload?.amount).toBe(7); // 35 / 5 = 7
        });

        it("零积分成员返回 null", () => {
            const report = calculateMemberRewardPoints(RECORDS, ["m3"]);
            const m3 = report.members.find((m) => m.memberId === "m3")!;
            expect(mapPointsToAllowanceRow(m3, "小红")).toBeNull();
        });
    });

    describe("formatRewardsSummaryText", () => {
        it("格式化可读简报与待结算家务", () => {
            const report = calculateMemberRewardPoints(RECORDS, ["m1"]);
            const text = formatRewardsSummaryText(report, (id) => (id === "m1" ? "小明" : id));

            expect(text).toContain("家庭劳动积分与零花钱结算账本");
            expect(text).toContain("兑换汇率：10 积分 = 1 元");
            expect(text).toContain("小明：共获 45 积分 · 可结算 35 分（¥3.5）");
            expect(text).toContain("待结家务：洗碗、扫地");
        });

        it("全部积分已结算时展示已全额结算状态", () => {
            const settledOnly: RewardRecordItem[] = [
                { choreName: "倒垃圾", memberId: "m1", date: "2026-10-18", points: 10, settled: true },
            ];
            const report = calculateMemberRewardPoints(settledOnly, ["m1"]);
            const text = formatRewardsSummaryText(report, (id) => (id === "m1" ? "小明" : id));
            expect(text).toContain("已全额结算");
        });

        it("空积分时给出引导提示", () => {
            const emptyReport = calculateMemberRewardPoints([]);
            const text = formatRewardsSummaryText(emptyReport);
            expect(text).toContain("暂无家务积分记录");
        });
    });
});
