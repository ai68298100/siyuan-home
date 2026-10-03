/**
 * UG02 脱敏诊断包（第八十八轮）：用户确认后本地组装，无网络。
 * 含：版本/平台/生成时间/启用模块/各台账落点状态/最近扫描错误（截断）/schema 校验失败项。
 * 不含：成员名、台账内容、证件号、文档/笔记本 ID（台账错误只保留布尔，不带消息）。
 */

export interface DiagnosticInput {
    diag: {
        version: string;
        scannedAt?: number;
        errors: { moduleId: string; message: string }[];
        ledgers: { id: string; provisioned: boolean; provisional: boolean; columns: number; error?: string }[];
        contracts: string[];
    };
    enabledModules: string[];
    platform: string;
    generatedAt: string;
}

const MSG_MAX = 200;

export function buildDiagnosticPackage(input: DiagnosticInput) {
    return {
        schema: 1,
        generatedAt: input.generatedAt,
        plugin: input.diag.version,
        scannedAt: input.diag.scannedAt ?? null,
        platform: input.platform,
        enabledModules: [...input.enabledModules],
        // provisionError 可能含内部 ID → 只保留布尔
        ledgers: input.diag.ledgers.map((l) => ({
            id: l.id, provisioned: l.provisioned, provisional: l.provisional, columns: l.columns, hasError: !!l.error,
        })),
        // 内核端点消息（低敏但可能含块 ID）→ 截断；确认框已声明该残余风险
        scanErrors: input.diag.errors.map((e) => ({ moduleId: e.moduleId, message: String(e.message ?? "").slice(0, MSG_MAX) })),
        schemaIssues: [...input.diag.contracts],
    };
}
