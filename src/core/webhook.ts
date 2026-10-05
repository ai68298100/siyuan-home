/**
 * Webhook 推送（路线图"下一阶段"，229 波）：把提醒汇总推到用户自建的 Bark / ntfy 地址。
 * 边界：只在用户显式配置并启用后外发；地址/内容全部由用户掌握；失败静默降级（console.warn + 返回 error），
 * 绝不阻断扫描与本地提醒。发送器可注入（单测不发真网络）。
 */
import type { HomeSettings } from "@/types";

export type WebhookMode = "bark" | "ntfy";

export interface WebhookPayload {
    title: string;
    body: string;
}

export interface WebhookRequest {
    url: string;
    method: "GET" | "POST";
    body?: string;
    headers?: Record<string, string>;
}

type Sender = (url: string, init: { method: "GET" | "POST"; body?: string; headers?: Record<string, string>; signal: AbortSignal }) => Promise<void>;

let sender: Sender | null = null;

/** 测试注入点：替换底层发送（默认 fetch + 5s 超时） */
export function setWebhookSender(s: Sender | null): void {
    sender = s;
}

/** 构造请求（纯函数）：Bark=GET /<title>/<body>；ntfy=POST 正文（标题并进首行，规避非 ASCII 头）。 */
export function buildWebhookRequest(mode: WebhookMode, baseUrl: string, p: WebhookPayload): WebhookRequest {
    const base = baseUrl.trim().replace(/\/+$/, "");
    if (mode === "bark") {
        return { url: `${base}/${encodeURIComponent(p.title)}/${encodeURIComponent(p.body)}`, method: "GET" };
    }
    return { url: base, method: "POST", body: `${p.title}\n${p.body}`, headers: { "Content-Type": "text/plain" } };
}

export function isWebhookConfigured(settings: HomeSettings): boolean {
    return !!(settings.webhookEnabled && settings.webhookUrl && settings.webhookUrl.trim());
}

/** 推送汇总（不抛错）：disabled=未启用；ok=已发；error=发送失败 */
export async function sendWebhook(settings: HomeSettings, p: WebhookPayload): Promise<"disabled" | "ok" | "error"> {
    if (!isWebhookConfigured(settings)) return "disabled";
    const mode: WebhookMode = settings.webhookMode === "ntfy" ? "ntfy" : "bark";
    const req = buildWebhookRequest(mode, settings.webhookUrl ?? "", p);
    const ctrl = new AbortController();
    // 环境无关计时器（单测运行在 node，无 window）
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
        if (sender) await sender(req.url, { method: req.method, body: req.body, headers: req.headers, signal: ctrl.signal });
        else await fetch(req.url, { method: req.method, body: req.body, headers: req.headers, signal: ctrl.signal });
        return "ok";
    } catch (e) {
        console.warn("[siyuan-home] webhook push failed:", e instanceof Error ? e.message : e);
        return "error";
    } finally {
        clearTimeout(timer);
    }
}

/** 汇总正文（有界）：逾期/近期计数 + 前 3 条标题（只传计数与标题，不含日期/备注等额外内容） */
export function buildDigestBody(counts: { overdue: number; soon: number }, topTitles: string[]): WebhookPayload {
    const titles = topTitles.slice(0, 3).map((t) => `· ${t}`).join("\n");
    return {
        title: "小驴管家",
        body: `逾期 ${counts.overdue} 件 · 7 天内 ${counts.soon} 件${titles ? "\n" + titles : ""}`,
    };
}
