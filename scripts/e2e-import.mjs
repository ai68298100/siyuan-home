// VALUE-02 导入失败/敌意导入恢复 e2e —— node scripts/e2e-import.mjs
// 场景A：非法 JSON 导入 → 报错且设置不变（坏文件拒绝，不覆盖）
// 场景B：敌意导入（未知模块+坏成员）→ 归一化应用（未知剔除/成员修复）
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const TOKEN = process.env.SIYUAN_TOKEN ?? "";
if (!TOKEN) { console.error("缺 SIYUAN_TOKEN"); process.exit(1); }
const BASE = process.env.TEST_WS_URL || "http://127.0.0.1:14680";
const api = async (path, body) => (await fetch(BASE + path, { method: "POST", headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) })).json();
const rawFile = async (p) => await (await fetch(BASE + "/api/file/getFile", { method: "POST", headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ path: p }) })).text();
const putObj = async (p, obj) => {
    const fd = new FormData();
    fd.set("path", p);
    fd.set("file", new Blob([JSON.stringify(obj, null, 2)]), p.split("/").pop());
    return (await fetch(BASE + "/api/file/putFile", { method: "POST", headers: { Authorization: `Token ${TOKEN}` }, body: fd })).json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "/data/storage/petal/siyuan-home";
const results = [];
const rec = (item, pass, detail = "") => { results.push({ item, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"} ${item}${detail ? " — " + detail : ""}`); };

// 测试文件
writeFileSync("tmp/imp-garbage.json", '{"enabledModules": ["cert"],');
writeFileSync("tmp/imp-hostile.json", JSON.stringify({
    enabledModules: ["certs", "unknown_mod", "ghost_mod"],
    members: [{ name: "" }, { id: "kept", name: "敌意成员", role: " alien " }],
    dbRefs: {},
    notifyHour: 99,
}));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const openImport = async () => {
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" })).newPage();
    await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await sleep(14000);
    await p.evaluate(() => {
        const tb = document.getElementById("toolbar");
        Array.from(tb?.children ?? []).find((c) => (c.getAttribute("aria-label") || "").includes("小驴管家"))?.click();
    });
    await sleep(2500);
    await p.evaluate(() => {
        const b = Array.from(document.querySelectorAll(".lv-tabbar button")).find((e) => e.textContent?.trim() === "⚙");
        b?.click();
    });
    await sleep(2000);
    await p.evaluate(() => {
        const el = Array.from(document.querySelectorAll(".b3-dialog button")).find((e) => e.textContent?.trim() === "关于");
        el?.click();
    });
    await sleep(1200);
    return p;
};
const toastOf = (p) => p.evaluate(() => document.querySelector("#message")?.textContent?.trim().slice(0, 100) ?? "");
const settingsOf = async () => {
    try { return JSON.parse(await rawFile(`${P}/settings.json`)); } catch { return null; } // 文件缺失/内核内存未落盘 → null
};

// 基线：当前设置快照（用于不变断言；文件缺失时视为空基线）
const before = (await settingsOf()) ?? {};
const beforeCount = Array.isArray(before.enabledModules) ? before.enabledModules.length : 0;

// ── 场景 A：非法 JSON
{
    const stage = "A-非法JSON";
    const p = await openImport();
    await p.setInputFiles('input[type="file"][accept*="json"]', "tmp/imp-garbage.json");
    await sleep(2500);
    const toast = await toastOf(p);
    const after = await settingsOf();
    rec(stage + ":报错提示", (toast || "").length > 0, toast.slice(0, 50));
    rec(stage + ":设置未被覆盖（模块数不变）", after.enabledModules.length === beforeCount, `${beforeCount}→${after.enabledModules.length}`);
    await p.context().close();
}

// ── 场景 B：敌意导入（形状合法 + 未知模块 + 坏成员）
{
    const stage = "B-敌意导入";
    const p = await openImport();
    await p.setInputFiles('input[type="file"][accept*="json"]', "tmp/imp-hostile.json");
    await sleep(2000);
    await p.evaluate(() => {
        const btn = Array.from(document.querySelectorAll(".b3-dialog button, .b3-button")).find((e) => ["确认", "确定"].includes(e.textContent?.trim() ?? ""));
        btn?.click();
    });
    await sleep(5000);
    const after = await settingsOf();
    rec(stage + ":未知模块剔除", !!after && !after.enabledModules.includes("unknown_mod") && !after.enabledModules.includes("ghost_mod"), after?.enabledModules?.join(",") ?? "null");
    const ghost = (after?.members ?? []).filter((m) => !m.id || !m.name || m.name === "?");
    rec(stage + ":坏成员被修复（补 id/名）", (after?.members ?? []).length >= 1 && ghost.every((m) => m.id && m.name), `${after?.members?.length ?? 0} 成员`);
    rec(stage + ":越界时刻被钳制（notifyHour 0-23）", (after?.notifyHour ?? 8) >= 0 && (after?.notifyHour ?? 8) <= 23, String(after?.notifyHour));
    await p.screenshot({ path: "tmp/ui-shots/device-batch/imp-hostile.png" });
    await p.context().close();
}

await browser.close();
// 还原：清掉测试写入的设置与备份/标记，让工作区回到导入前
await rm(`${P}/settings.json`);
await rm(`${P}/settings.pre-import.json`);
await rm(`${P}/settings.json.corrupted.json`);
const fails = results.filter((r) => !r.pass);
console.log(`\n==== IMPORT-RECOVERY: ${results.length - fails.length}/${results.length} PASS ====`);
async function rm(p) { await api("/api/file/removeFile", { path: p }).catch(() => {}); }
