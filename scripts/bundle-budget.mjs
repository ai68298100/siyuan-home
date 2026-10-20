#!/usr/bin/env node
/**
 * 产物体积归因分析（308 波）：
 * 用 esbuild metafile 之外的低成本方案——按源文件体量与「是否被 index.ts 静态引入」
 * 双重口径给出体积热点排行，供瘦身决策。构建产物完整介入请用 `--build` 触发
 * VITE_BUNDLE_ANALYZE=1 的构建（见 vite.config.ts）。
 *
 * 用法：node scripts/bundle-budget.mjs
 */
import { readFileSync, statSync } from "node:fs";
import * as childProcess from "node:child_process";
import { join, relative, posix } from "node:path";
import fg from "fast-glob";

const ROOT = process.cwd();
const SRC = "src";

function fmt(n) {
    return `${String(n).padStart(8)} B  ${(n / 1024).toFixed(1).padStart(7)} KB`;
}

/** 统计 dist 产物体积 */
function distSnapshot() {
    const out = {};
    for (const name of ["dist/index.js", "dist/index.css", "dist/package.zip"]) {
        try {
            out[name] = statSync(join(ROOT, name)).size;
        } catch {
            out[name] = null;
        }
    }
    try {
        const gz = statSync(join(ROOT, "dist/index.js"));
        out["dist/index.js#raw"] = gz.size;
    } catch {
        /* ignore */
    }
    return out;
}

/** 源文件体积排行（svelte 的 script+markup 都计入） */
function sourceRanking() {
    const files = fg.sync(["src/**/*.ts", "src/**/*.svelte"], { cwd: ROOT, absolute: false });
    return files
        .map((f) => ({ file: posix.normalize(f), size: statSync(join(ROOT, f)).size }))
        .sort((a, b) => b.size - a.size);
}

/**
 * 模块级依赖热度：统计每个源文件被其他文件 import 的次数。
 * 被多处引用的共享模块比"只有入口引用"的大文件更值得优先关注公共样板抽取。
 */
function importHeat() {
    const files = fg.sync(["src/**/*.ts", "src/**/*.svelte"], { cwd: ROOT, absolute: false });
    const heat = new Map();
    for (const f of files) {
        const text = readFileSync(join(ROOT, f), "utf8");
        const re = /from\s+["'](@\/[^"']+|\.[^"']+)["']/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const spec = m[1];
            let target = spec.startsWith("@/") ? `src/${spec.slice(2)}` : null;
            if (!target) {
                // 相对路径归一（仅用于统计；不追求完全解析）
                target = posix.normalize(posix.join(posix.dirname(f), spec));
                if (!target.startsWith("src/")) target = `src/${posix.relative(SRC, target)}`;
            }
            heat.set(target, (heat.get(target) ?? 0) + 1);
        }
    }
    return [...heat.entries()].sort((a, b) => b[1] - a[1]);
}

const dist = distSnapshot();
console.log("=== 产物体积 ===");
for (const [k, v] of Object.entries(dist)) {
    if (k.endsWith("#raw")) continue;
    console.log(`${k.padEnd(20)} ${v === null ? "(missing)" : fmt(v)}`);
}

const gzip = (() => {
    try {
        const { execFileSync } = childProcess;
        const out = execFileSync("node", ["-e", `
const fs=require('fs'),z=require('zlib');
const c=fs.readFileSync('dist/index.js');
process.stdout.write(String(z.gzipSync(c).length));
`], { cwd: ROOT }).toString();
        return Number(out);
    } catch {
        return null;
    }
})();
if (gzip) console.log(`${"dist/index.js gzip".padEnd(20)} ${fmt(gzip)}`);

console.log("\n=== 源文件体积 Top 20 ===");
for (const { file, size } of sourceRanking().slice(0, 20)) {
    console.log(`${fmt(size)}  ${file}`);
}

console.log("\n=== 被引用次数 Top 15（公共样板优先抽取）===");
for (const [file, count] of importHeat().slice(0, 15)) {
    console.log(`${String(count).padStart(4)}x  ${file}`);
}

// 汇总目录级占比，帮助判断"大头在屏幕层还是核心层"
const byDir = new Map();
for (const { file, size } of sourceRanking()) {
    const dir = posix.dirname(file);
    byDir.set(dir, (byDir.get(dir) ?? 0) + size);
}
const total = [...byDir.values()].reduce((s, v) => s + v, 0);
console.log(`\n=== 目录体积占比（总 ${(total / 1024).toFixed(0)} KB）===`);
for (const [dir, size] of [...byDir.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${fmt(size)}  ${((size / total) * 100).toFixed(1).padStart(5)}%  ${dir}`);
}
