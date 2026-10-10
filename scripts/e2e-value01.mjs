// VALUE-01 五分钟首录路径 e2e —— node scripts/e2e-value01.mjs
// 空工作区 → 引导 → 建成员 → 快速表单录证件 → 提醒派生 → 定位原文，全自动走查并断言。
import { chromium } from "playwright";

const TOKEN = process.env.SIYUAN_TOKEN ?? "";
if (!TOKEN) { console.error("缺 SIYUAN_TOKEN"); process.exit(1); }
const BASE = process.env.TEST_WS_URL || "http://127.0.0.1:14680";
const api = async (path, body) => (await fetch(BASE + path, { method: "POST", headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const rec = (item, pass, detail = "") => { results.push({ item, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"} ${item}${detail ? " — " + detail : ""}`); };

// 1) 真·空区：清 petal 存储
for (const f of ["settings.json", "hub-runtime.json", "settings.json.corrupted.json"]) {
    await api("/api/file/removeFile", { path: `/data/storage/petal/siyuan-home/${f}` }).catch(() => {});
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" })).newPage();
p.on("pageerror", (e) => results.push({ item: "PAGEERROR", pass: false, detail: String(e).slice(0, 150) }));
await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await sleep(13000);
await p.evaluate(() => {
    const tb = document.getElementById("toolbar");
    Array.from(tb?.children ?? []).find((c) => (c.getAttribute("aria-label") || "").includes("小驴管家"))?.click();
});
await sleep(2500);

const clickByText = (texts, scope = "button, .b3-chip, [role=tab], option") =>
    p.evaluate(([ts, sc]) => {
        for (const t of ts) {
            const els = Array.from(document.querySelectorAll(sc)).filter((e) => e.textContent?.trim() === t);
            if (els.length) { els[0].click(); return t; }
        }
        return null;
    }, [texts, scope]);

// 2) 引导（含建库）
rec("首启向导出现", !!(await p.evaluate(() => {
    const text = document.body.innerText;
    return text.includes("STEP 1 / 2") || /第\s*1\s*步[，,]?\s*共\s*2\s*步/.test(text);
})));
await p.evaluate(() => {
    const input = document.querySelector(".lv-quick + * input, .lv-card input[placeholder*='例如']");
});
await clickByText(["配偶"]); await sleep(300);
await clickByText(["下一步 →", "下一步"]); await sleep(800);
await clickByText(["✓ 完成并录第一条证件", "完成引导"]); await sleep(9000);
const s1 = await api("/api/file/getFile", { path: "/data/storage/petal/siyuan-home/settings.json" }).then((r) => r.json?.() ?? JSON.parse(JSON.stringify(r))).catch(() => null);
// getFile 返回裸对象
const settings1 = s1 && s1.dbRefs ? s1 : null;
rec("引导完成并建库（≥5 模块）", !!settings1 && Object.keys(settings1.dbRefs ?? {}).length >= 5, `${Object.keys(settings1?.dbRefs ?? {}).length} 个`);

// 3) 建成员
await p.evaluate(() => {
    const t = Array.from(document.querySelectorAll(".lv-tabs__item")).find((e) => e.textContent?.trim() === "成员");
    t?.click();
});
await sleep(2000);
await p.evaluate(() => {
    const i = Array.from(document.querySelectorAll(".lv-card input.b3-text-field")).find((e) => e.placeholder === "称呼" || e.placeholder?.includes("称"));
    if (i) { i.value = "妈妈"; i.dispatchEvent(new Event("input", { bubbles: true })); }
});
await clickByText(["＋ 添加", "＋添加"]); await sleep(2500);
const memberOk = await p.evaluate(() => Array.from(document.querySelectorAll(".lv-people > *")).some((c) => (c.textContent || "").includes("妈妈")));
rec("成员建立（妈妈）", memberOk);

// 4) 快速表单录证件（成员=妈妈，到期 +10 天）
await p.evaluate(() => {
    const t = Array.from(document.querySelectorAll(".lv-tabs__item")).find((e) => e.textContent?.trim() === "台账");
    t?.click();
});
await sleep(3000);
const due = new Date(Date.now() + 10 * 86400000);
const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
await p.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll(".lv-screen input.b3-text-field"));
    const name = inputs.find((e) => e.placeholder === "名称");
    if (name) { name.value = "妈妈身份证"; name.dispatchEvent(new Event("input", { bubbles: true })); }
});
// 成员下拉选 妈妈
await p.evaluate(() => {
    const sel = Array.from(document.querySelectorAll(".lv-screen select")).find((s) => Array.from(s.options).some((o) => o.textContent === "妈妈"));
    if (sel) { sel.value = Array.from(sel.options).find((o) => o.textContent === "妈妈").value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
});
// 证件流程要求先选择证件类型，身份证用于覆盖最常见的完整编号录入路径。
await p.evaluate(() => {
    const sel = Array.from(document.querySelectorAll(".lv-screen select")).find((s) => Array.from(s.options).some((o) => o.textContent === "身份证"));
    if (sel) { sel.value = Array.from(sel.options).find((o) => o.textContent === "身份证").value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
});
await p.evaluate((d) => {
    const dateInput = Array.from(document.querySelectorAll(".lv-screen input[type=date]")).find((e) => !e.disabled);
    if (dateInput) { dateInput.value = d; dateInput.dispatchEvent(new Event("input", { bubbles: true })); dateInput.dispatchEvent(new Event("change", { bubbles: true })); }
}, dueStr);
await sleep(500);
const saveHit = await clickByText(["保存", "保存并继续新增"], ".lv-screen button"); await sleep(5000);
const rows = await p.evaluate(() => document.querySelectorAll(".lv-table tbody tr").length);
const rowNamed = await p.evaluate(() => Array.from(document.querySelectorAll(".lv-table tbody tr")).some((r) => (r.textContent || "").includes("妈妈身份证")));
rec("快速表单录证件（行出现且带名称）", saveHit !== null && rowNamed, `rows=${rows} named=${rowNamed}`);

// 5) 提醒派生（10 天内 → soon）
await p.evaluate(() => {
    const t = Array.from(document.querySelectorAll(".lv-tabs__item")).find((e) => e.textContent?.trim() === "提醒");
    t?.click();
});
await sleep(3000);
const rem = await p.evaluate(() => Array.from(document.querySelectorAll(".lv-rem-t b")).some((b) => (b.textContent || "").includes("妈妈身份证")));
rec("提醒派生（妈妈身份证进入提醒中枢）", rem);

// 6) 定位原文（打开台账文档页签）
await p.evaluate(() => {
    const row = Array.from(document.querySelectorAll(".lv-rem")).find((r) => (r.textContent || "").includes("妈妈身份证"));
    row?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const btn = Array.from(row?.querySelectorAll("button") ?? []).find((b) => b.textContent?.trim() === "定位");
    btn?.click();
});
await sleep(3500);
const tabs = await p.evaluate(() => Array.from(document.querySelectorAll(".layout-tab-bar .item .item__text")).map((e) => e.textContent?.trim()));
const located = tabs.some((t) => (t || "").includes("证件") || (t || "").includes("台账"));
rec("定位原文（台账文档页签打开）", located, JSON.stringify(tabs?.slice(0, 6)));

await browser.close();
const fails = results.filter((r) => !r.pass);
console.log(`\n==== VALUE-01: ${results.length - fails.length}/${results.length} PASS ====`);
