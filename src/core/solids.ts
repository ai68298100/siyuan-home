/**
 * 婴儿辅食添加 3 天观察期与健康过敏史联动逻辑（MOD-07 / §16 辅食观察期与过敏史联动）
 * 遵循儿科与营养学会权威指南：
 * - 引入每种新食材需进行 3 天排容性观察（Day 1、Day 2、Day 3）；
 * - 计算当前处于观察期的第几天、是否已安然度过 3 天安全耐受窗口；
 * - 若观察期内出现过敏或消化道不适反应，提供一键联动记录至 health 健康台账过敏史（category: allergy）。
 */

import { localDateKey } from "./hub/rule";

export type SolidsObservationStatus = "future" | "day1" | "day2" | "day3" | "completed";

export interface DayWindow {
    day: number;
    date: string;
    isToday: boolean;
    isPast: boolean;
}

export interface SolidsObservation {
    status: SolidsObservationStatus;
    currentDay: number; // 1, 2, 3 或 0 (未到), 4+ (已完成)
    remainingDays: number; // 观察期还剩几天（0 = 已完成）
    dayWindows: DayWindow[];
    isObserving: boolean;
    labelKey: string;
}

/**
 * 计算辅食 3 天观察期时效与每日窗口
 */
export function calculateSolidsObservation(introDateStr: string, todayKey?: string): SolidsObservation {
    const today = todayKey ?? localDateKey(new Date());
    const introDate = new Date(`${introDateStr}T00:00:00`);
    const curDate = new Date(`${today}T00:00:00`);

    if (Number.isNaN(introDate.getTime()) || Number.isNaN(curDate.getTime())) {
        return {
            status: "completed",
            currentDay: 4,
            remainingDays: 0,
            dayWindows: [],
            isObserving: false,
            labelKey: "solids.completed",
        };
    }

    const diffDays = Math.round((curDate.getTime() - introDate.getTime()) / 86400000);

    const dayWindows: DayWindow[] = [0, 1, 2].map((offset) => {
        const d = new Date(introDate.getTime() + offset * 86400000);
        const dateStr = localDateKey(d);
        return {
            day: offset + 1,
            date: dateStr,
            isToday: dateStr === today,
            isPast: dateStr < today,
        };
    });

    if (diffDays < 0) {
        return {
            status: "future",
            currentDay: 0,
            remainingDays: 3,
            dayWindows,
            isObserving: false,
            labelKey: "solids.future",
        };
    }

    if (diffDays === 0) {
        return {
            status: "day1",
            currentDay: 1,
            remainingDays: 2,
            dayWindows,
            isObserving: true,
            labelKey: "solids.day1",
        };
    }

    if (diffDays === 1) {
        return {
            status: "day2",
            currentDay: 2,
            remainingDays: 1,
            dayWindows,
            isObserving: true,
            labelKey: "solids.day2",
        };
    }

    if (diffDays === 2) {
        return {
            status: "day3",
            currentDay: 3,
            remainingDays: 0,
            dayWindows,
            isObserving: true,
            labelKey: "solids.day3",
        };
    }

    return {
        status: "completed",
        currentDay: diffDays + 1,
        remainingDays: 0,
        dayWindows,
        isObserving: false,
        labelKey: "solids.completed",
    };
}

export interface AllergyEntryPayload {
    name: string;
    category: "allergy";
    date: string;
    diagnosis: string;
    note: string;
    memberBlockId?: string;
}

/**
 * 构造从辅食排容观察转入健康台账过敏史的数据载荷
 */
export function buildAllergyFromFeeding(params: {
    foodName: string;
    reactionDate?: string;
    symptoms?: string;
    memberBlockId?: string;
}): AllergyEntryPayload {
    const food = params.foodName.trim() || "新辅食";
    const date = params.reactionDate || localDateKey(new Date());
    const symptoms = params.symptoms?.trim() || "";
    return {
        name: `${food}过敏`,
        category: "allergy",
        date,
        diagnosis: `辅食观察期排容不耐受（${food}）`,
        note: symptoms ? `观察期反应：${symptoms}` : "引入辅食后观察到过敏或消化道不适反应，暂停喂养并归档过敏史。",
        memberBlockId: params.memberBlockId,
    };
}
