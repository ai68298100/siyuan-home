/**
 * 家庭生活律动与就绪成就（Weekly Pulse & Achievements）：
 * 参考原型参考图（Bento/Streak/Achievements 设计规范），
 * 派生本周 7 天日程就绪脉冲与家庭安全/健康生活成就勋章。
 * 纯函数，100% 可单元测试。
 */
import type { HomeSettings, Reminder } from "@/types";
import { localDateKey } from "./hub/rule";

export interface DayPulseItem {
    date: string; // YYYY-MM-DD
    dayNum: number; // 1-31
    weekday: string; // 周一~周日
    isToday: boolean;
    isPast: boolean;
    isFuture: boolean;
    dueCount: number;
    hasOverdue: boolean;
}

export interface FamilyAchievement {
    id: string;
    title: string;
    desc: string;
    icon: string;
    achieved: boolean;
}

/** 派生当前周（周一至周日）的 7 天生活日程脉冲 */
export function getWeeklyPulse(asOfDate = new Date(), reminders: Reminder[] = []): DayPulseItem[] {
    const todayKey = localDateKey(asOfDate);
    const dayOfWeek = asOfDate.getDay(); // 0 is Sunday, 1 is Monday...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(asOfDate);
    monday.setDate(asOfDate.getDate() + mondayOffset);

    const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    const pulse: DayPulseItem[] = [];

    const remindersByDate = new Map<string, number>();
    for (const r of reminders) {
        if (!r.dueDate) continue;
        remindersByDate.set(r.dueDate, (remindersByDate.get(r.dueDate) ?? 0) + 1);
    }

    for (let i = 0; i < 7; i++) {
        const cur = new Date(monday);
        cur.setDate(monday.getDate() + i);
        const curKey = localDateKey(cur);
        const isToday = curKey === todayKey;
        const isPast = curKey < todayKey;
        const isFuture = curKey > todayKey;
        const count = remindersByDate.get(curKey) ?? 0;
        const hasOverdue = isPast && count > 0;

        pulse.push({
            date: curKey,
            dayNum: cur.getDate(),
            weekday: weekdays[i],
            isToday,
            isPast,
            isFuture,
            dueCount: count,
            hasOverdue,
        });
    }

    return pulse;
}

/** 派生家庭生活管理成就勋章 */
export function getFamilyAchievements(
    settings: HomeSettings,
    reminders: Reminder[] = [],
): FamilyAchievement[] {
    const overdueCount = reminders.filter((r) => r.daysLeft < 0).length;
    const certsCount = reminders.filter((r) => r.moduleId === "certs" && r.daysLeft < 0).length;
    const medExpCount = reminders.filter((r) => r.moduleId === "medicine" && r.daysLeft <= 0).length;

    const hasMembers = (settings.members ?? []).length > 0;
    const enabledModulesCount = (settings.enabledModules ?? []).length;
    const hasEmergencyCard = hasMembers && (settings.dbRefs?.health?.docId !== undefined);

    return [
        {
            id: "all_clear",
            title: "全家就绪无逾期",
            desc: "当前没有任何超期未办的事项",
            icon: "checkCircle",
            achieved: overdueCount === 0 && reminders.length > 0,
        },
        {
            id: "certs_safe",
            title: "全员证件安心在期",
            desc: "所有家庭成员的重要证照均在有效期内",
            icon: "shield",
            achieved: certsCount === 0 && (settings.dbRefs?.certs?.docId !== undefined),
        },
        {
            id: "medicine_fresh",
            title: "安心药箱零过期",
            desc: "常用常备药品全部在有效期内",
            icon: "medicine",
            achieved: medExpCount === 0 && (settings.dbRefs?.medicine?.docId !== undefined),
        },
        {
            id: "emergency_ready",
            title: "家庭急救卡就绪",
            desc: "已登记成员血型/过敏史与紧急联络资料",
            icon: "heartPulse",
            achieved: hasEmergencyCard,
        },
        {
            id: "full_archive",
            title: "生活掌柜大成",
            desc: "已启用并建档 8 个以上家庭生活核心台账",
            icon: "sparkle",
            achieved: enabledModulesCount >= 8,
        },
    ];
}
