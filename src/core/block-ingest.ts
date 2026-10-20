/**
 * 思源文档块收录入台账（§16/§17 319波，已有文档块进台账能力）：
 * 解析思源块 ID/块链接/块引用，结合智能自然语言提炼出结构化台账字段，
 * 并在行记录中保留块深链（siyuan://blocks/${id}），实现双向可溯。
 * 纯函数，无网络，100% 可单元测试。
 */

import { smartParseNoteContent, type ParsedCaptureResult } from "./block-capture";

export interface BlockIngestResult {
    blockId: string;
    deepLink: string;
    parsed: ParsedCaptureResult;
    suggestedModule: string;
    rowPayload: {
        name: string;
        date?: string;
        amount?: number;
        note?: string;
        blockId: string;
    };
}

const SIYUAN_BLOCK_ID_REGEX = /\b(\d{14}-[a-z0-9]{7})\b/i;
const SIYUAN_DEEP_LINK_REGEX = /siyuan:\/\/blocks\/(\d{14}-[a-z0-9]{7})/i;
const SIYUAN_BLOCK_REF_REGEX = /\(\((\d{14}-[a-z0-9]{7})(?:\s+"([^"]*)")?\)\)/i;

/**
 * 从 URL、文本或引用格式中提取思源 22 位块 ID
 */
export function extractBlockId(input: string): string | undefined {
    if (!input || typeof input !== "string") return undefined;
    const trimmed = input.trim();

    // 1. siyuan://blocks/... 协议链接
    const deepMatch = trimmed.match(SIYUAN_DEEP_LINK_REGEX);
    if (deepMatch) return deepMatch[1];

    // 2. ((id "anchor")) 块引用语法
    const refMatch = trimmed.match(SIYUAN_BLOCK_REF_REGEX);
    if (refMatch) return refMatch[1];

    // 3. 裸 ID (如 20261020120000-abc1234)
    const idMatch = trimmed.match(SIYUAN_BLOCK_ID_REGEX);
    if (idMatch) return idMatch[1];

    return undefined;
}

/**
 * 组装思源块深链
 */
export function buildBlockDeepLink(blockId: string): string {
    return `siyuan://blocks/${blockId}`;
}

/**
 * 将思源块内容解析并转换为台账收录行载荷
 */
export function parseBlockToLedgerRow(params: {
    blockId: string;
    content: string;
    targetModule?: string;
}): BlockIngestResult {
    const { blockId, content, targetModule } = params;
    const cleanContent = (content ?? "").trim();
    const parsed = smartParseNoteContent(cleanContent);
    const chosenModule = targetModule || parsed.suggestedModule || "adhoc";
    const deepLink = buildBlockDeepLink(blockId);

    // 构造备注并附带块深链反向定位
    const noteParts: string[] = [];
    if (parsed.note) noteParts.push(parsed.note);
    noteParts.push(`思源块链接: ${deepLink}`);

    return {
        blockId,
        deepLink,
        parsed,
        suggestedModule: chosenModule,
        rowPayload: {
            name: parsed.title || cleanContent.slice(0, 30) || "收录块记录",
            date: parsed.date,
            amount: parsed.amount,
            note: noteParts.join(" · "),
            blockId,
        },
    };
}

/**
 * 生成在原思源文档中写回或粘贴的反向收录标记
 */
export function formatBlockIngestSnippet(
    moduleTitle: string,
    rowTitle: string,
    today = new Date().toISOString().slice(0, 10),
): string {
    return `> 🏠 已收录至小驴管家【${moduleTitle}】· ${today} · ${rowTitle}`;
}
