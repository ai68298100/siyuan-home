// Real-kernel activity flow: seed a temporary rowlog for an existing vehicle,
// open it from the feed, verify exact-entry focus, then restore the workspace.
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { APP, BASE, TOKEN, WS_DIR, ensureKernel, login, openPanel, gotoTab } from "./lib.mjs";

const storageDir = path.join(WS_DIR, "data", "storage", "petal", "siyuan-home");
const settingsPath = path.join(storageDir, "settings.json");
const rowlogsPath = path.join(storageDir, "rowlogs.json");
const hadSettings = existsSync(settingsPath);
const originalSettings = hadSettings ? readFileSync(settingsPath) : undefined;
const hadRowlogs = existsSync(rowlogsPath);
const originalRowlogs = hadRowlogs ? readFileSync(rowlogsPath) : undefined;
const stationMarker = `LV_ACTIVITY_${Date.now().toString(36)}`;

function parseJsonFile(file, fallback) {
    try {
        return JSON.parse(readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

async function findVehicleFixture() {
    const settings = parseJsonFile(settingsPath, null);
    const ref = settings?.dbRefs?.vehicles;
    if (!ref?.avId || !ref?.columns?.name) return null;
    const response = await fetch(`${BASE}/api/av/renderAttributeView`, {
        method: "POST",
        headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: ref.avId }),
    });
    if (!response.ok) throw new Error(`vehicle ledger render failed: ${response.status}`);
    const payload = await response.json();
    const rows = payload?.data?.view?.rows ?? [];
    for (const row of rows) {
        const nameCell = row.cells?.find((cell) => cell.value?.keyID === ref.columns.name);
        const name = nameCell?.value?.text?.content?.trim();
        if (name) return { avId: ref.avId, rowId: row.id, name };
    }
    return null;
}

function seedRowlog(fixture) {
    mkdirSync(storageDir, { recursive: true });
    const logs = parseJsonFile(rowlogsPath, {});
    const key = `${fixture.avId}|${fixture.rowId}`;
    const existing = logs[key] ?? {};
    logs[key] = {
        ...existing,
        fuelings: [
            ...(Array.isArray(existing.fuelings) ? existing.fuelings : []),
            {
                date: new Date().toISOString().slice(0, 10),
                at: new Date().toISOString(),
                fuelGrade: "92",
                quantity: 25,
                odometer: 10000,
                totalCost: 180,
                station: stationMarker,
            },
        ],
    };
    writeFileSync(rowlogsPath, JSON.stringify(logs, null, 2));
}

async function main() {
    await ensureKernel();
    const fixture = await findVehicleFixture();
    if (!fixture) {
        console.log(JSON.stringify({
            skipped: true,
            reason: "fixture-missing-vehicle-ledger-row",
            detail: "The isolated workspace needs an enabled vehicles module with at least one ledger row.",
        }, null, 2));
        return;
    }
    seedRowlog(fixture);

    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
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
        await page.waitForSelector(".lv-activity", { timeout: 20000 });
        const vehicleActivity = feed.locator(".lv-activity-row").filter({ hasText: "车辆" }).first();
        await vehicleActivity.waitFor({ state: "visible", timeout: 20000 });
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
        const clearFilters = feed.getByRole("button", { name: "清除筛选" });
        await clearFilters.waitFor({ state: "visible", timeout: 10000 });
        await clearFilters.click();
        const restoredCount = await feed.locator(".lv-activity-row").count();
        await feed.getByRole("button", { name: "收起最近记录" }).click();
        const controlsTargetExists = await page.locator("#lv-activity-body").count() === 1;
        const refreshHiddenWhenCollapsed = await feed.getByRole("button", { name: "刷新" }).count() === 0;
        if (restoredCount === 0 || !controlsTargetExists || !refreshHiddenWhenCollapsed || pageErrors.length > 0) {
            throw new Error(JSON.stringify({ restoredCount, controlsTargetExists, refreshHiddenWhenCollapsed, pageErrors }));
        }
        console.log(JSON.stringify({
            fixture: { avId: fixture.avId, rowId: fixture.rowId, name: fixture.name },
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
    }
}

try {
    await main();
} finally {
    if (hadSettings) writeFileSync(settingsPath, originalSettings);
    else if (existsSync(settingsPath)) rmSync(settingsPath);
    if (hadRowlogs) writeFileSync(rowlogsPath, originalRowlogs);
    else if (existsSync(rowlogsPath)) rmSync(rowlogsPath);
}
