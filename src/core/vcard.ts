/**
 * UG11 v1（第九十波）：家庭成员导出 vCard 4.0（.vcf）。纯逻辑可单测；本地生成无网络。
 * 字段：FN（称呼）、BDAY（公历生日，农历生日不导出——无公历映射不造数）、NOTE（备注）、
 * CATEGORIES（角色 i18n 由调用方解析后传入）、UID（成员 id@lvhome.local，幂等）。
 * 复用 ICS 的文本转义与 75 字节行折叠（转义集一致：反斜杠/分号/逗号/换行）。
 */
import { foldLine, icsEscape } from "./ics";

export interface VCardMember {
    /** 稳定 UID 基（成员 id） */
    uid: string;
    name: string;
    /** 公历生日 YYYY-MM-DD；缺省/农历不导出 BDAY */
    birthday?: string;
    lunarBirthday?: boolean;
    note?: string;
    /** 角色显示名（调用方 i18n） */
    category?: string;
}

const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** 组装 VCF 文本：每成员一张卡，CRLF + 行折叠；now 供 REV（测试注入） */
export function buildVCard(members: VCardMember[], now = new Date()): string {
    const rev = `${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
    const cards: string[] = [];
    for (const m of members) {
        if (!m.uid || !m.name) continue;
        const lines = [
            "BEGIN:VCARD",
            "VERSION:4.0",
            `UID:${icsEscape(m.uid)}@lvhome.local`,
            `FN:${icsEscape(m.name)}`,
            `REV:${rev}`,
        ];
        if (validDate(m.birthday ?? "") && !m.lunarBirthday) lines.push(`BDAY:${m.birthday!.slice(0, 10)}`);
        if (m.note) lines.push(`NOTE:${icsEscape(m.note)}`);
        if (m.category) lines.push(`CATEGORIES:${icsEscape(m.category)}`);
        lines.push("END:VCARD");
        cards.push(lines.map(foldLine).join("\r\n"));
    }
    return cards.length ? cards.join("\r\n") + "\r\n" : "";
}
