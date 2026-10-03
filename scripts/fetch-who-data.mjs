#!/usr/bin/env node
/**
 * WHO 儿童生长参考带构建期脚本（第七十七轮）。
 *
 * 下载 WHO Child Growth Standards 官方 LMS 参数表（xlsx），
 * 推导 P3/P15/P50/P85/P97 百分位带，生成 src/core/data/who-refs.ts。
 *
 * 零依赖：xlsx 用 unzip 解包（不可用时回退 PowerShell Expand-Archive），
 * sheet XML 为纯数字单元格，用正则解析；列名经 sharedStrings 映射，不写死列序。
 *
 * 数据来源：WHO Child Growth Standards（2006），
 * https://www.who.int/tools/child-growth-standards/standards/weight-for-age
 * © World Health Organization，CC BY-NC 3.0 IGO（引用署名；非商用）。
 * 百分位推导公式即 WHO 官方 LMS：X(z) = M·(1+L·S·z)^(1/L)（L=0 时 M·e^(S·z)），
 * z(P3)=-1.880794，z(P15)=-1.036433，z(P85)=1.036433，z(P97)=1.880794。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_FILE = join(ROOT, "src", "core", "data", "who-refs.ts");
const CACHE = join(tmpdir(), "lv-who-cache");

const CDN = "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators";
const FILES = [
    { id: "wfa-boys", url: `${CDN}/weight-for-age/wfa_boys_0-to-5-years_zscores.xlsx?sfvrsn=97a05331_9` },
    { id: "wfa-girls", url: `${CDN}/weight-for-age/wfa_girls_0-to-5-years_zscores.xlsx?sfvrsn=4c03b8db_7` },
    { id: "wfa-boys-w", url: `${CDN}/weight-for-age/wfa_boys_0-to-13-weeks_zscores.xlsx?sfvrsn=6e3a980f_7` },
    { id: "wfa-girls-w", url: `${CDN}/weight-for-age/wfa_girls_0-to-13-weeks_zscores.xlsx?sfvrsn=c4f4ba9f_7` },
    { id: "lhfa-boys-02", url: `${CDN}/length-height-for-age/lhfa_boys_0-to-2-years_zscores.xlsx?sfvrsn=30e044c_9` },
    { id: "lhfa-boys-25", url: `${CDN}/length-height-for-age/lhfa_boys_2-to-5-years_zscores.xlsx?sfvrsn=17e5ad91_9` },
    { id: "lhfa-boys-w", url: `${CDN}/length-height-for-age/lhfa_boys_0-to-13-weeks_zscores.xlsx?sfvrsn=70682dcc_9` },
    { id: "lhfa-girls-02", url: `${CDN}/length-height-for-age/lhfa_girls_0-to-2-years_zscores.xlsx?sfvrsn=e9e66a95_11` },
    { id: "lhfa-girls-25", url: `${CDN}/length-height-for-age/lhfa_girls_2-to-5-years_zscores.xlsx?sfvrsn=2ec187b9_11` },
    { id: "lhfa-girls-w", url: `${CDN}/length-height-for-age/lhfa_girls_0-to-13-weeks_zscores.xlsx?sfvrsn=a2c6650e_11` },
];

const Z = { p3: -1.880794, p15: -1.036433, p85: 1.036433, p97: 1.880794 };

async function download(url, dest) {
    if (existsSync(dest)) return; // 缓存命中（构建期可重复运行）
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`download ${url} → HTTP ${res.status}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function extractZip(xlsxPath, inner) {
    // Git Bash unzip 优先；Windows 无 unzip 时回退 PowerShell Expand-Archive
    try {
        return execFileSync("unzip", ["-p", xlsxPath, inner], { maxBuffer: 32 * 1024 * 1024 }).toString();
    } catch {
        const stage = join(tmpdir(), `lv-who-extract-${Date.now()}`);
        mkdirSync(stage, { recursive: true });
        execFileSync("powershell", ["-NoProfile", "-Command",
            `Expand-Archive -LiteralPath '${xlsxPath}' -DestinationPath '${stage}' -Force`]);
        return readFileSync(join(stage, ...inner.split("/")), "utf8");
    }
}

function parseSheet(xlsxPath) {
    const sst = extractZip(xlsxPath, "xl/sharedStrings.xml");
    const strings = [...sst.matchAll(/<si>(?:<t[^>]*>([^<]*)<\/t>)?<\/si>/g)].map((m) => m[1] ?? "");
    const xml = extractZip(xlsxPath, "xl/worksheets/sheet1.xml");
    const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
        const cells = {};
        for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>(?:<v>([^<]*)<\/v>)?<\/c>/g)) {
            const isString = /\bt="s"/.test(c[2]);
            cells[c[1]] = isString ? strings[Number(c[3])] : Number(c[3]);
        }
        return cells;
    });
    // 表头行：列字母 → 列名（Month|Week/L/M/S/SD…）
    const header = rows[0] ?? {};
    const colOf = {};
    for (const [col, name] of Object.entries(header)) if (typeof name === "string") colOf[name.trim()] = col;
    return rows.slice(1).map((cells) => ({
        age: cells[colOf.Month] ?? cells[colOf.Week], // 月表首列 Month，周表首列 Week
        L: cells[colOf.L], M: cells[colOf.M], S: cells[colOf.S],
        sd: { sd3neg: cells[colOf.SD3neg], sd1neg: cells[colOf.SD1neg], sd0: cells[colOf.SD0],
              sd1: cells[colOf.SD1], sd3: cells[colOf.SD3] },
    }));
}

function lmsValue(lms, z) {
    const { L, M, S } = lms;
    if (!Number.isFinite(L) || !Number.isFinite(M) || !Number.isFinite(S)) return NaN;
    return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}

/** 由 LMS 行推导五个百分位；先用表内 SD 列（z=∓3/∓1/0）全量校验 LMS 读数（表值 0.1 精度舍入） */
function bandFrom(lms) {
    const sdChecks = [[-3, lms.sd.sd3neg], [-1, lms.sd.sd1neg], [0, lms.sd.sd0], [1, lms.sd.sd1], [3, lms.sd.sd3]];
    for (const [z, tab] of sdChecks) {
        const derived = lmsValue(lms, z);
        if (!Number.isFinite(derived)) throw new Error("non-finite LMS derivation");
        if (Math.abs(derived - tab) > 0.061) throw new Error(`SD cross-check failed at z=${z}: derived ${derived.toFixed(3)} vs table ${tab}`);
    }
    return { p3: lmsValue(lms, Z.p3), p15: lmsValue(lms, Z.p15), p50: lms.M, p85: lmsValue(lms, Z.p85), p97: lmsValue(lms, Z.p97) };
}

