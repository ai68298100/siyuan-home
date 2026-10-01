// 元数据一致性校验（33.5）—— node scripts/check-meta.mjs
// 交叉核对 package.json 与 plugin.json 的 name/version，并确认关键文件存在。
import { readFileSync, existsSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const plugin = JSON.parse(readFileSync("plugin.json", "utf8"));
const errors = [];

if (pkg.name !== plugin.name) {
    errors.push(`name mismatch: package.json "${pkg.name}" vs plugin.json "${plugin.name}"（集市硬性要求一致）`);
}
if (pkg.version !== plugin.version) {
    errors.push(`version mismatch: package.json "${pkg.version}" vs plugin.json "${plugin.version}"`);
}
if (plugin.displayName?.default && plugin.displayName["zh-CN"] === undefined) {
    errors.push("plugin.json displayName 缺 zh-CN");
}
for (const f of ["src/index.ts", "plugin.json", "icon.png", "preview.png", "README.md", "README.zh-CN.md", "LICENSE", "public/i18n/zh-CN.json", "public/i18n/en.json"]) {
    if (!existsSync(f)) errors.push(`missing file: ${f}`);
}
if (plugin.disabledInPublish === false) {
    console.log("note: disabledInPublish=false —— 集市上架已启用（当前阶段应保持 true，除非你决定上架）");
}

if (errors.length) {
    console.error("metadata errors:\n" + errors.map((e) => " - " + e).join("\n"));
    process.exit(1);
}
console.log(`metadata OK: ${pkg.name} v${pkg.version}`);
