/**
 * UG11 v1（第八十九波）：提醒导出 RFC 5545 日历（.ics）。纯逻辑可单测；本地生成无网络。
 * v1 形态：每条提醒 = 一个全天事件（dueDate 当日），无 VALARM（系统通知已另有链路）。
 */

export interface IcsEvent {
    /** 稳定 UID（调用方传 `${reminderId}@lvhome.local`，重导出不重复） */
    uid: string;
    /** 全天事件日期 YYYY-MM-DD（非法日期的事件被跳过） */
    date: string;
    summary: string;
    description?: string;
}

/** RFC 5545 文本转义：反斜杠、分号、逗号、换行 */
export function icsEscape(s: string): string {
    return String(s ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");
}

const enc = new TextEncoder();
const byteLen = (s: string) => enc.encode(s).length;

/** 75 八字节行折叠：超长以 CRLF+空格 续行（续行内容上限 74 字节） */
export function foldLine(line: string): string {
    const out: string[] = [];
    let cur = "";
    let curLen = 0;
    for (const ch of line) {
        const bl = byteLen(ch);
        const limit = out.length === 0 ? 75 : 74;
        if (curLen + bl > limit && cur !== "") {
            out.push(cur);
            cur = "";
            curLen = 0;
        }
        cur += ch;
        curLen += bl;
    }
    out.push(cur);
    return out.join("\r\n ");
}

function addDays(dateStr: string, n: number): string {
    const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s);

/** 组装 VCALENDAR 文本：CRLF 行结束 + 行折叠；now 供 DTSTAMP（默认当前，测试注入） */
export function buildIcs(calName: string, events: IcsEvent[], now = new Date()): string {
    const stamp = `${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
    const lines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//LvHome//Reminders//CN",
        `X-WR-CALNAME:${icsEscape(calName)}`,
        "CALSCALE:GREGORIAN",
    ];
    for (const ev of events) {
        if (!ev.uid || !validDate(ev.date)) continue;
        lines.push(
            "BEGIN:VEVENT",
            `UID:${icsEscape(ev.uid)}`,
            `DTSTAMP:${stamp}`,
            `DTSTART;VALUE=DATE:${ev.date.slice(0, 10).replace(/-/g, "")}`,
            // 全天事件 DTEND 为开区间次日
            `DTEND;VALUE=DATE:${addDays(ev.date, 1).replace(/-/g, "")}`,
            `SUMMARY:${icsEscape(ev.summary)}`,
        );
        if (ev.description) lines.push(`DESCRIPTION:${icsEscape(ev.description)}`);
        lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return lines.map(foldLine).join("\r\n") + "\r\n";
}
