/**
 * 文档模板基建（2026-10-04 第七十轮落地；此前 DocTemplate 类型无消费者）。
 * 模板文件 src/templates/<module>/<key>.tpl，构建期 ?raw 打包进 bundle（离线可用，无运行时文件加载）。
 * renderTemplate 纯函数：{{key}} → 变量值，缺失变量替换为空串；vars 由调用方从行单元格收集。
 */
import parentMeeting from "@/templates/schooling/parent-meeting.tpl?raw";

/** file 字段（schema DocTemplate）→ 模板内容 */
const TEMPLATE_FILES: Record<string, string> = {
    "schooling/parent-meeting.tpl": parentMeeting,
};

export function getTemplate(file: string): string | undefined {
    return TEMPLATE_FILES[file];
}

/** {{key}} 替换；未提供的变量 → 空串（模板先行于数据，不给用户看占位符残渣） */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
    return tpl.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => vars[key] ?? "");
}
