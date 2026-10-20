import { describe, it, expect } from "vitest";

/**
 * 309 波回归守卫：顶栏图标消失的根因是「onload 里 await 之后才 addTopBar」。
 * 思源宿主在插件 onload 返回前完成顶栏装配；若注册发生在 await 之后，条目可能落不到
 * toolbar，且重载/热更新后残留条目不更新 —— 表现为图标"突然消失"。
 *
 * 本测试用静态分析守住该契约：onload 内所有登记类调用必须出现在第一个 await 之前。
 * 这里以受控样例校验判定逻辑本身，再对真实源文件断言。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** 返回 onload 体内出现在第一个 await 之后的登记调用（空数组=合规） */
export function findLateRegistrations(source: string): string[] {
    const start = source.indexOf("async onload(");
    if (start < 0) return [];
    // 取 onload 方法体（到下一个同级方法声明为止，粗略但足够）
    const rest = source.slice(start);
    const endMatch = /\n {4}(?:private |public |async |static |[A-Za-z_]+\()/.exec(rest.slice(20));
    const body = endMatch ? rest.slice(0, 20 + endMatch.index) : rest;

    const firstAwait = body.search(/\bawait\b/);
    const registrations = [...body.matchAll(/\bthis\.(addTopBar|addTab|addCommand|addDock|addStatusBar|addIcons)\s*\(/g)];
    return registrations
        .filter((m) => firstAwait >= 0 && (m.index ?? 0) > firstAwait)
        .map((m) => m[1]);
}

describe("309 波 顶栏注册时序契约", () => {
    it("判定逻辑能识别 await 之后的登记调用", () => {
        const bad = `
export default class P {
    async onload() {
        await this.loadSettings();
        this.addTopBar({ icon: "iconEmoji", title: "x" });
    }
    other() {}
}`;
        expect(findLateRegistrations(bad)).toEqual(["addTopBar"]);
    });

    it("同步登记（await 之前）视为合规", () => {
        const good = `
export default class P {
    async onload() {
        this.addTopBar({ icon: "iconEmoji", title: "x" });
        await this.loadSettings();
    }
    other() {}
}`;
        expect(findLateRegistrations(good)).toEqual([]);
    });

    it("真实 src/index.ts 的 onload 不得在 await 之后登记顶栏/页签/命令/状态栏", () => {
        const source = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
        expect(findLateRegistrations(source)).toEqual([]);
    });
});