/** 合并 lhfa 分段表：0-2（卧位身长）取 0..24 月，2-5（站立身高）取 25..60 月。
 * 两表在 24 月并存，差值 ≈0.7cm 即 WHO 规定的卧位/站立测量方式差，方向作断言。 */
function mergeLhfa(a, b) {
    const aEnd = a[a.length - 1];
    if (aEnd?.age !== 24) throw new Error(`lhfa 0-2 must end at month 24, got ${aEnd?.age}`);
    const bAt24 = b.find((r) => r.age === 24);
    if (!bAt24 || b[0].age !== 24) throw new Error(`lhfa 2-5 must start at month 24, got ${b[0]?.age}`);
    const gap = aEnd.M - bAt24.M;
    if (!(gap > 0.5 && gap < 0.9)) throw new Error(`lhfa 24m length-vs-height gap ${gap.toFixed(3)}cm out of expected 0.7±0.2`);
    return [...a, ...b.filter((r) => r.age >= 25)];
}

function round1(n) { return Math.round(n * 10) / 10; }

const sexKey = { boys: "male", girls: "female" };

async function main() {
    mkdirSync(CACHE, { recursive: true });
    mkdirSync(join(ROOT, "src", "core", "data"), { recursive: true });
    const tables = {};
    for (const f of FILES) {
        const dest = join(CACHE, `${f.id}.xlsx`);
        await download(f.url, dest);
        const parts = f.id.split("-");
        const sex = sexKey[parts[1]];
        const metric = parts[0] === "wfa" ? "weight" : "height";
        const rows = parseSheet(dest);
        const expectRows = parts[2] === "w" ? 14 : parts[2] === "02" ? 25 : parts[0] === "wfa" ? 61 : 37;
        if (rows.length !== expectRows) throw new Error(`${f.id}: ${rows.length} rows, expected ${expectRows}`);
        if (rows.some((r) => !Number.isFinite(r.age) || !Number.isFinite(r.M))) throw new Error(`${f.id}: bad row`);
        tables[f.id] = rows;
    }

    const band = () => ({ p3: [], p15: [], p50: [], p85: [], p97: [] });
    const fillBand = (bandObj, rows) => {
        for (const r of rows) for (const k of Object.keys(bandObj)) bandObj[k].push(round1(bandFrom(r)[k]));
        return bandObj;
    };
    // LMS 原参数入库（供运行时百分位反推 z）：L/S 5 位小数、M 4 位（推导精度足够，体积可控）
    const fillLms = (rows) => ({
        l: rows.map((r) => Math.round(r.L * 1e5) / 1e5),
        m: rows.map((r) => Math.round(r.M * 1e4) / 1e4),
        s: rows.map((r) => Math.round(r.S * 1e5) / 1e5),
    });

    const out = {};
    for (const sex of ["male", "female"]) {
        for (const metric of ["weight", "height"]) {
            const monthlyRows = metric === "weight" ? tables[`wfa-${parts0Sex(sex)}`] : mergeLhfa(tables[`lhfa-${parts0Sex(sex)}-02`], tables[`lhfa-${parts0Sex(sex)}-25`]);
            const months = monthlyRows.map((r) => r.age);
            if (months.some((m, i) => m !== i)) throw new Error(`${sex}/${metric}: months not contiguous from 0`);
            const weeklyRows = tables[`${metric === "weight" ? "wfa" : "lhfa"}-${parts0Sex(sex)}-w`];
            if (weeklyRows.some((r, i) => r.age !== i)) throw new Error(`${sex}/${metric}: weeks not contiguous from 0`);
            // 周/月交界一致性：周13（=91 天）与月3（=91.3 天）中位值差应有界
            const tol = metric === "weight" ? 0.15 : 0.4;
            const diff = Math.abs(weeklyRows[13].M - monthlyRows[3].M);
            if (diff > tol) throw new Error(`${sex}/${metric}: weekly w13 M ${weeklyRows[13].M} vs monthly m3 M ${monthlyRows[3].M} beyond ${tol}`);
            out[sex] ??= {};
            out[sex][metric] = { ...fillBand(band(), monthlyRows), lms: fillLms(monthlyRows), weekly: { ...fillBand(band(), weeklyRows), lms: fillLms(weeklyRows) } };
        }
    }

    const ts = `// AUTO-GENERATED by scripts/fetch-who-data.mjs — 请勿手改；重跑脚本再生成。
// 数据来源：WHO Child Growth Standards (2006) 官方 LMS 参数表。
// © World Health Organization，CC BY-NC 3.0 IGO（引用署名，非商用）。
// 百分位由 LMS 推导：X(z) = M·(1+L·S·z)^(1/L)；数组下标：主表 = 月龄（0..60），
// weekly = 周龄（0..13，新生儿期细粒度）。
export const WHO_REFS_VERSION = "WHO-CGS-2006";
export const WHO_REFS_ATTRIBUTION = "WHO Child Growth Standards (2006), CC BY-NC 3.0 IGO";

export interface WhoLms {
    /** L/M/S 原参数（下标=月龄或周龄）；供 whoPercentile 反解 z */
    l: number[]; m: number[]; s: number[];
}

export interface WhoBandTable {
    p3: number[]; p15: number[]; p50: number[]; p85: number[]; p97: number[];
    /** L/M/S 原参数（百分位反推用） */
    lms?: WhoLms;
    /** 0–13 周周粒度带（新生儿期）；存在时运行时按周龄优先取用 */
    weekly?: WhoBandTable;
}

export const WHO_REFS: Record<"male" | "female", Record<"height" | "weight", WhoBandTable>> = ${JSON.stringify(out, null, 2)};
`;
    writeFileSync(OUT_FILE, ts, "utf8");
    const kb = (Buffer.byteLength(ts) / 1024).toFixed(1);
    console.log(`who-refs.ts written: ${kb} KB, sexes=${Object.keys(out)}, months=${out.male.weight.p50.length}, weekly=${out.male.weight.weekly.p50.length}`);
}

function parts0Sex(sex) { return sex === "male" ? "boys" : "girls"; }

main().catch((e) => { console.error(e.message); process.exit(1); });
