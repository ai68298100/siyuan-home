// i18n 键位对齐 + 使用面审计 —— node scripts/check-i18n.mjs
// 1) zh-CN/en 必须同键集；2) src/ 里 t() 用到的键必须存在（缺键 = UI 裸显 key 名）；
// 3) 模板串键族（`role.${r}` 等）按前缀查命中。第八十三轮起为门禁项。
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const zhMap = JSON.parse(readFileSync("public/i18n/zh-CN.json", "utf8"));
const enMap = JSON.parse(readFileSync("public/i18n/en.json", "utf8"));
const zh = Object.keys(zhMap).sort();
const en = Object.keys(enMap).sort();
let failed = false;

const onlyZh = zh.filter((k) => !en.includes(k));
const onlyEn = en.filter((k) => !zh.includes(k));
if (onlyZh.length || onlyEn.length) {
    console.error("i18n key mismatch:", { onlyZh, onlyEn });
    failed = true;
}

// 收集 src/ 下 t() 的键：静态字面量 + 模板串（含 ${} 的按前缀族查命中）
const files = [];
(function walk(d) {
    for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.svelte$/.test(f) || /\.ts$/.test(f)) files.push(p);
    }
})("src");

const staticKeys = new Set();
const dynFamilies = new Set();
for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bt\(\s*["']([^"'?]+)["']/g)) staticKeys.add(m[1]);
    for (const m of src.matchAll(/\bt\(\s*`([^`]+)`/g)) {
        const tpl = m[1];
        if (tpl.includes("${")) dynFamilies.add(tpl.replace(/\$\{[^}]*\}/g, "*"));
        else staticKeys.add(tpl);
    }
}

const missZh = [...staticKeys].filter((k) => !(k in zhMap));
const missEn = [...staticKeys].filter((k) => !(k in enMap));
if (missZh.length || missEn.length) {
    console.error("i18n missing keys used in src:", { missZh, missEn });
    failed = true;
}

const deadFamilies = [];
for (const fam of [...dynFamilies].sort()) {
    const prefix = fam.split("*")[0];
    if (!zh.some((k) => k.startsWith(prefix))) deadFamilies.push(fam);
}
if (deadFamilies.length) {
    console.error("i18n dynamic families with no keys:", deadFamilies);
    failed = true;
}

if (failed) process.exit(1);
console.log("i18n OK:", zh.length, "keys aligned,", staticKeys.size, "static keys verified,", dynFamilies.size, "dynamic families have hits");
