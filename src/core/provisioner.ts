/**
 * 建库器（provisioner）：模块启用 → 幂等创建台账文档与数据库。
 * 落点：专用笔记本（默认 "🏠 小驴管家"，可配）。幂等：已启用再启用 = 跳过；
 * 版本升级补列不删不改。文档/av ID 记入 settings.dbRefs（01 ADR-3/5/7）。
 *
 * Spike 定案后走真实建库路径（siyuan.ts）：div 插入 → createIfNotExist → 加列。
 * members 库是 relation 列（member 列）的目标，先建 members 再建其他模块。
 *
 * D07/D08（2026-10-02）：
 * - 笔记本登记值兼容 ID 与历史名称；ID 查不到不把 ID 当名称建新笔记本；
 *   笔记本被关闭 → openNotebook 恢复而非新建。
 * - dbRef 文档检查区分瞬态错误（网络/响应异常 → 记录后原样返回，不重建）
 *   与内核明确报错（文档不存在 → 重建路径）。
 * - 复用原库时补列续跑（缺列只增不改），成功后清除旧 provisionError；
 *   补登记路径尝试按 root_id 找回 av 块，找回即复用原库。
 */
import type { HomeSettings, DbRef } from "@/types";
import type { ModuleSchema } from "./schema";
import {
    listNotebooks, createNotebook, openNotebook, createDocWithMd, getHPathByID, sql, newSiYuanId,
    createAttributeView, addAttributeViewColumn, renderLedger, KernelError, isWriteResultUnknown,
} from "./siyuan";

export interface DuplicateFinding {
    hpath: string;
    docIds: string[];
}

/** 33.2 重复检测：同一笔记本内同名台账文档（hpath 相同出现 >1 次） */
export async function findDuplicateLedgers(settings: HomeSettings): Promise<DuplicateFinding[]> {
    const notebookId = settings.dbRefs.members?.notebook ?? settings.dbRefs.certs?.notebook;
    if (!notebookId) return [];
    const rows = await sql<{ hpath: string; cnt: number }>(
        `SELECT hpath, COUNT(id) AS cnt FROM blocks
         WHERE type='d' AND box='${notebookId.replace(/'/g, "''")}' AND hpath LIKE '${DOC_TITLE_PREFIX}%'
         GROUP BY hpath HAVING cnt > 1`,
    );
    const out: DuplicateFinding[] = [];
    for (const r of rows) {
        const ids = await sql<{ id: string }>(
            `SELECT id FROM blocks WHERE type='d' AND box='${notebookId}' AND hpath='${r.hpath.replace(/'/g, "''")}'`,
        );
        out.push({ hpath: r.hpath, docIds: ids.map((x) => x.id) });
    }
    return out;
}

export const DEFAULT_NOTEBOOK_NAME = "🏠 小驴管家";
const DOC_TITLE_PREFIX = "台账 · ";

/**
 * 历史版本模块中文标题别名表（老版本平滑升级兼容与自动找回引擎）：
 * 兼容各历史版本中可能使用的台账文档命名，避免升级后被当作未建库或重复创建。
 */
