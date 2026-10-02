/**
 * 合成示例数据（24 组/CM07）：一键生成虚拟家庭的少量台账行，供新用户体验、截图与回归测试。
 * 纪律：所有名称带【示例】前缀；只写已启用模块；记录生成的行/成员 ID，一键清除可回滚；
 * 清除走 removeLedgerRows（[待实测] 端点）——失败逐行报告，不静默假清成功。
 */
import type { Plugin } from "siyuan";
import type { HomeSettings, MemberRole } from "@/types";
import { addDetachedRow, setCell, removeLedgerRows, newSiYuanId } from "./siyuan";
import { addMember, removeMember } from "./members";
import { saveSettings } from "./settings";

const DEMO_PREFIX = "【示例】";

export interface DemoResult {
    created: number;
    cleared: number;
    /** 清除失败的行（moduleId/itemID/原因），数据仍在台账可手动删 */
    errors: string[];
}

function localMs(daysAhead: number): number {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 在模块台账中建一行示例数据（字段按列存在性写入；默认状态同快速表单惯例） */
async function demoRow(
    settings: HomeSettings,
    moduleId: string,
    schemaCatalog: Record<string, any>,
    fields: Record<string, unknown>,
    collected: Record<string, string[]>,
): Promise<boolean> {
    const ref = settings.dbRefs[moduleId];
    const cols = ref?.columns;
    if (!ref?.avId || !cols) return false;
    const itemID = await addDetachedRow(ref.avId, `${DEMO_PREFIX}${fields.name}`);
    collected[moduleId] = [...(collected[moduleId] ?? []), itemID];
    const write = async (key: string, value: unknown) => {
        if (!cols[key]) return;
        await setCell(ref.avId!, cols[key], itemID, value);
    };
    for (const [key, v] of Object.entries(fields)) {
        if (key === "name") continue;
        if (typeof v === "number") await write(key, { type: "number", number: { content: v, isNotEmpty: true } });
        else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) await write(key, { type: "date", date: { content: localMs(daysFromToday(v)), isNotEmpty: true, isNotTime: true } });
        else if (typeof v === "string") await write(key, { type: "text", text: { content: v } });
        else if (typeof v === "boolean") await write(key, { type: "checkbox", checkbox: { checked: v } });
    }
    // 默认状态（schema 显式声明优先，否则枚举首值；D11）与快速表单一致
    const statusCol = (schemaCatalog[moduleId]?.columns ?? []).find((c: any) => c.key === "status");
    if (statusCol?.options?.length) await write("status", { type: "select", select: { content: statusCol.default ?? statusCol.options[0] } });
    return true;
}

function daysFromToday(ymd: string): number {
    const [y, m, d] = ymd.split("-").map(Number);
    const target = new Date(y, (m ?? 1) - 1, d ?? 1);
    return Math.round((target.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

/** 生成示例成员 + 少量已启用模块的示例行；生成清单记入 settings.demoRows/demoMemberIds */
export async function generateDemoData(
    plugin: Plugin,
    settings: HomeSettings,
    schemaCatalog: Record<string, any>,
): Promise<DemoResult> {
    const result: DemoResult = { created: 0, cleared: 0, errors: [] };
    const collected: Record<string, string[]> = {};

    // 示例成员（走成员 DAL：设置侧 + 台账行 + 生日）
    const demoMembers: { name: string; role: MemberRole; birthday: string; lunar: boolean }[] = [
        { name: `${DEMO_PREFIX}驴爸爸`, role: "self", birthday: "1988-04-15", lunar: false },
        { name: `${DEMO_PREFIX}驴妈妈`, role: "spouse", birthday: "1990-10-08", lunar: true },
    ];
    for (const m of demoMembers) {
        const member = { id: newSiYuanId(), name: m.name, role: m.role, birthday: m.birthday, lunarBirthday: m.lunar, createdAt: new Date().toISOString() };
        await addMember(plugin, settings, member);
        settings.demoMemberIds = [...(settings.demoMemberIds ?? []), member.id];
        result.created++;
    }

    // 示例行：证件（一张 20 天后到期 → 提醒中枢立即可见）+ 药箱低库存 + 囤货
    const plan: [string, Record<string, unknown>][] = [
        ["certs", { name: "护照", expiry: dateStr(20), note: "示例：到期前 20 天应出现在提醒中枢" }],
        ["medicine", { name: "布洛芬", expiry: dateStr(90), stock_qty: 2, low_stock_at: 5, location: "家庭药箱" }],
        ["stock", { name: "抽纸", expiry: dateStr(300), qty: 1, low_stock_at: 3 }],
    ];
    for (const [moduleId, fields] of plan) {
        if (!settings.enabledModules.includes(moduleId)) continue;
        try {
            if (await demoRow(settings, moduleId, schemaCatalog, fields, collected)) result.created++;
        } catch (e) {
            result.errors.push(`${moduleId}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    settings.demoRows = { ...(settings.demoRows ?? {}), ...mergeIds(settings.demoRows, collected) };
    await saveSettings(plugin, settings);
    return result;
}

function mergeIds(prev: Record<string, string[]> | undefined, added: Record<string, string[]>): Record<string, string[]> {
    const out: Record<string, string[]> = { ...(prev ?? {}) };
    for (const [k, v] of Object.entries(added)) out[k] = [...(out[k] ?? []), ...v];
    return out;
}

function dateStr(daysAhead: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 清除示例数据：按生成清单删行（[待实测] 端点，失败逐行报告）+ 移除示例成员引用 */
export async function clearDemoData(plugin: Plugin, settings: HomeSettings): Promise<DemoResult> {
    const result: DemoResult = { created: 0, cleared: 0, errors: [] };
    for (const [moduleId, itemIds] of Object.entries(settings.demoRows ?? {})) {
        const ref = settings.dbRefs[moduleId];
        if (!ref?.avId) continue;
        for (const itemID of itemIds) {
            try {
                await removeLedgerRows(ref.avId, [itemID]);
                result.cleared++;
            } catch (e) {
                result.errors.push(`${moduleId}/${itemID}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }
    settings.demoRows = {};
    for (const id of settings.demoMemberIds ?? []) {
        const m = settings.members.find((x) => x.id === id);
        if (m) await removeMember(plugin, settings, id);
    }
    settings.demoMemberIds = [];
    await saveSettings(plugin, settings);
    return result;
}
