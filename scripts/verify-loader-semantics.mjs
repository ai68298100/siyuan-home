// 思源前端加载语义验证（v0.3.1 chunks 事故回归门禁）—— node scripts/verify-loader-semantics.mjs
// 复现思源前端真实加载链路：window.eval 包 CJS + require 桩（"siyuan"→petal，其余→Electron
// window.require，相对路径以思源 app 根为基准解析）。 chunks 分包在该语义下必然
// MODULE_NOT_FOUND → 插件静默加载失败、零入口（v0.3.0 教训）。构建后运行，任何一步失败即非零退出。
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const distJs = "dist/index.js";
if (!existsSync(distJs)) {
    console.error("dist/index.js not found — run `pnpm run build` first");
    process.exit(1);
}
const errors = [];

// ---------- 最小浏览器全局（onload 需要 window/document） ----------
const noop = () => {};
const el = () => ({
    style: { cssText: "", display: "" }, className: "", textContent: "", setAttribute: noop,
    appendChild: noop, remove: noop, addEventListener: noop, children: [], dataset: {},
});
globalThis.window = {
    addEventListener: noop, removeEventListener: noop, setInterval: noop, clearInterval: noop,
    setTimeout: () => 0, clearTimeout: noop, getSelection: () => ({ toString: () => "" }),
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } },
    dispatchEvent: noop, location: { href: "http://127.0.0.1:6806/stage/build/app/" },
};
globalThis.document = {
    addEventListener: noop, removeEventListener: noop, createElement: el, getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [], visibilityState: "visible", body: el(),
};
globalThis.CustomEvent = globalThis.window.CustomEvent;
globalThis.location = globalThis.window.location;

// ---------- 思源加载语义的 require 桩 ----------
const calls = [];
class PluginStub {
    eventBus = { on() {}, off() {} };
    addTab(o) { calls.push(["addTab", o?.type]); }
    addTopBar(o) { calls.push(["addTopBar", o?.title]); }
    addCommand(o) { calls.push(["addCommand", o?.langKey]); }
    addStatusBar() { calls.push(["addStatusBar"]); }
    loadData() { return Promise.resolve(null); }
    saveData() { return Promise.resolve([]); }
    removeData() { return Promise.resolve(); }
}
const siyuanStub = {
    Plugin: PluginStub,
    showMessage() {}, confirm() {}, Dialog: class {}, openTab() {}, closeTab() {},
    fetchPost() {}, fetchSyncPost() {}, getFrontend: () => "desktop",
};
// 相对路径基准 = 思源 app 根（真实 Electron window.require 行为），绝不指向插件目录
const electronLikeRequire = createRequire("D:/biji/SiYuan/resources/app/index.html");
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
console.log("loader-semantics verify OK");
