// 发布包 smoke test（33.5）—— node scripts/smoke-test.mjs
// 检查 package.zip：必要文件齐全、禁入文件未泄漏、manifest/i18n JSON 有效、体积门禁。
import { readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const zip = path.resolve("package.zip");
const tmp = path.resolve("tmp/smoke-test");
const errors = [];
const warnings = [];

if (!existsSync(zip)) {
    console.error("package.zip not found — run `pnpm run build` first");
    process.exit(1);
}

// 解压（REL-02 跨平台）：unzip（Linux/macOS/Git Bash）→ PowerShell Expand-Archive（Windows）
// → python zipfile，任一成功即用；三者皆缺才失败。SMOKE_EXTRACT 可强制指定方法名。
function extractZip(zipPath, dest) {
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    const methods = [
        ["unzip", "unzip", ["-o", "-q", zipPath, "-d", dest]],
        [
            "powershell",
            "powershell",
            [
                "-NoProfile",
                "-Command",
                "Expand-Archive -LiteralPath $env:SMOKE_ZIP -DestinationPath $env:SMOKE_DEST -Force",
            ],
        ],
        ["python", "python", ["-m", "zipfile", "-e", zipPath, dest]],
    ];
    const forced = process.env.SMOKE_EXTRACT;
    const chain = forced ? methods.filter(([name]) => name === forced) : methods;
    if (forced && chain.length === 0) throw new Error(`SMOKE_EXTRACT=${forced} 不存在（可选 unzip/powershell/python）`);
    let lastErr;
    for (const [name, executable, args] of chain) {
        try {
            const env = executable === "powershell"
                ? { ...process.env, SMOKE_ZIP: zipPath, SMOKE_DEST: dest }
                : process.env;
            execFileSync(executable, args, { env, stdio: "pipe" });
            if (existsSync(path.join(dest, "plugin.json"))) return name;
            lastErr = new Error(`${name} 执行成功但未产出 plugin.json`);
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr ?? new Error("no extraction method available");
}

let extractBy = "";
try {
    extractBy = extractZip(zip, tmp);
} catch (e) {
    console.error("extract failed:", e.message);
    process.exit(1);
}

// 1. 必要文件（集市与运行要求）
const required = [
    "index.js", "index.css", "plugin.json", "icon.png", "preview.png",
    "README.md", "README.en.md", "LICENSE", "kernel.js",
    "i18n/zh-CN.json", "i18n/en.json",
];
for (const f of required) {
    if (!existsSync(path.join(tmp, f))) errors.push(`missing required file: ${f}`);
}

// 2. 禁入文件（D12：发布产物仅运行必需）
const forbidden = ["TODO.md", "MODULES.md", "docs", "prototype", "tests", "scripts", "ROADMAP.md", "CONTRIBUTING.md"];
for (const f of forbidden) {
    if (existsSync(path.join(tmp, f))) errors.push(`forbidden file leaked: ${f}`);
}

// 3. JSON 有效性 + i18n 键位对齐（包内副本）
try {
    const manifest = JSON.parse(readFileSync(path.join(tmp, "plugin.json"), "utf8"));
    if (manifest.name !== "siyuan-home") errors.push("manifest name mismatch");
    const zh = Object.keys(JSON.parse(readFileSync(path.join(tmp, "i18n/zh-CN.json"), "utf8"))).sort();
    const en = Object.keys(JSON.parse(readFileSync(path.join(tmp, "i18n/en.json"), "utf8"))).sort();
    if (zh.join() !== en.join()) errors.push("packaged i18n key mismatch");
    if (zh.length < 400) warnings.push(`packaged i18n keys suspiciously few: ${zh.length}`);
} catch (e) {
    errors.push("packaged JSON parse error: " + e.message);
}

// 4. 体积门禁（<10MB）
const mb = readFileSync(zip).length / 1024 / 1024;
if (mb > 10) errors.push(`package.zip too large: ${mb.toFixed(2)} MB`);

// 5. 单文件门禁：思源前端 require 桩把相对路径交给 Electron window.require（以思源 app 根为基准），
//    require("./...") 必然 MODULE_NOT_FOUND → 插件静默加载失败、零入口（v0.3.0 chunks 事故）。
//    index.js 必须保持单文件（vite/rolldown codeSplitting=false），禁止任何相对 require。
const bundledJs = readFileSync(path.join(tmp, "index.js"), "utf8");
const relativeRequires = bundledJs.match(/require\("\.\//g) ?? [];
if (relativeRequires.length) {
    errors.push(`index.js contains ${relativeRequires.length} relative require(s) — code splitting breaks the SiYuan loader; rebuild with codeSplitting:false`);
}
const chunkFiles = existsSync(path.join(tmp, "chunks"));
if (chunkFiles) errors.push("package.zip contains chunks/ directory — forbidden (single-file bundle only)");

// 汇总
if (warnings.length) console.log("warnings:\n" + warnings.map((w) => " ⚠ " + w).join("\n"));
if (errors.length) {
    console.error("SMOKE TEST FAILED:\n" + errors.map((e) => " ✗ " + e).join("\n"));
    process.exit(1);
}
console.log(`smoke test OK: zip ${mb.toFixed(2)} MB, all required files present, no leaks`);
rmSync(tmp, { recursive: true, force: true });
