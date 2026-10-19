import { describe, it, expect } from "vitest";
import {
    createDefaultGuestConfig,
    isModuleAllowedForGuest,
    filterGuestVisibleModules,
    filterGuestReminders,
    maskValueForGuest,
    checkGuestWritePermission,
    getGuestModeBannerInfo,
    DEFAULT_GUEST_ALLOWED_MODULES,
    type GuestModeConfig,
} from "@/core/guest-mode";
import type { Reminder } from "@/types";

describe("core/guest-mode 多设备协作只读访客模式（297波）", () => {
    describe("createDefaultGuestConfig 默认配置", () => {
        it("正确生成默认配置", () => {
            const cfg = createDefaultGuestConfig();
            expect(cfg.active).toBe(false);
            expect(cfg.readOnly).toBe(true);
            expect(cfg.maskFinancials).toBe(true);
            expect(cfg.allowedModules).toEqual([...DEFAULT_GUEST_ALLOWED_MODULES]);
        });
    });

    describe("isModuleAllowedForGuest & filterGuestVisibleModules 模块白名单判定", () => {
        const activeCfg: GuestModeConfig = {
            active: true,
            allowedModules: ["medicine", "food", "address"],
            maskFinancials: true,
            maskIdNumbers: true,
            readOnly: true,
        };

        it("未激活时允许所有模块", () => {
            const inactiveCfg = createDefaultGuestConfig(false);
            expect(isModuleAllowedForGuest("contracts", inactiveCfg)).toBe(true);
            expect(filterGuestVisibleModules(["allowance", "contracts", "medicine"], inactiveCfg))
                .toEqual(["allowance", "contracts", "medicine"]);
        });

        it("激活时严格仅放行白名单模块", () => {
            expect(isModuleAllowedForGuest("medicine", activeCfg)).toBe(true);
            expect(isModuleAllowedForGuest("food", activeCfg)).toBe(true);
            expect(isModuleAllowedForGuest("contracts", activeCfg)).toBe(false);
            expect(isModuleAllowedForGuest("allowance", activeCfg)).toBe(false);

            const filtered = filterGuestVisibleModules(["medicine", "allowance", "contracts", "address"], activeCfg);
            expect(filtered).toEqual(["medicine", "address"]);
        });
    });

    describe("filterGuestReminders 提醒中枢事项过滤", () => {
        const activeCfg = createDefaultGuestConfig(true);

        it("过滤掉敏感财务与合同等黑名单模块提醒，保留白名单与通用日程", () => {
            const list: Reminder[] = [
                { id: "1", title: "降压药补充", moduleId: "medicine", level: "soon", dueDate: "2026-10-25" },
                { id: "2", title: "交房租押金", moduleId: "contracts", level: "overdue", dueDate: "2026-10-18" },
                { id: "3", title: "零花钱发放", moduleId: "allowance", level: "normal", dueDate: "2026-10-30" },
                { id: "4", title: "去超市备忘", moduleId: "adhoc", level: "normal", dueDate: "2026-10-22" },
            ];

            const filtered = filterGuestReminders(list, activeCfg);
            expect(filtered.map((r) => r.id)).toEqual(["1", "4"]);
        });
    });

    describe("maskValueForGuest 敏感数值与信息脱敏", () => {
        const activeCfg = createDefaultGuestConfig(true);

        it("遮蔽金额与财务字段", () => {
            expect(maskValueForGuest(5000, "amount", activeCfg)).toBe("***");
            expect(maskValueForGuest(1200, "deposit", activeCfg)).toBe("***");
            expect(maskValueForGuest(388, "monthlyCost", activeCfg)).toBe("***");
        });

        it("脱敏证件号与敏感代码", () => {
            expect(maskValueForGuest("123", "holder_no", activeCfg)).toBe("****");
            expect(maskValueForGuest("12345678", "holder_no", activeCfg)).toBe("12****78");
            expect(maskValueForGuest("110101199001011234", "holder_no", activeCfg)).toBe("110******234");
        });

        it("普通安全字段保持原值不变", () => {
            expect(maskValueForGuest("阿莫西林胶囊", "name", activeCfg)).toBe("阿莫西林胶囊");
            expect(maskValueForGuest("2026-12-31", "expiry", activeCfg)).toBe("2026-12-31");
        });

        it("未激活模式时不进行脱敏", () => {
            const inactive = createDefaultGuestConfig(false);
            expect(maskValueForGuest(5000, "amount", inactive)).toBe(5000);
            expect(maskValueForGuest("110101199001011234", "holder_no", inactive)).toBe("110101199001011234");
        });
    });

    describe("checkGuestWritePermission 只读权限门禁", () => {
        it("激活只读访客模式时拦截写操作", () => {
            const activeCfg = createDefaultGuestConfig(true);
            const perm = checkGuestWritePermission("deleteRow", activeCfg);
            expect(perm.allowed).toBe(false);
            expect(perm.reason).toContain("已拦截写入操作");
        });

        it("未激活模式允许写入", () => {
            const inactive = createDefaultGuestConfig(false);
            expect(checkGuestWritePermission("addRow", inactive).allowed).toBe(true);
        });
    });

    describe("getGuestModeBannerInfo 横幅提示状态", () => {
        it("正确生成激活状态下的横幅信息", () => {
            const info = getGuestModeBannerInfo(createDefaultGuestConfig(true));
            expect(info.isActive).toBe(true);
            expect(info.badgeText).toContain("访客模式");
            expect(info.description).toContain("受控遮蔽");
        });

        it("正常模式返回正常说明", () => {
            const info = getGuestModeBannerInfo(createDefaultGuestConfig(false));
            expect(info.isActive).toBe(false);
            expect(info.badgeText).toBe("正常模式");
        });
    });
});
