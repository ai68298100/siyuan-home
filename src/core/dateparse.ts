/**
 * 快速录入中文日期解析（16 组规格基准 = 滴答清单官方规则深挖；214 波落地）。
 * 克制范围：仅日期粒度（备忘/到期无时刻语义）；不吸收时刻（下午3点）与重复语法（每天）——
 * 前者归提醒时刻（未做），后者归周期规则列。
 *
 * 支持：今天/明天/后天/大后天、(下)(星期|礼拜|周)X、N天后、M月D日(号)、YYYY-MM-DD；
 * "周X"取最近未来（含今天）；"M月D日"已过自动进明年；识别后表达式从标题剥离。
 */

export interface ParsedNaturalDate {
    /** 本地时区 yyyy-MM-dd */
    date: string;
    /** 剥离日期表达式后的剩余标题（首尾空白收敛） */
    rest: string;
}

function pad(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function startOfToday(today: Date): Date {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function addDays(base: Date, n: number): Date {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
}

const WEEKDAY: Record<string, number> = { 日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

/** 返回 [regex 源, 命中后构造日期]。顺序即优先级：长模式在前。 */
function patterns(today: Date): { re: RegExp; make: (m: RegExpMatchArray) => Date | null }[] {
    const t0 = startOfToday(today);
    return [
        // 大后天 / 后天 / 明天 / 今天
        { re: /大后天/, make: () => addDays(t0, 3) },
        { re: /后天/, make: () => addDays(t0, 2) },
        { re: /明天/, make: () => addDays(t0, 1) },
        { re: /今天/, make: () => t0 },
        // N 天后（1-999）
        { re: /(\d{1,3})\s*天[后後]/, make: (m) => addDays(t0, Math.min(999, parseInt(m[1], 10))) },
        // 下周X / 下星期X / 下礼拜X（下周一起算的下一周）
        {
            re: /下(?:周|星期|礼拜)([一二三四五六日])/,
            make: (m) => {
                // 周一起算索引：getDay(日=0) 转周一=0
                const monIdx = (WEEKDAY[m[1]] + 6) % 7;
                const monday = addDays(t0, -((t0.getDay() + 6) % 7));
                return addDays(monday, 7 + monIdx);
            },
        },
        // 周X / 星期X / 礼拜X（最近的未来，含今天）
        {
            re: /(?:周|星期|礼拜)([一二三四五六日])/,
            make: (m) => {
                const target = WEEKDAY[m[1]];
                const diff = (target - t0.getDay() + 7) % 7;
                return addDays(t0, diff);
            },
        },
        // M月D日 / M月D号（今年；已过 → 明年）
        {
            re: /(\d{1,2})\s*月\s*(\d{1,2})[日号]/,
            make: (m) => {
                const month = parseInt(m[1], 10);
                const day = parseInt(m[2], 10);
                if (month < 1 || month > 12 || day < 1 || day > 31) return null;
                const d = new Date(today.getFullYear(), month - 1, day);
                if (d.getMonth() !== month - 1 || d.getDate() !== day) return null; // 不存在（2/30）
                if (d < startOfToday(today)) d.setFullYear(d.getFullYear() + 1);
                return d;
            },
        },
        // ISO 透传（yyyy-MM-dd / yyyy/M/d）
        {
            re: /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/,
            make: (m) => {
                const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
                if (d.getMonth() !== parseInt(m[2], 10) - 1 || d.getDate() !== parseInt(m[3], 10)) return null;
                return d;
            },
        },
    ];
}

/** 解析标题中的中文日期表达式。命中 → { date, rest }（表达式已剥离）；未命中 → null。 */
export function parseNaturalDate(text: string, today: Date = new Date()): ParsedNaturalDate | null {
    const src = text.trim();
    if (!src) return null;
    for (const p of patterns(today)) {
        const m = src.match(p.re);
        if (!m) continue;
        const d = p.make(m);
        if (!d) continue;
        const rest = src.replace(m[0], " ").replace(/\s{2,}/g, " ").trim();
        return { date: pad(d), rest };
    }
    return null;
}
