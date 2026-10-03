/**
 * 免疫程序表单测（第一百零四波）：剂量日期推算（月末收敛/跨年）、程序表不变式、非法输入。
 */
import { describe, it, expect } from "vitest";
import { IMMUNIZATION_SCHEDULE, doseDate } from "@/core/immunization";

describe("immunization.doseDate", () => {
    it("月龄推算：monthAge 0 = 出生日期；跨年正确", () => {
        expect(doseDate("2026-03-15", { vaccine: "乙肝疫苗", dose: 1, monthAge: 0 })).toBe("2026-03-15");
        expect(doseDate("2026-03-15", { vaccine: "乙肝疫苗", dose: 2, monthAge: 1 })).toBe("2026-04-15");
        expect(doseDate("2026-11-20", { vaccine: "百白破疫苗", dose: 1, monthAge: 3 })).toBe("2027-02-20");
    });

    it("月末溢出收敛：1/31 + 1 月 → 2/28（闰年 2/29）", () => {
        expect(doseDate("2026-01-31", { vaccine: "x", dose: 1, monthAge: 1 })).toBe("2026-02-28");
        expect(doseDate("2024-01-31", { vaccine: "x", dose: 1, monthAge: 1 })).toBe("2024-02-29");
        expect(doseDate("2026-03-31", { vaccine: "x", dose: 1, monthAge: 1 })).toBe("2026-04-30");
    });

    it("非法出生日期 → 空串（防御，不出 NaN 字符串）", () => {
        expect(doseDate("bad", { vaccine: "x", dose: 1, monthAge: 1 })).toBe("");
        expect(doseDate("2026/03/15", { vaccine: "x", dose: 1, monthAge: 1 })).toBe("");
        expect(doseDate("", { vaccine: "x", dose: 1, monthAge: 1 })).toBe("");
    });
});

describe("immunization.IMMUNIZATION_SCHEDULE", () => {
    it("不变式：同疫苗剂次递增、月龄非降；脊灰系列灭活+减毒连续编号（2021 版 2+2）", () => {
        const byVaccine = new Map<string, VaccineLike[]>();
        for (const d of IMMUNIZATION_SCHEDULE) {
            expect(d.monthAge).toBeGreaterThanOrEqual(0);
            expect(d.monthAge).toBeLessThanOrEqual(72);
            const arr = byVaccine.get(d.vaccine) ?? [];
            arr.push(d);
            byVaccine.set(d.vaccine, arr);
        }
        for (const [vaccine, doses] of byVaccine) {
            const sorted = [...doses].sort((a, b) => a.dose - b.dose);
            sorted.forEach((d, i) => {
                if (i > 0) {
                    expect(d.dose, `${vaccine} 剂次递增`).toBeGreaterThan(sorted[i - 1].dose);
                    expect(d.monthAge, `${vaccine} 第 ${d.dose} 剂月龄非降`).toBeGreaterThanOrEqual(sorted[i - 1].monthAge);
                }
            });
        }
        // 脊灰：灭活(1,2) + 减毒(3,4) 连续编号，合成完整 1–4
        const polio = IMMUNIZATION_SCHEDULE.filter((d) => d.vaccine.includes("脊灰")).map((d) => d.dose).sort((a, b) => a - b);
        expect(polio).toEqual([1, 2, 3, 4]);
    });

    it("覆盖 0–6 岁关键节点：出生 24h、8 月麻腮风、18 月加强、6 岁白破", () => {
        const has = (vaccine: string, dose: number, monthAge: number) =>
            IMMUNIZATION_SCHEDULE.some((d) => d.vaccine === vaccine && d.dose === dose && d.monthAge === monthAge);
        expect(has("乙肝疫苗", 1, 0)).toBe(true);
        expect(has("麻腮风疫苗", 1, 8)).toBe(true);
        expect(has("百白破疫苗", 4, 18)).toBe(true);
        expect(has("白破疫苗", 1, 72)).toBe(true);
    });
});

interface VaccineLike { vaccine: string; dose: number; monthAge: number }