export const MODULE_TITLE_ALIASES: Record<string, string[]> = {
    members: ["家庭成员", "成员档案", "家庭成员档案", "成员清单"],
    certs: ["证件管理", "重要证件", "证件档案", "证照管理"],
    health: ["病历与健康", "健康档案", "病历档案", "医疗健康"],
    social: ["社保医保", "社保公积金", "社保管理", "医保社保"],
    insurance: ["保险管理", "保单管理", "家庭保单", "商业保险"],
    exams: ["考证管理", "考试管理", "备考记录", "证书资质"],
    pets: ["宠物档案", "宠物管理", "毛孩子档案"],
    "assets-real": ["实物资产", "固定资产", "家庭资产", "大件资产"],
    "assets-virtual": ["虚拟资产", "数字资产", "网络资产", "账户资产"],
    shopping: ["购物记录", "采购清单", "待买清单", "购物清单"],
    memberships: ["会员与订阅", "订阅管理", "周期会员", "订阅服务"],
    contracts: ["合同与文件", "重要合同", "合同协议", "协议合同"],
    medicine: ["家庭药箱", "常用药箱", "药品管理", "家用药箱"],
    stock: ["囤货与库存", "备品耗材", "家庭囤货", "物资储备"],
    favors: ["礼尚往来", "人情账本", "随礼人情", "份子礼金"],
    chores: ["家务与周期", "家务分工", "日常家务", "家庭清洁"],
    food: ["餐饮", "美食菜谱", "家常菜谱", "家庭食谱", "餐饮美食"],
    address: ["地址管理", "常用地址", "家庭地址", "收货地址"],
    bookmarks: ["网址管理", "常用书签", "家庭导航", "常用网址"],
    snippets: ["常用语", "随手便签", "常用话术", "备忘随手记"],
    house: ["房屋与日程", "房屋物业", "房产档案", "物业缴费"],
    parenting: ["育儿管理", "育儿档案", "宝宝成长", "母婴育儿"],
    schooling: ["上学管理", "教育上学", "学业档案", "学校教育"],
    allowance: ["零花钱与压岁钱", "零花钱账本", "儿童零花钱", "零用账本"],
    vehicles: ["车辆", "车辆档案", "家庭车辆", "爱车档案"],
    transit: ["交通卡证", "公交卡", "公共交通"],
    "travel-plan": ["旅行计划", "行程规划", "出行计划"],
    "travel-booking": ["预订单据", "机票酒店", "行程单据"],
    "travel-packing": ["行前清单", "行李打包", "收拾行李"],
    "travel-log": ["行中行后足迹", "旅行足迹", "旅行随记"],
    media: ["影音书库", "书影音", "阅读追剧", "书单影单"],
};

/** 思源 ID 形态（yyyyMMddHHmmss-xxxxxxx）：区分 dbRefs.notebook 里的 ID 与历史名称值（D07） */
const SIYUAN_ID_RE = /^\d{14}-[0-9a-z]{7}$/;
// The kernel may commit a notebook before its list endpoint/index observes it.
// Keep the recovery window bounded and never replay an unknown create request.
const NOTEBOOK_RECOVERY_ATTEMPTS = 5;
const NOTEBOOK_RECOVERY_DELAY_MS = 250;

export function isSiYuanId(v: string | undefined): boolean {
    return !!v && SIYUAN_ID_RE.test(v);
}

async function createNotebookWithRecovery(name: string): Promise<string> {
    try {
        return await createNotebook(name, { idempotencyKey: `provision:notebook:create:${name}`, retries: 0 });
    } catch (error) {
        // The create request may have committed before its response was lost,
        // or a notebook with this name already exists.
        let matches: Awaited<ReturnType<typeof listNotebooks>> = [];
        for (let attempt = 0; attempt < NOTEBOOK_RECOVERY_ATTEMPTS; attempt++) {
            if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, NOTEBOOK_RECOVERY_DELAY_MS));
            matches = (await listNotebooks()).filter((notebook) => notebook.name === name);
            if (matches.length > 0) break;
        }
        if (matches.length > 0) {
            const chosen = matches.find((n) => !n.closed) || matches[0];
            return chosen.id;
        }
        throw error;
    }
}

/**
 * 确保专用笔记本可用，返回笔记本 ID（D07）：
 * - 登记值为 ID → 按 ID 匹配；查不到（笔记本被删除）→ 落回默认名，绝不把 ID 当名称新建；
 * - 登记值为名称（历史值）→ 按名称匹配；
 * - 命中但已关闭 → openNotebook 恢复；未命中 → createNotebook。
 * - 若受限无法创建根笔记本，自动优雅降级到当前思源工作区已打开的首个笔记本，保障建库绝对不卡死。
 */
