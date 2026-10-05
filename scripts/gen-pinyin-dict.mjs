// 生成精简拼音字典资产（提案 C 拼音检索）：public/asset/pinyin-dict.json
// 运行时按需 fetch（不打入 bundle，体积预算不受损）；仅收录 pinyin-pro 认识的 CJK 字。
// 用法：node scripts/gen-pinyin-dict.mjs（依赖 devDependency pinyin-pro）
import { pinyin } from "pinyin-pro";
import { writeFileSync, mkdirSync } from "node:fs";

const out = {};
let count = 0;
// CJK 统一表意文字主平面
for (let cp = 0x4e00; cp <= 0x9fa5; cp++) {
    const ch = String.fromCodePoint(cp);
    let full;
    try {
        // v:true → ü 记作 v（驴 lü→lv），否则 ü 音字全被过滤
        full = pinyin(ch, { toneType: "none", type: "array", nonZh: "consecutive", v: true })[0] ?? "";
    } catch { continue; }
    if (!full || full === ch || /[^a-zv]/.test(full)) continue; // 未识别字跳过（运行时对缺字保守不误配）
    out[ch] = [full, full[0]];
    count++;
}
mkdirSync("public/asset", { recursive: true });
writeFileSync("public/asset/pinyin-dict.json", JSON.stringify(out));
console.log(`pinyin dict: ${count} chars, ${(JSON.stringify(out).length / 1024).toFixed(0)}KB raw`);
