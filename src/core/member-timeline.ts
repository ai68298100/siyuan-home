/**
 * 重要证件与合同的个人资产全景时间轴（§16/§17 296波）：
 * 聚合指定成员名下绑定的全部证件（certs）与合同协议（contracts），
 * 判定各证件与合同的效期、履约状态与剩余天数，构建统一的时间轴节点与资产档案。
 * 纯函数，无思源/DOM 强依赖，100% 可单元测试。
 */
import type { AvRow } from "./siyuan";
import type { AvCellLike } from "./avcell";
import { formatAmount } from "./format";

export type AssetModuleType = "certs" | "contracts";
export type AssetNodeStatus = "valid" | "expiring_soon" | "expired" | "terminated";

export interface MemberTimelineNode {
    id: string;
    module: AssetModuleType;
    title: string;
    category?: string;
    date: string;
    dateType: "expiry" | "endorsement" | "contract_end" | "contract_start";
    status: AssetNodeStatus;
    daysRemaining: number;
    extra?: {
        holderNo?: string;
        party?: string;
        deposit?: number;
        autoRenew?: boolean;
    };
}

export interface MemberTimelineReport {
    memberAvItemId: string;
    memberName?: string;
    totalCertsCount: number;
    validCertsCount: number;
    expiringCertsCount: number;
    expiredCertsCount: number;
    totalContractsCount: number;
    activeContractsCount: number;
    totalDepositAmount: number;
    timeline: MemberTimelineNode[];
}

function cellText(v: AvCellLike | null | undefined): string {
    return String(v?.text?.content ?? v?.block?.content ?? "").trim();
}

function cellNumber(v: AvCellLike | null | undefined): number | undefined {
    return v?.number?.isNotEmpty && typeof v.number.content === "number" ? v.number.content : undefined;
}

function cellCheckbox(v: AvCellLike | null | undefined): boolean {
    return !!v?.checkbox?.checked;
}

function cellDate(v: AvCellLike | null | undefined): string {
    if (v?.date?.isNotEmpty && v.date.content) {
        const d = new Date(v.date.content);
        if (!isNaN(d.getTime())) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
        }
    }
    return String(v?.text?.content ?? "").trim();
}

function cellRelationBlockId(v: AvCellLike | null | undefined): string | undefined {
    return v?.relation?.blockIDs?.[0];
}

/**
 * 计算两个 YYYY-MM-DD 日期的相隔天数 (target - base)
 */
export function diffCalendarDays(targetDateStr: string, baseDateStr: string): number {
    const p1 = targetDateStr.split("-").map(Number);
    const p2 = baseDateStr.split("-").map(Number);
    if (p1.length < 3 || p2.length < 3) return 0;
    const d1 = new Date(p1[0], p1[1] - 1, p1[2]);
    const d2 = new Date(p2[0], p2[1] - 1, p2[2]);
    return Math.round((d1.getTime() - d2.getTime()) / (24 * 3600 * 1000));
}

