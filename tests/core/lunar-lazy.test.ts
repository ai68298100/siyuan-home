/**
 * 农历换算懒加载层单测（第一百零五波）：公历锚点、小月回退、周年推进、标签往返。
 * 使用真实 lunar-typescript（日历库确定性）；2026 年春节 = 公历 2026-02-17 为已知锚点。
 */
import { describe, it, expect } from "vitest";
import { lunarToSolar, nextLunarAnniversary, lunarLabel } from "@/core/hub/lunar-lazy";
import { Lunar } from "lunar-typescript";

const solar = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe("lunar.lunarToSolar", () => {
    it("2026 农历正月初一 → 公历 2026-02-17（春节锚点）", async () => {
        const g = await lunarToSolar(2026, 1, 1);
        expect(g).toEqual(solar(2026, 2, 17));
    });

    it("小月无三十 → 向前回退到廿九（回退逻辑用库自身作存在性判据）", async () => {
        // 找一个没有三十的月（编造 day=30，库会抛错 → 我们的回退应返回该月廿九的公历）
        let probed: { y: number; m: number } | null = null;
        for (let y = 2026; y <= 2030 && !probed; y++) {
            for (let m = 1; m <= 12; m++) {
                let has30 = true;
                try {
                    Lunar.fromYmd(y, m, 30);
                } catch {
                    has30 = false;
                }
                if (!has30) { probed = { y, m }; break; }
            }
        }
        expect(probed).toBeTruthy();
        const g30 = await lunarToSolar(probed!.y, probed!.m, 30);
        const g29 = await lunarToSolar(probed!.y, probed!.m, 29);
        expect(g30).toEqual(g29); // 回退到廿九
    });

    it("日/月非法（全回退失败）→ null", async () => {
        expect(await lunarToSolar(2026, 13, 1)).toBeNull(); // 无十三月且无闰十三月
    });
});

describe("lunar.nextLunarAnniversary", () => {
    it("公历生日 → 下一个农历周年 ≥ today0；农历月日与生日一致", async () => {
        const base = solar(1990, 6, 15);
        const today0 = solar(2026, 10, 4);
        const next = await nextLunarAnniversary(base, today0);
        expect(next).toBeDefined();
        expect(next!.getTime()).toBeGreaterThanOrEqual(today0.getTime());
        expect(next!.getFullYear()).toBe(2027); // 2026 的周年已过
        // 农历月日与生日一致（转回农历核对）
        const lb = Lunar.fromDate(next!);
        const baseLunar = Lunar.fromDate(base);
        expect(Math.abs(lb.getMonth())).toBe(Math.abs(baseLunar.getMonth()));
        expect(lb.getDay()).toBe(baseLunar.getDay());
    });

    it("今年周年未过 → 返回今年", async () => {
        const base = solar(1990, 12, 20);
        const today0 = solar(2026, 10, 4);
        const next = await nextLunarAnniversary(base, today0);
        expect(next).toBeDefined();
        expect(next!.getFullYear()).toBe(2026);
        expect(next!.getTime()).toBeGreaterThanOrEqual(today0.getTime());
    });
});

describe("lunar.lunarLabel", () => {
    it("春节锚点标签含「正月初一」；非法 ISO → undefined", async () => {
        const label = await lunarLabel("2026-02-17");
        expect(label).toContain("正月初一");
        expect(await lunarLabel("not-a-date")).toBeUndefined();
    });
});
