import { describe, expect, it } from "vitest";
import { batchReassignMember } from "../../src/core/members";
import { setTransport } from "../../src/core/siyuan";

describe("batchReassignMember (MOD-05 / §15 成员批量改派)", () => {
    it("成功改派多行成员关系列", async () => {
        const calls: any[] = [];
        setTransport(async (endpoint: string, payload: any) => {
            if (endpoint === "/api/av/setAttributeViewBlockAttr") {
                calls.push(payload);
                return { code: 0, msg: "", data: {} };
            }
            return { code: 0, msg: "", data: {} };
        });

        const res = await batchReassignMember({
            avId: "av-certs-1",
            memberColKey: "col-member-rel",
            targetAvItemId: "member-av-item-mom",
            rowItemIds: ["row-1", "row-2", "row-3"],
        });

        expect(res.successCount).toBe(3);
        expect(res.failedCount).toBe(0);
        expect(res.errors).toHaveLength(0);
        expect(calls).toHaveLength(3);
        expect(calls[0].itemID).toBe("row-1");
        expect(calls[0].keyID).toBe("col-member-rel");
        expect(calls[0].value.type).toBe("relation");
        expect(calls[0].value.relation.blockIDs).toEqual(["member-av-item-mom"]);
    });

    it("部分行写入失败时如实收集错误并记录失败数", async () => {
        setTransport(async (endpoint: string, payload: any) => {
            if (endpoint === "/api/av/setAttributeViewBlockAttr") {
                if (payload.itemID === "row-bad") {
                    throw new Error("Kernel lock timeout");
                }
                return { code: 0, msg: "", data: {} };
            }
            return { code: 0, msg: "", data: {} };
        });

        const res = await batchReassignMember({
            avId: "av-certs-1",
            memberColKey: "col-member-rel",
            targetAvItemId: "member-av-item-dad",
            rowItemIds: ["row-good-1", "row-bad", "row-good-2"],
        });

        expect(res.successCount).toBe(2);
        expect(res.failedCount).toBe(1);
        expect(res.errors).toContain("Kernel lock timeout");
    });

    it("空行列表快速返回零计数", async () => {
        const res = await batchReassignMember({
            avId: "av-certs-1",
            memberColKey: "col-member-rel",
            targetAvItemId: "member-av-item-dad",
            rowItemIds: [],
        });

        expect(res.successCount).toBe(0);
        expect(res.failedCount).toBe(0);
    });
});
