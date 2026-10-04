/**
 * 活体集成测试助手（第一百七十七波）：真实 HTTP transport + 工作区门禁。
 * 纪律：单次探测不重试（鉴权失败严禁循环——429/401 直接 skip 整套件）；
 * 测试数据全部落在专用笔记本 LVH-真机批 内，afterAll 清理。
 */
export const LIVE_URL = process.env.SIYUAN_URL ?? "http://127.0.0.1:6806";
export const LIVE_TOKEN = process.env.SIYUAN_TOKEN ?? "";
export const LIVE_NOTEBOOK = "LVH-真机批";

export interface RawEnvelope { code: number; msg: string; data: any }

/** 真实 HTTP transport（与 siyuan.ts setTransport 接口一致）：返回完整信封，post 内解包 */
export async function liveTransport(endpoint: string, payload: object): Promise<RawEnvelope> {
    const res = await fetch(`${LIVE_URL}${endpoint}`, {
        method: "POST",
        headers: { authorization: `Token ${LIVE_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify(payload ?? {}),
    });
    return (await res.json()) as RawEnvelope;
}

/** 真实上传 transport（与 setUploadTransport 接口一致；192 波：node 下 uploadAsset 默认相对 URL 不可用，
 * 活体套件必须注入绝对地址。multipart 由 fetch/FormData 原生构造，不手工设 content-type）。 */
export async function liveUploadTransport(formData: FormData): Promise<RawEnvelope> {
    const res = await fetch(`${LIVE_URL}/api/asset/upload`, {
        method: "POST",
        headers: { authorization: `Token ${LIVE_TOKEN}` },
        body: formData,
    });
    return (await res.json()) as RawEnvelope;
}

/** 原始内核调用（setup/teardown 用，不经插件代码） */
export async function rawApi(endpoint: string, payload: object): Promise<RawEnvelope> {
    return liveTransport(endpoint, payload);
}

/** 工作区门禁：单次 lsNotebooks 探测。true = 本工作区在线可跑；false = skip 整套件（严禁重试） */
export async function gateProbe(): Promise<{ ok: boolean; reason: string }> {
    if (!LIVE_TOKEN) return { ok: false, reason: "缺 SIYUAN_TOKEN（用 scripts/e2e-core.sh 运行，其会 source env）" };
    try {
        const r = await fetch(`${LIVE_URL}/api/notebook/lsNotebooks`, {
            method: "POST",
            headers: { authorization: `Token ${LIVE_TOKEN}`, "content-type": "application/json" },
            body: "{}",
        });
        if (r.status === 429) return { ok: false, reason: "429 鉴权锁定冷却中（勿重试，稍后再跑）" };
        if (r.status === 401) return { ok: false, reason: "401 token 被拒（外来工作区占用或 token 变更）" };
        const j = (await r.json()) as any;
        if (j.code !== 0) return { ok: false, reason: `lsNotebooks code=${j.code} ${j.msg ?? ""}` };
        return { ok: true, reason: `工作区在线（${j.data?.notebooks?.length ?? 0} 笔记本）` };
    } catch (e) {
        return { ok: false, reason: `内核不可达：${e instanceof Error ? e.message : String(e)}` };
    }
}
