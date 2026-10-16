// Real SiYuan lifecycle regression: two frontends must receive plugin storage
// changes without the host unloading/recreating the plugin or echoing writes.
// This script deliberately refuses every workspace except tmp/sy-ui3.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { APP, BASE, WS_DIR, ensureKernel, login, sleep } from "./lib.mjs";

const isolatedWorkspace = path.resolve(import.meta.dirname, "../../tmp/sy-ui3");
assert.equal(path.resolve(WS_DIR).toLowerCase(), isolatedWorkspace.toLowerCase(), "ui:data-change only supports tmp/sy-ui3");
assert.equal(new URL(BASE).origin, "http://127.0.0.1:14680", "ui:data-change only supports the isolated kernel on port 14680");

const storageDir = path.join(isolatedWorkspace, "data/storage/petal/siyuan-home");
const beforeStorage = new Map(existsSync(storageDir)
    ? readdirSync(storageDir).filter((name) => name.endsWith(".json")).map((name) => [name, readFileSync(path.join(storageDir, name))])
    : []);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const pages = [];
const errors = [];
const report = {};

async function snapshot(page) {
    return page.evaluate(() => {
        const monitor = window.__lvLifecycleMonitor;
        const plugin = window.siyuan?.ws?.app?.plugins?.find((item) => item.name === "siyuan-home");
        return {
            instances: monitor.instances.size,
            unloads: monitor.unloads,
            writes: [...monitor.writes],
            toolbarLosses: monitor.toolbarLosses,
            panelLosses: monitor.panelLosses,
            firstRunNotices: monitor.firstRunNotices,
            hasPlugin: !!plugin,
            hasToolbar: !!monitor.findToolbar(),
            hasPanel: !!document.querySelector(".lv-home"),
            hideAmounts: plugin?.settings?.hideAmounts,
            hubViewMode: plugin?.runtime?.hubViewMode,
        };
    });
}

async function openFrontend(label) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "zh-CN" });
    await login(context);
    await context.addInitScript(() => {
        const monitor = {
            instances: new Set(), unloads: 0, writes: [], toolbarLosses: 0,
            panelLosses: 0, firstRunNotices: 0, baseline: undefined, lastToolbar: undefined, lastPanel: undefined,
            findToolbar: () => document.querySelector('#toolbar [data-name="siyuan-home"], #toolbar [data-plugin-name="siyuan-home"], #toolbar [aria-label*="小驴管家"]'),
        };
        window.__lvLifecycleMonitor = monitor;
        const notices = new WeakSet();
        const tick = () => {
            const plugin = window.siyuan?.ws?.app?.plugins?.find((item) => item.name === "siyuan-home");
            if (plugin && !monitor.instances.has(plugin)) {
                monitor.instances.add(plugin);
                const originalSave = plugin.saveData;
                plugin.saveData = function (name, data) {
                    monitor.writes.push(name);
                    return originalSave.call(this, name, data);
                };
                const originalUnload = plugin.onunload;
                plugin.onunload = function (...args) {
                    monitor.unloads++;
                    return originalUnload.apply(this, args);
                };
                // Do not wrap onDataChanged: the real host checks its identity
                // against Plugin.prototype to decide whether it must reload.
            }
            for (const element of document.querySelectorAll(".b3-snackbar__content")) {
                if (!notices.has(element) && /首次|欢迎使用|welcome/i.test(element.textContent ?? "")) {
                    notices.add(element);
                    monitor.firstRunNotices++;
                }
            }
            if (monitor.baseline) {
                if (monitor.lastToolbar && !monitor.lastToolbar.isConnected) monitor.toolbarLosses++;
                if (monitor.lastPanel && !monitor.lastPanel.isConnected) monitor.panelLosses++;
                monitor.lastToolbar = monitor.findToolbar();
                monitor.lastPanel = document.querySelector(".lv-home");
            }
        };
        setInterval(tick, 25);
        new MutationObserver(tick).observe(document, { childList: true, subtree: true });
    });
    const page = await context.newPage();
    pages.push(page);
    page.on("pageerror", (error) => errors.push(`${label}: ${error}`));
    await page.goto(APP, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
        const plugin = window.siyuan?.ws?.app?.plugins?.find((item) => item.name === "siyuan-home");
        return plugin?.settings && plugin?.runtime && window.__lvLifecycleMonitor.findToolbar();
    }, { timeout: 30000 });
    await page.evaluate(() => window.siyuan.ws.app.plugins.find((item) => item.name === "siyuan-home").showTab());
    await page.waitForSelector(".lv-home", { timeout: 15000 });
    await sleep(3500);
    await page.evaluate(() => {
        const monitor = window.__lvLifecycleMonitor;
        monitor.baseline = { toolbar: monitor.findToolbar(), panel: document.querySelector(".lv-home") };
        monitor.lastToolbar = monitor.baseline.toolbar;
        monitor.lastPanel = monitor.baseline.panel;
    });
    return page;
}