export async function ensureNotebook(preferred?: string, defaultNotebookId?: string): Promise<string> {
    const notebooks = await listNotebooks();
    const byId = (id: string) => notebooks.find((nb) => nb.id === id);
    const byName = (name: string) => notebooks.find((nb) => nb.name === name);

    // 1. 最高优先级：用户在设置中显式指定的自选目标笔记本（targetNotebookId）
    if (defaultNotebookId) {
        const custom = isSiYuanId(defaultNotebookId) ? byId(defaultNotebookId) : (byId(defaultNotebookId) || byName(defaultNotebookId));
        if (custom) {
            if (custom.closed) {
                await openNotebook(custom.id, { idempotencyKey: `provision:notebook:open:${custom.id}`, retries: 1 });
            }
            return custom.id;
        }
    }

    // 2. 第二优先级：该模块原本登记且有效的笔记本
    if (preferred) {
        const hit = isSiYuanId(preferred) ? byId(preferred) : byName(preferred);
        if (hit) {
            if (hit.closed) await openNotebook(hit.id, { idempotencyKey: `provision:notebook:open:${hit.id}`, retries: 1 });
            return hit.id;
        }
    }

    // 3. 第三优先级：默认笔记本名称 "🏠 小驴管家"
    const name = isSiYuanId(preferred) || !preferred ? DEFAULT_NOTEBOOK_NAME : preferred;
    const hit = byName(name);
    if (hit) {
        if (hit.closed) await openNotebook(hit.id, { idempotencyKey: `provision:notebook:open:${hit.id}`, retries: 1 });
        return hit.id;
    }
    try {
        const createdId = await createNotebookWithRecovery(name);
        const nb = (await listNotebooks()).find((n) => n.id === createdId);
        if (nb?.closed) {
            await openNotebook(createdId, { idempotencyKey: `provision:notebook:open:${createdId}`, retries: 1 });
        }
        return createdId;
    } catch (e) {
        // 环境受限无法创建笔记本时的兜底自愈：复用思源当前已打开的第一个有效笔记本
        const openNb = notebooks.find((n) => !n.closed) || notebooks[0];
        if (openNb) {
            if (openNb.closed) await openNotebook(openNb.id, { idempotencyKey: `provision:notebook:open:${openNb.id}`, retries: 1 });
            return openNb.id;
        }
        throw e;
    }
}

/** 台账文档 hpath（笔记本内一级文档） */
export function ledgerHPath(titleI18n: string): string {
    return `/${DOC_TITLE_PREFIX}${titleI18n}`;
}

function stableAvSeed(moduleId: string, docId: string): string {
    let hash = 2166136261;
    for (const char of `${moduleId}:${docId}`) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    const timestamp = docId.match(/^(\d{14})-/)?.[1] ?? "20000101000000";
    return `${timestamp}-${(hash >>> 0).toString(36).padStart(7, "0")}`;
}

export interface FoundLedgerDoc {
    id: string;
    box: string;
}

/**
 * 健壮找回台账文档（消除历史脆弱的 rows.length > 1 抛 409 异常）：
 * 1. 优先在指定的 notebookId 找精确 hpath；
 * 2. 如果同一笔记本内有多份同名文档，优先选取包含已有 av 块的文档，次选最新修改的文档；
 * 3. 如果指定笔记本没有找到，按模块历史别名扩展查找；
 * 4. 如果仍未找到，全局跨所有笔记本搜寻带有该模块台账特征的文档（自动自愈历史版本）。
 */