function getTodayStr(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/**
 * 聚合成员证件与合同资产全景时间轴
 */
export function buildMemberAssetTimeline(
    memberAvItemId: string,
    certRows: AvRow[],
    certCols: Record<string, string>,
    contractRows: AvRow[],
    contractCols: Record<string, string>,
    options?: {
        today?: string;
        memberName?: string;
        expiringDaysThreshold?: number; // 默认 90 天
    },
): MemberTimelineReport {
    const today = options?.today || getTodayStr();
    const warnDays = options?.expiringDaysThreshold ?? 90;
    const timeline: MemberTimelineNode[] = [];

    let totalCerts = 0;
    let validCerts = 0;
    let expiringCerts = 0;
    let expiredCerts = 0;

    let totalContracts = 0;
    let activeContracts = 0;
    let totalDeposit = 0;

    // 1. 处理该成员的证件行 (certs)
    if (Array.isArray(certRows) && certCols) {
        for (const row of certRows) {
            // 校验是否归属该成员
            const relBlock = certCols.member ? cellRelationBlockId(row.cells[certCols.member]) : undefined;
            if (memberAvItemId && relBlock && relBlock !== memberAvItemId) {
                continue;
            }

            const title = (certCols.name && cellText(row.cells[certCols.name])) || "";
            if (!title || title === "—") continue;

            totalCerts++;
            const category = certCols.category ? cellText(row.cells[certCols.category]) : undefined;
            const holderNo = certCols.holder_no ? cellText(row.cells[certCols.holder_no]) : undefined;
            const expiryStr = certCols.expiry ? cellDate(row.cells[certCols.expiry]) : "";
            const dueStr = certCols.due ? cellDate(row.cells[certCols.due]) : "";

            // 优先以 expiry 为主效期节点
            if (expiryStr && expiryStr !== "—") {
                const days = diffCalendarDays(expiryStr, today);
                let status: AssetNodeStatus;
                if (days < 0) {
                    status = "expired";
                    expiredCerts++;
                } else if (days <= warnDays) {
                    status = "expiring_soon";
                    expiringCerts++;
                    validCerts++;
                } else {
                    status = "valid";
                    validCerts++;
                }

                timeline.push({
                    id: `${row.itemID}_expiry`,
                    module: "certs",
                    title,
                    category,
                    date: expiryStr,
                    dateType: "expiry",
                    status,
                    daysRemaining: days,
                    extra: {
                        holderNo: holderNo && holderNo !== "—" ? holderNo : undefined,
                    },
                });
            } else {
                validCerts++;
            }

            // 若有审验日/签注日 due，另作为时间轴单独里程碑节点
            if (dueStr && dueStr !== "—" && dueStr !== expiryStr) {
                const days = diffCalendarDays(dueStr, today);
                const status: AssetNodeStatus = days < 0 ? "expired" : days <= warnDays ? "expiring_soon" : "valid";
                timeline.push({
                    id: `${row.itemID}_due`,
                    module: "certs",
                    title: `${title}（签注/审验）`,
                    category,
                    date: dueStr,
                    dateType: "endorsement",
                    status,
                    daysRemaining: days,
                });
            }
        }
    }

    // 2. 处理该成员的合同协议行 (contracts)
    if (Array.isArray(contractRows) && contractCols) {
        for (const row of contractRows) {
            const relBlock = contractCols.member ? cellRelationBlockId(row.cells[contractCols.member]) : undefined;
            if (memberAvItemId && relBlock && relBlock !== memberAvItemId) {
                continue;
            }

            const title = (contractCols.name && cellText(row.cells[contractCols.name])) || "";
            if (!title || title === "—") continue;

            totalContracts++;
            const category = contractCols.category ? cellText(row.cells[contractCols.category]) : undefined;
            const party = contractCols.party ? cellText(row.cells[contractCols.party]) : undefined;
            const depositVal = contractCols.deposit ? cellNumber(row.cells[contractCols.deposit]) : undefined;
            const autoRenew = contractCols.auto_renew ? cellCheckbox(row.cells[contractCols.auto_renew]) : false;
            const expiryStr = contractCols.expiry ? cellDate(row.cells[contractCols.expiry]) : "";
            const dateStr = contractCols.date ? cellDate(row.cells[contractCols.date]) : "";

            if (depositVal !== undefined && depositVal > 0) {
                totalDeposit += depositVal;
            }

            if (expiryStr && expiryStr !== "—") {
                const days = diffCalendarDays(expiryStr, today);
                let status: AssetNodeStatus;
                if (days < 0) {
                    status = "expired";
                } else if (days <= warnDays) {
                    status = "expiring_soon";
                    activeContracts++;
                } else {
                    status = "valid";
                    activeContracts++;
                }

                timeline.push({
                    id: `${row.itemID}_contract_expiry`,
                    module: "contracts",
                    title,
                    category,
                    date: expiryStr,
                    dateType: "contract_end",
                    status,
                    daysRemaining: days,
                    extra: {
                        party: party && party !== "—" ? party : undefined,
                        deposit: depositVal,
                        autoRenew,
                    },
                });
            } else {
                activeContracts++;
                if (dateStr && dateStr !== "—") {
                    timeline.push({
                        id: `${row.itemID}_contract_start`,
                        module: "contracts",
                        title,
                        category,
                        date: dateStr,
                        dateType: "contract_start",
                        status: "valid",
                        daysRemaining: diffCalendarDays(dateStr, today),
                        extra: {
                            party: party && party !== "—" ? party : undefined,
                            deposit: depositVal,
                            autoRenew,
                        },
                    });
                }
            }
        }
    }

    // 3. 时间轴排序：临期优先（即将到期 > 远期 > 已过期），日期升序
    timeline.sort((a, b) => {
        // 未到期的按到期先后排，已逾期的排在后部
        const aOverdue = a.daysRemaining < 0;
        const bOverdue = b.daysRemaining < 0;
        if (aOverdue !== bOverdue) {
            return aOverdue ? 1 : -1;
        }
        return a.date.localeCompare(b.date);
    });

    return {
        memberAvItemId,
        memberName: options?.memberName,
        totalCertsCount: totalCerts,
        validCertsCount: validCerts,
        expiringCertsCount: expiringCerts,
        expiredCertsCount: expiredCerts,
        totalContractsCount: totalContracts,
        activeContractsCount: activeContracts,
        totalDepositAmount: Math.round(totalDeposit * 100) / 100,
        timeline,
    };
}

/**
 * 格式化成员资产时间轴简报文本
 */
export function formatMemberTimelineReportText(report: MemberTimelineReport): string {
    const title = report.memberName ? `【${report.memberName} · 个人资产与合约时间轴】` : `【个人资产与合约时间轴】`;
    const lines: string[] = [title];

    lines.push(`📄 证件概览：共 ${report.totalCertsCount} 件（${report.validCertsCount} 件有效在保，${report.expiringCertsCount} 件临期，${report.expiredCertsCount} 件已到期）`);
    lines.push(`📑 合约概览：共 ${report.totalContractsCount} 份（${report.activeContractsCount} 份履约中，累计押金 ¥${formatAmount(report.totalDepositAmount)}）`);
    lines.push("──────────────────");

    if (report.timeline.length === 0) {
        lines.push("（该成员名下暂无关联的到期时间轴节点）");
        return lines.join("\n");
    }

    lines.push("【效期与履约时间轴】");
    for (const node of report.timeline) {
        let tag = "✔";
        let daysDesc = `剩 ${node.daysRemaining} 天`;
        if (node.status === "expired") {
            tag = "❌";
            daysDesc = `已逾期 ${Math.abs(node.daysRemaining)} 天`;
        } else if (node.status === "expiring_soon") {
            tag = "⚠️";
            daysDesc = `临期 · 剩 ${node.daysRemaining} 天`;
        }

        const typeLabel = node.module === "certs" ? "证件" : "合同";
        const extraParts: string[] = [];
        if (node.extra?.holderNo) extraParts.push(`号：${node.extra.holderNo}`);
        if (node.extra?.party) extraParts.push(`相对方：${node.extra.party}`);
        if (node.extra?.deposit) extraParts.push(`押金 ¥${formatAmount(node.extra.deposit)}`);
        if (node.extra?.autoRenew) extraParts.push("🔄 自动续约");

        const extraText = extraParts.length > 0 ? ` (${extraParts.join(" · ")})` : "";
        lines.push(`${tag} ${node.date} [${typeLabel}] ${node.title} · ${daysDesc}${extraText}`);
    }

    return lines.join("\n");
}

/**
 * 成员个人资产与合约时间轴异步弹窗流
 */
export async function openMemberTimelineFlow(
    m: any,
    plugin: any,
    t: (k: string) => string,
    DialogCls: any,
    showMessageFn: any,
): Promise<void> {
    const certRef = plugin.settings.dbRefs?.certs;
    const contractRef = plugin.settings.dbRefs?.contracts;

    let certRows: AvRow[] = [];
    let contractRows: AvRow[] = [];

    const { renderLedgerAll } = await import("./siyuan");

    if (certRef?.avId) {
        try {
            const allCerts = await renderLedgerAll(certRef.avId);
            if (allCerts.complete) certRows = allCerts.rows;
        } catch { /* 忽略单个读取失败 */ }
    }

    if (contractRef?.avId) {
        try {
            const allContracts = await renderLedgerAll(contractRef.avId);
            if (allContracts.complete) contractRows = allContracts.rows;
        } catch { /* 忽略单个读取失败 */ }
    }

    const report = buildMemberAssetTimeline(
        m.avItemId ?? "",
        certRows,
        certRef?.columns ?? {},
        contractRows,
        contractRef?.columns ?? {},
        { memberName: m.name },
    );

    const dlg = new DialogCls({
        title: t("members.timelineTitle").replace("${name}", m.name),
        content: `<div class="b3-dialog__content lv-dialog-scroll-body" id="lv-member-timeline-body"></div>
<div class="b3-dialog__action"><button class="b3-button b3-button--cancel" id="lv-member-timeline-close">${t("close")}</button><button class="b3-button" id="lv-member-timeline-copy">${t("members.timelineCopy")}</button></div>`,
        width: "600px",
    });

    const body = dlg.element.querySelector("#lv-member-timeline-body") as HTMLElement;
    const copyBtn = dlg.element.querySelector("#lv-member-timeline-copy") as HTMLButtonElement;
    (dlg.element.querySelector("#lv-member-timeline-close") as HTMLButtonElement).onclick = () => dlg.destroy();

    const metrics = document.createElement("div");
    metrics.style.cssText = "display:grid;grid-template-columns:repeat(3, 1fr);gap:10px";

    const makeBox = (cap: string, numVal: string | number, sub: string, color?: string) => {
        const d = document.createElement("div");
        d.className = "lv-metric-item";
        d.innerHTML = `<span class="lv-caption">${cap}</span><b class="lv-num" style="font-size:18px;${color ? `color:${color}` : ""}">${numVal}</b><span class="lv-caption">${sub}</span>`;
        return d;
    };

    metrics.append(
        makeBox(t("members.timelineCertsCount"), report.totalCertsCount, `${report.validCertsCount} 有效 · ${report.expiringCertsCount} 临期`, "var(--lv-accent)"),
        makeBox(t("members.timelineContractsCount"), report.totalContractsCount, `${report.activeContractsCount} 份履约中`, "var(--lv-warn)"),
        makeBox(t("members.timelineDeposits"), `¥${formatAmount(report.totalDepositAmount)}`, "累计押金"),
    );
    body.appendChild(metrics);

    const timelineSec = document.createElement("div");
    timelineSec.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-top:4px";

    if (report.timeline.length === 0) {
        const empty = document.createElement("div");
        empty.className = "lv-caption";
        empty.style.cssText = "text-align:center;padding:24px 0";
        empty.textContent = t("members.timelineEmpty");
        timelineSec.appendChild(empty);
    } else {
        for (const node of report.timeline) {
            const rowEl = document.createElement("div");
            rowEl.className = "lv-metric-item";
            rowEl.style.cssText = "flex-direction:row;align-items:center;justify-content:space-between;padding:8px 12px;font-size:12px";

            const left = document.createElement("div");
            left.style.cssText = "display:flex;align-items:center;gap:8px;min-width:0;flex:1";

            const badge = document.createElement("span");
            const badgeClass = node.status === "expired" ? "red" : node.status === "expiring_soon" ? "orange" : "green";
            badge.className = `lv-badge ${badgeClass}`;
            badge.textContent = node.status === "expired" ? t("members.timelineNodeExpired") : node.status === "expiring_soon" ? t("members.timelineNodeExpiring") : t("members.timelineNodeValid");

            const typeTag = document.createElement("span");
            typeTag.className = "lv-badge gray";
            typeTag.textContent = node.module === "certs" ? "证件" : "合同";

            const nameSpan = document.createElement("b");
            nameSpan.style.cssText = "color:var(--lv-tx)";
            nameSpan.textContent = node.title;

            const extraInfo: string[] = [];
            if (node.extra?.holderNo) extraInfo.push(node.extra.holderNo);
            if (node.extra?.party) extraInfo.push(node.extra.party);
            if (node.extra?.deposit) extraInfo.push(`押金 ¥${formatAmount(node.extra.deposit)}`);
            if (node.extra?.autoRenew) extraInfo.push("自动续约");

            const infoSpan = document.createElement("span");
            infoSpan.className = "lv-caption";
            infoSpan.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px";
            infoSpan.textContent = extraInfo.join(" · ");

            left.append(badge, typeTag, nameSpan, infoSpan);

            const right = document.createElement("div");
            right.style.cssText = "text-align:right;flex-shrink:0";
            const daysDesc = node.daysRemaining < 0
                ? `<b style="color:var(--lv-warn)">${t("members.timelineDaysOverdue").replace("${n}", String(Math.abs(node.daysRemaining)))}</b>`
                : node.daysRemaining <= 90
                    ? `<b style="color:var(--lv-amber, #e67e22)">${t("members.timelineDaysLeft").replace("${n}", String(node.daysRemaining))}</b>`
                    : `<span class="lv-caption">${t("members.timelineDaysLeft").replace("${n}", String(node.daysRemaining))}</span>`;

            right.innerHTML = `<div>${daysDesc}</div><span class="lv-caption">${node.date}</span>`;

            rowEl.append(left, right);
            timelineSec.appendChild(rowEl);
        }
    }

    body.appendChild(timelineSec);

    copyBtn.onclick = async () => {
        const text = formatMemberTimelineReportText(report);
        try {
            await navigator.clipboard.writeText(text);
            showMessageFn(t("members.timelineCopied"), 2500, "info");
        } catch {
            showMessageFn(t("ledger.copyAsImageFail"), 4000, "error");
        }
    };
}
