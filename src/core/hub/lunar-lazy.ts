/**
 * 农历换算懒加载层（bundle 整改 🔴）：lunar-typescript 是 425KB 单文件 bundle（不可 tree-shake），
 * 通过动态 import 拆为独立 chunk，仅在出现农历生日/忌日时加载。
 */
let mod: Promise<typeof import("lunar-typescript")> | null = null;

function loadLunar(): Promise<typeof import("lunar-typescript")> {
    return (mod ??= import("lunar-typescript"));
}

/** 农历 (年,月,日) → 公历；日不存在时向前回退（腊月三十→廿九）；完全失败返回 null */
export async function lunarToSolar(y: number, m: number, d: number): Promise<Date | null> {
    const { Lunar } = await loadLunar();
    for (let day = d; day >= 1; day--) {
        try {
            const s = Lunar.fromYmd(y, m, day).getSolar();
            return new Date(s.getYear(), s.getMonth() - 1, s.getDay());
        } catch {
            // 该日不存在（小月无三十等），继续回退
        }
    }
    return null;
}

/**
 * 农历周年（决策 09/D2：闰月生日平年过平月同日；生日缺失日向前回退）。
 * 从候选公历年起逐个尝试，返回第一个 >= today 的公历日期。
 */
export async function nextLunarAnniversary(base: Date, today0: Date): Promise<Date | undefined> {
    const { Lunar } = await loadLunar();
    const lb = Lunar.fromDate(base);
    const lm = lb.getMonth(); // 负数 = 闰月
    const ld = lb.getDay();
    for (let y = today0.getFullYear() - 1; y <= today0.getFullYear() + 1; y++) {
        // 闰月生日：先试当年同闰月，无该闰月则过平月同日
        const candidates = lm < 0 ? [y, -lm] as const : [lm] as const;
        for (const m of candidates) {
            const g = await lunarToSolar(y, m, ld);
            if (g && g >= today0) return g;
        }
    }
    return undefined;
}

/** Solar → 农历文本（供 UI 显示） */
export async function lunarLabel(iso: string): Promise<string | undefined> {
    const { Lunar } = await loadLunar();
    const d = new Date(`${iso}T00:00:00`);
    if (isNaN(d.getTime())) return undefined;
    return Lunar.fromDate(d).toString();
}
