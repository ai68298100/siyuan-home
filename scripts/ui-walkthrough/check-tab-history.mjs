// Verify plugin tab navigation leaves SiYuan's global browser history untouched.
// This runs against the isolated SiYuan kernel to exercise the real panel lifecycle.
import { chromium } from "playwright";
import { APP, ensureKernel, login, openPanel, gotoTab } from "./lib.mjs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
    await ensureKernel();
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "zh-CN" });
    await login(context);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
        if (message.type() === "error" || /tree not found|effect_update_depth_exceeded/i.test(message.text())) {
            errors.push(`${message.type()}: ${message.text()}`);
        }
    });
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11000);
    await openPanel(page);

    const baseline = await page.evaluate(() => ({
        href: location.href,
        historyLength: history.length,
        historyState: JSON.stringify(history.state),
    }));
    const transitions = [];
    for (const [label, tab, screen] of [
        ["ledger", "台账", "ledger"],
        ["reminders", "提醒", "reminders"],
        ["members", "成员", "members"],
        ["overview", "总览", "overview"],
        ["reminders", "提醒", "reminders"],
    ]) {
        await gotoTab(page, tab);
        transitions.push(await page.evaluate((expected) => ({
            expected,
            screen: document.querySelector(".lv-screen")?.id ?? "",
            screenSession: sessionStorage.getItem("siyuan-home:last-screen"),
            homeCount: document.querySelectorAll(".lv-home").length,
            href: location.href,
            historyLength: history.length,
            historyState: JSON.stringify(history.state),
        }), screen));
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11000);
    await openPanel(page);
    const restored = await page.evaluate(() => ({
        screen: document.querySelector(".lv-screen")?.id ?? "",
        screenSession: sessionStorage.getItem("siyuan-home:last-screen"),
        homeCount: document.querySelectorAll(".lv-home").length,
    }));

    const historyStable = transitions.every((item) => item.href === baseline.href
        && item.historyLength === baseline.historyLength
        && item.historyState === baseline.historyState);
    const screensStable = transitions.every((item) => item.screen === `lv-panel-${item.expected}`
        && item.screenSession === item.expected
        && item.homeCount === 1);
    const restoreOk = restored.screen === "lv-panel-reminders"
        && restored.screenSession === "reminders"
        && restored.homeCount === 1;
    if (!historyStable || !screensStable || !restoreOk || errors.length > 0) {
        throw new Error(JSON.stringify({ baseline, transitions, restored, historyStable, screensStable, restoreOk, errors }));
    }
    console.log(JSON.stringify({ baseline, transitions, restored, errors }, null, 2));
    await context.close();
} finally {
    await browser.close();
}
