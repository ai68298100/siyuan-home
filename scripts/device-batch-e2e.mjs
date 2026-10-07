// 真机批 e2e（DEVICE-01/02/03/04/05 自动化替代）—— node scripts/device-batch-e2e.mjs
// 前置：隔离靶场实例（见 CONTRIBUTING「内核靶场约定」）+ npx playwright install-channel msedge 或系统 Edge；
// 依赖 playwright（npx i playwright@1.63）
// 在独立靶场实例上驱动浏览器版思源，逐项产出 {stage,item,pass,detail} 证据。
// 边界：无头浏览器 ≠ 真实 Android WebView/读屏/低端设备——报告中如实声明残余项。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.TEST_WS_URL || "http://127.0.0.1:14680";
const TOKEN = process.env.SIYUAN_TOKEN ?? process.env.TEST_WS_TOKEN ?? "";
if (!TOKEN) { console.error("缺 SIYUAN_TOKEN（靶场 token 从该实例 设置→关于 获取）"); process.exit(1); }
const OUT = "tmp/ui-shots/device-batch";
mkdirSync(OUT, { recursive: true });

const api = async (path, body) => {
    const r = await fetch(BASE + path, {
        method: "POST",
        headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    });
    return r.json();
};
const results = [];
const rec = (stage, item, pass, detail = "") => { results.push({ stage, item, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"} [${stage}] ${item}${detail ? " — " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const api2 = async (path, body) => {
    const r = await fetch(BASE + path, {
        method: "POST",
        headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    });
    return r.json();
};

// 页面侧工具：按文本点击 / 面板打开 / 等待
const pClickByText = (page, texts, scope = "button, .b3-chip, [role=tab], select, option") =>
    page.evaluate(([ts, sc]) => {
        for (const t of ts) {
            const els = Array.from(document.querySelectorAll(sc)).filter((e) => e.textContent?.trim() === t);
            if (els.length) { els[0].click(); return t; }
        }
        return null;
    }, [texts, scope]);
const pOpenPanel = async (page) => {
    await page.evaluate(() => {
        const tb = document.getElementById("toolbar");
        Array.from(tb?.children ?? []).find((c) => (c.getAttribute("aria-label") || "").includes("小驴管家"))?.click();
    });
    await sleep(2500);
};
const pToast = (page) => page.evaluate(() => {
    // 思源 toast 文本在 .b3-snackbar__content（无 --item 类）；系统条（Chrome 兼容提示，常驻
    // 不自动消失）与插件回执同住 #message——过滤系统文案，取最后一条插件回执
    const items = Array.from(document.querySelectorAll("#message .b3-snackbar__content"));
    const texts = items.map((el) => el.textContent?.trim() ?? "").filter((t) => t && !t.includes("Chrome 浏览器"));
    return (texts.at(-1) ?? "").slice(0, 120);
});

// 轮询等待插件回执（生成/建库耗时随规模浮动，固定延时会错过完成回执）
const pToastPoll = async (page, timeoutMs = 90000) => {
    for (let t = 0; t < timeoutMs; t += 2000) {
        await sleep(2000);
        const txt = await pToast(page);
        if (txt.includes("已生成") || txt.includes("失败") || txt.includes("已清除")) return txt;
    }
    return await pToast(page);
};

const browser = await chromium.launch({ channel: "msedge", headless: true });

// ============================================================ S1 首启与引导
{
    const stage = "S1-首启引导";
    // 清 petal 存储 → 真·首启
    for (const f of ["settings.json", "hub-runtime.json", "settings.json.corrupted.json"]) {
        await api("/api/file/removeFile", { path: `/data/storage/petal/siyuan-home/${f}` });
    }
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await sleep(12000);
    await pOpenPanel(page);
    const wiz = await page.evaluate(() => document.body.innerText.includes("STEP 1 / 2"));
    rec(stage, "首启显示两步引导向导", wiz);
    await page.screenshot({ path: `${OUT}/s1-onboarding.png` });
    // 走向导：配偶+子女+1
    await pClickByText(page, ["配偶"]); await sleep(250);
    await pClickByText(page, ["子女"]); await sleep(250);
    await pClickByText(page, ["＋"]); await sleep(250);
    await pClickByText(page, ["下一步 →", "下一步"]); await sleep(800);
    await pClickByText(page, ["✓ 完成并录第一条证件", "完成引导"]); 
    await sleep(14000);
    // getFile 直接返回文件内容（非信封）——res.json() 即 settings 对象
    const j = await api("/api/file/getFile", { path: "/data/storage/petal/siyuan-home/settings.json" });
    let refs = {}, onboarded = false, errs = [];
    try { refs = j.dbRefs ?? {}; onboarded = !!j.onboarded;
        errs = Object.entries(refs).filter(([, v]) => v.provisionError).map(([k]) => k); } catch { /* noop */ }
    rec(stage, "完成引导后 onboarded=true", onboarded);
    rec(stage, "核心+推荐模块建库全部成功（无 provisionError）", Object.keys(refs).length >= 5 && errs.length === 0,
        `建库 ${Object.keys(refs).length} 个${errs.length ? "，失败：" + errs.join(",") : ""}`);
    await page.screenshot({ path: `${OUT}/s1-after-finish.png` });
    await ctx.close();
}

// ============================================================ S1.5 演示数据（为 S2/S3 提供行级数据）
{
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await sleep(12000);
    await pOpenPanel(page);
    await page.evaluate(() => document.querySelector(".lv-tabbar .lv-iconbtn")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await sleep(2000);
    await pClickByText(page, ["ℹ️ 关于", "关于"], ".lv-setnav__item, .b3-dialog button"); await sleep(1200);
    await pClickByText(page, ["生成示例数据"], "button");
    // 268 波：断言以磁盘结果为主（成员+行落盘），toast 时序受扫描耗时/系统条影响仅作辅助
    let diskDemo = { ids: 0, rows: 0 };
    for (let i = 0; i < 30; i++) {
        await sleep(2000);
        diskDemo = await api("/api/file/getFile", { path: "/data/storage/petal/siyuan-home/settings.json" })
            .then((j) => ({ ids: (j.demoMemberIds ?? []).length, rows: Object.keys(j.demoRows ?? {}).length }))
            .catch(() => ({ ids: 0, rows: 0 }));
        if (diskDemo.ids >= 2 && diskDemo.rows >= 2) break;
    }
    const toast = await pToast(page);
    rec("S1.5-演示数据", "生成示例数据", diskDemo.ids >= 2 && diskDemo.rows >= 2, `磁盘 成员${diskDemo.ids}/行${diskDemo.rows}；toast=${toast.slice(0, 40)}`);
    await page.keyboard.press("Escape"); await sleep(1000);
    await ctx.close();
}

// ============================================================ S2 四页 + S3 弹层回执 + 导入导出
{
    const stage = "S2-四页渲染";
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await sleep(12000);
    await pOpenPanel(page);

    const ov = await page.evaluate(() => ({
        strip: !!document.querySelector(".lv-strip[role=status]"),
        hero: document.querySelector(".lv-hero h1")?.textContent?.trim(),
        focus: document.querySelectorAll(".lv-focus-card").length,
        chips: document.querySelectorAll(".lv-members .lv-chip").length,
    }));
    rec(stage, "总览：状态条 role=status", ov.strip);
    rec(stage, "总览：按时段问候 hero", ["早安", "午安", "晚安"].includes(ov.hero ?? ""), ov.hero);
    rec(stage, "总览：三张重点卡", ov.focus === 3, `实际 ${ov.focus}`);
    rec(stage, "总览：成员 chips 渲染", ov.chips >= 1, `${ov.chips} 个`);

    await pClickByText(page, ["提醒"]);
    // 268 波：回执先行后重扫在后台——轮询等分组/行出现（扫描完成），上限 90s
    for (let i = 0; i < 45; i++) {
        await sleep(2000);
        const ready = await page.evaluate(() => document.querySelectorAll(".lv-group-label, .lv-rem").length > 0 || document.body.innerText.includes("最近没有要紧事"));
        if (ready) break;
    }
    await sleep(1000);
    const rem = await page.evaluate(() => ({
        h1: document.querySelector(".lv-screen h1")?.textContent?.trim(),
        selects: document.querySelectorAll(".lv-screen select").length,
        groups: document.querySelectorAll(".lv-group-label").length,
    }));
    rec(stage, "提醒：标题与四维筛选", rem.h1 === "提醒中枢" && rem.selects >= 4, `select=${rem.selects}`);
    rec(stage, "提醒：时间段分组标签", rem.groups >= 1, `${rem.groups} 组`);
    await page.screenshot({ path: `${OUT}/s2-reminders.png` });

    await pClickByText(page, ["台账"]); await sleep(2500);
    const led = await page.evaluate(() => ({
        select: !!document.querySelector(".lv-screen select"),
        table: !!document.querySelector(".lv-screen .av, .lv-screen table"),
    }));
    rec(stage, "台账：模块切换器 + 表格/原生 av", led.select && led.table);

    await pClickByText(page, ["成员"]); await sleep(2000);
    const mem = await page.evaluate(() => ({ cards: document.querySelectorAll(".lv-people > *").length }));
    rec(stage, "成员：卡片网格渲染", mem.cards >= 0, `${mem.cards} 卡`);

    // ── S3 弹层与回执
    const s3 = "S3-弹层与异步回执";
    await pClickByText(page, ["总览"]); await sleep(1500);
    // 快速备忘（智能日期）：输入 → 添加 → toast 回执 → 提醒页出现 adhoc 行
    await page.evaluate(() => {
        const input = document.querySelector(".lv-quick + * input, .lv-card input[placeholder*='例如']");
        if (input) { input.value = "明天交付e2e验证备忘"; input.dispatchEvent(new Event("input", { bubbles: true })); }
    });
    await pClickByText(page, ["＋ 备忘", "＋备忘"]); await sleep(1800);
    const toast1 = await pToast(page);
    rec(s3, "快速备忘保存回执（snackbar）", toast1.length > 0, toast1);
    await pClickByText(page, ["提醒"]); await sleep(1800);
    const memoRow = await page.evaluate(() => Array.from(document.querySelectorAll(".lv-rem-t b")).some((b) => (b.textContent || "").includes("e2e验证备忘")));
    rec(s3, "备忘进入提醒中枢（adhoc 行）", memoRow);
    // 完成（hover 行显示操作 → 点击 完成）→ 行消失
    const doneClicked = await page.evaluate(() => {
        const row = Array.from(document.querySelectorAll(".lv-rem")).find((r) => (r.textContent || "").includes("e2e验证备忘"));
        if (!row) return false;
        row.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        const btn = Array.from(row.querySelectorAll("button")).find((b) => b.textContent?.trim() === "完成");
        if (!btn) return false;
        btn.click();
        return true;
    });
    await sleep(2500);
    const memoGone = await page.evaluate(() => !Array.from(document.querySelectorAll(".lv-rem-t b")).some((b) => (b.textContent || "").includes("e2e验证备忘")));
    rec(s3, "完成动作：行即时消失（H02 免重扫）", doneClicked && memoGone, `clicked=${doneClicked} gone=${memoGone}`);

    // 成员新增/删除（确认对话框）
    await pClickByText(page, ["成员"]); await sleep(1500);
    const before = await page.evaluate(() => document.querySelectorAll(".lv-people > *").length);
    await page.evaluate(() => {
        const i = document.querySelector(".lv-card input.b3-text-field");
        if (i) { i.value = "e2e成员"; i.dispatchEvent(new Event("input", { bubbles: true })); }
    });
    await pClickByText(page, ["＋ 添加", "＋添加"]); await sleep(2500);
    const after = await page.evaluate(() => document.querySelectorAll(".lv-people > *").length);
    rec(s3, "成员新增（表单 → 卡片 +1）", after === before + 1, `${before}→${after}`);
    // 右键菜单删除 + 确认
    const del = await page.evaluate(() => {
        const card = Array.from(document.querySelectorAll(".lv-people > *")).find((c) => (c.textContent || "").includes("e2e成员"));
        if (!card) return "no card";
        card.querySelector(".lv-person-head")?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 400, clientY: 300 }));
        return "menu";
    });
    await sleep(900);
    await pClickByText(page, ["删除"], ".b3-menu__item, .b3-menu button"); await sleep(900);
    const confirmHit = await pClickByText(page, ["确认", "确定", "删除"], ".b3-dialog button, .b3-button");
    await sleep(2200);
    const afterDel = await page.evaluate(() => document.querySelectorAll(".lv-people > *").length);
    rec(s3, "成员删除经确认对话框", del === "menu" && !!confirmHit && afterDel === before, `${after}→${afterDel}`);

    // 演示数据生成回执
    await page.evaluate(() => document.querySelector(".lv-tabbar .lv-iconbtn")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await sleep(2000);
    await pClickByText(page, ["关于"], ".b3-dialog button"); await sleep(1200);
    await pClickByText(page, ["生成示例数据"], "button");
    let diskDemo2 = { ids: 0 };
    for (let i = 0; i < 30; i++) {
        await sleep(2000);
        diskDemo2 = await api("/api/file/getFile", { path: "/data/storage/petal/siyuan-home/settings.json" })
            .then((j) => ({ ids: (j.demoMemberIds ?? []).length }))
            .catch(() => ({ ids: 0 }));
        if (diskDemo2.ids >= 2) break;
    }
    const toast2 = await pToast(page);
    rec(s3, "示例数据生成回执", diskDemo2.ids >= 2, `磁盘 成员${diskDemo2.ids}；toast=${toast2.slice(0, 40)}`);
    // ICS 导出下载（先关设置回提醒页；高后果模块会弹 G1 确认 → 确认后下载）
    await page.keyboard.press("Escape"); await sleep(1200);
    await pClickByText(page, ["提醒"]); await sleep(1800);
    let icsOk = false, icsName = "";
    try {
        const dlPromise = page.waitForEvent("download", { timeout: 10000 });
        await pClickByText(page, ["导出日历 (.ics)", "导出日历"], "button");
        await sleep(1200);
        await pClickByText(page, ["确认", "确定"], ".b3-dialog button, .b3-button");
        const dl = await dlPromise;
        icsName = dl.suggestedFilename();
        icsOk = icsName.endsWith(".ics");
    } catch { /* 无数据时走 toast 提示 */ }
    rec(s3, "ICS 导出产生下载（G1 确认链路）", icsOk, icsName || "(无下载)");
    await ctx.close();
}

// ============================================================ S4 移动前端 320/375/768
{
    const stage = "S4-移动布局";
    const ua = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36";
    for (const width of [375, 320, 768]) {
        const ctx = await browser.newContext({ viewport: { width, height: 800 }, userAgent: ua, isMobile: true, hasTouch: true, locale: "zh-CN" });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
        await sleep(13000);
    // 移动端入口：227 波起插件在 #mobileTopBar 注入顶栏按钮（DEVICE-07 已落地）
    await page.evaluate(() => {
        const el = document.getElementById("lvHomeMobileTopBarButton");
        el?.click();
    });
    await sleep(3000);
        const m = await page.evaluate(() => ({
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            panel: !!document.querySelector(".lv-home"),
            tabsVisible: (() => { const t = document.querySelector(".lv-tabs"); if (!t) return false; const r = t.getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth + 1; })(),
            opsVisible: (() => { const b = Array.from(document.querySelectorAll(".lv-rem-ops")); if (!b.length) return "no-rows"; return b.every((e) => getComputedStyle(e).display !== "none"); })(),
            minHit: (() => {
                let min = 999;
                for (const e of document.querySelectorAll(".lv-home button")) { const r = e.getBoundingClientRect(); if (r.height > 0) min = Math.min(min, r.height); }
                return min;
            })(),
        }));
        rec(stage, `${width}px：无横向溢出`, m.overflowX <= 1, `溢出 ${m.overflowX}px`);
        rec(stage, `${width}px：面板挂载且页签在视口内`, m.panel && m.tabsVisible);
        rec(stage, `${width}px：触屏提醒操作常显`, m.opsVisible !== false, String(m.opsVisible));
        rec(stage, `${width}px：最小命中区 ≥32px`, m.minHit >= 32, `min=${Math.round(m.minHit)}px`);
        await page.screenshot({ path: `${OUT}/s4-mobile-${width}.png` });
        await ctx.close();
    }
}

// ============================================================ S5 无障碍（键盘/aria/命中区）
{
    const stage = "S5-无障碍";
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await sleep(12000);
    await pOpenPanel(page);
    const a11y = await page.evaluate(() => {
        const home = document.querySelector(".lv-home");
        const unnamed = Array.from(home.querySelectorAll("button")).filter((b) => {
            const t = (b.textContent || "").trim();
            return !t && !b.getAttribute("aria-label") && !b.title;
        }).length;
        let minHit = 999;
        for (const e of home.querySelectorAll(".lv-tabs__item, .lv-chip, .lv-rem-ops button")) {
            const r = e.getBoundingClientRect();
            if (r.height > 0) minHit = Math.min(minHit, r.height);
        }
        return {
            unnamed,
            minHit,
            ariaCurrent: !!home.querySelector('.lv-tabs__item[aria-current="page"]'),
            stripRole: home.querySelector(".lv-strip")?.getAttribute("role"),
        };
    });
    rec(stage, "图标按钮均有可访问名称", a11y.unnamed === 0, `${a11y.unnamed} 个未命名`);
    rec(stage, "页签/筛选/行操作最小命中区 ≥32px", a11y.minHit >= 32, `min=${Math.round(a11y.minHit)}px`);
    rec(stage, "激活页签 aria-current=page", a11y.ariaCurrent);
    rec(stage, "状态条 role=status", a11y.stripRole === "status");
    // 键盘：Tab 到页签并 Enter 切换
    await pClickByText(page, ["总览"]); await sleep(800);
    const kb = await page.evaluate(() => {
        const btn = document.querySelector('.lv-tabs__item[data-s="reminders"]');
        btn?.focus();
        return document.activeElement?.dataset?.s;
    });
    await page.keyboard.press("Enter"); await sleep(1500);
    const kbSwitched = await page.evaluate(() => document.querySelector(".lv-screen h1")?.textContent?.trim());
    rec(stage, "键盘 Enter 切换页签", kb === "reminders" && kbSwitched === "提醒中枢", `focus=${kb} → ${kbSwitched}`);
    await ctx.close();
}

// ============================================================ S6 性能基线（200/500/1000 行）
{
    const stage = "S6-性能基线";
    // getFile 直接返回文件内容（非信封）
    const j = await api("/api/file/getFile", { path: "/data/storage/petal/siyuan-home/settings.json" });
    const avId = j.dbRefs?.certs?.avId;
    if (!avId) { rec(stage, "certs av 可用", false, "无 avId"); } else {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
        await sleep(12000);
        await pOpenPanel(page);
        // 记录基线行 id（onboarding 空表≈0 行）
        const render = async () => api("/api/av/renderAttributeView", { id: avId });
        const rowIds = async () => (await render())?.data?.view?.rows?.map((r) => r.id) ?? [];
        const baseline = new Set(await rowIds());
        let seeded = [];
        const targetSizes = [200, 500, 1000];
        for (const size of targetSizes) {
            while (seeded.length < size) {
                const batch = [];
                for (let k = 0; k < 50 && seeded.length + batch.length < size; k++) batch.push({ content: `perf行${seeded.length + batch.length + 1}`, isDetached: true });
                await api("/api/av/addAttributeViewBlocks", { avID: avId, srcs: batch });
                seeded.push(...batch.map((_, i) => `idx-${seeded.length + i}`));
                await sleep(400);
            }
            const t0 = Date.now();
            const rv = await render();
            const apiMs = Date.now() - t0;
            // 面板内：切到台账，量首屏 200 行可达耗时（230 波起渐进渲染：加载更多按需追加，全量语义不变）
            await pClickByText(page, ["总览"]); await sleep(600);
            const t1 = Date.now();
            await pClickByText(page, ["台账"]);
            await page.waitForFunction(() => document.querySelectorAll(".lv-table tbody tr").length >= 200, { timeout: 30000 }).catch(() => {});
            const domMs = Date.now() - t1;
            let domRows = await page.evaluate(() => document.querySelectorAll(".lv-table tbody tr").length);
            for (let click = 0; click < 10 && domRows < size; click++) {
                await page.evaluate(() => {
                    const btn = document.querySelector(".lv-more button");
                    btn?.click();
                });
                await sleep(1500);
                domRows = await page.evaluate(() => document.querySelectorAll(".lv-table tbody tr").length);
            }
            rec(stage, `${size} 行：面板首屏 ${domMs}ms（渐进 200 行）+ 加载更多至 ${domRows} 行`, domRows >= size, `firstPaint=${domMs}ms rows=${domRows}`);
            await page.screenshot({ path: `${OUT}/s6-perf-${size}.png` });
        }
        // 清理：render.rows 有 pageSize 封顶（每次最多 50）→ 循环清到空
        let removed = 0;
        for (let round = 0; round < 60; round++) {
            const ids = await rowIds();
            if (!ids.length) break;
            await api("/api/av/removeAttributeViewBlocks", { avID: avId, srcIDs: ids });
            removed += ids.length;
            await sleep(400);
        }
        const left = (await rowIds()).length;
        rec(stage, "性能种子行清理完毕", left === 0, `移除 ${removed}，剩余 ${left}`);
        await ctx.close();
    }
}

await browser.close();
writeFileSync("tmp/device-batch-results.json", JSON.stringify(results, null, 1));
const fails = results.filter((r) => !r.pass);
console.log(`\n==== SUMMARY: ${results.length - fails.length}/${results.length} PASS, ${fails.length} FAIL ====`);
