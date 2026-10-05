/**
 * 拼音检索（提案 C 定案，227 波"不等用户反馈直接开发"）：
 * 字典构建期生成（scripts/gen-pinyin-dict.mjs → public/asset/pinyin-dict.json，约 330KB），
 * 运行时首次检索按需 fetch 一次并缓存——不打入 bundle（v0.3.1 起单文件门禁，体积预算不受损）。
 * 匹配语义：直接包含 → 全拼包含 → 首字母串包含；字典缺失的汉字保守不匹配（宁缺勿误）。
 */

let dict: Record<string, [string, string]> | null = null;
let pending: Promise<void> | null = null;

/** 测试注入点（避免测试环境发起 fetch） */
export function setPinyinDict(d: Record<string, [string, string]> | null): void {
    dict = d;
    pending = Promise.resolve();
}

export function pinyinReady(): boolean {
    return dict !== null;
}

export function ensurePinyin(): Promise<void> {
    if (dict) return Promise.resolve();
    pending ??= (async () => {
        try {
            const base = `${location.origin}/plugins/siyuan-home/`;
            const r = await fetch(new URL("asset/pinyin-dict.json", base));
            dict = (await r.json()) as Record<string, [string, string]>;
        } catch {
            dict = {}; // 拉取失败：拼音检索静默降级为直接匹配
        }
    })();
    return pending;
}

const indexCache = new Map<string, string>();

/** 文本的拼音检索索引："全拼|首字母"（ü 音统一记 u——用户习惯打 lu 而非 lv；非汉字原样小写并入；缺字典的汉字 → 空串=不参与匹配） */
export function pinyinIndex(text: string): string {
    const cached = indexCache.get(text);
    if (cached !== undefined) return cached;
    let out = "";
    if (dict) {
        let full = "";
        let init = "";
        let ok = true;
        for (const ch of text) {
            const lower = ch.toLowerCase();
            const e = dict[ch];
            if (e) {
                full += e[0].replace(/v/g, "u");
                init += e[1];
            } else if (/[a-z0-9]/.test(lower)) {
                full += lower;
                init += lower;
            } else if (/[\s\-_·/./(（）)]/.test(ch)) {
                // 分隔符跳过
            } else if (/\p{Script=Han}/u.test(ch)) {
                ok = false; // 字典缺字：整串不产出索引（保守不误配）
                break;
            } else {
                full += lower;
                init += lower;
            }
        }
        if (ok) out = `${full}|${init}`;
    }
    if (indexCache.size > 5000) indexCache.clear();
    indexCache.set(text, out);
    return out;
}

/** 检索匹配：直接包含，或全拼/首字母包含（q 应已小写；空串恒真；ü 音 v/u 双拼法都试） */
export function searchMatch(text: string, q: string): boolean {
    const hay = text.toLowerCase();
    if (hay.includes(q)) return true;
    if (!q || !/[a-z]/.test(q)) return false;
    const idx = pinyinIndex(text);
    if (!idx) return false;
    const [full, init] = idx.split("|");
    const qU = q.replace(/v/g, "u");
    return full.includes(q) || init.includes(q) || (qU !== q && full.includes(qU));
}
