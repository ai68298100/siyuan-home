import { describe, it, expect } from "vitest";
import {
    defaultRuntime,
    saveNamedView,
    removeNamedView,
    applyNamedView,
    type ReminderNamedView,
} from "@/core/hub/runtime";

describe("namedViews（§17 命名视图切换与持久化）", () => {
    it("保存新增命名视图并自动激活", () => {
        const rt = defaultRuntime();
        const saved = saveNamedView(rt, {
            name: "紧急逾期",
            filter: "overdue",
            dueWithin: "7",
        });

        expect(saved.id).toMatch(/^view-/);
        expect(saved.name).toBe("紧急逾期");
        expect(rt.namedViews).toHaveLength(1);
        expect(rt.namedViews?.[0]).toEqual(saved);
        expect(rt.activeNamedViewId).toBe(saved.id);
    });

    it("更新已存在的命名视图保持原 ID", () => {
        const rt = defaultRuntime();
        const v1 = saveNamedView(rt, { id: "custom-1", name: "家庭财务", moduleId: "insurance" });
        expect(v1.id).toBe("custom-1");

        const v2 = saveNamedView(rt, { id: "custom-1", name: "家庭保单与财务", moduleId: "insurance", dueWithin: "30" });
        expect(v2.id).toBe("custom-1");
        expect(v2.name).toBe("家庭保单与财务");
        expect(rt.namedViews).toHaveLength(1);
        expect(rt.namedViews?.[0].dueWithin).toBe("30");
    });

    it("应用命名视图更新 runtime 各筛选维度", () => {
        const rt = defaultRuntime();
        const view: ReminderNamedView = {
            id: "view-1",
            name: "我的待办",
            filter: "soon",
            memberId: "m-self",
            moduleId: "certs",
            dueWithin: "7",
        };

        applyNamedView(rt, view);
        expect(rt.hubFilter).toBe("soon");
        expect(rt.hubMemberId).toBe("m-self");
        expect(rt.hubModuleId).toBe("certs");
        expect(rt.hubDueWithin).toBe("7");
        expect(rt.activeNamedViewId).toBe("view-1");
    });

    it("删除命名视图；若当前激活则重置激活状态", () => {
        const rt = defaultRuntime();
        const v1 = saveNamedView(rt, { id: "v1", name: "视图1" });
        const v2 = saveNamedView(rt, { id: "v2", name: "视图2" });
        expect(rt.activeNamedViewId).toBe("v2");

        const removedV2 = removeNamedView(rt, "v2");
        expect(removedV2).toBe(true);
        expect(rt.namedViews?.map((v) => v.id)).toEqual(["v1"]);
        expect(rt.activeNamedViewId).toBeUndefined();

        const removedV1 = removeNamedView(rt, "v1");
        expect(removedV1).toBe(true);
        expect(rt.namedViews).toHaveLength(0);

        expect(removeNamedView(rt, "non-existent")).toBe(false);
    });
});