export async function findLedgerDoc(notebookId: string, hpath: string, moduleId?: string): Promise<FoundLedgerDoc | null> {
    try {
        const escapedHpath = hpath.replace(/'/g, "''");
        const escapedBox = notebookId.replace(/'/g, "''");
        // 1. 指定笔记本内精确匹配
        const rows = await sql<{ id: string; box: string; updated: string }>(
            `SELECT id, box, updated FROM blocks WHERE type='d' AND box='${escapedBox}' AND hpath='${escapedHpath}' ORDER BY updated DESC LIMIT 5`,
        );
        if (rows.length === 1) return { id: rows[0].id, box: rows[0].box || notebookId };
        if (rows.length > 1) {
            for (const r of rows) {
                const av = await findAvBlockInDoc(r.id);
                if (av) return { id: r.id, box: r.box || notebookId };
            }
            return { id: rows[0].id, box: rows[0].box || notebookId };
        }

        // 2. 指定笔记本内历史别名匹配
        if (moduleId && MODULE_TITLE_ALIASES[moduleId]) {
            for (const alias of MODULE_TITLE_ALIASES[moduleId]) {
                const aliasHpath = `/${DOC_TITLE_PREFIX}${alias}`.replace(/'/g, "''");
                const aliasRows = await sql<{ id: string; box: string }>(
                    `SELECT id, box FROM blocks WHERE type='d' AND box='${escapedBox}' AND hpath='${aliasHpath}' ORDER BY updated DESC LIMIT 2`,
                );
                if (aliasRows.length > 0) return { id: aliasRows[0].id, box: aliasRows[0].box || notebookId };
            }
        }

        // 3. 全局跨笔记本自愈找回（针对历史版本建在其他笔记本的情况）
        const globalRows = await sql<{ id: string; box: string }>(
            `SELECT id, box FROM blocks WHERE type='d' AND hpath='${escapedHpath}' ORDER BY updated DESC LIMIT 2`,
        );
        if (globalRows.length > 0) return { id: globalRows[0].id, box: globalRows[0].box };

        if (moduleId && MODULE_TITLE_ALIASES[moduleId]) {
            for (const alias of MODULE_TITLE_ALIASES[moduleId]) {
                const globalAliasRows = await sql<{ id: string; box: string }>(
                    `SELECT id, box FROM blocks WHERE type='d' AND hpath LIKE '%${alias.replace(/'/g, "''")}%' ORDER BY updated DESC LIMIT 1`,
                );
                if (globalAliasRows.length > 0) return { id: globalAliasRows[0].id, box: globalAliasRows[0].box };
            }
        }
    } catch { /* SQL 异常回退 null */ }
    return null;
}

/** 在文档内找既有 av 块（D08 补登记：文档在、登记丢 → 找回原库而非重建第二套） */
export async function findAvBlockInDoc(docId: string): Promise<string | null> {
    try {
        const rows = await sql<{ id: string }>(
            `SELECT id FROM blocks WHERE type='av' AND root_id='${docId}' LIMIT 1`,
        );
        return rows[0]?.id ?? null;
    } catch {
        return null;
    }
}

/**
 * D07 错误分类（保守方向：宁可不重建，不误重建）：
 * - 网络层异常 / malformed envelope（TypeError、code=-1 且非"找不到"消息）→ 瞬态，不重建；
 * - 内核非 -1 错误码，或内核明确返回 "not found/不存在" → 文档缺失，走重建。
 */
export function isDocMissingError(e: unknown): boolean {
    if (!(e instanceof KernelError)) return false;
    if (e.code !== -1) return true;
    return /not found|不存在/i.test(e.kernelMsg);
}

function errText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

export interface ProvisionResult {
    dbRef: DbRef;
    created: boolean;
}

export interface ProvisioningReport {
    issues: { moduleId: string; message: string }[];
}

export function getProvisioningReport(settings: Pick<HomeSettings, "enabledModules" | "dbRefs">): ProvisioningReport {
    const issues: ProvisioningReport["issues"] = [];
    for (const moduleId of settings.enabledModules) {
        const ref = settings.dbRefs[moduleId];
        const message = ref?.provisionError ?? (!ref?.avId ? "Attribute view unavailable" : "");
        if (message) issues.push({ moduleId, message });
    }
    return { issues };
}

export interface ProvisionOptions {
    /** 列名解析（i18n）：列 key → 显示名（缺省用 key 本身） */
    resolveName?: (colKey: string) => string;
}

/** 补列（D08 只增不改）：跳过已登记列；返回完整 keyID 映射与首个失败摘要（undefined = 全部就绪） */
async function ensureColumns(
    avId: string | undefined,
    schema: ModuleSchema,
    existing: Record<string, string> | undefined,
    moduleId: string,
    opts: ProvisionOptions,
    memberAvId?: string,
): Promise<{ columns: Record<string, string>; error?: string }> {
    const columns: Record<string, string> = { ...(existing ?? {}) };
    let error: string | undefined;
    if (!avId) return { columns, error: error ?? "av unavailable" };
    let knownColumns: any[];
    try {
        knownColumns = (await renderLedger(avId)).columns ?? [];
    } catch (e) {
        return { columns, error: `column preflight: ${errText(e)}` };
    }
    for (const col of schema.columns) {
        if (columns[col.key]) continue; // 已登记 → 不删不改（ensureColumns 约束，15/33.2）
        const keyID = newSiYuanId();
        const columnName = opts.resolveName?.(col.key) ?? col.key;
        // Settings can be lost while the AV still contains the column. Reuse
        // the one preflight snapshot so existing columns are restored without
        // issuing another read for every field.
        const currentMatches = knownColumns.filter((candidate: any) =>
            candidate?.id === keyID || candidate?.name === columnName || candidate?.keyName === columnName,
        );
        if (currentMatches.length === 1 && currentMatches[0]?.id) {
            columns[col.key] = String(currentMatches[0].id);
            continue;
        }
        if (currentMatches.length > 1) {
            error = `column "${col.key}" has multiple matching keys`;
            continue;
        }
        try {
            await addAttributeViewColumn(avId, {
                keyID,
                name: columnName,
                type: col.type,
                relationTargetAvID: col.type === "relation" ? memberAvId : undefined,
            }, { idempotencyKey: `provision:column:${moduleId}:${col.key}`, retries: 0 });
            columns[col.key] = keyID;
            knownColumns.push({ id: keyID, name: columnName });
        } catch (e) {
            // The add may have committed while its response was lost. A
            // fresh view can safely recover the key; otherwise leave the
            // mapping missing so the next run can reconcile before creating.
            let recovered: any;
            for (let attempt = 0; attempt < (isWriteResultUnknown(e) ? 4 : 1); attempt++) {
                if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 300));
                try {
                    const recoveredView = await renderLedger(avId);
                    const matches = (recoveredView.columns ?? []).filter((candidate: any) =>
                        candidate?.id === keyID || candidate?.name === columnName || candidate?.keyName === columnName,
                    );
                    if (matches.length === 1) {
                        recovered = matches[0];
                        knownColumns = recoveredView.columns ?? [];
                    }
                    if (matches.length > 1) error = `column "${col.key}" recovery is ambiguous`;
                    if (matches.length > 0) break;
                } catch { /* keep trying briefly only when the write result is unknown */ }
            }
            if (recovered?.id) {
                columns[col.key] = String(recovered.id);
                continue;
            }
            // 补列失败不阻断建库（可重跑续补，33.2）
            error = `column "${col.key}": ${errText(e)}`;
            console.warn(`[siyuan-home] column "${col.key}" on "${moduleId}" deferred:`, error);
        }
    }
    return { columns, error };
}

/**
 * 为模块创建台账文档 + 数据库 + 全部列。幂等：
 * ① dbRefs 有效且非 provisional → 校验文档在（瞬态错误不重建）→ 补列续跑 → 清除旧错误；
 * ② 文档已存在但未登记（重装/手删设置）→ 找回 av 块复用原库 + 补列；
 * ③ 全新 → 建文档 → 建库 → 建列。单模块失败记 provisionError，不中断其他模块。
 */
export async function provisionModule(
    settings: HomeSettings,
    moduleId: string,
    schema: ModuleSchema,
    titleI18n: string,
    opts: ProvisionOptions = {},
): Promise<ProvisionResult> {
    const existing = settings.dbRefs[moduleId];
    if (existing?.docId && !existing.provisional) {
        let docMissing = false;
        try {
            await getHPathByID(existing.docId);
        } catch (e) {
            if (!isDocMissingError(e)) {
                // D07：网络/瞬态错误 → 记录后原样返回，不重建（防误删/重复建库）
                existing.provisionError = `doc check: ${errText(e)}`;
                return { dbRef: existing, created: false };
            }
            docMissing = true; // 内核明确报错 → 文档已被删除，落到下方重建流程
        }
        if (!docMissing) {
            // D08：复用原库 + 补列续跑（成功后清除旧 provisionError）
            const memberAvId = moduleId === "members" ? undefined : settings.dbRefs.members?.avId;
            const { columns, error } = await ensureColumns(existing.avId, schema, existing.columns, moduleId, opts, memberAvId);
            const dbRef: DbRef = { ...existing, columns, provisionError: error };
            settings.dbRefs[moduleId] = dbRef;
            return { dbRef, created: false };
        }
    }
    try {
        const notebookId = await ensureNotebook(existing?.notebook, settings.targetNotebookId);
        const hpath = ledgerHPath(titleI18n);
        const found = await findLedgerDoc(notebookId, hpath, moduleId);
        if (found) {
            const actualNotebookId = found.box || notebookId;
            try {
                await openNotebook(actualNotebookId, { retries: 1 });
            } catch { /* ignore */ }
            // 补登记：优先找回文档内既有 av 块（D08），找不回才建新库
            let avId = await findAvBlockInDoc(found.id);
            if (!avId) {
                try {
                    avId = await createAttributeView(found.id, stableAvSeed(moduleId, found.id), { idempotencyKey: `provision:av:${moduleId}:${found.id}` });
                } catch {
                    avId = null; // av 创建失败 → provisional 落库，诊断可见
                }
            }
            const memberAvId = moduleId === "members" ? undefined : settings.dbRefs.members?.avId;
            const { columns, error } = await ensureColumns(avId, schema, existing?.columns, moduleId, opts, memberAvId);
            const dbRef: DbRef = { ...existing, docId: found.id, avId: avId ?? undefined, notebook: actualNotebookId, provisional: !avId, columns, provisionError: error };
            settings.dbRefs[moduleId] = dbRef;
            return { dbRef, created: false };
        }
        let docId: string;
        try {
            const docHeaderMarkdown = `# ${titleI18n}\n\n> 🏠 **小驴管家 · 专属台账文档**\n> 快捷直达：按 \`Ctrl+Alt+H\` 可在任意界面随时呼出小驴管家；下方为思源原生属性视图数据库（AttributeView），支持双向编辑与同步。\n\n{: placeholder-ledger }\n`;
            docId = await createDocWithMd(notebookId, hpath, docHeaderMarkdown, {
                idempotencyKey: `provision:doc:${moduleId}:${notebookId}:${hpath}`,
                retries: 0,
            });
        } catch (error) {
            let recovered: FoundLedgerDoc | null = null;
            for (let attempt = 0; attempt < 6 && !recovered; attempt++) {
                if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
                recovered = await findLedgerDoc(notebookId, hpath, moduleId);
            }
            if (recovered) {
                docId = recovered.id;
            } else {
                throw error;
            }
        }
        const avIdSeed = stableAvSeed(moduleId, docId);
        let avId: string | undefined;
        let provisional = false;
        let provisionError: string | undefined;
        try {
            avId = await createAttributeView(docId, avIdSeed, { idempotencyKey: `provision:av:${moduleId}:${docId}` });
        } catch (e) {
            provisional = true;
            provisionError = errText(e);
            console.warn(`[siyuan-home] module "${moduleId}" provisioned provisionally:`, provisionError);
        }
        const memberAvId = moduleId === "members" ? undefined : settings.dbRefs.members?.avId;
        const { columns, error } = await ensureColumns(avId, schema, undefined, moduleId, opts, memberAvId);
        const dbRef: DbRef = { docId, avId, notebook: notebookId, provisional, columns, provisionError: provisionError ?? error };
        settings.dbRefs[moduleId] = dbRef;
        return { dbRef, created: true };
    } catch (e) {
        // D07：笔记本/文档创建失败（含瞬态）→ 记录，不向上抛（不中断其他模块建库）
        const msg = errText(e);
        console.warn(`[siyuan-home] provision "${moduleId}" failed:`, msg);
        const dbRef: DbRef = { ...existing, provisionError: msg };
        settings.dbRefs[moduleId] = dbRef;
        return { dbRef, created: false };
    }
}

/**
 * 将思源已有文档一键绑定为指定模块的台账（大幅降低用户迁移与建账门槛）：
 * 1. 验证文档在思源中存在；
 * 2. 检索文档内已有的 AttributeView 属性视图，若不存在则在文档末尾自动生成一个；
 * 3. 对齐并校验各业务列；
 * 4. 写入 settings.dbRefs[moduleId]；
 * 5. 返回更新后的 DbRef。
 */
export async function bindExistingDoc(
    settings: HomeSettings,
    moduleId: string,
    rawDocInput: string,
    schema: ModuleSchema,
    opts: ProvisionOptions = {},
): Promise<ProvisionResult> {
    const raw = (rawDocInput ?? "").trim();
    const mBlock = raw.match(/\b\d{14}-[a-z0-9]{7}\b/i);
    const docId = mBlock ? mBlock[0] : raw;
    if (!docId) throw new Error("invalid document ID or link");

    let hpath = "";
    try {
        hpath = await getHPathByID(docId);
    } catch (e) {
        throw new Error(`document not found in SiYuan: ${errText(e)}`);
    }
    if (!hpath) throw new Error("document not found in SiYuan");

    const notebookRows = await sql<{ box: string }>(`SELECT box FROM blocks WHERE id='${docId.replace(/'/g, "''")}' LIMIT 1`);
    const notebookId = notebookRows[0]?.box;

    let avId = await findAvBlockInDoc(docId);
    let provisional = false;
    let provisionError: string | undefined;

    if (!avId) {
        try {
            avId = await createAttributeView(docId, stableAvSeed(moduleId, docId), { idempotencyKey: `bind:av:${moduleId}:${docId}` });
        } catch (e) {
            provisional = true;
            provisionError = errText(e);
        }
    }

    const memberAvId = moduleId === "members" ? undefined : settings.dbRefs.members?.avId;
    const { columns, error } = await ensureColumns(avId, schema, undefined, moduleId, opts, memberAvId);
    const dbRef: DbRef = {
        docId,
        avId: avId ?? undefined,
        notebook: notebookId,
        provisional,
        columns,
        provisionError: provisionError ?? error,
    };
    settings.dbRefs[moduleId] = dbRef;
    return { dbRef, created: false };
}

export interface AdoptionReport {
    adoptedCount: number;
    adoptedModules: string[];
    alreadyReadyCount: number;
    issues: { moduleId: string; message: string }[];
}

/**
 * 智能扫描并找回思源中已有的全部历史台账（老版本平滑升级匹配与成果保障机制）：
 * 1. 遍历当前启用的所有模块；
 * 2. 检查当前是否已绑定有效 docId，若已绑定且思源文档在则计入已就绪；
 * 3. 若未绑定、provisional 或失效，启动全局智能探针（按标题、多版本别名、专属 AV 块特征）在思源全部笔记本中找回；
 * 4. 找回后自动更新设置映射并补齐缺失列；
 * 5. 返回详细的找回与升级报告。
 */
export async function discoverAndAdoptAllLedgers(
    settings: HomeSettings,
    schemaCatalog: Record<string, ModuleSchema>,
    resolveName: (k: string) => string = (k) => k,
): Promise<AdoptionReport> {
    const report: AdoptionReport = {
        adoptedCount: 0,
        adoptedModules: [],
        alreadyReadyCount: 0,
        issues: [],
    };
    const defaultNbId = await ensureNotebook(undefined, settings.targetNotebookId);

    for (const moduleId of settings.enabledModules) {
        const schema = schemaCatalog[moduleId];
        if (!schema) continue;
        const existing = settings.dbRefs[moduleId];
        if (existing?.docId && !existing.provisional) {
            try {
                const hp = await getHPathByID(existing.docId);
                if (hp) {
                    report.alreadyReadyCount++;
                    continue;
                }
            } catch { /* doc missing or invalid */ }
        }

        // 尝试自动找回
        const titleI18n = resolveName(`module.${moduleId}`);
        const hpath = ledgerHPath(titleI18n);
        const found = await findLedgerDoc(existing?.notebook || defaultNbId, hpath, moduleId);

        if (found) {
            const actualNb = found.box || existing?.notebook || defaultNbId;
            try {
                await openNotebook(actualNb, { retries: 1 });
            } catch { /* ignore */ }

            let avId = await findAvBlockInDoc(found.id);
            if (!avId) {
                try {
                    avId = await createAttributeView(found.id, stableAvSeed(moduleId, found.id), {
                        idempotencyKey: `adopt:av:${moduleId}:${found.id}`,
                    });
                } catch {
                    // provisional
                }
            }
            const memberAvId = moduleId === "members" ? undefined : settings.dbRefs.members?.avId;
            const { columns, error } = await ensureColumns(avId, schema, existing?.columns, moduleId, { resolveName }, memberAvId);
            settings.dbRefs[moduleId] = {
                ...existing,
                docId: found.id,
                avId: avId ?? undefined,
                notebook: actualNb,
                columns,
                provisional: !avId,
                provisionError: error,
            };
            report.adoptedCount++;
            report.adoptedModules.push(titleI18n);
        } else {
            if (existing?.provisionError) {
                report.issues.push({ moduleId, message: existing.provisionError });
            }
        }
    }

    return report;
}
