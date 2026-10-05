// ============================================================
// 冒烟/基准脚本共享件：目标解析 + 共享内核防呆 + 残留清扫
// （改造自小驴考试 scripts/lib/smoke-kernel.mjs @fa57d6a，前缀注册表换为本插件）
// 背景：真机内核常与其他插件项目和真实数据共用——
// 写型冒烟（建删笔记本/写台账文档/建 riff 卡组）不应直打在用工作区：
//   - 其他插件的事件监听（打卡桥/雷切/管家服务桥等）会对冒烟写入产生真实反应
//   - 并发索引放大内核侧 flakiness
//   - 同步开启的工作区会被测试库的建删反复搅动同步桶
// 三层防护：
//   1) resolveTarget：SIYUAN_BASE_URL（兼容 SIYUAN_URL）/ SIYUAN_TOKEN（argv 优先），缺 token 即退出
//   2) sweepOrphans：清扫上次崩溃残留的临时笔记本（前缀注册表匹配）
//   3) guardScratch：目标内核存在非临时笔记本 → 拒跑；SIYUAN_E2E_ALLOW_SHARED=1 显式豁免
// 外发约束：凡会向已配置 AI 模型真实发请求的检查步，默认跳过；SIYUAN_E2E_AI=1 显式启用（aiEnabled()）
// 隔离靶场做法（推荐）：独立 workspace 起第二个思源实例（端口自动顺延为 6807），
// 实例内只装被测插件；每个插件项目用自己的靶场 workspace，不跨项目共用。
// CLI 用法（bash 脚本集成）：node scripts/lib/smoke-kernel.mjs [base] [token]
//   执行 清扫残留 + 防呆守卫；通过退出 0，拒绝退出 1。
// ============================================================
import { pathToFileURL } from "node:url";

/** 历来所有冒烟临时笔记本前缀/名称（新脚本一律用 siyuan-home-smoke-；旧名保留供清扫） */
export const SCRATCH_PREFIXES = [
    "siyuan-home-smoke-",
    "LVH-真机批", // 旧：e2e-core.sh / vitest.live（已更名，保留清扫）
    "LVH-端点实测", // 旧：e2e-endpoints.sh（已更名，保留清扫）
];

export function isScratchName(name) {
    return SCRATCH_PREFIXES.some((p) => name.startsWith(p));
}

/** 目标解析：argv > SIYUAN_BASE_URL > SIYUAN_URL（env 文件惯例）> 默认端口；token 缺失返回 null（不使用默认凭据） */
export function resolveTarget({ baseArg, tokenArg } = {}) {
    const base = String(baseArg ?? process.env.SIYUAN_BASE_URL ?? process.env.SIYUAN_URL ?? "http://127.0.0.1:6806").replace(/\/+$/, "");
    const token = tokenArg ?? process.env.SIYUAN_TOKEN ?? "";
    if (!token) {
        console.error("✗ 缺少思源 token：请传入第二个参数或设置 SIYUAN_TOKEN；不会使用默认 token");
        process.exitCode = 1;
        return null;
    }
    return { base, token };
}

/** 外发开关（约定 4）：会向 AI 模型真实发请求的检查步默认跳过，SIYUAN_E2E_AI=1 显式启用 */
export function aiEnabled() {
    return process.env.SIYUAN_E2E_AI === "1";
}

/** 统一 api 调用器（思源返回非 2xx 或 code!==0 时抛错） */
export function makeApi(base, token) {
    return async function api(path, body) {
        const res = await fetch(base + path, {
            method: "POST",
            headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(body ?? {}),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    };
}

/** 思源建库 id 双形态（3.8.5 裸 id / 3.8.6 { notebook: { id } }） */
export function notebookIdOf(data) {
    return data?.notebook?.id ?? data?.notebook ?? data?.id ?? "";
}

async function listNotebooks(api) {
    const r = await api("/api/notebook/lsNotebooks", {});
    if (r.code !== 0) throw new Error(`lsNotebooks code=${r.code} ${r.msg}`);
    return r.data?.notebooks ?? [];
}

/** 清扫上次崩溃残留的临时笔记本（只动前缀注册表内的，绝不碰用户数据） */
export async function sweepOrphans(api) {
    const orphans = (await listNotebooks(api)).filter((n) => isScratchName(n.name));
    for (const n of orphans) {
        try {
            await api("/api/notebook/removeNotebook", { notebook: n.id });
            console.log(`  清扫残留临时库：${n.name}`);
        } catch (e) {
            console.log(`  ⚠ 残留清理失败（不影响本次运行）：${n.name} — ${String(e).slice(0, 60)}`);
        }
    }
}

/** 共享内核防呆：存在任何非冒烟前缀的笔记本即拒跑写型冒烟。通过/豁免返回 true，拒绝返回 false（exitCode=1） */
export async function guardScratch(api, { base } = {}) {
    const notebooks = await listNotebooks(api);
    const foreign = notebooks.filter((n) => !isScratchName(n.name));
    if (!foreign.length) return true;
    if (process.env.SIYUAN_E2E_ALLOW_SHARED === "1") {
        console.log(`  ⚠ SIYUAN_E2E_ALLOW_SHARED=1：在共享内核上直跑写型冒烟（${foreign.length} 个既有笔记本），临时库用后即清`);
        return true;
    }
    console.error([
        `✗ 目标内核 ${base} 不是隔离靶场：存在 ${foreign.length} 个非冒烟笔记本（如「${foreign[0].name}」）。`,
        "  写型冒烟会建删笔记本并写入台账文档——与其他插件/真实数据共用的内核不宜直跑：",
        "    ① 推荐：独立 workspace 起第二个思源实例（端口自动顺延，只装被测插件），见 CONTRIBUTING「内核靶场约定」；",
        "    ② 或确认风险后设 SIYUAN_E2E_ALLOW_SHARED=1 显式豁免（临时库自清理，脚本崩溃可能残留）。",
    ].join("\n"));
    process.exitCode = 1;
    return false;
}

// CLI 模式（bash 脚本集成入口）：清扫残留 + 防呆，通过 0 / 拒绝 1
// 注意：不用 process.exit()——Node/Windows 下带未排空的 fetch keep-alive 句柄会触发
// libuv 断言崩溃（exit 127）；用 exitCode + 自然排空（keep-alive 空闲数秒后自行退出）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const target = resolveTarget({ baseArg: process.argv[2], tokenArg: process.argv[3] });
    if (target) {
        const api = makeApi(target.base, target.token);
        try {
            await sweepOrphans(api);
            const ok = await guardScratch(api, { base: target.base });
            if (ok) console.log(`靶场守卫通过：${target.base}`);
        } catch (e) {
            console.error(`✗ 靶场守卫失败（${target.base}）：${e instanceof Error ? e.message : e}`);
            process.exitCode = 1;
        }
    }
}
