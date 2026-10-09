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
