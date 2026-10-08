import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildWebhookRequest, buildDigestBody, sendWebhook, setWebhookSender, isWebhookConfigured } from "@/core/webhook";
import type { HomeSettings } from "@/types";

const base = { webhookEnabled: true, webhookUrl: "https://push.example.com/key/", webhookMode: "bark" } as HomeSettings;

beforeEach(() => setWebhookSender(null));
afterEach(() => setWebhookSender(null));

describe("Webhook 推送（Bark / ntfy）", () => {
    it("Bark：GET，标题/正文 URL 编码，尾斜杠归一", () => {
        const req = buildWebhookRequest("bark", "https://api.day.app/abc/", { title: "小驴管家（内测版）", body: "逾期 2 件" });
        expect(req.method).toBe("GET");
        expect(req.url).toBe(`https://api.day.app/abc/${encodeURIComponent("小驴管家（内测版）")}/${encodeURIComponent("逾期 2 件")}`);
        expect(req.body).toBeUndefined();
    });

    it("ntfy：POST 正文，标题并进首行", () => {
        const req = buildWebhookRequest("ntfy", "https://ntfy.sh/mytopic", { title: "T", body: "B" });
        expect(req.method).toBe("POST");
        expect(req.url).toBe("https://ntfy.sh/mytopic");
        expect(req.body).toBe("T\nB");
    });

    it("未启用/未配置 → disabled 且不发送", async () => {
        let called = 0;
        setWebhookSender(async () => { called++; });
        expect(isWebhookConfigured({ ...base, webhookEnabled: false })).toBe(false);
        const r = await sendWebhook({ ...base, webhookEnabled: false }, { title: "t", body: "b" });
        expect(r).toBe("disabled");
        const r2 = await sendWebhook({ ...base, webhookUrl: "" }, { title: "t", body: "b" });
        expect(r2).toBe("disabled");
        expect(called).toBe(0);
    });

    it("发送成功 → ok；失败 → error 且不抛出", async () => {
        setWebhookSender(async () => undefined);
        const ok = await sendWebhook(base, { title: "t", body: "b" });
        expect(ok).toBe("ok");
        setWebhookSender(async () => { throw new Error("boom"); });
        const err = await sendWebhook(base, { title: "t", body: "b" });
        expect(err).toBe("error");
    });

    it("汇总正文有界：只取前 3 条标题", () => {
        const p = buildDigestBody({ overdue: 2, soon: 5 }, ["甲", "乙", "丙", "丁"]);
        expect(p.body).toContain("逾期 2 件");
        expect(p.body).toContain("· 甲");
        expect(p.body).not.toContain("丁");
    });
});