function assertStable(state, label) {
    assert.equal(state.instances, 1, `${label}: plugin instance was recreated`);
    assert.equal(state.unloads, 0, `${label}: plugin was unloaded`);
    assert.equal(state.toolbarLosses, 0, `${label}: toolbar button was removed`);
    assert.equal(state.panelLosses, 0, `${label}: plugin panel was removed`);
    assert.ok(state.firstRunNotices <= 1, `${label}: first-run notice repeated`);
    assert.ok(state.hasPlugin && state.hasToolbar && state.hasPanel, `${label}: frontend entries disappeared`);
}

try {
    // Exercise a genuine first launch without changing the existing AV ledgers.
    // A welcome notice is allowed once per frontend, but must never loop.
    const fixtureSettings = JSON.parse(beforeStorage.get("settings.json")?.toString("utf8") ?? "null");
    assert.ok(fixtureSettings && typeof fixtureSettings === "object", "tmp/sy-ui3 needs an initialized settings fixture");
    writeFileSync(path.join(storageDir, "settings.json"), JSON.stringify({ ...fixtureSettings, onboarded: false }));
    await ensureKernel();
    await openFrontend("A");
    await openFrontend("B");
    await sleep(5000);
    report.before = await Promise.all(pages.map(snapshot));
    report.before.forEach((state, index) => assertStable(state, `frontend ${index + 1}`));

    report.phases = [];
    // Alternate both directions across three rounds. Every storage change must
    // arrive in place, including runtime changes, with one intentional write.
    for (let round = 0; round < 3; round++) {
        for (const kind of ["settings", "runtime"]) {
            const writerIndex = (round + (kind === "runtime" ? 1 : 0)) % 2;
            const writer = pages[writerIndex];
            const receiver = pages[1 - writerIndex];
            const key = kind === "settings" ? "hideAmounts" : "hubViewMode";
            const target = kind === "settings" ? round % 2 === 0 : round % 2 === 0 ? "calendar" : "list";
            const file = kind === "settings" ? "settings.json" : "hub-runtime.json";
            await Promise.all(pages.map((page) => page.evaluate(() => { window.__lvLifecycleMonitor.writes = []; })));
            await writer.evaluate(async ({ kind: targetKind, key: targetKey, target: targetValue, file: targetFile }) => {
                const plugin = window.siyuan.ws.app.plugins.find((item) => item.name === "siyuan-home");
                plugin[targetKind] = { ...plugin[targetKind], [targetKey]: targetValue };
                await plugin.saveData(targetFile, plugin[targetKind]);
            }, { kind, key, target, file });
            await receiver.waitForFunction(({ kind: targetKind, key: targetKey, target: targetValue }) =>
                window.siyuan?.ws?.app?.plugins?.find((item) => item.name === "siyuan-home")?.[targetKind]?.[targetKey] === targetValue,
            { kind, key, target }, { timeout: 20000 });
            await sleep(1500);
            const states = await Promise.all(pages.map(snapshot));
            states.forEach((state, index) => {
                assertStable(state, `round ${round + 1} ${kind}, frontend ${index + 1}`);
                assert.equal(state.firstRunNotices, report.before[index].firstRunNotices, "data change must not show the welcome notice again");
                assert.deepEqual(state.writes, index === writerIndex ? [file] : [], "receiving a data change must not echo plugin storage writes");
                assert.equal(state[key], target, `frontend ${index + 1} did not receive ${key}`);
            });
            report.phases.push({ round: round + 1, kind, writer: writerIndex === 0 ? "A" : "B", target, states });
        }
    }
    await sleep(5000);
    report.after = await Promise.all(pages.map(snapshot));
    report.after.forEach((state, index) => assertStable(state, `frontend ${index + 1}`));
    assert.deepEqual(report.after.map((state) => state.writes), report.phases.at(-1).states.map((state) => state.writes), "storage writes continued after the final data change");
    assert.deepEqual(errors, [], "browser errors occurred");
    report.receivedByOtherFrontend = true;
    report.errors = errors;
    console.log(JSON.stringify(report, null, 2));
} catch (error) {
    report.failure = String(error);
    report.current = await Promise.all(pages.map((page) => snapshot(page).catch(() => ({ closed: true }))));
    report.errors = errors;
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
} finally {
    await browser.close();
    // Restore the exact fixture only after both websocket frontends are closed.
    mkdirSync(storageDir, { recursive: true });
    for (const name of readdirSync(storageDir).filter((name) => name.endsWith(".json"))) {
        if (!beforeStorage.has(name)) rmSync(path.join(storageDir, name));
    }
    for (const [name, content] of beforeStorage) writeFileSync(path.join(storageDir, name), content);
}
