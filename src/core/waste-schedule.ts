/**
 * 家庭市政垃圾分类与周期回收日程（§16/§17 316波，调研缺口 G7）：
 * 支持厨余/生活/可回收/有害/大件垃圾清运周期推算，
 * 涵盖每周固定日、隔周、每月固定日及每月最后一个周几等市政规则。
 * 纯函数，无网络，100% 可单元测试。
 */

export type WasteType = "kitchen" | "recyclable" | "hazardous" | "residual" | "bulky";

export interface WasteRule {
    type: WasteType;
    label: string;
    pattern: "weekly" | "biweekly" | "monthly_day" | "last_weekday";
    /** weekly 模式：0=周日，1=周一，...，6=周六 */
    daysOfWeek?: number[];
    /** biweekly 模式：基准日 YYYY-MM-DD */
    anchorDate?: string;
    /** monthly_day 模式：每月第几天 (1-31) */
    dayOfMonth?: number;
    /** last_weekday 模式：0=周日，...，6=周六 */
    lastWeekday?: number;
}

export interface UpcomingPickup {
    date: string;
    type: WasteType;
    label: string;
    daysLeft: number;
    isToday: boolean;
    isTomorrow: boolean;
}

function parseIso(iso: string): Date {
    const [y, m, d] = (iso ?? "").split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

function formatIso(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
}

function dayDiff(fromIso: string, toIso: string): number {
    const a = parseIso(fromIso).getTime();
    const b = parseIso(toIso).getTime();
    return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/** 默认常见的市政分类规则模板 */
export const DEFAULT_WASTE_RULES: WasteRule[] = [
    { type: "kitchen", label: "厨余垃圾", pattern: "weekly", daysOfWeek: [1, 3, 5, 0] },
    { type: "residual", label: "其他垃圾", pattern: "weekly", daysOfWeek: [1, 2, 3, 4, 5, 6, 0] },
    { type: "recyclable", label: "可回收物", pattern: "weekly", daysOfWeek: [6] },
    { type: "hazardous", label: "有害垃圾", pattern: "last_weekday", lastWeekday: 5 }, // 最后一个周五
];

/** 判定某一天是否匹配该清运规则 */
export function isPickupDay(rule: WasteRule, dateStr: string): boolean {
    const d = parseIso(dateStr);
    if (Number.isNaN(d.getTime())) return false;
    const weekday = d.getDay();

    switch (rule.pattern) {
        case "weekly":
            return (rule.daysOfWeek ?? []).includes(weekday);

        case "biweekly": {
            if (!rule.anchorDate) return false;
            const diff = dayDiff(rule.anchorDate, dateStr);
            return diff >= 0 && diff % 14 === 0;
        }

        case "monthly_day": {
            if (!rule.dayOfMonth) return false;
            return d.getDate() === rule.dayOfMonth;
        }

        case "last_weekday": {
            if (rule.lastWeekday === undefined) return false;
            if (weekday !== rule.lastWeekday) return false;
            // 如果加 7 天就跨月了，说明这是当月最后一个该周几
            const nextWeek = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
            return nextWeek.getMonth() !== d.getMonth();
        }

        default:
            return false;
    }
}

/**
 * 推算未来窗口期内（默认 14 天）所有的垃圾回收清运节点
 */
export function nextWastePickups(
    rules: WasteRule[] = DEFAULT_WASTE_RULES,
    referenceDate?: string,
    daysForward = 14,
): UpcomingPickup[] {
    const today = referenceDate || formatIso(new Date());
    const baseDate = parseIso(today);
    const pickups: UpcomingPickup[] = [];

    const activeRules = (rules ?? []).filter((r) => r && r.type);

    for (let i = 0; i < Math.max(1, daysForward); i++) {
        const cur = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + i);
        const curIso = formatIso(cur);
        const daysLeft = i;

        for (const r of activeRules) {
            if (isPickupDay(r, curIso)) {
                pickups.push({
                    date: curIso,
                    type: r.type,
                    label: r.label,
                    daysLeft,
                    isToday: daysLeft === 0,
                    isTomorrow: daysLeft === 1,
                });
            }
        }
    }

    return pickups.sort(
        (a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type),
    );
}

/**
 * 格式化为可直接复制/展示的清运时间表
 */
export function formatWasteScheduleText(pickups: UpcomingPickup[], today?: string): string {
    const curToday = today || formatIso(new Date());
    if (!pickups || pickups.length === 0) return "未来两周内无垃圾回收排期。";

    const lines: string[] = [
        `🚛 家庭垃圾分类清运日程（基准：${curToday}）`,
        "──────────────────────",
    ];

    // 按日期聚类展示
    const byDate = new Map<string, UpcomingPickup[]>();
    for (const p of pickups) {
        const list = byDate.get(p.date) ?? [];
        list.push(p);
        byDate.set(p.date, list);
    }

    for (const [date, items] of byDate) {
        const first = items[0];
        const dayTag = first.isToday ? "【今天】" : first.isTomorrow ? "【明天】" : `${first.daysLeft} 天后`;
        const itemNames = items.map((it) => it.label).join("、");
        lines.push(`• ${date} ${dayTag}：${itemNames}`);
    }

    return lines.join("\n");
}
