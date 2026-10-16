// 思源前端加载语义验证（v0.3.1 chunks 事故回归门禁）—— node scripts/verify-loader-semantics.mjs
// 复现思源前端真实加载链路：window.eval 包 CJS + require 桩（"siyuan"→petal，其余→Electron
// window.require，相对路径以思源 app 根为基准解析）。 chunks 分包在该语义下必然
// MODULE_NOT_FOUND → 插件静默加载失败、零入口（v0.3.0 教训）。构建后运行，任何一步失败即非零退出。
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import path from "node:path";

const distJs = "dist/index.js";
if (!existsSync(distJs)) {
    console.error("dist/index.js not found — run `pnpm run build` first");
    process.exit(1);
}
const errors = [];

// ---------- 最小浏览器全局（onload 需要 window/document） ----------
const noop = () => {};
const windowListeners = new Map();
const windowEvents = [];
const el = () => ({
    style: { cssText: "", display: "" }, className: "", textContent: "", setAttribute: noop,
    appendChild: noop, remove: noop, addEventListener: noop, children: [], dataset: {},
});
globalThis.window = {
    addEventListener(type, callback) {
        if (!windowListeners.has(type)) windowListeners.set(type, new Set());
        windowListeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { windowListeners.get(type)?.delete(callback); },
    setInterval: noop, clearInterval: noop,
    setTimeout: () => 0, clearTimeout: noop, getSelection: () => ({ toString: () => "" }),
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } },
    dispatchEvent(event) {
        windowEvents.push(event.type);
        for (const callback of [...(windowListeners.get(event.type) ?? [])]) callback(event);
        return true;
    },
    location: { href: "http://127.0.0.1:6806/stage/build/app/", origin: "http://127.0.0.1:6806", pathname: "/stage/build/app/", search: "", hash: "" },
};
globalThis.document = {
    addEventListener: noop, removeEventListener: noop, createElement: el, getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [], visibilityState: "visible", body: el(),
};
globalThis.CustomEvent = globalThis.window.CustomEvent;
globalThis.location = globalThis.window.location;

// ---------- 思源加载语义的 require 桩 ----------
const calls = [];
const storageCalls = [];
const messages = [];
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
class PluginStub {
    constructor(options) {
        this.name = options.name;
        this.displayName = options.displayName;
        this.app = { plugins: [] };
        this.data = {};
        this.storage = new Map();
    }
    eventBus = { on() {}, off() {} };
    // SiYuan compares this base method with the instance hook to decide
    // whether a storage notification requires unloading the entire plugin.
    onDataChanged() {}
    addTab(o) { calls.push(["addTab", o?.type]); }
    addTopBar(o) { calls.push(["addTopBar", o?.title]); }
    addCommand(o) { calls.push(["addCommand", o?.langKey]); }
    addStatusBar() { calls.push(["addStatusBar"]); }
    loadData(name) {
        storageCalls.push(["loadData", name]);
        // Match the host's session-cache fallback when a file is absent.
        if (this.storage.has(name)) this.data[name] = clone(this.storage.get(name));
        return Promise.resolve(this.data[name] ?? "");
    }
    saveData(name, value) {
        storageCalls.push(["saveData", name]);
        this.storage.set(name, clone(value));
        this.data[name] = clone(value);
        return Promise.resolve({ code: 0, msg: "", data: null });
    }
    removeData() { return Promise.resolve(); }
}
const siyuanStub = {
    Plugin: PluginStub,
    showMessage(...args) { messages.push(args); }, confirm() {},
    Dialog: class { constructor() { calls.push(["Dialog"]); } },
    openTab() { calls.push(["openTab"]); }, closeTab() {},
    fetchPost() {}, fetchSyncPost() {}, getFrontend: () => "desktop",
};
// 相对路径基准 = 思源 app 根（真实 Electron window.require 行为），绝不指向插件目录。
// REL-02 配套：基准路径环境化——本机思源安装存在则用之，否则回退仓库根（CI/他机）。
// 语义不变：stub 拦截 "siyuan"；其余 require 仅在 bundle 误含相对/Node 依赖时才会触发解析。
const siyuanAppBase = existsSync("D:/biji/SiYuan/resources/app/index.html")
    ? "D:/biji/SiYuan/resources/app/index.html"
    : path.resolve("index.html");
