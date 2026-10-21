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

export const QUICK_TEMPLATES: Record<string, QuickRecordTemplate[]> = {
    certs: [
        {
            id: "id_card",
            label: "居民身份证",
            icon: "🪪",
            values: { name: "居民身份证", category: "id", store_place: "主卧抽屉" },
        },
        {
            id: "passport",
            label: "中国护照",
            icon: "🛂",
            values: { name: "中华人民共和国护照", category: "passport", store_place: "主卧抽屉" },
        },
        {
            id: "driver_lic",
            label: "驾驶证",
            icon: "🚗",
            values: { name: "机动车驾驶证", category: "driver_license", store_place: "随身包" },
        },
        {
            id: "hkmo_permit",
            label: "港澳通行证",
            icon: "🎫",
            values: { name: "往来港澳通行证", category: "hkmo_permit", store_place: "主卧抽屉" },
        },
        {
            id: "vehicle_lic",
            label: "行驶证",
            icon: "🚙",
            values: { name: "机动车行驶证", category: "vehicle_lic", store_place: "车内储物盒" },
        },
        {
            id: "marriage_cert",
            label: "结婚证",
            icon: "💍",
            values: { name: "结婚证", category: "other", store_place: "重要文件盒" },
        },
        {
            id: "grad_cert",
            label: "学历毕业证",
            icon: "🎓",
            values: { name: "普通高等教育毕业证书", category: "graduation_cert", store_place: "书房文件柜" },
        },
    ],
    stock: [
        {
            id: "paper_tissue",
            label: "抽纸/卷纸",
            icon: "🧻",
            values: { name: "抽纸", category: "paper", qty: 1, low_stock_at: 2, location: "客厅储物柜" },
        },
        {
            id: "laundry_detergent",
            label: "洗衣液/除菌液",
            icon: "🧴",
            values: { name: "洗衣液", category: "daily_chem", qty: 1, low_stock_at: 1, location: "阳台柜" },
        },
        {
            id: "food_staple",
            label: "大米/食用油",
            icon: "🍚",
            values: { name: "大米", category: "food_st", qty: 1, low_stock_at: 1, location: "厨房储藏柜" },
        },
        {
            id: "emergency_mask",
            label: "医用口罩/消毒",
            icon: "😷",
            values: { name: "医用外科口罩", category: "emergency_st", qty: 1, low_stock_at: 2, location: "玄关柜" },
        },
        {
            id: "garbage_bags",
            label: "加厚垃圾袋",
            icon: "🛍️",
            values: { name: "加厚垃圾袋", category: "daily_chem", qty: 1, low_stock_at: 2, location: "厨房抽屉" },
        },
    ],
    medicine: [
        {
            id: "cold_fever",
            label: "感冒退烧",
            icon: "🌡️",
            values: { name: "布洛芬缓释胶囊", category: "otc", stock_qty: 1, low_stock_at: 1, location: "客厅药箱" },
        },
        {
            id: "first_aid",
            label: "外用创伤消炎",
            icon: "🩹",
            values: { name: "碘伏棉签 / 创口贴", category: "external", stock_qty: 1, low_stock_at: 1, location: "客厅药箱" },
        },
        {
            id: "stomach_care",
            label: "肠胃消化",
            icon: "💊",
            values: { name: "健胃消食片", category: "otc", stock_qty: 1, low_stock_at: 1, location: "客厅药箱" },
        },
        {
            id: "allergy_care",
            label: "抗过敏常备",
            icon: "🌿",
            values: { name: "氯雷他定片", category: "otc", stock_qty: 1, low_stock_at: 1, location: "客厅药箱" },
        },
    ],
    chores: [
        {
            id: "floor_clean",
            label: "扫地拖地吸尘",
            icon: "🧹",
            values: { name: "全屋扫地拖地", category: "cleaning" },
        },
        {
            id: "bedding_change",
            label: "换洗床单被罩",
            icon: "🛏️",
            values: { name: "换洗全家床单被套", category: "cleaning" },
        },
        {
            id: "kitchen_deep",
            label: "厨房油烟清洁",
            icon: "🧽",
            values: { name: "清洗油烟机与灶台", category: "cleaning" },
        },
        {
            id: "trash_clear",
            label: "垃圾清运回收",
            icon: "🗑️",
            values: { name: "清空垃圾桶与硬纸板", category: "cleaning" },
        },
    ],
    contracts: [
        {
            id: "rent_contract",
            label: "房屋租赁合同",
            icon: "🏠",
            values: { name: "房屋租赁协议", category: "rent", auto_renew: false },
        },
        {
            id: "labor_contract",
            label: "劳动工作合同",
            icon: "💼",
            values: { name: "全日制劳动合同", category: "labor", auto_renew: true },
        },
        {
            id: "property_agreement",
            label: "物业服务协议",
            icon: "🏢",
            values: { name: "住宅物业服务合同", category: "property_ct" },
        },
    ],
};

/**
 * 获取指定模块的快速录入模板列表
 */
export function getQuickTemplates(moduleId: string): QuickRecordTemplate[] {
    return QUICK_TEMPLATES[moduleId] ?? [];
}
