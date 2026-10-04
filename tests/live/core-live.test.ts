/**
 * 活体集成测试（第一百七十七波）：插件自己的 core 代码路径打真实内核。
 * 覆盖 §8：IT-02（写读回）/IT-03（D01 分页）/IT-04（renderLedger 语义）/IT-05（删行）/规则引擎真实派生/健康检查。
 * 门禁：单次探测，401/429 直接 skip 整套件（严禁重试——见 CONTRIBUTING）；
 * 数据隔离：专用笔记本 LVH-真机批，afterAll 清理。
 * 运行：pnpm run test:live（或 scripts/e2e-core.sh，其会 source 环境并先跑门禁）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { gateProbe, liveTransport, liveUploadTransport, rawApi, LIVE_NOTEBOOK } from "./live-env";
import {
    setTransport, setUploadTransport, createAttributeView, addAttributeViewColumn, addDetachedRow,
    setCell, renderLedger, renderLedgerAll, primaryRowItemIDs, removeLedgerRows, uploadAsset,
} from "@/core/siyuan";
import { CertsProvider } from "@/core/hub/providers";
import { runScan } from "@/core/hub/scanner";
import { defaultRuntime } from "@/core/hub/runtime";
import { runHealthCheck } from "@/core/health";
import { CERTS_SCHEMA } from "@/core/schema";
import type { HomeSettings, Reminder } from "@/types";

const gate = await gateProbe();
const skip = !gate.ok;
if (skip) console.warn(`[live] SKIP 整套件：${gate.reason}`);
setTransport(liveTransport); // 无害：门禁失败时测试全部 skip
setUploadTransport(liveUploadTransport); // 192 波：node 下 uploadAsset 需绝对地址（E6 端点已证可用）

let NB = "";
let DOC = "";
let AV = "";
let kName = "";
let kExp = "";
let kDue = ""; // endorsement 规则字段（certs schema 声明 due 列——H14 缺列显式报错，fixture 必须齐）
let kAsset = ""; // IT-11：asset 单元格形状验证列
const pluginRowIds: string[] = [];
const pluginRowNames = ["逾期证件", "即将到期证件", "远期证件"];

const iso = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const settings = (): HomeSettings => ({
    enabledModules: ["certs"],
    dbRefs: { certs: { avId: AV, docId: DOC, columns: { name: kName, expiry: kExp, due: kDue } } },
    members: [],
} as unknown as HomeSettings);

beforeAll(async () => {
    if (skip) return;
    // 笔记本（幂等）
    const created = await rawApi("/api/notebook/createNotebook", { name: LIVE_NOTEBOOK });
    NB = created.data?.notebook?.id ?? "";
    if (!NB) {
        const ls = await rawApi("/api/notebook/lsNotebooks", {});
        NB = (ls.data?.notebooks ?? []).find((n: any) => n.name === LIVE_NOTEBOOK)?.id ?? "";
    }
    expect(NB).toBeTruthy();
    await rawApi("/api/notebook/openNotebook", { notebook: NB });
    // 文档 + av（经插件 createAttributeView：div 占位 → SQL 定位 → render createIfNotExist）
    DOC = String((await rawApi("/api/filetree/createDocWithMd", { notebook: NB, path: `/core-live-${Date.now()}`, markdown: "# t" })).data ?? "").replace(/"/g, "");
    expect(DOC).toBeTruthy();
    AV = await createAttributeView(DOC, `lvh-core-${Date.now()}`);
    expect(AV).toBeTruthy();
    // 列：名称(text) + 到期(date) + 签注 due(date) + 附件(mAsset, IT-11——E14：内核无 asset 单资源列)——keyID 由插件 newSiYuanId 自造
    kName = await addAttributeViewColumn(AV, { name: "名称", type: "text" });
    kExp = await addAttributeViewColumn(AV, { name: "到期", type: "date" });
    kDue = await addAttributeViewColumn(AV, { name: "签注", type: "date" });
    kAsset = await addAttributeViewColumn(AV, { name: "附件", type: "mAsset" });
    expect(kName).toBeTruthy();
    expect(kExp).toBeTruthy();
}, 120_000);

afterAll(async () => {
    if (skip || !DOC) return;
    await rawApi("/api/filetree/removeDocByID", { id: DOC });
    await rawApi("/api/notebook/removeNotebook", { notebook: NB });
});

describe("live.IT-03 · D01 主键分页循环（插件代码路径）", () => {
    it.skipIf(skip)("60 行（>单页 50）→ primaryRowItemIDs 循环返回全部且唯一", async () => {
        const srcs = Array.from({ length: 60 }, (_, i) => ({ content: `批量行${i + 1}`, isDetached: true }));
        const r = await liveTransport("/api/av/addAttributeViewBlocks", { avID: AV, blockID: "", srcs });
        expect(r.code).toBe(0);
        await new Promise((res) => setTimeout(res, 800)); // 块索引异步重建
        const ids = await primaryRowItemIDs(AV);
        expect(ids).toHaveLength(60);
        expect(new Set(ids).size).toBe(60);
    });

    it.skipIf(skip)("IT-04 renderLedger 语义：60 行 → complete=false 且 rows=50（E1：默认分页 50/页）", async () => {
        const read = await renderLedger(AV);
        expect(read.rowCount).toBe(60);
        expect(read.rows).toHaveLength(50);
        expect(read.complete).toBe(false);
    });

    it.skipIf(skip)("IT-07/E13 renderLedgerAll：60 行全量读回 complete=true（N7：>50 行派生不再受阻）", async () => {
        const all = await renderLedgerAll(AV);
        expect(all.rowCount).toBe(60);
        expect(all.rows).toHaveLength(60);
        expect(all.complete).toBe(true);
        expect(new Set(all.rows.map((r) => r.itemID)).size).toBe(60);
    });
});

describe("live.IT-02/05 · 插件写路径（D02 行确认 / 删行）", () => {
    it.skipIf(skip)("addDetachedRow×3 → setCell 名称/到期 → renderLedger 读回一致", async () => {
        const dates = [iso(-2), iso(3), iso(40)]; // 逾期 / 即将 / 远期
        for (let i = 0; i < 3; i++) {
            const itemID = await addDetachedRow(AV, pluginRowNames[i]);
            expect(itemID).toBeTruthy();
            pluginRowIds.push(itemID);
            await setCell(AV, kName, itemID, { type: "text", text: { content: pluginRowNames[i] } });
            await setCell(AV, kExp, itemID, { type: "date", date: { content: new Date(`${dates[i]}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true } });
        }
        const read = await renderLedger(AV);
        for (let i = 0; i < 3; i++) {
            const row = read.rows.find((r) => r.itemID === pluginRowIds[i]);
            expect(row, `行 ${pluginRowNames[i]} 可见`).toBeTruthy();
            expect(String(row!.cells[kName]?.text?.content)).toBe(pluginRowNames[i]);
        }
    });

    it.skipIf(skip)("IT-05 removeLedgerRows → 行数即减，幸存行正确", async () => {
        await removeLedgerRows(AV, [pluginRowIds[0]]);
        const read = await renderLedger(AV);
        // 60 批量行 + 3 插件行 - 1 = 62
        expect(read.rowCount).toBe(62);
        expect(read.rows.find((r) => r.itemID === pluginRowIds[0])).toBeUndefined();
    });

    it.skipIf(skip)("IT-11 mAsset 单元格：uploadAsset → setCell {mAsset:[{content,name}]} → render 读回（E14：无 asset 单资源列；头像/附件写值形态真机验证）", async () => {
        const file = new File([new Uint8Array([1, 2, 3, 4])], "lvh-it11.txt", { type: "text/plain" });
        const up = await uploadAsset(file);
        expect(up.path).toMatch(/^assets\//); // E6/192 波：succMap 路径为工作区相对路径（无前导斜杠）
        await setCell(AV, kAsset, pluginRowIds[1], { type: "mAsset", mAsset: [{ content: up.path, name: up.name }] });
        const read = await renderLedger(AV);
        const row = read.rows.find((r) => r.itemID === pluginRowIds[1]);
        const v = row?.cells[kAsset];
        expect(v?.type).toBe("mAsset");
        expect(v?.mAsset?.[0]?.content ?? v?.mAsset?.[0]?.block?.content).toBe(up.path);
    });
});

describe("live.规则引擎 · CertsProvider 在真实内核数据上派生", () => {
    it.skipIf(skip)("先清 60 批量行（插件删行路径，render 分页逐页删 → 2 行）", async () => {
        // 182 波真机发现：内核删行端点只认 render row.id 空间；PK values id（primaryRowItemIDs）
        // 传入 srcIDs 静默无效（D02 两套 ID 空间论断延伸到删除路径）。render 恒 50/页（E1），
        // >50 行批量删除只能逐页删到净。guard 防死循环。
        for (let guard = 0; guard < 5; guard++) {
            const read = await renderLedger(AV);
            if (read.rowCount <= 2) break;
            const ids = read.rows.map((r) => r.itemID).filter((id) => !pluginRowIds.includes(id));
            if (ids.length === 0) break;
            await removeLedgerRows(AV, ids);
        }
        const read = await renderLedger(AV);
        expect(read.rowCount).toBe(2);
    });

    it.skipIf(skip)("扫描派生：重建逾期行（IT-05 已删）→ 逾期/即将/远期 三级提醒与种子一致", async () => {
        // IT-05 删除了 pluginRowIds[0]（逾期行）——重建同语义行再扫描
        const itemID = await addDetachedRow(AV, pluginRowNames[0]);
        await setCell(AV, kName, itemID, { type: "text", text: { content: pluginRowNames[0] } });
        await setCell(AV, kExp, itemID, { type: "date", date: { content: new Date(`${iso(-2)}T00:00:00`).getTime(), isNotEmpty: true, isNotTime: true } });
        const deps = { settings: settings(), getDbRef: (mid: string) => settings().dbRefs[mid] };
        const providers = [new CertsProvider(deps)];
        const result = await runScan(providers, settings(), defaultRuntime(), new Date());
        expect(result.errors).toEqual([]);
        expect(result.stale).toBe(false);
        const levels = result.derived.filter((r) => pluginRowNames.includes(r.title)).map((r: Reminder) => r.level);
        expect(levels).toContain("overdue");
        expect(levels).toContain("soon");
        expect(levels).toContain("lead");
        const titles = result.derived.map((r) => r.title);
        expect(titles).toEqual(expect.arrayContaining(pluginRowNames));
    });
});

describe("live.健康检查 · runHealthCheck 真实模块", () => {
    it.skipIf(skip)("certs 模块 ok、完整读取；schema 其余列如实列为缺失", async () => {
        const report = await runHealthCheck(settings(), { certs: CERTS_SCHEMA });
        expect(report.modules).toHaveLength(1);
        const m = report.modules[0];
        expect(m.moduleId).toBe("certs");
        expect(m.ok).toBe(true);
        expect(m.complete).toBe(true);
        expect(m.rows).toBe(3); // 即将 + 远期 + 规则测试重建的逾期行
        expect((m.missingColumns ?? []).length).toBeGreaterThan(0); // fixture 只建 name/expiry/due
    });
});
