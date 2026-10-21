/**
 * 思源文档块内容与生活笔记智能识别入库（§16/§17 301波）：
 * 依据自由笔记或复制的思源块文本，通过语义关键词指纹智能推断归属模块，
 * 自动抽取实体名称、到期日/发生日、费用金额与备注信息，赋能一键速记入库。
 * 纯函数，无思源/DOM 强依赖，100% 可单元测试。
 */

export interface ParsedCaptureResult {
    raw: string;
    title: string;
    suggestedModule?: string;
    confidence: number; // 0 - 1
    date?: string; // YYYY-MM-DD
    amount?: number;
    note?: string;
}

const FINGERPRINTS: [string, RegExp, RegExp?][] = [
    ["medicine", /药|[片丸]|胶囊|滴眼液|口服液|喷雾|软膏|用量|[顿日]服|饭后/i, /阿司匹林|布洛芬|抗生素|感冒灵|头孢|降压药|处方药|otc/i],
    ["stock", /囤|库存|备用|余量|消耗品|耗材|日用|应急/, /卷纸|抽纸|洗衣液|洗洁精|牙膏|牙刷|洗发水|沐浴露|垃圾袋|保鲜袋|保鲜膜|电池|口罩|消毒液|大米|食用油|洗手液/],
    ["chores", /打扫|清洁|家务|分工|轮流|整理|收拾/, /扫地|拖地|擦窗|吸尘|洗碗|倒垃圾|扔垃圾|换床单|除螨|洗衣服|洗油烟机|洗空调/],
    ["contracts", /合同|协议|签约|到期|违约金|房东|租[房金]|转让/, /房屋租赁合同|劳动合同|押金|租约|自动续约/],
    ["vehicles", /车(?:辆)?|里程|公里|加油|充电|保养|年检|交强险|违章/, /机动车|电动车|行驶证|车牌|机油|商业险|电瓶/],
    ["certs", /证(?:书)?|有效期|签注|编号|发证/, /身份证|护照|通行证|驾驶证|毕业证|学位证|资格证|户口本/],
    ["health", /医院|门诊|挂号|化验|检查|医生|复诊|就医|体检/, /诊断证明|住院|血常规|心电图|ct报告|核磁/i],
    ["insurance", /保险|保单|理赔|出险|保费/, /重疾险|意外险|医疗险|寿险|百万医疗|年金险|商业保险/],
    ["favors", /随礼|礼金|份子钱|[送收]礼|红包|回礼/, /满月红包|结婚份子|乔迁贺礼|百日宴|丧奠礼金/],
    ["food", /做法|食材|食谱|烹饪|生抽|大蒜|生姜|小葱|[炒煮烤]/, /菜谱|西红柿炒蛋|红烧肉|清蒸|煲汤|家常菜/],
    ["house", /[水电煤]费|燃气费|物业费|读数|抄表|[电水]表|供暖/, /阶梯电价|公用事业|燃气表|水电煤/],
    ["schooling", /学校|老师|年级|功课|班级|开学|放假|升学/, /家长会|期末考试|期中考试|中考|高考|辅导班|培训班|学费|校服|班主任/],
    ["parenting", /宝宝|婴儿|幼童|儿歌|生长/, /奶粉|纸尿裤|辅食|儿保|生长曲线|疫苗接种|推车|安全座椅/],
    ["pets", /[猫狗]|宠物|猫咪|小狗|幼[犬猫]|绝育|猫砂/, /狂犬疫苗|体内外?驱虫|猫三联|联苗/],
    ["memberships", /会员|订阅|年费|[月季]卡|续约|连续包月|vip/i, /自动续费|plus会员|大会员|icloud/i],
    ["shopping", /买|采购|购物|快递|运费|包邮|退[货款]/, /取件码|单号|顺丰|淘宝|京东|拼多多/],
    ["allowance", /零花钱|压岁钱|零钱|理财收益|利息/, /零花钱发放|压岁钱存入/],
    ["media", /在看|在读|观后感|读后感|评分|作者/, /豆瓣|电影|电视剧|动漫|小说|书单|剧集|完结|追剧/],
    ["bookmarks", /网址|网站|链接|portal|收藏夹/i, /https?:\/\/|后台系统|登录地址|网盘地址/i],
    ["snippets", /随手记|备忘|记事|金句|摘抄/, /快捷回复|常用语|常用话术|备用文本/],
    ["exams", /备考|刷题|复习|真题|准考证/, /软考|法考|教资|考公|考研|资格考试/],
    ["assets-real", /家电|设备|保修|发票|数码|折旧/, /笔记本电脑|手机|平板|相机|冰箱|洗衣机|空调|电视机|吸油烟机|扫地机器人/],
    ["assets-virtual", /账户|银行|理财|基金|股票|余额/, /银行卡|活期|定存|证券账户|公积金账户|养老金/],
    ["address", /地址|住址|门牌|收货|邮编/, /收货地址|家庭住址|送货上门|自提柜|驿站/],
    ["travel-booking", /出行|旅行|旅游|游玩|攻略/, /机票|高铁票|动车票|预订酒店|民宿|登机牌|景点门票|行程单/],
];

