// VALUE-02 恢复路径 e2e（靶场专用）—— node scripts/e2e-recovery.mjs
// 场景A：settings.json 损坏 → 回退默认不崩启动 + 留损坏标记
// 场景B：台账文档误删 → 扫描显式报错（不静默装作无事项）+ provisioner 复用原库恢复
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
const rm = async (p) => api("/api/file/removeFile", { path: p });
const results = [];
const rec = (item, pass, detail = "") => { results.push({ item, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"} ${item}${detail ? " — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const P = "/data/storage/petal/siyuan-home";

const browser = await chromium.launch({ channel: "msedge", headless: true });

// ── 场景 A：settings.json 损坏
{
    const stage = "A-设置损坏";
    // 记住当前配置（场景结束后恢复）
    const backup = JSON.parse(await rawFile(`${P}/settings.json`));
    // 写入损坏内容（手工改坏/半截 JSON 形态）
    const fd = new FormData();
    fd.set("path", `${P}/settings.json`);
    fd.set("file", new Blob(['{"enabledModules": ["certs", "medi']), "settings.json");
    await fetch(BASE + "/api/file/putFile", { method: "POST", headers: { Authorization: `Token ${TOKEN}` }, body: fd });
    // 重载面板（新页面 = 新插件实例）
    const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    p.on("pageerror", (e) => rec("损坏启动零未捕获异常", false, String(e).slice(0, 120)));
    await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await sleep(14000);
    await p.evaluate(() => {
        const tb = document.getElementById("toolbar");
        Array.from(tb?.children ?? []).find((c) => (c.getAttribute("aria-label") || "").includes("小驴管家"))?.click();
    });
    await sleep(2500);
    const alive = await p.evaluate(() => !!document.querySelector(".lv-home"));
    rec(stage + ":插件照常加载（面板挂载）", alive);
    const marker = await rawFile(`${P}/settings.json.corrupted.json`).then((t) => { try { return JSON.parse(t); } catch { return null; } }).catch(() => null);
    rec(stage + ":留损坏标记（可诊断）", !!marker && !!marker.corruptedAt, marker ? marker.reason?.slice(0, 60) : "无标记文件");
    const s = JSON.parse(await rawFile(`${P}/settings.json`));
    rec(stage + ":回退默认设置（enabledModules 非空）", Array.isArray(s.enabledModules) && s.enabledModules.length > 0, `${s.enabledModules?.length} 模块`);
    await p.screenshot({ path: "tmp/ui-shots/device-batch/rec-corrupted.png" });
    await p.context().close();
    // 恢复原配置 + 清标记
    await putObj(`${P}/settings.json`, backup);
    await rm(`${P}/settings.json.corrupted.json`);
}

// ── 场景 B：缺库恢复（清 dbRefs.certs 模拟缺库；文档误删的 provisioner 复用语义由活体/单测覆盖）
{
    const stage = "B-缺库重建";
    const s = JSON.parse(await rawFile(`${P}/settings.json`));
    const backupRefs = JSON.parse(JSON.stringify(s.dbRefs ?? {}));
    if (!backupRefs.certs) { rec(stage + ":certs 原有登记（前置）", false, "无 dbRefs.certs"); }
    else {
        // 模拟缺库：移除登记（模块保持启用）
        delete s.dbRefs.certs;
        await putObj(`${P}/settings.json`, s);
        const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
        await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
        await sleep(14000);
        await p.evaluate(() => {
            const tb = document.getElementById("toolbar");
            Array.from(tb?.children ?? []).find((c) => (c.getAttribute("aria-label") || "").includes("小驴管家"))?.click();
        });
        await sleep(3000);
        await p.evaluate(() => {
            const t = Array.from(document.querySelectorAll(".lv-tabs__item")).find((e) => e.textContent?.trim() === "台账");
            t?.click();
        });
        await sleep(3000);
        // 台账页切换到证书管理 → 缺库重建入口
        await p.evaluate(() => {
            const sel = document.querySelector(".lv-screen select");
            if (sel) {
                const opt = Array.from(sel.options).find((o) => o.value === "certs");
                if (opt) { sel.value = "certs"; sel.dispatchEvent(new Event("change", { bubbles: true })); }
            }
        });
        await sleep(2500);
        const rebuildClicked = await p.evaluate(() => {
            const btn = Array.from(document.querySelectorAll(".lv-screen button")).find((b) => /重建|建库/.test(b.textContent || ""));
            if (!btn) return false;
            btn.click();
            return true;
        });
        await sleep(9000);
        const s2 = JSON.parse(await rawFile(`${P}/settings.json`));
        const ref2 = s2.dbRefs?.certs ?? {};
        // 实测（227 波恢复 e2e）：面板打开即触发 provision 自动自愈——原库被找回并重新登记，
        // 快于手动重建入口；docId 恢复且零 provisionError 即为通过
        rec(stage + ":缺库自愈（自动找回登记）", !!ref2.docId && !ref2.provisionError, `docId=${ref2.docId ? "有" : "无"} err=${ref2.provisionError ?? "无"}`);
        await p.screenshot({ path: "tmp/ui-shots/device-batch/rec-rebuilt.png" });
        await p.context().close();
    }
}

await browser.close();
writeFileSync("tmp/recovery-results.json", JSON.stringify(results, null, 1));
const fails = results.filter((r) => !r.pass);
console.log(`\n==== RECOVERY: ${results.length - fails.length}/${results.length} PASS ====`);
