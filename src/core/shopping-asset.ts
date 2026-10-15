/**
 * 购物记录转入实物资产档案（MOD-09 / §7 购物转资产建档）：
 * 纯函数、本地转换：
 * - 智能映射购物分类到实物资产分类（digital、apparel、appliance等）；
 * - 默认状态设为在用（inuse）；
 * - 继承购入金额、购入日期、渠道、归属家庭成员与备注。
 */

export type RealAssetCategory =
    | "appliance"
    | "furniture"
    | "digital"
    | "toy"
    | "apparel"
    | "jewelry"
    | "collection"
    | "sports"
    | "other_ar";

export interface ShoppingRowInput {
    name: string;
    category?: string;
    amount?: number;
    date?: string;
    channel?: string;
    memberBlockId?: string;
    note?: string;
}

export interface RealAssetPayload {
    name: string;
    category: RealAssetCategory;
    status: "inuse";
    amount?: number;
    date?: string;
    channel?: string;
    memberBlockId?: string;
    note: string;
}

/**
 * 将购物记录转换为实物资产档案数据载荷
 */
export function buildAssetFromShopping(input: ShoppingRowInput): RealAssetPayload {
    const rawCat = (input.category ?? "").toLowerCase().trim();
    const rawName = (input.name ?? "").toLowerCase().trim();
    const text = `${rawCat} ${rawName}`;
    let category: RealAssetCategory = "other_ar";

    if (text.includes("家具") || text.includes("桌") || text.includes("椅") || text.includes("柜") || text.includes("床") || text.includes("沙发")) {
        category = "furniture";
    } else if (rawCat === "digital" || text.includes("数码") || text.includes("电子") || text.includes("手机") || text.includes("笔记本电脑") || text.includes("平板") || (text.includes("电脑") && !text.includes("桌"))) {
        category = "digital";
    } else if (rawCat === "apparel" || text.includes("服饰") || text.includes("衣") || text.includes("鞋")) {
        category = "apparel";
    } else if (rawCat === "daily" || text.includes("家电") || text.includes("电器") || text.includes("设备") || text.includes("吸尘器") || text.includes("洗衣机") || text.includes("冰箱")) {
        category = "appliance";
    } else if (text.includes("玩具") || text.includes("乐高") || text.includes("手办")) {
        category = "toy";
    } else if (text.includes("首饰") || text.includes("珠宝") || text.includes("手表") || text.includes("黄金")) {
        category = "jewelry";
    } else if (text.includes("运动") || text.includes("健身") || text.includes("器械") || text.includes("自行车")) {
        category = "sports";
    } else if (text.includes("收藏") || text.includes("古董") || text.includes("字画")) {
        category = "collection";
    }

    return {
        name: input.name.trim() || "新实物资产",
        category,
        status: "inuse",
        amount: typeof input.amount === "number" && Number.isFinite(input.amount) && input.amount > 0 ? input.amount : undefined,
        date: input.date && input.date !== "—" ? input.date : undefined,
        channel: input.channel && input.channel !== "—" ? input.channel : undefined,
        memberBlockId: input.memberBlockId,
        note: input.note ? `由购物记录转入：${input.note}` : "由购物记录一键建档",
    };
}
