// UI 走查共享库（299 波入册）：靶场内核拉起 / 登录 / 面板操作 helpers。
// 靶场约定见 CONTRIBUTING「内核靶场约定」与 docs/testing/ui-walkthrough-runbook.md。
import { execSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
export const PORT = process.env.TEST_WS_PORT || "14680";
export const BASE = process.env.TEST_WS_URL || `http://127.0.0.1:${PORT}`;
export const TOKEN = process.env.SIYUAN_TOKEN || "";
export const APP = `${BASE}/stage/build/desktop/`;
export const COOKIE_FILE = path.resolve(ROOT, "tmp/ui3-cookies.json");
export const WS_DIR = process.env.TEST_WS_DIR || path.resolve(ROOT, "tmp/sy-ui3");
const KERNEL = process.env.SIYUAN_KERNEL || "D:\\biji\\SiYuan\\resources\\kernel\\SiYuan-Kernel.exe";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 内核不在则拉起（分离进程），等待就绪。 */
export async function ensureKernel() {
    const alive = await fetch(`${BASE}/check-auth`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok).catch(() => false);
    if (alive) return;
    execSync(`powershell.exe -NoProfile -Command "Start-Process -FilePath '${KERNEL}' -ArgumentList 'serve','--workspace','${WS_DIR.replace(/\\/g, "\\\\")}','--port','${PORT}','--lang','zh-CN' -WindowStyle Hidden"`, { stdio: "ignore" });
    for (let i = 0; i < 30; i++) {
        await sleep(1000);
        if (await fetch(`${BASE}/check-auth`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok).catch(() => false)) return;
    }
    throw new Error("kernel failed to boot");
}

/** 会话 cookie：文件缓存 → 失效则经授权页登录（需已设访问授权码，或靶场未启用锁屏）。 */
export async function login(ctx) {
    if (existsSync(COOKIE_FILE)) {
        const cookies = JSON.parse(readFileSync(COOKIE_FILE, "utf8"));
        ctx.addCookies(cookies);
        const page = await ctx.newPage();
        const ok = await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 20000 })
            .then((r) => !r.url().includes("check-auth")).catch(() => false);
        await page.close();
        if (ok) return;
    }
    const page = await ctx.newPage();
    await page.goto(`${BASE}/check-auth`, { waitUntil: "domcontentloaded" });
    await page.locator("input:visible").first().fill(process.env.TEST_WS_AUTH_CODE || "ui3pass1234");
    await page.locator("button:visible").first().click();
    await sleep(2500);
    writeFileSync(COOKIE_FILE, JSON.stringify(await ctx.cookies()));
    await page.close();
}

/** 打开管家面板并跳过首启向导（幂等）。 */
export async function openPanel(page) {
    await page.evaluate(() => {
        const tb = document.getElementById("toolbar");
        const el = tb?.querySelector('[data-name="siyuan-home"]')
            ?? Array.from(tb?.children ?? []).find((c) => (c.getAttribute("aria-label") || "").includes("小驴管家"));
        el?.click();
    });
    await sleep(3500);
    await page.evaluate(() => {
        document.querySelectorAll(".b3-snackbar__close").forEach((b) => b.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    });
    await page.keyboard.press("Escape");
    await sleep(600);
    await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll(".lv-card button, .lv-card .b3-button")).find((x) => (x.textContent || "").includes("跳过"));
        b?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await sleep(2200);
}

/** 页签切换（按可见文案）。 */
export async function gotoTab(page, name) {
    await page.evaluate((n) => {
        const els = Array.from(document.querySelectorAll("button[data-s], .lv-tabs__item")).filter((e) => e.textContent?.trim() === n);
        els[0]?.click();
    }, name);
    await sleep(2200);
}

/**
 * 面板 reparent 到 body 全量渲染（祖先裁剪失效），整屏截图用。
 * 注意：reparent 会重置入场编排动画（lv-rise backwards+delay），截图前需再等 ~600ms。
 */
export async function armFullRender(page) {
    await page.evaluate(() => {
        const el = document.querySelector(".lv-home");
        if (!el) return;
        if (!el.dataset.reparented) {
            el.dataset.reparented = "1";
            document.body.appendChild(el);
        }
        // width 必须显式给定：.lv-home 带 container-type:inline-size（尺寸包含），
        // 固定定位下不设宽度会把 inline-size 解析为 0，整面板塌缩成竖条
        el.style.cssText = "position:fixed;inset:auto;top:0;left:0;width:calc(100vw - 32px);z-index:9999;background:var(--b3-theme-background);overflow:visible;height:auto;padding:16px";
    });
    await sleep(600);
}

/** 主题切换（外部 API：modeOS 必须关掉，否则 headless/系统偏好覆盖 mode）。 */
export async function setTheme(mode) {
    const r = await fetch(`${BASE}/api/system/getConf`, { method: "POST", headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" }, body: "{}" });
    const conf = (await r.json()).data.conf;
    await fetch(`${BASE}/api/setting/setAppearance`, { method: "POST", headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...conf.appearance, mode, modeOS: false }) });
}
