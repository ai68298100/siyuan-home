/**
 * 多段提醒割点（311 波，G2）：
 * 年检/保修/续签类事项需要"提前预警 + 临近催促"两段提醒，而不是单一提前量。
 * 规则可选声明 `leadStages`（如 [60, 30, 7]），到达每个割点各唤醒一次；
 * 未声明时行为完全不变（回退 leadDays 单一窗口），向后兼容旧 schema。
 * 纯函数，100% 可单元测试。
 */
import type { Reminder, ReminderRuleSpec } from "@/types";

type StageRule = Pick<ReminderRuleSpec, "leadDays" | "leadStages">;

/** 归一化割点：去重、降序、只保留正整数；无有效割点时回退 leadDays 单一窗口 */
export function stagesOf(rule: StageRule): number[] {
    const stages = (rule.leadStages ?? [])
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.floor(n));
    const uniq = Array.from(new Set(stages)).sort((a, b) => b - a);
    if (uniq.length) return uniq;
    const lead = Math.floor(rule.leadDays);
    return [Number.isFinite(lead) && lead > 0 ? lead : 30];
}

/** 当前所处割点：已进入的、|最近的（按升序遍历第一个覆盖它的点）|
 * （最小、已进入的割点：daysLeft 越小，落到的割点越靠近） */
export function currentStage(daysLeft: number, stages: number[]): number | null {
    if (!Number.isFinite(daysLeft) || stages.length === 0) return null;
    if (daysLeft < 0) return stages[stages.length - 1];
    for (let i = stages.length - 1; i >= 0; i--) if (daysLeft <= stages[i]) return stages[i];
    return null;
}

/** 是否已进入提醒窗口（逾期一律算在内） */
export function isWithinStages(daysLeft: number, stages: number[]): boolean {
    if (!Number.isFinite(daysLeft)) return false;
    if (daysLeft < 0) return true;
    const max = stages[0];
    return max === undefined ? false : daysLeft <= max;
}

/** 割点序号：从 1（最远）开始；逾期为 stages.length；未进入为 0 */
export function stageIndexOf(daysLeft: number, stages: number[]): number {
    if (!Number.isFinite(daysLeft)) return -1;
    if (daysLeft < 0) return stages.length;
    for (let i = stages.length - 1; i >= 0; i--) if (daysLeft <= stages[i]) return i + 1;
    return 0;
}

/** 提醒卡所需的段位信息 */
export function stageBadge(daysLeft: number, rule: StageRule): {
    stage: number | null;
    index: number;
    total: number;
    isUrgentStage: boolean;
} {
    const stages = stagesOf(rule);
    const stage = currentStage(daysLeft, stages);
    const index = stageIndexOf(daysLeft, stages);
    const lastStage = stages[stages.length - 1];
    return {
        stage,
        index,
        total: stages.length,
        isUrgentStage: index === stages.length || (stage !== null && stage === lastStage),
    };
}

/** 粗筛：只保留进入提醒窗口的条目 */
export function filterByStages<T extends { daysLeft: number }>(items: T[], rule: StageRule): T[] {
    return items.filter((it) => isWithinStages(it.daysLeft, stagesOf(rule)));
}

/** 已通知过的割点里是否还缺当前这一段（用于"每段只弹一次"） */
export function shouldNotifyAtStage(daysLeft: number, rule: StageRule, notifiedStages: number[]): boolean {
    const stage = currentStage(daysLeft, stagesOf(rule));
    if (stage === null) return false;
    return !notifiedStages.includes(stage);
}

/** 记录某段已通知（不修改入参） */
export function markStageNotified(notifiedStages: number[], rule: StageRule, daysLeft: number): number[] {
    const stage = currentStage(daysLeft, stagesOf(rule));
    if (stage === null || notifiedStages.includes(stage)) return notifiedStages;
    return [...notifiedStages, stage];
}

/** 续期/完成后清理已过期割点（只保留 ≤ 新周期的） */
export function pruneStagesAbove(notifiedStages: number[], max: number): number[] {
    return notifiedStages.filter((s) => s <= max);
}

/** 段位徽章文案（i18n 键 hub.stageBadge；缺键时回退 T${i}/${n}） */
export function stageBadgeLabel(daysLeft: number, rule: StageRule, t: (k: string) => string): string {
    const badge = stageBadge(daysLeft, rule);
    if (badge.stage === null) return "";
    const key = "hub.stageBadge";
    const val = t(key);
    const text = val === key ? "T${i}/${n}" : val;
    return text.replace("${stage}", String(badge.stage)).replace("${i}", String(badge.index)).replace("${n}", String(badge.total));
}

/** 段位说明文案（i18n 键 hub.stageDesc） */
export function stageDescription(rule: StageRule, t: (k: string) => string): string {
    const stages = stagesOf(rule).join(" / ");
    const key = "hub.stageDesc";
    const val = t(key);
    return val === key ? stages : val.replace("${stages}", stages);
}

/** 给提醒附加段位元信息（供卡片渲染，不污染 Reminder 类型） */
export function attachStageMeta<T extends Reminder>(reminder: T, rule: StageRule): T & {
    stageTotal: number;
    stageCurrent: number | null;
    stageIndex: number;
} {
    const badge = stageBadge(reminder.daysLeft, rule);
    return { ...reminder, stageTotal: badge.total, stageCurrent: badge.stage, stageIndex: badge.index };
}
