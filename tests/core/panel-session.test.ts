import { describe, it, expect } from "vitest";
import { panelSession } from "@/panels/panel-session";

describe("panelSession", () => {
    it("初始化时提供默认状态，且不污染其他插件实例", () => {
        const p1 = {};
        const p2 = {};
        const s1 = panelSession(p1);
        const s2 = panelSession(p2);

        expect(s1).toEqual({ scrollTop: {}, ledgerSearch: "" });
        expect(s2).toEqual({ scrollTop: {}, ledgerSearch: "" });
        expect(s1).not.toBe(s2);
    });

    it("同一插件实例多次调用获取同一 session 引用", () => {
        const plugin = {};
        const s1 = panelSession(plugin);
        s1.ledgerSearch = "test-query";
        s1.tableDensity = "compact";

        const s2 = panelSession(plugin);
        expect(s2.ledgerSearch).toBe("test-query");
        expect(s2.tableDensity).toBe("compact");
        expect(s2).toBe(s1);
    });

    it("支持紧凑与舒适密度切换与记录", () => {
        const plugin = {};
        const session = panelSession(plugin);
        expect(session.tableDensity).toBeUndefined();

        session.tableDensity = "compact";
        expect(session.tableDensity).toBe("compact");

        session.tableDensity = "comfortable";
        expect(session.tableDensity).toBe("comfortable");
    });
});
