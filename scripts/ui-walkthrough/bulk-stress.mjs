// 满数据压测注入：证件行（到期日散布）+ 备忘批量 —— node scripts/ui-walkthrough/bulk-stress.mjs [rows] [memos]
// 走查用法见 docs/testing/ui-walkthrough-runbook.md。注入后需在面板点「重新扫描」或调 refreshHub。
// API 调用器复用冒烟共享件 makeApi（SIYUAN_TOKEN 语义一致；库分工见两文件头注）
import { TOKEN, BASE, ensureKernel, sleep } from "./lib.mjs";
import { makeApi } from "../lib/smoke-kernel.mjs";

const ROWS = Number(process.argv[2] || 50);
const MEMOS = Number(process.argv[3] || 60);
await ensureKernel();
const api = makeApi(BASE, TOKEN);

const settings = await api("/api/file/getFile", { path: "/data/storage/petal/siyuan-home/settings.json" });
const certs = settings.dbRefs.certs;
if (!certs?.avId) { console.error("certs 未建库——先在面板启用证件模块"); process.exit(1); }

// addAttributeViewBlocks 响应不带行 ID —— 前后 render 差分（插件 addDetachedRow 同款语义）
const rowIDs = async () => ((await api("/api/av/renderAttributeView", { id: certs.avId }))?.data?.view?.rows ?? []).map((r) => r.id);
const day = 86400000;
const today = new Date();
today.setHours(0, 0, 0, 0);
let created = 0, failed = 0;
for (let i = 0; i < ROWS; i++) {
    const before = new Set(await rowIDs());
    await api("/api/av/addAttributeViewBlocks", { avID: certs.avId, blockID: "", srcs: [{ blockID: "", content: `压测行 ${String(i + 1).padStart(2, "0")}`, isDetached: true }] });
    await sleep(400);
    const added = (await rowIDs()).filter((id) => !before.has(id));
    if (!added.length) { failed++; continue; }
    const offset = i < 5 ? -(i + 1) * 4 : i < 10 ? i - 4 : Math.min(60, Math.round((i - 10) * 1.1) + 8);
    const due = today.getTime() + offset * day;
    for (const id of added) {
        await api("/api/av/setAttributeViewBlockAttr", {
            avID: certs.avId, keyID: certs.columns.expiry, itemID: id,
            value: { type: "date", date: { content: due, isNotEmpty: true, isNotTime: true } },
        });
    }
    created++;
}
console.log(`rows created: ${created}, failed: ${failed}`);

const rtPath = "/data/storage/petal/siyuan-home/hub-runtime.json";
// 干净靶场可能尚无 runtime 文件（getFile code≠0 → makeApi 抛错），回退空对象
const rt = await api("/api/file/getFile", { path: rtPath }).catch(() => ({}));
rt.memos = rt.memos ?? [];
for (let i = 0; i < MEMOS; i++) {
    const offset = i < 5 ? -(i + 1) : i < 6 ? 0 : i < 16 ? i - 5 : Math.round((i - 15) * 0.7) + 8;
    const d = new Date(today.getTime() + offset * day);
    rt.memos.push({
        id: `stress-${i}-${Date.now().toString(36)}`,
        title: `压测备忘 ${String(i + 1).padStart(2, "0")}`,
        dueDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        createdAt: new Date().toISOString(),
    });
}
const put = new FormData();
put.set("path", rtPath);
put.set("file", new Blob([JSON.stringify(rt)]), "hub-runtime.json");
const pr = await fetch(`${BASE}/api/file/putFile`, { method: "POST", headers: { Authorization: `Token ${TOKEN}` }, body: put });
console.log(`memos total: ${rt.memos.length}, putFile:`, (await pr.json()).code === 0 ? "OK" : "FAIL");