const electronLikeRequire = createRequire(siyuanAppBase);
const loaderRequire = (n) => (n === "siyuan" ? siyuanStub : electronLikeRequire(n));

// ---------- [1] 按加载器语义评估 ----------
const module_ = { exports: {} };
try {
    const js = readFileSync(distJs, "utf8");
    const fn = new Function("require", "module", "exports", js + "\n//# sourceURL=plugin:siyuan-home");
    fn(loaderRequire, module_, module_.exports);
} catch (e) {
    console.error("[1] EVAL FAILED under SiYuan loader semantics:", e.name + ":", e.message);
    console.error("    → 插件在真实前端会静默加载失败（零入口）。检查是否引入了相对 require / 分包。");
    process.exit(1);
}
console.log("[1] eval OK under SiYuan loader semantics; export =", typeof module_.exports);
if (typeof module_.exports !== "function") {
    console.error("[1] export is not a class/function — loader would log 'plugin has no export'");
    process.exit(1);
}

// ---------- [2] 实例化 + onload：入口注册必须在断网/无 DOM 真机的最小桩下完成 ----------
const i18n = JSON.parse(readFileSync("dist/i18n/zh-CN.json", "utf8"));
const inst = new module_.exports({ name: "siyuan-home", displayName: "小驴管家" });
inst.i18n = i18n; // 真实 petal 基类在构造时挂 this.i18n；桩里手动补
assert.notEqual(inst.onDataChanged, PluginStub.prototype.onDataChanged,
    "plugin must override onDataChanged: inheriting it makes SiYuan reload on every cross-window storage write");
const lifecycleCalls = { onload: 0, onLayoutReady: 0 };
for (const method of Object.keys(lifecycleCalls)) {
    const original = inst[method].bind(inst);
    inst[method] = (...args) => {
        lifecycleCalls[method] += 1;
        return original(...args);
    };
}
function storedSettings(label) {
    return { schemaVersion: 1, enabledModules: [], members: [{ id: "member-sync", name: label, role: "self", createdAt: "2026-01-01T00:00:00.000Z" }], onboarded: true, hideAmounts: label.endsWith("sync"), dbRefs: {} };
}
function storedRuntime(label, withCache = true) {
    const dueDate = new Date().toISOString().slice(0, 10);
    const reminder = { id: "memo-sync::adhoc.due", moduleId: "adhoc", rowId: "memo-sync", ruleKey: "adhoc.due", title: label, dueDate, daysLeft: 0, level: "overdue", kind: "oneoff" };
    return {
        schemaVersion: 1, snoozed: {}, muted: {}, handledYear: {}, handledUntil: {}, handled: {}, renewHistory: {}, captureDrafts: [],
        memos: [{ id: "memo-sync", title: label, dueDate, createdAt: "2026-01-01T00:00:00.000Z" }],
        ...(withCache ? { scannedAt: "2026-01-01T00:00:00.000Z", cache: { reminders: [reminder], derived: [reminder], counts: { overdue: 1, soon: 0, lead: 0 }, errors: [], byModule: { adhoc: { reminders: [reminder], at: "2026-01-01T00:00:00.000Z" } } } } : {}),
    };
}
inst.storage.set("settings.json", storedSettings("initial"));
inst.storage.set("hub-runtime.json", storedRuntime("initial"));
try {
    await inst.onload();
} catch (e) {
    console.error("[2] onload THREW:", e.message);
    console.error(e.stack?.split("\n").slice(0, 5).join("\n"));
    process.exit(1);
}
const kinds = new Set(calls.map((c) => c[0]));
for (const required of ["addTab", "addTopBar", "addCommand", "addStatusBar"]) {
    if (!kinds.has(required)) errors.push(`onload did not register ${required}`);
}
if (errors.length) {
    console.error("[2] entry registration incomplete:\n" + errors.map((e) => " ✗ " + e).join("\n"));
    process.exit(1);
}
console.log("[2] onload OK; entries =", JSON.stringify(calls));

