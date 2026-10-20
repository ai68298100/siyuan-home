/**
 * 记录分享卡（R7 资料强化）：把台账行渲染为品牌卡片 PNG。
 * 纯 Canvas 2D 本地绘制——零依赖、零网络；QR 沿用 core/qr 的深链数据。
 * 消费方：详情抽屉「复制为图片 / 下载 PNG」。
 */
import { generateQRDataUrl, blockDeepLink } from "./qr";

export interface ShareCardRow {
    label: string;
    value: string;
}

export interface FamilyYearlyReportCardData {
    year: number;
    familyScore: number;
    levelLabel: string;
    memberCount: number;
    choresCompleted: number;
    mediaFinished: number;
    milestoneCount: number;
    milestones: Array<{ date: string; title: string; icon: string; memberName?: string }>;
    highlights: string[];
    generatedAt: string;
}

/**
 * 组装年度回顾长图卡片数据结构
 */
export function buildFamilyYearlyCardData(params: {
    year: number;
    familyScore: number;
    levelLabel: string;
    memberCount: number;
    choresCompleted: number;
    mediaFinished: number;
    milestones?: Array<{ date: string; title: string; icon: string; memberName?: string }>;
    highlights?: string[];
    generatedAt?: string;
}): FamilyYearlyReportCardData {
    const {
        year,
        familyScore,
        levelLabel,
        memberCount,
        choresCompleted,
        mediaFinished,
        milestones = [],
        highlights = [],
        generatedAt = new Date().toISOString().slice(0, 10),
    } = params;

    return {
        year,
        familyScore,
        levelLabel,
        memberCount,
        choresCompleted,
        mediaFinished,
        milestoneCount: milestones.length,
        milestones: milestones.slice(0, 8), // 长图展示精选最多 8 条大事记
        highlights: highlights.slice(0, 4),
        generatedAt,
    };
}

/**
 * 格式化为纯文本简报（用于剪贴板后备）
 */
export function formatYearlyCardText(data: FamilyYearlyReportCardData): string {
    const lines: string[] = [
        `🎉 【${data.year} 家庭生活年度回顾卡】`,
        `综合幸福生活指数：${data.familyScore}分（${data.levelLabel}）`,
        `家庭成员：${data.memberCount} 人 · 家务完成：${data.choresCompleted} 次 · 书影音达成：${data.mediaFinished} 部`,
        `大事记里程碑：共 ${data.milestoneCount} 个高光时刻`,
        "──────────────────────",
    ];

    if (data.highlights.length > 0) {
        lines.push("✨ 年度亮点：");
        for (const h of data.highlights) lines.push(`  • ${h}`);
    }

    if (data.milestones.length > 0) {
        lines.push("", "📖 重要里程碑时刻：");
        for (const m of data.milestones) {
            const mem = m.memberName ? `（${m.memberName}）` : "";
            lines.push(`  ${m.icon} ${m.date} ${m.title}${mem}`);
        }
    }

    lines.push("", "由小驴管家本地生成 · 私密家庭数据绝不离端");
    return lines.join("\n");
}

export interface ShareCardOptions {
    title: string;
    moduleLabel: string;
    rows: ShareCardRow[];
    /** 块深链（可选）——有则绘 QR */
    deepLink?: string;
    /** 品牌渐变第二色（design tokens 单一豁免字面色） */
    accent?: string;
}

const W = 760;
const PAD = 36;
const HEADER_H = 96;
const LINE_H = 34;
const QR_SIZE = 116;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const chars = Array.from(text);
    const lines: string[] = [];
    let line = "";
    for (const ch of chars) {
        if (ctx.measureText(line + ch).width > maxWidth && line) {
            lines.push(line);
            line = ch;
        } else line += ch;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
}

/** 绘制并返回 PNG Blob；绘制失败抛错由调用方回退文本复制 */
export async function renderRecordCardPng(opts: ShareCardOptions): Promise<Blob> {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");

    // 预测量正文行数（长值折行）
    ctx.font = "15px system-ui, sans-serif";
    const valueMax = W - PAD * 2 - 150;
    const bodyRows = opts.rows.map((r) => ({ ...r, lines: wrap(ctx, r.value || "—", valueMax) }));
    const bodyH = bodyRows.reduce((h, r) => h + Math.max(LINE_H, r.lines.length * 22 + 12), 8);
    const qrH = opts.deepLink ? QR_SIZE + 28 : 0;
    const H = HEADER_H + 24 + bodyH + qrH + 46;
    canvas.width = W;
    canvas.height = H;

    // 纸面
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // 品牌头部（渐变磁贴同源色）
    const grad = ctx.createLinearGradient(0, 0, W, HEADER_H);
    grad.addColorStop(0, "#7c5cff");
    grad.addColorStop(1, opts.accent ?? "#9a7cff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, HEADER_H);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px system-ui, sans-serif";
    ctx.fillText("🏠 " + opts.title.slice(0, 26), PAD, 44);
    ctx.font = "13px system-ui, sans-serif";
    ctx.globalAlpha = 0.85;
    ctx.fillText(opts.moduleLabel + " · " + new Date().toLocaleDateString(), PAD, 70);
    ctx.globalAlpha = 1;

    // 正文 kv
    let y = HEADER_H + 30;
    for (const r of bodyRows) {
        ctx.fillStyle = "#8a8f99";
        ctx.font = "12.5px system-ui, sans-serif";
        ctx.fillText(r.label, PAD, y);
        y += 18;
        ctx.fillStyle = "#1f2329";
        ctx.font = "15px system-ui, sans-serif";
        for (const line of r.lines) {
            ctx.fillText(line, PAD + 4, y + 14);
            y += 22;
        }
        y += 10;
    }

    // QR（右下）
    if (opts.deepLink) {
        try {
            const qrUrl = await generateQRDataUrl(opts.deepLink);
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error("qr decode failed"));
                img.src = qrUrl;
            });
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(W - PAD - QR_SIZE - 8, H - 46 - QR_SIZE - 8, QR_SIZE + 16, QR_SIZE + 16);
            ctx.strokeStyle = "#eceef1";
            ctx.strokeRect(W - PAD - QR_SIZE - 8, H - 46 - QR_SIZE - 8, QR_SIZE + 16, QR_SIZE + 16);
            ctx.drawImage(img, W - PAD - QR_SIZE, H - 46 - QR_SIZE, QR_SIZE, QR_SIZE);
        } catch {
            // QR 失败不阻断卡片
        }
    }

    // 页脚
    ctx.fillStyle = "#b3b8c2";
    ctx.font = "11.5px system-ui, sans-serif";
    ctx.fillText("小驴管家 · 本地优先", PAD, H - 20);

    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

