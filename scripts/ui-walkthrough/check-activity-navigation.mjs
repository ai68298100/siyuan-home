// Real-kernel activity flow: create a temporary rowlog, open it from the feed,
// verify exact-entry focus, then restore the isolated workspace data file.
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { APP, WS_DIR, ensureKernel, login, openPanel, gotoTab, sleep } from "./lib.mjs";

const rowlogsPath = path.join(WS_DIR, "data", "storage", "petal", "siyuan-home", "rowlogs.json");
const hadRowlogs = existsSync(rowlogsPath);
const originalRowlogs = hadRowlogs ? readFileSync(rowlogsPath) : undefined;
const stationMarker = `LV_ACTIVITY_${Date.now().toString(36)}`;
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
    await gotoTab(page, "总览");

    let feed = page.locator(".lv-activity").first();
    await feed.scrollIntoViewIfNeeded();
    await page.waitForSelector(".lv-activity-row", { timeout: 20000 });
    const vehicleActivity = feed.locator(".lv-activity-row").filter({ hasText: "车辆" }).first();
    if (await vehicleActivity.count() === 0) {
        throw new Error("The isolated UI workspace needs at least one vehicle activity row.");
    }
    await vehicleActivity.locator(".lv-activity-open").click();
    await page.waitForTimeout(1000);

    let dialogs = page.locator(".b3-dialog__container");
    let detailDialog = dialogs.last();
    await detailDialog.getByRole("button", { name: /记一笔加油/ }).click();
    const form = dialogs.last();
    await form.locator('input[type="date"]').first().fill(new Date().toISOString().slice(0, 10));
    const numbers = form.locator('input[type="number"]');
    await numbers.nth(0).fill("10000");
    await numbers.nth(1).fill("25");
    await numbers.nth(3).fill("180");
    await form.locator('input[type="text"]').nth(0).fill(stationMarker);
    await form.getByRole("button", { name: "保存" }).click();
    await page.waitForTimeout(900);
    // The host dialog can briefly re-render its action labels after the
    // energy form commits. Use the stable detail action id instead of a
    // translated label so this check validates the actual close behavior.
    await detailDialog.locator("#lv-detail-close").click();

    await gotoTab(page, "总览");
    feed = page.locator(".lv-activity").first();
    await feed.scrollIntoViewIfNeeded();
    await feed.getByRole("button", { name: "刷新" }).click();
    const targetActivity = feed.locator(".lv-activity-row").filter({ hasText: stationMarker }).first();
    await targetActivity.waitFor({ state: "visible", timeout: 20000 });
    await targetActivity.locator(".lv-activity-open").click();

    dialogs = page.locator(".b3-dialog__container");
    detailDialog = dialogs.last();
    const highlighted = detailDialog.locator('[aria-current="location"]');
    await highlighted.waitFor({ state: "visible", timeout: 10000 });
    const highlightedText = await highlighted.innerText();
    const newEntryForms = await page.locator(".lv-energy-dialog").count();
    if (!highlightedText.includes(stationMarker) || newEntryForms !== 0) {
        throw new Error(`Activity opened the wrong vehicle row: ${highlightedText}`);
    }

    await page.keyboard.press("Escape");
    await gotoTab(page, "总览");
    feed = page.locator(".lv-activity").first();
    await feed.scrollIntoViewIfNeeded();
    await feed.locator('input[type="search"]').fill("no-such-activity");
    await feed.getByRole("button", { name: "清除筛选" }).click();
    const restoredCount = await feed.locator(".lv-activity-row").count();
    await feed.getByRole("button", { name: "收起最近记录" }).click();
    const controlsTargetExists = await page.locator("#lv-activity-body").count() === 1;
    const refreshHiddenWhenCollapsed = await feed.getByRole("button", { name: "刷新" }).count() === 0;
    if (restoredCount === 0 || !controlsTargetExists || !refreshHiddenWhenCollapsed || pageErrors.length > 0) {
        throw new Error(JSON.stringify({ restoredCount, controlsTargetExists, refreshHiddenWhenCollapsed, pageErrors }));
    }
    console.log(JSON.stringify({
        exactEntry: highlightedText,
        newEntryFormOpened: newEntryForms > 0,
        restoredCountAfterClear: restoredCount,
        controlsTargetExists,
        refreshHiddenWhenCollapsed,
        pageErrors,
    }, null, 2));
    await context.close();
} finally {
    await browser.close();
    if (hadRowlogs) {
        writeFileSync(rowlogsPath, originalRowlogs);
    } else if (existsSync(rowlogsPath)) {
        rmSync(rowlogsPath);
    }
}