// ---------- [3] 跨窗口写入/同步必须原位只读摄入，不能再触发启动写回循环 ----------
const entryCalls = JSON.stringify(calls);
const initialMessages = messages.length;
let refreshes = 0;
inst.hubListeners.add(() => { refreshes += 1; });
function assertQuietNotification(label) {
    assert.equal(JSON.stringify(calls), entryCalls, `${label}: storage change must not recreate entries, tabs or dialogs`);
    assert.equal(storageCalls.filter(([method]) => method === "saveData").length, 0, `${label}: storage change must not write back (including corruption markers)`);
    assert.deepEqual(lifecycleCalls, { onload: 1, onLayoutReady: 0 }, `${label}: storage change must not reenter startup hooks`);
    assert.equal(messages.length, initialMessages, `${label}: storage change must not repeat startup notifications`);
}
try {
    storageCalls.length = 0;
    for (const [index, reason] of ["overwrite", "sync", "overwrite", "sync"].entries()) {
        const label = `${index}-${reason}`;
        inst.storage.set("settings.json", storedSettings(label));
        inst.storage.set("hub-runtime.json", storedRuntime(label));
        await inst.onDataChanged(reason);
        assert.equal(inst.settings.members[0]?.name, label, `${label}: changed settings were not ingested`);
        assert.equal(inst.runtime.memos[0]?.title, label, `${label}: changed runtime was not ingested`);
        assertQuietNotification(label);
    }
    assert.ok(refreshes > 0, "storage changes must refresh the existing panel listeners");
    assert.ok(windowEvents.includes("siyuan-home:settings-replaced"), "settings changes must notify existing avatar and module views");

    // A host notification can arrive while a local reminder action is saving.
    // Without the shared runtime lock it adopts the older disk snapshot, then
    // the action's notifyHubChanged writes that stale object over its own memo.
    const originalSaveData = inst.saveData.bind(inst);
    let releaseSave;
    let reportSaveStarted;
    const saveStarted = new Promise((resolve) => { reportSaveStarted = resolve; });
    const heldSave = new Promise((resolve) => { releaseSave = resolve; });
    let holdFirstRuntimeSave = true;
    inst.saveData = async (name, value) => {
        if (name === "hub-runtime.json" && holdFirstRuntimeSave) {
            holdFirstRuntimeSave = false;
            reportSaveStarted();
            await heldSave;
        }
        return originalSaveData(name, value);
    };
    const localMemoTitle = "local memo must survive a concurrent notification";
    const localAction = inst.addMemo(localMemoTitle, new Date().toISOString().slice(0, 10));
    await saveStarted;
    const storageCallsBeforeNotification = storageCalls.length;
    const concurrentNotification = inst.onDataChanged("overwrite");
    // Drain real Node microtasks without running the stubbed browser timers.
    await new Promise((resolve) => setImmediate(resolve));
    const readsWhileSaving = storageCalls.slice(storageCallsBeforeNotification).filter(([method]) => method === "loadData").length;
    const memoPresentWhileSaving = inst.runtime.memos.some((memo) => memo.title === localMemoTitle);
    releaseSave();
    await Promise.all([localAction, concurrentNotification]);
    inst.saveData = originalSaveData;
    assert.equal(readsWhileSaving, 0, "data-change reads must wait for an in-flight local runtime action");
    assert.ok(memoPresentWhileSaving, "storage notification must not replace the local action's runtime while its save is pending");
    assert.ok(inst.runtime.memos.some((memo) => memo.title === localMemoTitle), "concurrent notification lost the completed local memo in memory");
    assert.ok(inst.storage.get("hub-runtime.json").memos.some((memo) => memo.title === localMemoTitle), "concurrent notification overwrote the completed local memo on disk");
    // These writes belong to the explicit local action. Resume the zero-write
    // checks after confirming that the notification itself waited for it.
    storageCalls.length = 0;
    assertQuietNotification("concurrent-local-action");

    for (const [label, settingsValue, runtimeValue] of [
        ["settings-error-envelope", { code: 500, msg: "kernel busy", data: null }, storedRuntime("unapplied-runtime")],
        ["runtime-error-envelope", storedSettings("unapplied-settings"), JSON.stringify({ code: 403, msg: "permission denied", data: null })],
    ]) {
        const previousSettings = inst.settings;
        const previousRuntime = inst.runtime;
        inst.storage.set("settings.json", settingsValue);
        inst.storage.set("hub-runtime.json", runtimeValue);
        await inst.onDataChanged("sync");
        assert.equal(inst.settings, previousSettings, `${label}: a failed read must retain the previous settings reference`);
        assert.equal(inst.runtime, previousRuntime, `${label}: a failed read must retain the previous runtime reference`);
        assertQuietNotification(label);
    }
    inst.storage.set("settings.json", storedSettings("after-read-errors"));

    // A valid runtime can have no scan cache. Empty/missing storage is also
    // the host's network-error fallback, so it must preserve the last known
    // in-memory state without resurrecting the stale loadData session cache.
    inst.storage.set("hub-runtime.json", storedRuntime("without-cache", false));
    await inst.onDataChanged("overwrite");
    assert.equal(inst.runtime.memos[0]?.title, "without-cache");
    assertQuietNotification("without-cache");
    const beforeMissingRead = { settings: inst.settings, runtime: inst.runtime };
    inst.storage.delete("hub-runtime.json");
    await inst.onDataChanged("overwrite");
    assert.equal(inst.settings, beforeMissingRead.settings, "inconclusive runtime read must retain the previous settings reference");
    assert.equal(inst.runtime, beforeMissingRead.runtime, "inconclusive runtime read must retain the last known in-memory runtime");
    assert.equal(Object.hasOwn(inst.data, "hub-runtime.json"), false, "missing runtime must not revive the host's stale loadData session cache");
    assertQuietNotification("deleted-runtime");

    // Invalid externally written JSON must not cause a marker write, which
    // would notify the other frontend and restart the feedback loop.
    inst.storage.set("settings.json", "{broken-settings");
    inst.storage.set("hub-runtime.json", "{broken-runtime");
    await inst.onDataChanged("sync");
    assertQuietNotification("corrupt-storage");
    console.log("[3] data-change hook OK; repeated overwrite/sync, absent cache, deleted file and invalid JSON stay read-only");

    // Teardown can overlap an already running host notification. Hold one
    // read until after unload and ensure its completion cannot revive UI.
    const originalLoadData = inst.loadData.bind(inst);
    let releaseRead;
    let reportReadStarted;
    const readStarted = new Promise((resolve) => { reportReadStarted = resolve; });
    const heldRead = new Promise((resolve) => { releaseRead = resolve; });
    inst.loadData = async (name) => {
        const value = await originalLoadData(name);
        if (name === "settings.json") {
            reportReadStarted();
            await heldRead;
        }
        return value;
    };
    inst.storage.set("settings.json", storedSettings("in-flight-unload"));
    inst.storage.set("hub-runtime.json", storedRuntime("in-flight-unload"));
    const pendingChange = inst.onDataChanged("overwrite");
    await readStarted;
    await inst.onunload();
    const afterUnload = { settings: inst.settings, runtime: inst.runtime, reads: storageCalls.length, events: windowEvents.length, refreshes };
    releaseRead();
    await pendingChange;
    inst.loadData = originalLoadData;
    assert.equal(inst.settings, afterUnload.settings, "read completing after unload must not replace settings");
    assert.equal(inst.runtime, afterUnload.runtime, "read completing after unload must not replace runtime");
    assert.equal(windowEvents.length, afterUnload.events, "read completing after unload must not broadcast events");
    assert.equal(refreshes, afterUnload.refreshes, "read completing after unload must not refresh panels");

    // A later queued notification must be a complete no-op, including reads.
    const staleListener = () => { refreshes += 1; };
    inst.hubListeners.add(staleListener);
    inst.storage.set("settings.json", storedSettings("after-unload"));
    inst.storage.set("hub-runtime.json", storedRuntime("after-unload"));
    await inst.onDataChanged("overwrite");
    assert.equal(inst.settings, afterUnload.settings, "disposed hook must not replace settings");
    assert.equal(inst.runtime, afterUnload.runtime, "disposed hook must not replace runtime");
    assert.equal(storageCalls.length, afterUnload.reads, "disposed hook must not access storage");
    assert.equal(windowEvents.length, afterUnload.events, "disposed hook must not broadcast events");
    assert.equal(refreshes, afterUnload.refreshes, "disposed hook must not refresh panels");
    assert.equal(window.LvHome, undefined, "disposed hook must not remount the external bridge");
    assertQuietNotification("after-unload");
    console.log("[4] disposed data-change hook OK; in-flight reads and queued notifications cannot revive UI");
} catch (e) {
    console.error("[3/4] DATA-CHANGE REGRESSION:", e.message);
    console.error(e.stack?.split("\n").slice(0, 5).join("\n"));
    process.exit(1);
}
console.log("loader-semantics verify OK");