/**
 * 从文本中推断最匹配的小驴管家业务模块
 */
export function inferModuleFromText(text: string): { moduleId: string; confidence: number } | undefined {
    if (!text || typeof text !== "string") return undefined;

    let bestModule: string | undefined;
    let maxScore = 0;

    for (const [mod, kwReg, strongReg] of FINGERPRINTS) {
        let score = 0;
        if (strongReg && strongReg.test(text)) score += 5;
        if (kwReg.test(text)) score += 1;

        if (score > maxScore) {
            maxScore = score;
            bestModule = mod;
        }
    }

    if (!bestModule || maxScore <= 0) return undefined;

    const confidence = Math.min(0.98, Math.round((0.5 + Math.min(maxScore, 10) * 0.048) * 100) / 100);
    return { moduleId: bestModule, confidence };
}

/**
 * 从文本中抽离日期字符串，并返回剔除日期后的纯文本
 */
export function extractDateFromText(text: string): { date?: string; cleanText: string } {
    if (!text) return { cleanText: "" };
    const m = text.match(/(20\d{2})[-/.年](1[0-2]|0?[1-9])[-/.月]([12]\d|3[01]|0?[1-9])(?:日|号)?/);
    if (m) {
        return {
            date: `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`,
            cleanText: text.replace(m[0], " ").trim(),
        };
    }
    return { cleanText: text };
}

export function extractAmountFromText(text: string): { amount?: number; cleanText: string } {
    if (!text) return { cleanText: "" };
    const m = text.match(/[¥￥]\s*(\d+(?:\.\d{1,2})?)/) ||
              text.match(/(\d+(?:\.\d{1,2})?)\s*(?:元|块钱|块)/) ||
              text.match(/(?:金额|费用|花费|支出|押金|租金)[:：\s]+(\d+(?:\.\d{1,2})?)/);
    if (m) {
        return {
            amount: parseFloat(m[1]),
            cleanText: text.replace(m[0], " ").trim(),
        };
    }
    return { cleanText: text };
}

/**
 * 录入标题智能清洗与自动析出（如在名称输入 "2028-10-15 居民身份证" 或 "租房合同 3500元"）
 * 自动剥离日期与金额供表单联动回填，避免用户反复在输入框之间跳转切换。
 */
export function smartExtractFieldsFromTitle(rawTitle: string): {
    cleanTitle: string;
    extractedDate?: string;
    extractedAmount?: number;
} {
    let text = (rawTitle ?? "").trim();
    if (!text) return { cleanTitle: "" };

    const dateRes = extractDateFromText(text);
    text = dateRes.cleanText;

    const amountRes = extractAmountFromText(text);
    text = amountRes.cleanText;

    const cleanTitle = text.replace(/^[\s\-–—/、,，:：]+|[\s\-–—/、,，:：]+$/g, "").trim();

    return {
        cleanTitle: cleanTitle || rawTitle.trim(),
        extractedDate: dateRes.date,
        extractedAmount: amountRes.amount,
    };
}

/**
 * 智能解析自由文本/思源块，提炼结构化速记载荷
 */
export function smartParseNoteContent(rawText: string): ParsedCaptureResult {
    const raw = (rawText ?? "").trim();
    if (!raw) {
        return { raw: "", title: "", confidence: 0 };
    }

    // 1. 语义模块推断
    const moduleInferred = inferModuleFromText(raw);

    // 2. 抽取日期
    const { date, cleanText: textWithoutDate } = extractDateFromText(raw);

    // 3. 抽取金额
    const { amount, cleanText: finalText } = extractAmountFromText(textWithoutDate);

    // 4. 从清洗后的文本提炼简要标题
    // 取第一行或第一个逗号/句号前的内容
    const cleanLines = finalText
        .replace(/^[:：\-*·\s]+/, "")
        .split(/[\r\n，。；;,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

    return {
        raw,
        title: cleanLines[0] || raw.slice(0, 30),
        suggestedModule: moduleInferred?.moduleId,
        confidence: moduleInferred?.confidence ?? 0,
        date,
        amount,
        note: cleanLines.slice(1).join("；") || undefined,
    };
}
