// 窄屏走查：390px 视口四页签 + 横向溢出检测 —— node scripts/ui-walkthrough/shoot-mobile.mjs
// 输出 tmp/ui-shots/ui3-mobile/。溢出判定：scrollWidth − clientWidth ≠ 0 即 FAIL。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { APP, ensureKernel, login, openPanel, gotoTab, sleep } from "./lib.mjs";

mkdirSync("tmp/ui-shots/ui3-mobile", { recursive: true });
await ensureKernel();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", isMobile: true, hasTouch: true });
await login(ctx);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 160)));

await page.goto(APP, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(11000);
await openPanel(page);

for (const name of ["总览", "提醒", "台账", "成员"]) {
    await gotoTab(page, name);
    const overflow = await page.evaluate(() => {
        const el = document.querySelector(".lv-home");
        if (!el) return null;
        const bad = [];
        // 在横向滚动容器内的元素是预期形态（如台账表格），不计溢出
        const inScrollX = (node) => {
            for (let a = node.parentElement; a && a !== document.body; a = a.parentElement) {
                const o = getComputedStyle(a);
                if (o.overflowX === "auto" || o.overflowX === "scroll" || o.overflowX === "hidden") return true;
            }
            return false;
        };
        const walk = (node) => {
            for (const c of node.children) {
                const r = c.getBoundingClientRect();
                if (r.right > window.innerWidth + 2 && r.width > 30 && !inScrollX(c)) bad.push(`${(c.className || "").toString().slice(0, 40)} right=${Math.round(r.right)}`);
                if (bad.length < 8) walk(c);
            }
        };
        walk(el);
        return { delta: el.scrollWidth - el.clientWidth, offenders: bad.slice(0, 8) };
    });
    const fail = overflow && (overflow.delta !== 0 || overflow.offenders.length > 0);
    console.log(`${fail ? "FAIL" : "PASS"} ${name}: ${JSON.stringify(overflow)}`);
    const el = await page.$(".lv-home");
    if (el) await el.screenshot({ path: `tmp/ui-shots/ui3-mobile/m-${name}.png` });
}
await browser.close();
console.log("DONE");
