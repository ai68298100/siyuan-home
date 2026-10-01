// i18n 键位对齐检查（zh-CN/en 必须同键集）—— node scripts/check-i18n.mjs
import { readFileSync } from "node:fs";

const read = (f) => Object.keys(JSON.parse(readFileSync(f, "utf8"))).sort();
const zh = read("public/i18n/zh-CN.json");
const en = read("public/i18n/en.json");
const onlyZh = zh.filter((k) => !en.includes(k));
const onlyEn = en.filter((k) => !zh.includes(k));

if (onlyZh.length || onlyEn.length) {
    console.error("i18n key mismatch:", { onlyZh, onlyEn });
    process.exit(1);
}
console.log("i18n OK:", zh.length, "keys aligned");
