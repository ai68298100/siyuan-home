/**
 * 全景生活全局检索（Spotlight Search）：
 * 跨所有已启用台账聚合生活数据（名称、分类、存放位置、家庭成员、金额、到期日与备注），
 * 支持中文直匹、拼音全拼与首字母缩写秒级检索与多维打分排序。
 * 纯函数，无网络/DOM 强依赖，100% 可单元测试。
 */
import { searchMatch } from "./pinyin";

export interface SpotlightItem {
    rowId: string;
    moduleId: string;
    title: string;
    location?: string;
    category?: string;
    memberName?: string;
    dueDate?: string;
    amount?: number;
    note?: string;
}

export interface SpotlightResult {
    item: SpotlightItem;
    score: number;
}

/**
 * 跨模块全景搜索过滤与相关度排序
 */
export function searchSpotlight(items: SpotlightItem[], query: string, limit = 40): SpotlightItem[] {
    const q = (query ?? "").trim().toLowerCase();
    if (!q) {
        // 空搜索时优先展示带有到期日且临近的重点事项，次按原序返回
        return [...items].sort((a, b) => {
            if (a.dueDate && !b.dueDate) return -1;
            if (!a.dueDate && b.dueDate) return 1;
            if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
            return 0;
        }).slice(0, limit);
    }

    const scored: SpotlightResult[] = [];

    for (const item of items) {
        let score = 0;
        const titleLower = item.title.toLowerCase();

        // 1. 标题直接包含或拼音匹配（最高权重）
        if (titleLower === q) score += 100;
        else if (titleLower.startsWith(q)) score += 60;
        else if (titleLower.includes(q)) score += 40;
        else if (searchMatch(item.title, q)) score += 30;

        // 2. 存放位置匹配（极高生活查询价值）
        if (item.location) {
            const locLower = item.location.toLowerCase();
            if (locLower.includes(q)) score += 25;
            else if (searchMatch(item.location, q)) score += 20;
        }

        // 3. 关联成员匹配
        if (item.memberName) {
            const memLower = item.memberName.toLowerCase();
            if (memLower.includes(q)) score += 20;
            else if (searchMatch(item.memberName, q)) score += 15;
        }

        // 4. 类别匹配
        if (item.category && searchMatch(item.category, q)) {
            score += 15;
        }

        // 5. 备注匹配
        if (item.note && searchMatch(item.note, q)) {
            score += 10;
        }

        // 6. 模块 ID 匹配（例如搜 medicine 或 certs）
        if (item.moduleId.toLowerCase().includes(q)) {
            score += 10;
        }

        if (score > 0) {
            scored.push({ item, score });
        }
    }

    // 按得分降序排列
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.item);
}
