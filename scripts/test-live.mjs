// 真实内核活体测试门禁。
// 直接运行 pnpm test:live 时，缺凭据/实例不可达必须阻断并返回非零，避免
// vitest 的全量 skip 被误读为通过。需要可选跳过语义时使用 scripts/e2e-core.sh。
const baseUrl = process.env.SIYUAN_BASE_URL ?? process.env.SIYUAN_URL ?? "http://127.0.0.1:6806";
const token = process.env.SIYUAN_TOKEN ?? "";

function blocked(reason) {
    console.error(`[live] BLOCKED: ${reason}`);
    console.error("[live] 请提供 SIYUAN_URL/SIYUAN_TOKEN，并确认目标是隔离的 SiYuan 活体靶场。");
    process.exit(2);
}

if (!token) blocked("缺少 SIYUAN_TOKEN");

let response;
try {
    response = await fetch(`${baseUrl}/api/notebook/lsNotebooks`, {
        method: "POST",
        headers: { authorization: `Token ${token}`, "content-type": "application/json" },
        body: "{}",
    });
} catch (error) {
    blocked(`内核不可达：${error instanceof Error ? error.message : String(error)}`);
}

if (!response.ok) {
    blocked(`门禁 HTTP ${response.status}${response.status === 401 ? "（token 被拒）" : response.status === 429 ? "（鉴权锁定，勿重试）" : ""}`);
}

let envelope;
try {
    envelope = await response.json();
} catch (error) {
    blocked(`门禁响应不是有效 JSON：${error instanceof Error ? error.message : String(error)}`);
}
if (!envelope || envelope.code !== 0) blocked(`lsNotebooks code=${envelope?.code ?? "unknown"} ${envelope?.msg ?? ""}`);

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const { spawnSync } = await import("node:child_process");
const result = spawnSync(command, ["exec", "vitest", "run", "--config", "vitest.live.config.ts"], { stdio: "inherit" });
if (result.error) {
    console.error(`[live] failed to start vitest: ${result.error.message}`);
    process.exit(1);
}
process.exit(result.status ?? 1);
