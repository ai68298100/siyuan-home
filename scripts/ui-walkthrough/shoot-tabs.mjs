// UI 走查主脚本：四页签（+日历）双主题全高截图 —— node scripts/ui-walkthrough/shoot-tabs.mjs [light|dark]
// 用法/坑位见 docs/testing/ui-walkthrough-runbook.md。输出 tmp/ui-shots/ui3/。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { APP, ensureKernel, login, openPanel, gotoTab, armFullRender, setTheme, sleep } from "./lib.mjs";

const mode = process.argv[2] === "dark" ? 1 : 0;
const tag = mode ? "dark" : "light";
mkdirSync("tmp/ui-shots/ui3", { recursive: true });

await ensureKernel();
await setTheme(mode);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "zh-CN" });
await login(ctx);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 160)));

await page.goto(APP, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(11000);
await openPanel(page);

async function shotPanel(name, wait = 2200) {
    await page.waitForTimeout(wait);
    await armFullRender(page);
    const el = await page.$(".lv-home");
    if (el) await el.screenshot({ path: `tmp/ui-shots/ui3/${tag}-${name}.png` });
    console.log(`shot ${tag}-${name}`);
}

const overflow = async () => page.evaluate(() => {
    const el = document.querySelector(".lv-home");
    return el ? el.scrollWidth - el.clientWidth : -1;
});

await shotPanel("overview", 2500);
console.log("overview overflow px:", await overflow());

await gotoTab(page, "提醒");
await shotPanel("reminders");
console.log("reminders overflow px:", await overflow());

await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll(".lv-tabs__item")).filter((e) => e.textContent?.trim() === "日历");
    els[0]?.click();
});
await shotPanel("reminders-cal");

await gotoTab(page, "台账");
await shotPanel("ledger");

await gotoTab(page, "成员");
await shotPanel("members");

await browser.close();
console.log("DONE");
