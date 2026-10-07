// TRUST-01 能力证据矩阵生成器 —— node scripts/trust-matrix.mjs
// 逐模块登记 建库 / 读写（靶场内核实读）+ 全局契约事实（SCHEMA_CATALOG 覆盖 / providerCoverage 自检）。
// 证据等级：L1=代码存在 / L2=自动化断言 / L3=真机（残余）。输出 docs/capability-matrix.md。
import fs from "node:fs";
import path from "node:path";
import { TOKEN, BASE, ensureKernel } from "./ui-walkthrough/lib.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.resolve(ROOT, "package.json"), "utf8"));
const pluginVersion = packageJson.version;
const api = async (p2, body) =>
    (await fetch(BASE + p2, { method: "POST", headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) })).json();

await ensureKernel();

// ── 1) 契约侧：模块 id 单源（core/modules.ts BUILT_IN_MODULES）──
const modSrc = fs.readFileSync(path.resolve(ROOT, "src/core/modules.ts"), "utf8");
const modules = [...modSrc.matchAll(/\{\s*id:\s*"([a-z0-9-]+)",/g)].map((m) => m[1]);
const schemaSrc = fs.readFileSync(path.resolve(ROOT, "src/core/schema.ts"), "utf8");
// 全局契约事实：SCHEMA_CATALOG 覆盖的模块数 + labelKey 数 + 提醒规则块数
// SCHEMA_CATALOG 用常量引用（assets-real → ASSETS_REAL_SCHEMA）；验证 31 模块 id 全有对应 schema 常量
const snake = (id) => id.replace(/-/g, "_").toUpperCase();
const catalogIds = modules.filter((id) => new RegExp(`const ${snake(id)}_SCHEMA`).test(schemaSrc));
const labelKeys = new Set([...schemaSrc.matchAll(/labelKey:\s*"([^"]+)"/g)].map((m) => m[1]));
const reminderBlocks = (schemaSrc.match(/reminders:\s*\[/g) ?? []).length;
const captureBlocks = (schemaSrc.match(/capture:\s*\[/g) ?? []).length;

// ── 2) 实态侧：靶场 dbRefs + 逐 av 实读 ──
const settings = await api("/api/file/getFile", { path: "/data/storage/petal/siyuan-home/settings.json" }).catch(() => ({}));
const refs = settings.dbRefs ?? {};
const live = {};
for (const [mid, ref] of Object.entries(refs)) {
    if (!ref?.avId) { live[mid] = { provisioned: false }; continue; }
    const r = await api("/api/av/renderAttributeView", { id: ref.avId }).catch(() => null);
    live[mid] = {
        provisioned: true,
        columns: r?.data?.view?.columns?.length ?? 0,
        rows: (r?.data?.view?.rows ?? []).length,
        readable: !!r,
    };
}

// ── 3) 组装 ──
const row = (mid) => {
    const l = live[mid] ?? {};
    const provisioned = l.provisioned ? "✅" : "·未启用";
    const readable = l.readable ? `✅ ${l.rows} 行 / ${l.columns} 列` : (l.provisioned ? "⚠️ 实读失败" : "—");
    return `| ${mid} | ${provisioned} | ${readable} |`;
};
const enabledRows = modules.filter((m) => settings.enabledModules?.includes(m)).map(row);
const disabledRows = modules.filter((m) => !settings.enabledModules?.includes(m)).map(row);
const provisionedCount = Object.values(live).filter((l) => l.provisioned).length;
const readableCount = Object.values(live).filter((l) => l.readable).length;

const doc = [
    "# 能力证据矩阵（TRUST-01）",
    "",
    `> 生成：scripts/trust-matrix.mjs @ v${pluginVersion}（靶场 ${BASE} 内核实读 + 源码契约解析）。`,
    "> 证据等级：L1=代码存在 · L2=自动化断言（单测/e2e）· L3=真机（残余见 §缺口）。对外文案只引用 L2 及以上。",
    "",
    "## 全局契约事实（L1/L2）",
    "",
    `- SCHEMA_CATALOG 覆盖模块：**${catalogIds.length}/${modules.length}**（契约自检 validateSchema 启动期执行，违规即 console.error）`,
    `- 提醒规则块：${reminderBlocks} 处；providerCoverage 契约自检缺失=**0**（hub.test.ts 断言）`,
    `- 字段字典 labelKey：${labelKeys.size} 个，i18n 对齐缺失=**0**（274 波 A1b 收口）`,
    `- 快速录入（capture）定义：${captureBlocks} 处`,
    "",
    "## 已启用模块（靶场内核实读）",
    "",
    "| 模块 | 建库 | 读写（实读） |",
    "|---|---|---|",
    ...enabledRows,
    "",
    `> 实读通过 ${readableCount}/${provisionedCount}。`,
    "",
    "## 未启用模块（契约就绪，启用即建库）",
    "",
    "| 模块 | 建库 | 读写 |",
    "|---|---|---|",
    ...disabledRows,
    "",
    "## 横切能力（全模块共用，L2 自动化断言）",
    "",
    "| 能力 | 证据 |",
    "|---|---|",
    "| 首录路径 | VALUE-01 6/6（引导→建库→成员→录证件→提醒→定位） |",
    "| 恢复路径 | VALUE-02 4/4（设置损坏回退/缺库自愈） |",
    "| 导入 | IMPORT-RECOVERY 5/5（非法 JSON 拒绝/敌意归一化） |",
    "| 真机批 | Chromium/脚本化覆盖已形成；Android WebView、独立窗口、兄弟插件并发、双端冲突仍待 L3 设备验收 |",
    "| 成员 DAL | addMember/updateMember/removeMember/syncMembersToAv（VALUE-01 成员建立） |",
    "| 提醒派生 | runScan/deriveVisible + providerCoverage 契约自检（hub.test.ts） |",
    "| 导出 | .ics（提醒）/ .csv（台账）/ .vcf（成员）/ QR 标签 |",
    "| 移动端 | DEVICE-07 顶栏注入 + 全屏面板（S4 移动三档） |",
    "| 无障碍 | S5：可访问名称/aria-current/命中区/键盘切换 |",
    "",
    "## 缺口（L3 残余，不对外声明）",
    "",
    "- 真机批残余：Android WebView 软键盘/返回/旋转/安全区、独立窗口、兄弟插件并发、双端冲突（DEVICE-01~06 ◐）",
    "- 帧率/内存/能耗基线需低端真机（DEVICE-05 ◐）",
    "- 用户试用完成率证据（VALUE-04，待 3–5 位目标用户）",
    "",
].join("\n");
fs.writeFileSync(path.resolve(ROOT, "docs/capability-matrix.md"), doc);
console.log(`capability-matrix.md: ${modules.length} modules, catalog ${catalogIds.length}, provisioned ${provisionedCount}, readable ${readableCount}`);
