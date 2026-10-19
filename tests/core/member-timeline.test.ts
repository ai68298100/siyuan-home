import { describe, it, expect } from "vitest";
import {
    buildMemberAssetTimeline,
    diffCalendarDays,
    formatMemberTimelineReportText,
} from "@/core/member-timeline";
import type { AvRow } from "@/core/siyuan";

describe("core/member-timeline 个人资产与合同全景时间轴（296波）", () => {
    describe("diffCalendarDays 日期差纯函数", () => {
        it("正确计算天数差", () => {
            expect(diffCalendarDays("2026-10-30", "2026-10-20")).toBe(10);
            expect(diffCalendarDays("2026-10-10", "2026-10-20")).toBe(-10);
            expect(diffCalendarDays("2026-10-20", "2026-10-20")).toBe(0);
        });

        it("格式异常回退 0", () => {
            expect(diffCalendarDays("", "2026-10-20")).toBe(0);
        });
    });

    describe("buildMemberAssetTimeline 资产时间轴聚合", () => {
        const memberId = "mem_001";
        const today = "2026-10-20";

        const certCols = {
            name: "col_c_name",
            member: "col_c_member",
            category: "col_c_cat",
            expiry: "col_c_expiry",
            due: "col_c_due",
            holder_no: "col_c_no",
        };

        const contractCols = {
            name: "col_k_name",
            member: "col_k_member",
            category: "col_k_cat",
            expiry: "col_k_expiry",
            date: "col_k_date",
            party: "col_k_party",
            deposit: "col_k_deposit",
            auto_renew: "col_k_renew",
        };

        const certRows: AvRow[] = [
            // 1. 本成员的护照：临期（30 天后到期）
            {
                id: "c1",
                cells: {
                    col_c_name: { text: { content: "护照" } },
                    col_c_member: { relation: { blockIDs: [memberId] } },
                    col_c_expiry: { text: { content: "2026-11-19" } }, // +30 天
                    col_c_no: { text: { content: "E12345678" } },
                },
            },
            // 2. 本成员的驾照：远期有效（200 天后到期），且带审验日里程碑
            {
                id: "c2",
                cells: {
                    col_c_name: { text: { content: "机动车驾驶证" } },
                    col_c_member: { relation: { blockIDs: [memberId] } },
                    col_c_expiry: { text: { content: "2027-05-08" } }, // +200 天
                    col_c_due: { text: { content: "2026-10-25" } }, // +5 天审验
                },
            },
            // 3. 本成员已过期的身份证
            {
                id: "c3",
                cells: {
                    col_c_name: { text: { content: "旧居民身份证" } },
                    col_c_member: { relation: { blockIDs: [memberId] } },
                    col_c_expiry: { text: { content: "2026-09-01" } }, // 已过期
                },
            },
            // 4. 其他成员的证件（应被过滤）
            {
                id: "c4",
                cells: {
                    col_c_name: { text: { content: "他人通行证" } },
                    col_c_member: { relation: { blockIDs: ["other_member"] } },
                    col_c_expiry: { text: { content: "2026-12-01" } },
                },
            },
        ];

        const contractRows: AvRow[] = [
            // 1. 本成员租房合同：带押金，60 天后到期（临期），自动续约
            {
                id: "k1",
                cells: {
                    col_k_name: { text: { content: "房屋租赁合同" } },
                    col_k_member: { relation: { blockIDs: [memberId] } },
                    col_k_expiry: { text: { content: "2026-12-19" } }, // +60 天
                    col_k_party: { text: { content: "链家物业" } },
                    col_k_deposit: { number: { isNotEmpty: true, content: 5000 } },
                    col_k_renew: { checkbox: { checked: true } },
                },
            },
            // 2. 本成员车位合同：带押金，长期
            {
                id: "k2",
                cells: {
                    col_k_name: { text: { content: "地下车位租赁协议" } },
                    col_k_member: { relation: { blockIDs: [memberId] } },
                    col_k_deposit: { number: { isNotEmpty: true, content: 1000 } },
                },
            },
        ];

        it("准确统计证件与合同数量及押金总额", () => {
            const report = buildMemberAssetTimeline(memberId, certRows, certCols, contractRows, contractCols, {
                today,
                memberName: "张三",
            });

            expect(report.memberName).toBe("张三");
            expect(report.totalCertsCount).toBe(3); // c1, c2, c3
            expect(report.validCertsCount).toBe(2); // c1, c2
            expect(report.expiringCertsCount).toBe(1); // c1 (30 天)
            expect(report.expiredCertsCount).toBe(1); // c3
            expect(report.totalContractsCount).toBe(2); // k1, k2
            expect(report.activeContractsCount).toBe(2);
            expect(report.totalDepositAmount).toBe(6000); // 5000 + 1000
        });

        it("时间轴节点按未过期升序排前、已过期排后", () => {
            const report = buildMemberAssetTimeline(memberId, certRows, certCols, contractRows, contractCols, {
                today,
            });

            const timeline = report.timeline;
            expect(timeline.length).toBe(5); // 驾照审验(+5), 护照(+30), 租房(+60), 驾照效期(+200), 旧身份证(-49)

            expect(timeline[0].title).toContain("审验");
            expect(timeline[0].daysRemaining).toBe(5);
            expect(timeline[0].status).toBe("expiring_soon");

            expect(timeline[1].title).toBe("护照");
            expect(timeline[1].daysRemaining).toBe(30);
            expect(timeline[1].extra?.holderNo).toBe("E12345678");

            expect(timeline[2].title).toBe("房屋租赁合同");
            expect(timeline[2].extra?.deposit).toBe(5000);
            expect(timeline[2].extra?.autoRenew).toBe(true);

            expect(timeline[3].title).toBe("机动车驾驶证");
            expect(timeline[3].daysRemaining).toBe(200);
            expect(timeline[3].status).toBe("valid");

            // 最后一个节点为已过期节点
            expect(timeline[4].title).toBe("旧居民身份证");
            expect(timeline[4].status).toBe("expired");
            expect(timeline[4].daysRemaining).toBeLessThan(0);
        });

        it("格式化简报包含完整指标与细节说明", () => {
            const report = buildMemberAssetTimeline(memberId, certRows, certCols, contractRows, contractCols, {
                today,
                memberName: "李四",
            });

            const summary = formatMemberTimelineReportText(report);
            expect(summary).toContain("【李四 · 个人资产与合约时间轴】");
            expect(summary).toContain("共 3 件");
            expect(summary).toContain("累计押金 ¥6,000");
            expect(summary).toContain("护照");
            expect(summary).toContain("房屋租赁合同");
            expect(summary).toContain("🔄 自动续约");
        });

        it("空数据时优雅处理", () => {
            const report = buildMemberAssetTimeline("none", [], certCols, [], contractCols, { today });
            expect(report.totalCertsCount).toBe(0);
            expect(report.totalContractsCount).toBe(0);
            expect(report.timeline).toEqual([]);
            const text = formatMemberTimelineReportText(report);
            expect(text).toContain("暂无关联的到期时间轴节点");
        });
    });
});
