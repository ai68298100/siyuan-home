import { describe, it, expect } from "vitest";
import {
    buildLocationIndex,
    searchLocations,
    formatLocationIndexText,
    type LocationRowInput,
} from "@/core/location-index";

const ROWS: LocationRowInput[] = [
    { rowId: "a1", moduleId: "certs", name: "护照", location: "书房保险箱", memberName: "爸爸" },
    { rowId: "a2", moduleId: "certs", name: "护照复印件", location: "书房保险箱", source: "copy_location" },
    { rowId: "a3", moduleId: "medicine", name: "降压药", location: "客厅药箱", hint: "每日一片" },
    { rowId: "a4", moduleId: "contracts", name: "租房合同", location: "书房保险箱" },
    { rowId: "a5", moduleId: "assets-real", name: "相机", location: "   " },
    { rowId: "a6", moduleId: "address", name: "", location: "书房保险箱" },
];

describe("core/location-index 存放位置索引（313 波，G4）", () => {
    describe("buildLocationIndex", () => {
        it("按位置分组并按条目数降序", () => {
            const idx = buildLocationIndex(ROWS);
            expect(idx.total).toBe(4);
            expect(idx.groups[0].location).toBe("书房保险箱");
            expect(idx.groups[0].entries).toHaveLength(3);
            expect(idx.groups[1].location).toBe("客厅药箱");
        });

        it("组内按模块 + 名称排序", () => {
            const idx = buildLocationIndex(ROWS);
            const names = idx.groups[0].entries.map((e) => e.name);
            // certs 优先于 contracts（c 字母序）；certs 组内按名称
            expect(names).toEqual(["护照", "护照复印件", "租房合同"]);
        });

        it("统计未填写位置与空名称处理", () => {
            const idx = buildLocationIndex(ROWS);
            expect(idx.missing).toBe(1);
            expect(idx.total).toBe(4);
        });

        it("topLocations 取出现最多的位置", () => {
            const idx = buildLocationIndex(ROWS, { topN: 1 });
            expect(idx.topLocations).toEqual([{ location: "书房保险箱", count: 3 }]);
        });

        it("空输入返回零值", () => {
            const idx = buildLocationIndex([]);
            expect(idx).toEqual({ groups: [], total: 0, topLocations: [], missing: 0 });
        });

        it("limitPerGroup 截断单组条目", () => {
            const idx = buildLocationIndex(ROWS, { limitPerGroup: 1 });
            expect(idx.groups[0].entries).toHaveLength(1);
            // topLocations 仍按真实数量统计
            expect(idx.topLocations[0].count).toBe(3);
        });
    });

    describe("searchLocations", () => {
        it("按名称模糊检索", () => {
            const hits = searchLocations(ROWS, "护照");
            expect(hits).toHaveLength(2);
        });

        it("按位置或成员检索", () => {
            expect(searchLocations(ROWS, "客厅")).toHaveLength(1);
            expect(searchLocations(ROWS, "爸爸")).toHaveLength(1);
        });

        it("未填写位置的记录显示占位文案", () => {
            const hits = searchLocations(ROWS, "相机");
            expect(hits[0].location).toBe("（未填写）");
        });

        it("空关键词返回空数组", () => {
            expect(searchLocations(ROWS, "   ")).toEqual([]);
        });
    });

    describe("formatLocationIndexText", () => {
        it("输出分组清单与缺失提示", () => {
            const text = formatLocationIndexText(buildLocationIndex(ROWS), (m) => m.toUpperCase());
            expect(text).toContain("家庭物品存放位置索引（4 条记录）");
            expect(text).toContain("【书房保险箱】3 件");
            expect(text).toContain("CERTS");
            expect(text).toContain("另有 1 条记录尚未填写存放位置");
        });

        it("空索引给出空态文案", () => {
            expect(formatLocationIndexText(buildLocationIndex([]))).toBe("暂无已填写存放位置的记录。");
        });
    });
});
