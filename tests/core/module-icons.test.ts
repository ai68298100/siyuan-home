/**
 * 模块图标覆盖测试（第九十八波）：新增模块若忘配图标，此处红。
 */
import { describe, it, expect } from "vitest";
import { BUILT_IN_MODULES, MODULE_ICONS, moduleIcon } from "@/core/modules";

describe("modules.moduleIcon", () => {
    it("全部内置模块都有专属图标（防新模块漂移到 🗂）", () => {
        for (const m of BUILT_IN_MODULES) {
            expect(MODULE_ICONS[m.id], `module ${m.id} 缺图标`).toBeTruthy();
            expect(moduleIcon(m.id)).not.toBe("🗂");
        }
    });

    it("未知 id 回退 🗂", () => {
        expect(moduleIcon("ghost-module")).toBe("🗂");
    });
});