/**
 * 绘制家庭生活年度回顾长图并导出为 PNG Blob
 */
export async function renderYearlyReportCardPng(data: FamilyYearlyReportCardData): Promise<Blob> {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");

    const H = 460 + data.highlights.length * 28 + data.milestones.length * 34;
    canvas.width = W;
    canvas.height = H;

    // 纸面背景
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // 顶部深色品牌渐变
    const grad = ctx.createLinearGradient(0, 0, W, 140);
    grad.addColorStop(0, "#4f46e5");
    grad.addColorStop(1, "#7c5cff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 140);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.fillText(`🎉 ${data.year} 家庭生活年度回顾`, PAD, 58);
    ctx.font = "14px system-ui, sans-serif";
    ctx.globalAlpha = 0.85;
    ctx.fillText(`小驴管家 · 生活指数与年度大事记长图 · ${data.generatedAt}`, PAD, 92);
    ctx.globalAlpha = 1;

    // 综合评分徽章卡
    let y = 165;
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(PAD, y, W - PAD * 2, 70);
    ctx.strokeStyle = "#e2e8f0";
    ctx.strokeRect(PAD, y, W - PAD * 2, 70);

    ctx.fillStyle = "#4f46e5";
    ctx.font = "bold 32px system-ui, sans-serif";
    ctx.fillText(String(data.familyScore), PAD + 18, y + 48);
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText(`分 · ${data.levelLabel}`, PAD + 80, y + 44);
    ctx.fillStyle = "#64748b";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("综合幸福生活指数", PAD + 80, y + 24);

    // 四项核心指标卡网格
    y = 255;
    const tileW = (W - PAD * 2 - 24) / 4;
    const metrics = [
        { label: "家庭成员", val: `${data.memberCount} 人` },
        { label: "家务完成", val: `${data.choresCompleted} 次` },
        { label: "书影音达成", val: `${data.mediaFinished} 部` },
        { label: "大事记里程碑", val: `${data.milestoneCount} 个` },
    ];
    for (let i = 0; i < 4; i++) {
        const tx = PAD + i * (tileW + 8);
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(tx, y, tileW, 58);
        ctx.strokeStyle = "#e2e8f0";
        ctx.strokeRect(tx, y, tileW, 58);

        ctx.fillStyle = "#64748b";
        ctx.font = "11.5px system-ui, sans-serif";
        ctx.fillText(metrics[i].label, tx + 10, y + 22);

        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 15px system-ui, sans-serif";
        ctx.fillText(metrics[i].val, tx + 10, y + 44);
    }

    // 年度高光亮点
    y = 340;
    if (data.highlights.length > 0) {
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 16px system-ui, sans-serif";
        ctx.fillText("✨ 年度高光成就", PAD, y);
        y += 24;
        ctx.font = "13.5px system-ui, sans-serif";
        for (const h of data.highlights) {
            ctx.fillStyle = "#10b981";
            ctx.fillText("✔", PAD + 4, y);
            ctx.fillStyle = "#334155";
            ctx.fillText(h, PAD + 24, y);
            y += 26;
        }
        y += 12;
    }

    // 大事记时间轴
    if (data.milestones.length > 0) {
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 16px system-ui, sans-serif";
        ctx.fillText("📖 重要里程碑时刻", PAD, y);
        y += 24;
        ctx.font = "13.5px system-ui, sans-serif";
        for (const m of data.milestones) {
            ctx.fillStyle = "#6366f1";
            ctx.fillText(m.icon || "•", PAD + 4, y);
            ctx.fillStyle = "#64748b";
            ctx.fillText(m.date, PAD + 28, y);
            ctx.fillStyle = "#0f172a";
            ctx.font = "bold 13.5px system-ui, sans-serif";
            const member = m.memberName ? ` (${m.memberName})` : "";
            ctx.fillText(`${m.title}${member}`, PAD + 120, y);
            ctx.font = "13.5px system-ui, sans-serif";
            y += 32;
        }
    }

    // 页脚
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("由小驴管家本地生成 · 私密家庭数据绝不离端", PAD, H - 24);

    return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
    );
}

/** 复制 PNG 到剪贴板；失败返回 false（调用方回退下载） */
export async function copyPngToClipboard(blob: Blob): Promise<boolean> {
    try {
        const item = new ClipboardItem({ "image/png": blob });
        await navigator.clipboard.write([item]);
        return true;
    } catch {
        return false;
    }
}

/** 触发 PNG 下载 */
export function downloadPng(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 深链助手透出（抽屉组装用，避免重复导入） */
export { blockDeepLink };
