// 交互态走查：hover（提醒行/模块卡/快速记录/成员卡）+ 详情弹窗 + 键盘 focus
// node scripts/ui-walkthrough/shoot-hover.mjs —— 输出 tmp/ui-shots/ui3-hover/。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { APP, ensureKernel, login, openPanel, gotoTab, sleep } from "./lib.mjs";

mkdirSync("tmp/ui-shots/ui3-hover", { recursive: true });
await ensureKernel();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "zh-CN" });
await login(ctx);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 160)));

await page.goto(APP, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(11000);
await openPanel(page);

// 提醒行 hover：ops 浮现 + 色轨泛光
await gotoTab(page, "提醒");
const rem = await page.$(".lv-rem");
if (rem) {
    await rem.hover();
    await sleep(500);
    await rem.screenshot({ path: "tmp/ui-shots/ui3-hover/hover-rem.png" });
    console.log("shot hover-rem");
}

// 模块卡 hover：浮起 + 图标转 + 角落辉光
await gotoTab(page, "总览");
const mod = await page.$(".lv-mod");
if (mod) {
    await mod.scrollIntoViewIfNeeded();
    await mod.hover();
    await sleep(600);
    await mod.screenshot({ path: "tmp/ui-shots/ui3-hover/hover-mod.png" });
    console.log("shot hover-mod");
}
const qbtn = await page.$(".lv-qbtn");
if (qbtn) {
    await qbtn.scrollIntoViewIfNeeded();
    await qbtn.hover();
    await sleep(400);
    await qbtn.screenshot({ path: "tmp/ui-shots/ui3-hover/hover-qbtn.png" });
    console.log("shot hover-qbtn");
}

// 成员卡 hover：头行按钮浮现
await gotoTab(page, "成员");
const person = await page.$(".lv-person");
if (person) {
    await person.scrollIntoViewIfNeeded();
    await person.hover();
    await sleep(400);
    await person.screenshot({ path: "tmp/ui-shots/ui3-hover/hover-person.png" });
    console.log("shot hover-person");
}

// 台账详情弹窗（kv 排版）
await gotoTab(page, "台账");
await page.evaluate(() => document.querySelector(".lv-table tbody tr")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await sleep(1800);
const dlg = await page.evaluateHandle(() => {
    const list = document.querySelectorAll(".b3-dialog__container");
    return list[list.length - 1];
});
if (dlg.asElement()) {
    await dlg.asElement().screenshot({ path: "tmp/ui-shots/ui3-hover/detail-dialog.png" });
    console.log("shot detail-dialog");
}
await page.keyboard.press("Escape");
await sleep(800);

// 键盘 focus-visible：页签聚焦轮廓
await gotoTab(page, "总览");
await page.evaluate(() => document.querySelector('.lv-tabs__item[data-s="reminders"]')?.focus());
await sleep(400);
await page.screenshot({ path: "tmp/ui-shots/ui3-hover/focus-tab.png", clip: { x: 0, y: 0, width: 1440, height: 220 } });
console.log("shot focus-tab");

await browser.close();
console.log("DONE");
