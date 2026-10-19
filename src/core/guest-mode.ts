/**
 * 多设备家庭协作的只读访客模式（§16/§17 297波）：
 * 当设备放置在客厅平板、智能大屏或临时借给访客/孩子/老人时，
 * 仅开放药箱、日程日历、应急地址与生活服务卡，安全遮蔽财务账目、合同押金与敏感证件，
 * 并在操作层面强制只读保护，禁止删改台账与配置。
 * 纯逻辑函数，100% 可单元测试。
 */
import type { Reminder } from "@/types";

export interface GuestModeConfig {
    /** 是否激活访客模式 */
    active: boolean;
    /** 允许访客查看的模块白名单 */
    allowedModules: string[];
    /** 是否遮蔽金额数值（显示为 ***） */
    maskFinancials: boolean;
    /** 是否遮蔽敏感证件号码 */
    maskIdNumbers: boolean;
    /** 是否强制只读禁用写操作 */
    readOnly: boolean;
}

/** 默认访客模式允许查看的安全生活模块 */
export const DEFAULT_GUEST_ALLOWED_MODULES: readonly string[] = [
    "medicine",   // 家庭应急药箱与用药指南
    "address",    // 常用生活地址与物业维修联系
    "food",       // 美食菜谱与家庭忌口
    "stock",      // 生活日用与应急物资储备
    "chores",     // 家务分工与定期清洁保洁
    "pets",       // 宠物疫苗与护理档案
];

/** 金额与敏感数字字段名白名单 */
export const FINANCIAL_FIELD_KEYS: readonly string[] = [
    "amount",
    "price",
    "deposit",
    "target_amount",
    "refund_amount",
    "rawAmount",
    "monthlyCost",
    "annualCost",
];

export const SENSITIVE_ID_FIELD_KEYS: readonly string[] = [
    "holder_no",
    "account_note",
    "tracking_no",
    "pickup_code",
];

export function createDefaultGuestConfig(active = false): GuestModeConfig {
    return {
        active,
        allowedModules: [...DEFAULT_GUEST_ALLOWED_MODULES],
        maskFinancials: true,
        maskIdNumbers: true,
        readOnly: true,
    };
}

/**
 * 判定指定模块在当前访客模式配置下是否允许查看
 */
export function isModuleAllowedForGuest(moduleId: string, config: GuestModeConfig): boolean {
    if (!config.active) return true;
    if (!moduleId) return false;
    return config.allowedModules.includes(moduleId);
}

/**
 * 依据访客模式白名单过滤可见模块列表
 */
export function filterGuestVisibleModules(allModuleIds: string[], config: GuestModeConfig): string[] {
    if (!config.active) return [...allModuleIds];
    return allModuleIds.filter((id) => config.allowedModules.includes(id));
}

/**
 * 依据访客模式过滤提醒事项列表（遮蔽敏感模块提醒）
 */
export function filterGuestReminders(reminders: Reminder[], config: GuestModeConfig): Reminder[] {
    if (!config.active) return [...reminders];
    return reminders.filter((r) => {
        // 允许无明确模块归属的通用备忘（如日程待办）
        if (!r.moduleId || r.moduleId === "adhoc") return true;
        return config.allowedModules.includes(r.moduleId);
    });
}

/**
 * 遮蔽敏感字段值（金额显示为 ***，身份证号脱敏）
 */
export function maskValueForGuest(value: any, fieldKey: string, config: GuestModeConfig): any {
    if (!config.active) return value;
    if (value === null || value === undefined || value === "") return value;

    // 1. 金额脱敏
    if (config.maskFinancials && FINANCIAL_FIELD_KEYS.includes(fieldKey)) {
        return "***";
    }

    // 2. 证件号脱敏
    if (config.maskIdNumbers && SENSITIVE_ID_FIELD_KEYS.includes(fieldKey)) {
        const str = String(value).trim();
        if (str.length <= 4) return "****";
        if (str.length <= 8) return str.slice(0, 2) + "****" + str.slice(-2);
        return str.slice(0, 3) + "******" + str.slice(-3);
    }

    return value;
}

/**
 * 检查当前动作是否被只读访客模式拦截
 */
export function checkGuestWritePermission(
    actionName: string,
    config: GuestModeConfig,
): { allowed: boolean; reason?: string } {
    if (!config.active || !config.readOnly) {
        return { allowed: true };
    }
    return {
        allowed: false,
        reason: `访客只读模式运行中，已拦截写入操作 [${actionName}]`,
    };
}

/**
 * 获取访客模式顶部安全横幅文本
 */
export function getGuestModeBannerInfo(config: GuestModeConfig): {
    isActive: boolean;
    badgeText: string;
    description: string;
} {
    if (!config.active) {
        return {
            isActive: false,
            badgeText: "正常模式",
            description: "完整权限与全量数据访问",
        };
    }
    return {
        isActive: true,
        badgeText: "🔒 访客模式",
        description: "仅展示生活安全公开模块，财务金额与私密证件已受控遮蔽，禁止修改数据",
    };
}
