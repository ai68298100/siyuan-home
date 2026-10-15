/**
 * 旅行行前清单证件自查与护照余期核验（MOD-18 / §11 行前清单证件自查）：
 * 纯函数、本地计算、零网络：
 * - 依据国际民航（ICAO）与各国海关公认标准，核验护照在出发日是否满足 ≥6 个月（183 天）余期黄金规则；
 * - 结合家庭 certs 证件台账，智能关联出行人员护照、港澳通行证、身份证等有效期限；
 * - 生成格式化自查结论，支持一键存档至 rowlog checks 检查日志。
 */

import { localDateKey } from "./hub/rule";

export interface TravelPlanContext {
    tripName: string;
    destination: string;
    startDate?: string;
    endDate?: string;
    travelerMemberId?: string;
    travelerName?: string;
}

export interface CandidateCert {
    id: string;
    name: string;
    category?: string;
    expiry?: string;
    memberId?: string;
    memberName?: string;
}

export type CertCheckStatus = "pass" | "warn" | "fail" | "unverified";

export interface CertCheckItemResult {
    certId: string;
    certName: string;
    category: string;
    expiryDate?: string;
    status: CertCheckStatus;
    daysLeft?: number;
    monthsLeft?: number;
    message: string;
}

export interface TravelCertsCheckSummary {
    tripName: string;
    destination: string;
    travelDate: string;
    overallStatus: "pass" | "warn" | "fail";
    checks: CertCheckItemResult[];
    conclusionText: string;
}

/**
 * 核验单张证件是否满足行程时效要求
 */
export function evaluateTravelCert(
    cert: CandidateCert,
    travelDateStr: string,
): CertCheckItemResult {
    const certName = cert.name.trim() || "证件";
    const cat = (cert.category ?? "").trim().toLowerCase();
    const isPassport = cat === "passport" || certName.includes("护照");
    const isHkMacau = cat === "hk_macau" || certName.includes("港澳");

    if (!cert.expiry || cert.expiry === "—" || !/^\d{4}-\d{2}-\d{2}$/.test(cert.expiry)) {
        return {
            certId: cert.id,
            certName,
            category: cat || "other_c",
            status: "unverified",
            message: "未登记到期日，需人工核对证件原件有效期",
        };
    }

    const tDate = new Date(`${travelDateStr}T00:00:00`);
    const expDate = new Date(`${cert.expiry}T00:00:00`);

    if (Number.isNaN(tDate.getTime()) || Number.isNaN(expDate.getTime())) {
        return {
            certId: cert.id,
            certName,
            category: cat || "other_c",
            status: "unverified",
            message: "日期格式异常，请人工核查",
        };
    }

    const diffDays = Math.round((expDate.getTime() - tDate.getTime()) / 86400000);
    const monthsLeft = Math.floor(diffDays / 30);

    // 1. 已经过期
    if (diffDays < 0) {
        return {
            certId: cert.id,
            certName,
            category: cat || "other_c",
            expiryDate: cert.expiry,
            status: "fail",
            daysLeft: diffDays,
            monthsLeft: 0,
            message: `证件在出发前已过期（过期 ${Math.abs(diffDays)} 天），无法正常出行！`,
        };
    }

    // 2. 护照专属 6 个月黄金规则（183 天）
    if (isPassport) {
        if (diffDays < 183) {
            return {
                certId: cert.id,
                certName,
                category: "passport",
                expiryDate: cert.expiry,
                status: "fail",
                daysLeft: diffDays,
                monthsLeft,
                message: `出发日护照余期仅剩 ${diffDays} 天（约 ${monthsLeft} 个月），不足国际公认 6 个月要求，存在严重登机与拒签风险！`,
            };
        }
        if (diffDays < 210) {
            return {
                certId: cert.id,
                certName,
                category: "passport",
                expiryDate: cert.expiry,
                status: "warn",
                daysLeft: diffDays,
                monthsLeft,
                message: `护照余期临近 6 个月警戒线（剩余 ${monthsLeft} 个月），建议尽快办理换发新护照。`,
            };
        }
        return {
            certId: cert.id,
            certName,
            category: "passport",
            expiryDate: cert.expiry,
            status: "pass",
            daysLeft: diffDays,
            monthsLeft,
            message: `护照余期充裕（剩余 ${monthsLeft} 个月），符合出入境国际通行规则。`,
        };
    }

    // 3. 港澳通行证或普通身份证件
    if (diffDays < 30) {
        return {
            certId: cert.id,
            certName,
            category: cat || (isHkMacau ? "hk_macau" : "id_card"),
            expiryDate: cert.expiry,
            status: "warn",
            daysLeft: diffDays,
            monthsLeft,
            message: `证件在行程期临期（剩余 ${diffDays} 天），请留意签注与返程有效性。`,
        };
    }

    return {
        certId: cert.id,
        certName,
        category: cat || "id_card",
        expiryDate: cert.expiry,
        status: "pass",
        daysLeft: diffDays,
        monthsLeft,
        message: `证件在行程期间完全有效（剩余 ${diffDays} 天）。`,
    };
}

/**
 * 汇总行程行前证件自查
 */
export function evaluateTravelCertsCheck(
    trip: TravelPlanContext,
    certs: CandidateCert[],
    todayKey?: string,
): TravelCertsCheckSummary {
    const travelDate = trip.startDate || todayKey || localDateKey(new Date());
    const checks: CertCheckItemResult[] = [];

    // 筛选出行人员的证件，未指定时自查包含护照、港澳通行证与身份证的核心证件
    const targetCerts = certs.filter((c) => {
        if (trip.travelerMemberId && c.memberId) {
            return c.memberId === trip.travelerMemberId;
        }
        const cat = (c.category ?? "").toLowerCase();
        return cat === "passport" || cat === "hk_macau" || cat === "id_card" || c.name.includes("护照") || c.name.includes("通行证");
    });

    for (const c of targetCerts) {
        checks.push(evaluateTravelCert(c, travelDate));
    }

    let overallStatus: "pass" | "warn" | "fail" = "pass";
    if (checks.some((ck) => ck.status === "fail")) {
        overallStatus = "fail";
    } else if (checks.some((ck) => ck.status === "warn" || ck.status === "unverified")) {
        overallStatus = "warn";
    }

    let conclusionText = "行前证件自查全部通过，证件有效期充足。";
    if (overallStatus === "fail") {
        conclusionText = "行前自查存在严重风险：有证件过期或护照余期不足 6 个月，请立即处理！";
    } else if (overallStatus === "warn") {
        conclusionText = "行前自查提示：部分证件临期或未登记有效期，请人工核实。";
    }

    return {
        tripName: trip.tripName || "旅行行程",
        destination: trip.destination || "未定目的地",
        travelDate,
        overallStatus,
        checks,
        conclusionText,
    };
}
