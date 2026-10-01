// release notes 草稿生成（23 组 🟢）—— node scripts/release-notes.mjs [from-tag]
// 从 git log 按 Conventional Commits 类型分组，输出 markdown 到 stdout（人工润色后贴入 CHANGELOG/Release）。
import { execSync } from "node:child_process";

const from = process.argv[2] ?? "";
const range = from ? `${from}..HEAD` : "HEAD~30..HEAD";
const log = execSync(`git log ${range} --pretty=%s`, { encoding: "utf8" });
const groups = {
    feat: "### 新功能",
    fix: "### 修复",
    perf: "### 性能",
    refactor: "### 内部优化",
    docs: "### 文档",
    test: "### 测试",
    chore: "### 其他",
};
const buckets = {};
for (const line of log.split("\n").filter(Boolean)) {
    const m = line.match(/^(\w+)(\([^)]*\))?!?:\s*(.+)$/);
    if (!m) continue;
    const [, type, scope, subject] = m;
    (buckets[type] ??= []).push(`- ${subject}${scope ? `（${scope.replace(/[()]/g, "")}）` : ""}`);
}
console.log(`## Release Notes 草稿（${from || "最近 30 条"}）\n`);
for (const [type, title] of Object.entries(groups)) {
    if (!buckets[type]?.length) continue;
    console.log(`${title}\n`);
    for (const item of buckets[type]) console.log(item);
    console.log("");
}
console.log("> 提示：用户视角润色后使用；破坏性变更需单独列 migration notes。");
