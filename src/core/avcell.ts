/**
 * av 单元格读写的内核兼容层（R8 发现，2026-10-09）：
 * 思源 v3.7.0 起 setAttributeViewBlockAttr 移除 rowID、且 select 值按 MSelect 数组读取
 * （内核 UpdateAttributeViewCell 只认 val.MSelect；issue #15727 / #15533）。
 * - 写：selectCellValue(content) 统一产出 双形态 payload（select 单值 + mSelect 数组），
 *   新旧内核均能命中；
 * - 读：selectCellContent(cell) 先 mSelect 后 select（旧数据兼容）。
 */

export interface AvCellLike {
    type?: string;
    select?: { content?: string };
    mSelect?: { content?: string }[];
    text?: { content?: string };
    number?: { content?: number; isNotEmpty?: boolean };
    date?: { content?: number; isNotEmpty?: boolean };
    url?: { content?: string };
    checkbox?: { checked?: boolean };
    relation?: { blockIDs?: string[]; contents?: unknown };
    mAsset?: { name?: string; content?: string }[];
    [key: string]: unknown;
}

/** 写入：select 列统一双形态 payload（内核 3.8.x 读 MSelect 数组） */
export function selectCellValue(content: string): { type: string; select: { content: string }; mSelect: { content: string }[] } {
    return { type: "select", select: { content }, mSelect: [{ content }] };
}

/** 读取：select 单元格内容（mSelect 优先——内核存储形态；select 单值为旧数据兼容） */
export function selectCellContent(cell: AvCellLike | undefined | null): string | undefined {
    if (!cell) return undefined;
    const m = cell.mSelect?.map((o) => o?.content).filter((c): c is string => !!c) ?? [];
    if (m.length > 0) return m[0];
    return cell.select?.content || undefined;
}
