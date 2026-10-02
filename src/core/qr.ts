/**
 * QR 标签生成（26.6 Sortly 印证）：台账行生成 QR 贴物标签，扫码直达。
 * 依赖理由（33.5）：qrcode 1.5.4 纯 JS 无网络，用户可见功能必需。
 * 内容 = 思源块双链（siyuan://）——移动端扫码可直达对应块。
 */
import QRCode from "qrcode";

/** 生成 QR PNG data URL（尺寸可配，默认 256px 适合打印标签） */
export async function generateQRDataUrl(text: string, size = 256): Promise<string> {
    return QRCode.toDataURL(text, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: size,
        color: { dark: "#000000", light: "#ffffff" }, // 打印用黑白（扫码可靠性优先）
    });
}

/** 台账行的扫码内容：思源块深链（块 ID 定位） */
export function blockDeepLink(blockId: string): string {
    return `siyuan://blocks/${blockId}`;
}
