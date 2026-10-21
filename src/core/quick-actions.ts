/**
 * 快速生活流水动作（Quick Event Actions）：
 * 区分“实体资产/长期档案建档（一次性，低频）”与“日常高频流水录入（加油/充放电/生理指标/家务打卡）”，
 * 提供开箱即用的轻量流水构建纯函数与参数校验，赋能快速记录弹层“秒记日常流水”的最佳动线。
 * 纯函数，100% 可单元测试。
 */

export interface QuickFuelingInput {
    date: string; // YYYY-MM-DD
    mileage?: number;
    amount: number; // 费用（元）
    liters?: number; // 升数
    fuelType?: string; // 汽油/电量
    note?: string;
}

export interface QuickVitalInput {
    date: string; // YYYY-MM-DD
    time?: string; // HH:mm
    metricType: "bp" | "glucose"; // 血压或血糖
    systolic?: number; // 收缩压
    diastolic?: number; // 舒张压
    glucose?: number; // 血糖值
    glucoseTiming?: "fasting" | "postprandial" | "random";
    pulse?: number; // 脉搏
    note?: string;
}

export interface QuickChoreInput {
    date: string;
    memberId: string;
    memberName: string;
    choreTitle: string;
    points?: number;
    note?: string;
}

/** 构建加油/充电流水对象 */
export function buildFuelingLog(input: QuickFuelingInput): Record<string, unknown> {
    const record: Record<string, unknown> = {
        date: input.date || new Date().toISOString().slice(0, 10),
        cost: input.amount,
        at: new Date().toISOString(),
    };
    if (input.mileage !== undefined && Number.isFinite(input.mileage)) record.odometer = input.mileage;
    if (input.liters !== undefined && Number.isFinite(input.liters)) record.liters = input.liters;
    if (input.fuelType) record.category = input.fuelType;
    if (input.note) record.note = input.note.trim();
    return record;
}

/** 构建生理指标读数对象 */
export function buildVitalLog(input: QuickVitalInput): Record<string, unknown> {
    const record: Record<string, unknown> = {
        date: input.date || new Date().toISOString().slice(0, 10),
        time: input.time || new Date().toTimeString().slice(0, 5),
        at: new Date().toISOString(),
    };
    if (input.metricType === "bp") {
        if (input.systolic !== undefined) record.systolic = input.systolic;
        if (input.diastolic !== undefined) record.diastolic = input.diastolic;
        if (input.pulse !== undefined) record.pulse = input.pulse;
    } else if (input.metricType === "glucose") {
        if (input.glucose !== undefined) record.glucose = input.glucose;
        record.glucoseTiming = input.glucoseTiming || "fasting";
    }
    if (input.note) record.note = input.note.trim();
    return record;
}

/** 构建家务打卡记录对象 */
export function buildChoreLog(input: QuickChoreInput): Record<string, unknown> {
    return {
        date: input.date || new Date().toISOString().slice(0, 10),
        memberId: input.memberId,
        memberName: input.memberName,
        choreTitle: input.choreTitle,
        points: input.points ?? 0,
        note: input.note?.trim() || "",
        at: new Date().toISOString(),
    };
}
