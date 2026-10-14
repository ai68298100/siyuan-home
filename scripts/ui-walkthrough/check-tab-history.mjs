// Verify plugin tab history preserves the ledger query and scroll offset.
// This is intentionally run against the isolated SiYuan kernel used by the
// other Chrome walkthroughs, so it exercises the real Svelte panel lifecycle.
import { chromium } from "playwright";
import { APP, ensureKernel, login, openPanel, gotoTab } from "./lib.mjs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
    await ensureKernel();
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "zh-CN" });
    await login(context);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11000);
    await openPanel(page);
    await gotoTab(page, "台账");
    const home = page.locator(".lv-home");
    const search = page.locator('.lv-ledger-toolbar input[type="search"]');
    await search.waitFor({ state: "visible", timeout: 20000 });
    await search.fill("车辆");
    // Constrain the test container so the isolated fixture is scrollable even
    // when it has only a few rows. This changes only the test viewport.
    await home.evaluate((el) => { el.style.height = "400px"; el.style.overflow = "auto"; el.scrollTop = Math.max(240, el.scrollHeight / 3); });
    await page.waitForTimeout(250);
    const before = await page.evaluate(() => ({
        url: location.href, historyLength: history.length, history: history.state?.__siyuanHomeScreen ?? null,
        screen: document.querySelector(".lv-screen")?.id ?? "", homeCount: document.querySelectorAll(".lv-home").length,
        scrollTop: document.querySelector(".lv-home")?.scrollTop ?? -1,
        scrollHeight: document.querySelector(".lv-home")?.scrollHeight ?? -1,
        clientHeight: document.querySelector(".lv-home")?.clientHeight ?? -1,
        search: document.querySelector('.lv-ledger-toolbar input[type="search"]')?.value ?? "",
    }));

    await gotoTab(page, "提醒");
    const beforeBack = await page.evaluate(() => ({ url: location.href, historyLength: history.length, history: history.state?.__siyuanHomeScreen ?? null, screen: document.querySelector(".lv-screen")?.id ?? "", homeCount: document.querySelectorAll(".lv-home").length }));
    await page.goBack();
    const backSamples = [];
    for (const delay of [0, 50, 250, 900]) {
        await page.waitForTimeout(delay);
        backSamples.push(await page.evaluate(() => document.querySelector(".lv-home")?.scrollTop ?? -1));
    }
    const afterBack = await page.evaluate(() => ({
        url: location.href, historyLength: history.length,
        screen: document.querySelector(".lv-screen")?.id ?? "",
        homeCount: document.querySelectorAll(".lv-home").length,
        search: document.querySelector('.lv-ledger-toolbar input[type="search"]')?.value ?? "",
        scrollTop: document.querySelector(".lv-home")?.scrollTop ?? -1,
        history: history.state?.__siyuanHomeScreen ?? null,
    }));

    await page.goForward();
    await page.waitForTimeout(1200);
    const afterForward = await page.evaluate(() => ({ screen: document.querySelector(".lv-screen")?.id ?? "", history: history.state?.__siyuanHomeScreen ?? null }));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11000);
    await openPanel(page);
    await page.waitForTimeout(1200);
    const afterReload = await page.evaluate(() => ({
        screen: document.querySelector(".lv-screen")?.id ?? "",
        search: document.querySelector('.lv-ledger-toolbar input[type="search"]')?.value ?? "",
        history: history.state?.__siyuanHomeScreen ?? null,
    }));

    const ok = before.search === afterBack.search && afterBack.screen === "lv-panel-ledger" && afterBack.scrollTop >= Math.max(0, before.scrollTop - 8)
        && afterForward.screen === "lv-panel-reminders" && afterReload.screen === "lv-panel-reminders" && pageErrors.length === 0;
    if (!ok) throw new Error(JSON.stringify({ before, beforeBack, afterBack, backSamples, afterForward, afterReload, pageErrors }));
    console.log(JSON.stringify({ before, beforeBack, afterBack, backSamples, afterForward, afterReload, pageErrors }, null, 2));
    await context.close();
} finally {
    await browser.close();
}
