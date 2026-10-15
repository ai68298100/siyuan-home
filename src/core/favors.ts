/**
 * 人情往来年度报告与收送统计（MOD-08 / §16 人情年度净额与TOP榜）
 * 纯函数、本地计算：
 * - 年度收礼总额、送礼总额与年度净额计算；
 * - 人情往来 TOP 对手排序（收礼榜、送礼榜、往来频次）；
 * - 分类场景（婚礼、满月、乔迁、生日等）汇总；
 * - 支持一键生成格式化文本报告，方便分享与复盘。
 */

export interface FavorRow {
    id?: string;
    name?: string;
    category?: string;
    direction?: "in" | "out" | string;
    person?: string;
    amount?: number;
    date?: string;
    note?: string;
}

export interface PersonFavorStat {
    person: string;
    totalIn: number;
    totalOut: number;
    net: number;
    count: number;
}

export interface CategoryFavorStat {
    category: string;
    totalIn: number;
    totalOut: number;
    count: number;
}

export interface FavorsSummary {
    year: number;
    totalIn: number;
    totalOut: number;
    netAmount: number;
    countIn: number;
    countOut: number;
    totalCount: number;
    topIn: PersonFavorStat[];
    topOut: PersonFavorStat[];
    byCategory: CategoryFavorStat[];
}

/**
 * 计算指定年份的人情收送报告（默认当前公历年份）
 */
export function calculateFavorsSummary(rows: FavorRow[], targetYear?: number): FavorsSummary {
    const year = targetYear ?? new Date().getFullYear();
    const yearPrefix = `${year}-`;

    let totalIn = 0;
    let totalOut = 0;
    let countIn = 0;
    let countOut = 0;

    const personMap = new Map<string, { totalIn: number; totalOut: number; count: number }>();
    const catMap = new Map<string, { totalIn: number; totalOut: number; count: number }>();

    for (const r of rows) {
        if (!r.date || !r.date.startsWith(yearPrefix)) continue;
        const amt = typeof r.amount === "number" && Number.isFinite(r.amount) && r.amount > 0 ? r.amount : 0;
        const dir = r.direction === "in" ? "in" : "out";
        const person = (r.person ?? "").trim() || "未登记对象";
        const cat = (r.category ?? "").trim() || "other_fv";

        if (dir === "in") {
            totalIn += amt;
            countIn++;
        } else {
            totalOut += amt;
            countOut++;
        }

        // 统计人名
        const pStat = personMap.get(person) ?? { totalIn: 0, totalOut: 0, count: 0 };
        if (dir === "in") pStat.totalIn += amt;
        else pStat.totalOut += amt;
        pStat.count++;
        personMap.set(person, pStat);

        // 统计分类
        const cStat = catMap.get(cat) ?? { totalIn: 0, totalOut: 0, count: 0 };
        if (dir === "in") cStat.totalIn += amt;
        else cStat.totalOut += amt;
        cStat.count++;
        catMap.set(cat, cStat);
    }

    const allPersons: PersonFavorStat[] = [...personMap.entries()].map(([person, stat]) => ({
        person,
        totalIn: stat.totalIn,
        totalOut: stat.totalOut,
        net: stat.totalIn - stat.totalOut,
        count: stat.count,
    }));

    const topIn = [...allPersons].filter((p) => p.totalIn > 0).sort((a, b) => b.totalIn - a.totalIn).slice(0, 5);
    const topOut = [...allPersons].filter((p) => p.totalOut > 0).sort((a, b) => b.totalOut - a.totalOut).slice(0, 5);

    const byCategory: CategoryFavorStat[] = [...catMap.entries()].map(([category, stat]) => ({
        category,
        totalIn: stat.totalIn,
        totalOut: stat.totalOut,
        count: stat.count,
    })).sort((a, b) => (b.totalIn + b.totalOut) - (a.totalIn + a.totalOut));

    return {
        year,
        totalIn,
        totalOut,
        netAmount: totalIn - totalOut,
        countIn,
        countOut,
        totalCount: countIn + countOut,
        topIn,
        topOut,
        byCategory,
    };
}

/**
 * 格式化输出年度人情文本报告
 */
export function formatFavorsReportText(summary: FavorsSummary, formatAmountFn: (n: number) => string): string {
    const lines: string[] = [
        `【${summary.year} 年度人情往来报告】`,
        `・收礼总额：¥ ${formatAmountFn(summary.totalIn)}（共 ${summary.countIn} 笔）`,
        `・送礼总额：¥ ${formatAmountFn(summary.totalOut)}（共 ${summary.countOut} 笔）`,
        `・人情净额：¥ ${formatAmountFn(summary.netAmount)} ${summary.netAmount >= 0 ? "(净收礼)" : "(净随礼)"}`,
        "",
    ];

    if (summary.topIn.length > 0) {
        lines.push("【收礼 TOP 对象】");
        summary.topIn.forEach((p, idx) => {
            lines.push(`${idx + 1}. ${p.person}：¥ ${formatAmountFn(p.totalIn)}（${p.count} 笔）`);
        });
        lines.push("");
    }

    if (summary.topOut.length > 0) {
        lines.push("【随礼/送礼 TOP 对象】");
        summary.topOut.forEach((p, idx) => {
            lines.push(`${idx + 1}. ${p.person}：¥ ${formatAmountFn(p.totalOut)}（${p.count} 笔）`);
        });
        lines.push("");
    }

    return lines.join("\n").trim();
}
