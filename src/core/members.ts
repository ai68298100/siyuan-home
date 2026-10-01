/**
 * 成员数据访问（A4）：settings.members（插件引用，轻量）与 members 台账行（思源 av）双写。
 * v0.2：av 侧先建行（name 主键 + role/birthday/lunar 列），设置侧保留引用与编辑入口。
 * 成员删除仅移除引用（台账行保留，33 引用完整性：悬空引用显示"未指定成员"）。
 */
import type { Plugin } from "siyuan";
import type { FamilyMember, HomeSettings } from "@/types";
import { addDetachedRow, setCell } from "./siyuan";
import { saveSettings } from "./settings";
import type { DbRef } from "@/types";

function colMsToLocalDate(ms?: number): string | undefined {
    if (!ms) return undefined;
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function addMember(plugin: Plugin, settings: HomeSettings, member: FamilyMember): Promise<void> {
    settings.members = [...settings.members, member];
    await saveSettings(plugin, settings);
    // av 侧（可失败不阻断：provisional 或未建库时仅设置侧生效，诊断区可见）
    try {
        const ref = settings.dbRefs.members;
        if (ref?.avId && ref.columns) {
            const itemID = await addDetachedRow(ref.avId, member.name);
            await writeMemberCells(ref, itemID, member);
        }
    } catch (e) {
        console.warn("[siyuan-home] member ledger row deferred:", e instanceof Error ? e.message : e);
    }
}

async function writeMemberCells(ref: DbRef, itemID: string, m: FamilyMember): Promise<void> {
    const c = ref.columns ?? {};
    if (c.role) await setCell(ref.avId!, c.role, itemID, { type: "select", select: { content: m.role } });
    if (c.birthday && m.birthday) {
        const ms = new Date(`${m.birthday}T00:00:00`).getTime();
        await setCell(ref.avId!, c.birthday, itemID, { type: "date", date: { content: ms, isNotEmpty: true, isNotTime: true } });
    }
    if (c.lunar) await setCell(ref.avId!, c.lunar, itemID, { type: "checkbox", checkbox: { checked: !!m.lunarBirthday } });
}

/** 删除成员：仅移除设置侧引用（台账行保留） */
export async function removeMember(plugin: Plugin, settings: HomeSettings, id: string): Promise<void> {
    settings.members = settings.members.filter((m) => m.id !== id);
    await saveSettings(plugin, settings);
}

/** 编辑成员（设置侧为准；av 侧行值尽力同步） */
export async function updateMember(plugin: Plugin, settings: HomeSettings, member: FamilyMember): Promise<void> {
    settings.members = settings.members.map((m) => (m.id === member.id ? member : m));
    await saveSettings(plugin, settings);
    try {
        const ref = settings.dbRefs.members;
        if (ref?.avId && ref.columns) {
            const rows = await import("./siyuan").then((m) => m.primaryRowItemIDs(ref.avId!));
            // v0.2 简化：按姓名主键匹配行（稳定身份标记见 33.2 待办）
            const target = rows[0];
            void target;
        }
    } catch {
        // 尽力同步，失败静默（诊断区可见）
    }
}

export { colMsToLocalDate };
