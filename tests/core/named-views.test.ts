import { describe, expect, it } from "vitest";
import { upsertNamedView, deleteNamedView, type HubNamedView } from "../../src/core/hub/runtime";

describe("HubNamedView 纯函数 (UIX-06 提醒中枢筛选器命名视图)", () => {
    it("空清单新增命名视图", () => {
        const views = upsertNamedView([], {
            name: "妈妈的证件",
            filter: "all",
            memberId: "mem_mom",
            moduleId: "certs",
            dueWithin: "30",
        });
        expect(views).toHaveLength(1);
        expect(views[0].name).toBe("妈妈的证件");
        expect(views[0].memberId).toBe("mem_mom");
        expect(views[0].moduleId).toBe("certs");
        expect(views[0].dueWithin).toBe("30");
        expect(views[0].id).toBeTruthy();
    });

    it("更新已存在的命名视图", () => {
        const initial: HubNamedView[] = [
            { id: "v1", name: "待办", filter: "overdue" },
            { id: "v2", name: "家庭药箱", moduleId: "medicine" },
        ];
        const updated = upsertNamedView(initial, {
            id: "v1",
            name: "逾期与急办",
            filter: "soon",
            dueWithin: "7",
        });
        expect(updated).toHaveLength(2);
        expect(updated[0].id).toBe("v1");
        expect(updated[0].name).toBe("逾期与急办");
        expect(updated[0].filter).toBe("soon");
        expect(updated[0].dueWithin).toBe("7");
        expect(updated[1].name).toBe("家庭药箱");
    });

    it("空名称或纯空白不予保存", () => {
        const initial: HubNamedView[] = [{ id: "v1", name: "旧视图" }];
        const res = upsertNamedView(initial, { name: "   " });
        expect(res).toEqual(initial);
    });

    it("按 ID 删除命名视图", () => {
        const initial: HubNamedView[] = [
            { id: "v1", name: "待办" },
            { id: "v2", name: "订阅" },
        ];
        const res = deleteNamedView(initial, "v1");
        expect(res).toHaveLength(1);
        expect(res[0].id).toBe("v2");
    });

    it("删除不存在的 ID 不产生副作用", () => {
        const initial: HubNamedView[] = [{ id: "v1", name: "待办" }];
        const res = deleteNamedView(initial, "v999");
        expect(res).toHaveLength(1);
        expect(res[0].id).toBe("v1");
    });
});
