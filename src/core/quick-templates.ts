/**
 * 各高频业务分类的一键建档模板（Presets / Templates）：
 * 覆盖证件、囤货、药箱、家务、合同等高频场景，提供开箱即用的标准名称、分类与常用位置预设，
 * 赋能大量数据录入时“一键带入骨架、只需微调存盘”的高效动线。
 * 纯函数配置，100% 可单元测试。
 */

export interface QuickRecordTemplate {
    id: string;
    label: string; // 模板展示名称，如 "居民身份证"
    icon?: string;
    values: Record<string, string | number | boolean>; // 自动填充的字段集合
}

const tpl = (id: string, label: string, icon: string, values: Record<string, string | number | boolean>): QuickRecordTemplate => ({ id, label, icon, values });

export const QUICK_TEMPLATES: Record<string, QuickRecordTemplate[]> = {
    certs: [
        tpl("id_card", "居民身份证", "🪪", { name: "居民身份证", category: "id", store_place: "主卧抽屉" }),
        tpl("passport", "中国护照", "🛂", { name: "中华人民共和国护照", category: "passport", store_place: "主卧抽屉" }),
        tpl("driver_lic", "驾驶证", "🚗", { name: "机动车驾驶证", category: "driver_license", store_place: "随身包" }),
        tpl("hkmo_permit", "港澳通行证", "🎫", { name: "往来港澳通行证", category: "hkmo_permit", store_place: "主卧抽屉" }),
        tpl("vehicle_lic", "行驶证", "🚙", { name: "机动车行驶证", category: "vehicle_lic", store_place: "车内储物盒" }),
        tpl("marriage_cert", "结婚证", "💍", { name: "结婚证", category: "other", store_place: "重要文件盒" }),
        tpl("grad_cert", "学历毕业证", "🎓", { name: "普通高等教育毕业证书", category: "graduation_cert", store_place: "书房文件柜" }),
    ],
    stock: [
        tpl("paper_tissue", "抽纸/卷纸", "🧻", { name: "抽纸", category: "paper", qty: 1, low_stock_at: 2, location: "客厅储物柜" }),
        tpl("laundry_detergent", "洗衣液/除菌液", "🧴", { name: "洗衣液", category: "daily_chem", qty: 1, low_stock_at: 1, location: "阳台柜" }),
        tpl("food_staple", "大米/食用油", "🍚", { name: "大米", category: "food_st", qty: 1, low_stock_at: 1, location: "厨房储藏柜" }),
        tpl("emergency_mask", "医用口罩/消毒", "😷", { name: "医用外科口罩", category: "emergency_st", qty: 1, low_stock_at: 2, location: "玄关柜" }),
        tpl("garbage_bags", "加厚垃圾袋", "🛍️", { name: "加厚垃圾袋", category: "daily_chem", qty: 1, low_stock_at: 2, location: "厨房抽屉" }),
    ],
    medicine: [
        tpl("cold_fever", "感冒退烧", "🌡️", { name: "布洛芬缓释胶囊", category: "otc", stock_qty: 1, low_stock_at: 1, location: "客厅药箱" }),
        tpl("first_aid", "外用创伤消炎", "🩹", { name: "碘伏棉签 / 创口贴", category: "external", stock_qty: 1, low_stock_at: 1, location: "客厅药箱" }),
        tpl("stomach_care", "肠胃消化", "💊", { name: "健胃消食片", category: "otc", stock_qty: 1, low_stock_at: 1, location: "客厅药箱" }),
        tpl("allergy_care", "抗过敏常备", "🌿", { name: "氯雷他定片", category: "otc", stock_qty: 1, low_stock_at: 1, location: "客厅药箱" }),
    ],
    chores: [
        tpl("floor_clean", "扫地拖地吸尘", "🧹", { name: "全屋扫地拖地", category: "cleaning" }),
        tpl("bedding_change", "换洗床单被罩", "🛏️", { name: "换洗全家床单被套", category: "cleaning" }),
        tpl("kitchen_deep", "厨房油烟清洁", "🧽", { name: "清洗油烟机与灶台", category: "cleaning" }),
        tpl("trash_clear", "垃圾清运回收", "🗑️", { name: "清空垃圾桶与硬纸板", category: "cleaning" }),
    ],
    contracts: [
        tpl("rent_contract", "房屋租赁合同", "🏠", { name: "房屋租赁协议", category: "rent", auto_renew: false }),
        tpl("labor_contract", "劳动工作合同", "💼", { name: "全日制劳动合同", category: "labor", auto_renew: true }),
        tpl("property_agreement", "物业服务协议", "🏢", { name: "住宅物业服务合同", category: "property_ct" }),
    ],
};

/**
 * 获取指定模块的快速录入模板列表
 */
export function getQuickTemplates(moduleId: string): QuickRecordTemplate[] {
    return QUICK_TEMPLATES[moduleId] ?? [];
}
