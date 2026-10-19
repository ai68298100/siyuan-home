// Read-only Chrome regression: malformed success must show an error, and retry
// must recover using the real isolated kernel. Faults affect this page only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { APP, WS_DIR, ensureKernel, login, openPanel, gotoTab } from "./lib.mjs";

await ensureKernel();
const settings = JSON.parse(readFileSync(path.join(WS_DIR, "data/storage/petal/siyuan-home/settings.json"), "utf8"));
const modules = settings.enabledModules.filter((id) => id !== "members" && settings.dbRefs[id]?.avId);
assert.ok(modules.length >= 2, "read-recovery requires two provisioned ledgers in the isolated workspace");

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
    await gotoTab(page, "台账");
    const panel = page.locator("#lv-panel-ledger");
    const selector = panel.locator(".lv-ledger-toolbar select");
    const [target, other] = modules;
    await selector.selectOption(other);
    const ready = panel.locator('table, .lv-empty[role="status"]');
    await ready.first().waitFor({ state: "visible", timeout: 20000 });

    let injectFault = true;
    let injected = 0;
    await page.route("**/api/av/renderAttributeView", async (route) => {
        const payload = route.request().postDataJSON();
        if (injectFault && payload?.id === settings.dbRefs[target].avId) {
            injected++;
            await route.fulfill({ json: { code: 0, msg: "", data: {} } });
        } else {
            await route.continue();
        }
    });
    await selector.selectOption(target);
    const alert = panel.locator('.lv-empty[role="alert"]');
    await alert.waitFor({ state: "visible", timeout: 20000 });
    assert.match(await alert.innerText(), /malformed ledger response/);
    assert.ok(injected > 0, "fault was not exercised");
    assert.equal(await ready.count(), 0, "failed read must not show an empty-success state or stale table");

    injectFault = false;
    await alert.getByRole("button").click();
    await ready.first().waitFor({ state: "visible", timeout: 20000 });
    assert.equal(await alert.count(), 0, "retry must clear the error state");
    assert.equal(await selector.inputValue(), target, "retry must preserve the selected ledger");
    assert.deepEqual(pageErrors, []);
    console.log(JSON.stringify({ ok: true, injected, recovered: true, selectedLedgerPreserved: true, pageErrors }, null, 2));
} finally {
    await browser.close();
}
