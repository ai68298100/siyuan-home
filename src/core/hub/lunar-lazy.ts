/**
 * 农历换算层（1900-2100）。月长表仅约 600 字节，避免把 425KB 的完整
 * lunar-typescript 天文库内联到思源单文件插件；接口和闰月规则保持不变。
 */
type LunarParts = { year: number; month: number; day: number; leap: boolean };

const START_YEAR = 1900;
const END_YEAR = 2100;
// 每年 3 字节：高 4 位为闰月，低 13 位为各月月长（1=30 天）。
const DATA = "01096d0004ae000a5700aa4d000d26000d95008d5500056a0009ad00495d0004ae00d49b000a4d000d2500baa5000b54000d6a0052da00095b00e937000497000a4b00b64b0006a50006d40095b50002b600095700492f00049700cc96000d4a000ea500ada90005ad0002b600726e00092e00f92d000c95000d4a00db4a000b5500056a00955b00025d00092d00592b000a9500f6950006ca000b5500aab50004da000a5b006a5700052b01152a000e950006aa00d5aa000ab50004b60094ae000a57000526007d26000d9500eb5500056a00096d00a95d0004ad000a4d009a4d000d25011aa5000b54000b6a00d2da00095b00049b009497000a4b01564b0006a50006d400d5b4000ab600095700a92f00049700064b006d4a000ea5010d650005ac000ab600b26d00092e000c96009a95000d4a000da5004b5500056a00f55b00025d00092d00b92b000a95000b4a0096aa000ad5012ab50004ba000a5b00ca5700052b000a93008e950006aa000ad50049b50004b600d4ae000a4e000d2600bd26000d530005aa006d6a00096d01695d0004ad000a4d00da4b000d25000d5200bb54000b5a00056d00495b00049b00f497000a4b000aa500b6a50006d2000ada006ab600093701092f00049700064b00cd4a000ea50006b200956c000aae00092e00792e000c9600fa95000d4a000da500ab5500056a000a6d008a5d00052d01152b000a95000b4a00d6aa000ad500055a0094ba000a5b00052b00752700069300ee530006aa000ad500a9b50004b6000a57008a4e000d16011d26000d52000daa00cd6a00056d0004ae00949d000a2d000d15005b25000d52";

function info(year: number): { leap: number; bits: number } | undefined {
    if (year < START_YEAR || year > END_YEAR) return undefined;
    const i = (year - START_YEAR) * 6;
    const value = Number.parseInt(DATA.slice(i, i + 6), 16);
    return { leap: value >> 13, bits: value & 0x1fff };
}

function monthCount(i: { leap: number; bits: number }): number {
    return i.leap ? 13 : 12;
}

function monthDays(i: { leap: number; bits: number }, index: number): number {
    return (i.bits >> (monthCount(i) - 1 - index)) & 1 ? 30 : 29;
}

function yearDays(i: { leap: number; bits: number }): number {
    let total = 0;
    for (let n = 0; n < monthCount(i); n++) total += monthDays(i, n);
    return total;
}

function yearStart(year: number): Date | undefined {
    if (!info(year)) return undefined;
    const d = new Date(START_YEAR, 0, 31);
    for (let y = START_YEAR; y < year; y++) d.setDate(d.getDate() + yearDays(info(y)!));
    return d;
}

function dayOffset(a: Date, b: Date): number {
    return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
}

function partsForDate(date: Date): LunarParts | undefined {
    let year = date.getFullYear();
    const start = yearStart(year);
    if (!start) return undefined;
    if (date < start) year--;
    const i = info(year);
    const lunarStart = yearStart(year);
    if (!i || !lunarStart) return undefined;
    let offset = dayOffset(date, lunarStart);
    if (offset < 0 || offset >= yearDays(i)) return undefined;
    for (let index = 0; index < monthCount(i); index++) {
        const days = monthDays(i, index);
        if (offset < days) {
            const leap = i.leap !== 0 && index === i.leap;
            const month = leap ? i.leap : index - (i.leap && index > i.leap ? 1 : 0) + 1;
            return { year, month, day: offset + 1, leap };
        }
        offset -= days;
    }
    return undefined;
}

/** 农历 (年,月,日) → 公历；日不存在时向前回退。负月表示闰月。 */
export async function lunarToSolar(y: number, m: number, d: number): Promise<Date | null> {
    const i = info(y);
    if (!i || !Number.isInteger(m) || !Number.isInteger(d) || m === 0 || Math.abs(m) > 12 || d < 1 || d > 30) return null;
    const leap = m < 0;
    const month = Math.abs(m);
    if (leap && i.leap !== month) return null;
    let index = month - 1 + (i.leap && month > i.leap ? 1 : 0);
    if (leap) index = i.leap;
    const days = monthDays(i, index);
    const start = yearStart(y)!;
    const offset = Array.from({ length: index }, (_, n) => monthDays(i, n)).reduce((a, b) => a + b, 0);
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset + Math.min(d, days) - 1);
}

/** 农历周年：闰月生日优先同闰月，无闰月时回退平月同日。 */
export async function nextLunarAnniversary(base: Date, today0: Date): Promise<Date | undefined> {
    const lb = partsForDate(base);
    if (!lb) return undefined;
    const lm = lb.leap ? -lb.month : lb.month;
    for (let y = today0.getFullYear() - 1; y <= today0.getFullYear() + 1; y++) {
        const candidates = lm < 0 ? [lm, -lm] as const : [lm] as const;
        for (const m of candidates) {
            const g = await lunarToSolar(y, m, lb.day);
            if (g && g >= today0) return g;
        }
    }
    return undefined;
}

/** Solar → 农历文本（供 UI 显示）。 */
export async function lunarLabel(iso: string): Promise<string | undefined> {
    const d = new Date(`${iso}T00:00:00`);
    const p = Number.isNaN(d.getTime()) ? undefined : partsForDate(d);
    if (!p) return undefined;
    const nums = "〇一二三四五六七八九";
    const months = ["", "正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];
    const day = p.day <= 10 ? `初${p.day === 10 ? "十" : nums[p.day]}` : p.day < 20 ? `十${nums[p.day - 10]}` : p.day === 20 ? "二十" : p.day < 30 ? `廿${nums[p.day - 20]}` : "三十";
    return `${String(p.year).replace(/[0-9]/g, (n) => nums[Number(n)])}年${p.leap ? "闰" : ""}${months[p.month]}${day}`;
}
