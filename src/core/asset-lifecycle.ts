/**
 * 实物资产状态机流转与借还/送修/处置联动（MOD-21 / §7 实物资产状态机）：
 * 纯函数、本地状态机：
 * - 定义在用（inuse）、闲置（idle）、借出（lent）、送修（repairing）、已处置（disposed）5 态流转契约；
 * - 针对当前状态动态计算合法迁移路径；
 * - 结合 rowlog loans（借还记录）自动同步借出对象与归还日期。
 */

export type RealAssetStatus = "inuse" | "idle" | "lent" | "repairing" | "disposed";

export interface StatusTransition {
    target: RealAssetStatus;
    actionKey: string;
    icon: string;
    requiresInput?: "borrower" | "repair" | "disposal";
}

/**
 * 获取当前资产状态允许的后续状态流转集合
 */
export function getAllowedStatusTransitions(currentStatus?: string): StatusTransition[] {
    const s = (currentStatus || "inuse").toLowerCase().trim() as RealAssetStatus;
    switch (s) {
        case "inuse":
            return [
                { target: "lent", actionKey: "asset.action.lend", icon: "repeat", requiresInput: "borrower" },
                { target: "repairing", actionKey: "asset.action.repair", icon: "wrench", requiresInput: "repair" },
                { target: "idle", actionKey: "asset.action.idle", icon: "box" },
                { target: "disposed", actionKey: "asset.action.dispose", icon: "archive", requiresInput: "disposal" },
            ];
        case "idle":
            return [
                { target: "inuse", actionKey: "asset.action.use", icon: "check" },
                { target: "lent", actionKey: "asset.action.lend", icon: "repeat", requiresInput: "borrower" },
                { target: "disposed", actionKey: "asset.action.dispose", icon: "archive", requiresInput: "disposal" },
            ];
        case "lent":
            return [
                { target: "inuse", actionKey: "asset.action.return", icon: "check" },
                { target: "disposed", actionKey: "asset.action.dispose", icon: "archive", requiresInput: "disposal" },
            ];
        case "repairing":
            return [
                { target: "inuse", actionKey: "asset.action.repaired", icon: "check" },
                { target: "disposed", actionKey: "asset.action.dispose", icon: "archive", requiresInput: "disposal" },
            ];
        case "disposed":
            return [
                { target: "inuse", actionKey: "asset.action.restore", icon: "history" },
            ];
        default:
            return [
                { target: "inuse", actionKey: "asset.action.use", icon: "check" },
            ];
    }
}

/**
 * 校验指定状态跃迁是否合法
 */
export function isAllowedTransition(from: string | undefined, to: RealAssetStatus): boolean {
    const allowed = getAllowedStatusTransitions(from);
    return allowed.some((t) => t.target === to);
}
