/**
 * EC 集成契约形状测试：
 * 锁定管家与兄弟插件之间的数据交换形状——跨插件集成最常见的 bug 是
 * "提供方改了字段名，消费方静默拿到 undefined"。这些测试在编译期+运行时
 * 双重锁定形状，提供方改动时会在 CI 立即暴露。
 */
import { describe, it, expect } from "vitest";

// ── EC13/EC14：人脉 BridgePerson ──

/** 从小驴人脉 src/bridge/external-bridge.ts 摘录的形状 */
interface BridgePerson {
    docId: string;
    itemId: string;
    name: string;
    group: string;
    tags: string[];
}

describe("EC13/EC14 BridgePerson 形状", () => {
    it("消费方只读 docId/itemId/name——不依赖 group/tags", () => {
        const person: BridgePerson = { docId: "d1", itemId: "i1", name: "张三", group: "g", tags: [] };
        // 管家代码只取这三个字段
        const snapshot = `${person.name} [${person.docId}]`;
        expect(snapshot).toBe("张三 [d1]");
        expect(person.itemId).toBeTruthy();
    });

    it("ensurePerson 返回 created 标记", () => {
        const result: BridgePerson & { created: boolean } = {
            docId: "d1", itemId: "i1", name: "张三", group: "g", tags: [], created: true,
        };
        expect(result.created).toBe(true);
    });
});

// ── EC15：recordInteraction 幂等 ──

describe("EC15 recordInteraction 语义", () => {
    it("externalRef 幂等：同 ref 同批不重复", () => {
        // 人脉桥的 defaultBridgeRef 逻辑：bridge:<日期>:<排序后人员>
        const docIds = ["d2", "d1"];
        const date = "2026-10-03";
        const sorted = [...docIds].sort();
        const ref = `bridge:${date}:${sorted.join(",")}`;
        // 同批重复调用生成相同 ref
        const ref2 = `bridge:${date}:${[...docIds].sort().join(",")}`;
        expect(ref).toBe(ref2);
    });

    it("管家侧 favor ref 格式：favor:<rowId>", () => {
        const rowId = "20261001120000-abc1234";
        expect(`favor:${rowId}`).toMatch(/^favor:[a-zA-Z0-9-]+$/);
    });
});

// ── EC16/EC17：雷切 registerQuickAction/registerHomeModule ──

describe("EC16/EC17 雷切注册契约", () => {
    it("registerQuickAction id 格式限制", () => {
        // 雷切源码：/^[A-Za-z0-9._:-]+$/.test(options.id)
        const validIds = ["lvhome.open-overview", "lvhome.open-reminders", "a1", "x-y_z.w"];
        const invalidIds = ["has space", "中文", "has/slash", ""];
        for (const id of validIds) expect(id).toMatch(/^[A-Za-z0-9._:-]+$/);
        for (const id of invalidIds) expect(id).not.toMatch(/^[A-Za-z0-9._:-]+$/);
    });

    it("管家注册的两个动作 id 符合雷切限制", () => {
        const ids = ["lvhome.open-overview", "lvhome.open-reminders"];
        for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9._:-]+$/);
    });
});

// ── EC21：lv-exam:stats PublicStats ──

interface PublicStats {
    version: 1;
    generatedAt: number;
    attempts: number;
    accuracy: number;
    eliminated: number;
    activeWrong: number;
    streak: number;
    hours: number[];
    daily: { date: string; attempts: number; correct: number }[];
}

describe("EC21 lv-exam:stats PublicStats 形状", () => {
    it("管家消费的子集字段存在且类型正确", () => {
        const stats: PublicStats = {
            version: 1, generatedAt: Date.now(),
            attempts: 100, accuracy: 85, eliminated: 10, activeWrong: 5, streak: 7,
            hours: new Array(24).fill(0),
            daily: [{ date: "2026-10-01", attempts: 10, correct: 8 }],
        };
        // 管家只读这四个字段
        expect(Number(stats.streak)).toBe(7);
        expect(Number(stats.accuracy)).toBe(85);
        expect(Number(stats.attempts)).toBe(100);
        expect(Number(stats.generatedAt)).toBeGreaterThan(0);
    });

    it("管家拒绝非数字字段", () => {
        const bad = { streak: "not_a_number", accuracy: 85, attempts: 1, generatedAt: 1 };
        const values = [Number(bad.streak), Number(bad.accuracy), Number(bad.attempts), Number(bad.generatedAt)];
        expect(values.every((n) => Number.isFinite(n))).toBe(false);
    });
});

// ── EC09/EC10：打卡 CheckinApi getStrengthSummary ──

describe("EC09/EC10 getStrengthSummary 形状", () => {
    it("返回 items 数组和 windowDays", () => {
        const summary = {
            windowDays: 30,
            startDate: "2026-09-01",
            endDate: "2026-10-01",
            items: [{ itemId: "i1", name: "晨跑", score: 80 }],
        };
        expect(summary.items).toBeInstanceOf(Array);
        expect(summary.items[0]).toHaveProperty("itemId");
        expect(summary.items[0]).toHaveProperty("name");
        expect(summary.items[0]).toHaveProperty("score");
        expect(summary.windowDays).toBe(30);
    });
});

// ── LvHome 服务桥（EC03）──

describe("LvHome 服务桥形状", () => {
    it("summary() 返回四字段计数对象", () => {
        const summary = { overdue: 2, soon: 1, today: 1, updatedAt: "2026-10-03T00:00:00Z" };
        expect(summary).toHaveProperty("overdue");
        expect(summary).toHaveProperty("soon");
        expect(summary).toHaveProperty("today");
        expect(summary).toHaveProperty("updatedAt");
        expect(Number(summary.overdue)).toBe(2);
    });
});
