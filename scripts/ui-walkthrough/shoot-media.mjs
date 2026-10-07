// 媒体降级态走查：打印（双主题）/ reduced-motion / forced-colors —— node scripts/ui-walkthrough/shoot-media.mjs
// 断言与坑位见 docs/testing/ui-walkthrough-runbook.md。输出 tmp/ui-shots/ui3-media/。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { APP, ensureKernel, login, openPanel, setTheme, sleep } from "./lib.mjs";

mkdirSync("tmp/ui-shots/ui3-media", { recursive: true });
await ensureKernel();

const browser = await chromium.launch({ channel: "msedge", headless: true });

// —— 打印：暗/浅两主题各一张（lv token 在 print 块整体翻纸面，暗色必须不残留深色块）
for (const [mode, tag] of [[1, "dark"], [0, "light"]]) {
    await setTheme(mode);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "zh-CN" });
    await login(ctx);
    const page = await ctx.newPage();
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11000);
    await openPanel(page);
    await page.emulateMedia({ media: "print" });
    await sleep(800);
    const el = await page.$(".lv-home");
    if (el) { await el.screenshot({ path: `tmp/ui-shots/ui3-media/print-${tag}.png` }); console.log(`shot print-${tag}`); }
    // 暗色打印翻纸面断言：卡片背景应为白系（非暗色 surface）
    if (tag === "dark") {
        const cardBg = await page.evaluate(() => {
            const c = document.querySelector(".lv-card");
            return c ? getComputedStyle(c).backgroundColor : "none";
        });
        const lum = cardBg.match(/\d+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
        console.log(`print-dark card bg: ${cardBg} (纸面断言: ${lum.every((v) => v > 200) ? "PASS" : "FAIL"})`);
    }
    await ctx.close();
}

// —— reduced-motion：切页签后入场编排应为 none
{
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "zh-CN" });
    await login(ctx);
    const page = await ctx.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11000);
    await openPanel(page);
    await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll("button[data-s], .lv-tabs__item")).filter((e) => e.textContent?.trim() === "提醒");
        els[0]?.click();
    });
    await sleep(400);
    const anim = await page.evaluate(() => {
        const m = document.querySelector(".lv-screen");
        return m ? getComputedStyle(m).animationName : "none";
    });
    console.log(`reduced-motion screen anim: ${anim} (断言: ${anim === "none" ? "PASS" : "FAIL"})`);
    await ctx.close();
}

// —— forced-colors：卡片边框应恢复 CanvasText 轮廓
{
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "zh-CN" });
    await login(ctx);
    const page = await ctx.newPage();
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11000);
    await openPanel(page);
    await sleep(1500);
    const border = await page.evaluate(() => {
        const c = document.querySelector(".lv-card");
        return c ? getComputedStyle(c).borderTopColor : "none";
    });
    console.log(`forced-colors card border: ${border} (断言: ${border === "rgb(0, 0, 0)" ? "PASS" : "FAIL"})`);
    await page.evaluate(() => {
        const el = document.querySelector(".lv-home");
        if (el) { el.dataset.reparented = "1"; document.body.appendChild(el);
            el.style.cssText = "position:fixed;inset:0;z-index:9999;background:var(--b3-theme-background);overflow:visible;height:auto;padding:16px"; }
    });
    await sleep(600);
    const el = await page.$(".lv-home");
    if (el) await el.screenshot({ path: "tmp/ui-shots/ui3-media/forced-colors-overview.png" });
    console.log("shot forced-colors-overview");
    await ctx.close();
}

await browser.close();
console.log("DONE");
