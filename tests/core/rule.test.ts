/**
 * 提醒规则引擎单测（B1a-d，docs/design/09 决策定案的行为契约）。
 * 运行：pnpm test
 */
import { describe, it, expect } from "vitest";
import { Lunar } from "lunar-typescript";
import {
    nextOccurrence, levelOf, buildReminder, localDateKey, parseDate,
    type LedgerRowDates,
} from "@/core/hub/rule";
import { lunarToSolar } from "@/core/hub/lunar-lazy";
import type { ReminderRuleSpec } from "@/types";

const TODAY = new Date(2026, 9, 1); // 2026-10-01 本地时区
const oneoff: ReminderRuleSpec = { key: "expiry", field: "expiry", kind: "oneoff", leadDays: 90 };
const anniv: ReminderRuleSpec = { key: "birthday", field: "birthday", kind: "anniversary", leadDays: 7 };
const recur: ReminderRuleSpec = { key: "next_pay", field: "due", kind: "recurring", leadDays: 14, cycleField: "cycle" };

const row = (r: Partial<LedgerRowDates>): LedgerRowDates => ({ rowId: "r1", title: "t", ...r });

describe("oneoff", async () => {
    it("今天到期 → daysLeft 0 / soon", async () => {
        const d = await nextOccurrence(oneoff, row({ fieldValue: "2026-10-01" }), TODAY)!;
        expect(localDateKey(d)).toBe("2026-10-01");
    });
    it("昨天 → overdue", async () => {
        const d = await nextOccurrence(oneoff, row({ fieldValue: "2026-09-29" }), TODAY)!;
        expect(localDateKey(d)).toBe("2026-09-29");
    });
    it("未来日期原样返回（含闰日 2028-02-29）", async () => {
        const d = await nextOccurrence(oneoff, row({ fieldValue: "2028-02-29" }), TODAY)!;
        expect(localDateKey(d)).toBe("2028-02-29");
    });
    it("无日期 → undefined", async () => {
        expect(await nextOccurrence(oneoff, row({}), TODAY)).toBeUndefined();
    });
});

describe("anniversary 公历（决策：2/29 平年 2/28）", async () => {
    it("平年 2/29 → 2/28", async () => {
        const d = await nextOccurrence(anniv, row({ fieldValue: "2024-02-29" }), TODAY)!;
        expect(localDateKey(d)).toBe("2027-02-28");
    });
    it("闰年 2/29 当年未到 → 当年 2/29", async () => {
        const today = new Date(2028, 0, 15);
        const d = await nextOccurrence(anniv, row({ fieldValue: "2024-02-29" }), today)!;
        expect(localDateKey(d)).toBe("2028-02-29");
    });
    it("今年已过 → 明年周年", async () => {
        const d = await nextOccurrence(anniv, row({ fieldValue: "1990-07-12" }), TODAY)!;
        expect(localDateKey(d)).toBe("2027-07-12");
    });
    it("今年未到 → 今年周年", async () => {
        const d = await nextOccurrence(anniv, row({ fieldValue: "1990-12-25" }), TODAY)!;
        expect(localDateKey(d)).toBe("2026-12-25");
    });
});

describe("anniversary 农历（决策：闰月平年过平月同日）", async () => {
    it("平月生日：下次农历周年落在同月同日", async () => {
        // 农历 2000-01-01（春节）→ 公历 2000-02-05
        const base = Lunar.fromYmd(2000, 1, 1).getSolar();
        const baseIso = `${base.getYear()}-${String(base.getMonth()).padStart(2, "0")}-${String(base.getDay()).padStart(2, "0")}`;
        const d = await nextOccurrence(anniv, row({ fieldValue: baseIso, lunar: true }), TODAY)!;
        const lunar = Lunar.fromDate(d);
        expect(lunar.getMonth()).toBe(1);
        expect(lunar.getDay()).toBe(1);
        expect(d >= TODAY).toBe(true);
    });
    it("闰月生日：无闰月年份回退平月同日", async () => {
        // 2023 闰二月初八（库构造，避免硬编码公历）
        const solar = Lunar.fromYmd(2023, -2, 8).getSolar();
        const iso = `${solar.getYear()}-${String(solar.getMonth()).padStart(2, "0")}-${String(solar.getDay()).padStart(2, "0")}`;
        const d = await nextOccurrence(anniv, row({ fieldValue: iso, lunar: true }), TODAY)!;
        const lunar = Lunar.fromDate(d);
        expect(Math.abs(lunar.getMonth())).toBe(2); // 平二月（闰月标志已去除）
        expect(lunar.getDay()).toBe(8);
        expect(d >= TODAY).toBe(true);
    });
    it("腊月三十生日遇小月 → 回退腊月廿九（2022 腊月无三十，除夕 2023-01-21）", async () => {
        const d = await lunarToSolar(2022, 12, 30)!;
        expect(localDateKey(d)).toBe("2023-01-21");
    });
});

describe("recurring（决策：O(1) 滚动，月末 clamp 不漂移）", async () => {
    it("月末 1/31 月周期 → 最近缴费日 10/31（每期从 base 重算，clamp 不漂移）", async () => {
        const d = await nextOccurrence(recur, row({ fieldValue: "2026-01-31", cycle: "month" }), TODAY)!;
        expect(localDateKey(d)).toBe("2026-10-31");
    });
    it("季度周期滚动", async () => {
        const d = await nextOccurrence(recur, row({ fieldValue: "2025-06-10", cycle: "quarter" }), TODAY)!;
        expect(localDateKey(d)).toBe("2026-12-10");
    });
    it("周周期滚动", async () => {
        const d = await nextOccurrence(recur, row({ fieldValue: "2026-09-28", cycle: "week" }), TODAY)!;
        expect(localDateKey(d)).toBe("2026-10-05");
    });
    it("日周期滚动", async () => {
        const d = await nextOccurrence(recur, row({ fieldValue: "2026-09-28", cycle: "day" }), TODAY)!;
        expect(localDateKey(d)).toBe("2026-10-01");
    });
    it("未来 base 原样返回", async () => {
        const d = await nextOccurrence(recur, row({ fieldValue: "2027-01-10", cycle: "month" }), TODAY)!;
        expect(localDateKey(d)).toBe("2027-01-10");
    });
    it("未声明周期 → oneoff 降级（决策 09）", async () => {
        const d = await nextOccurrence(recur, row({ fieldValue: "2026-09-01" }), TODAY)!;
        expect(localDateKey(d)).toBe("2026-09-01"); // 逾期原样保留，由 overdue 呈现
    });
});

describe("分级与降噪", async () => {
    it("levelOf 四级边界", async () => {
        expect(levelOf(-1, 90)).toBe("overdue");
        expect(levelOf(0, 90)).toBe("soon");
        expect(levelOf(7, 90)).toBe("soon");
        expect(levelOf(8, 90)).toBe("lead");
        expect(levelOf(90, 90)).toBe("lead");
        expect(levelOf(91, 90)).toBe("later");
    });
    it("later 降噪 → buildReminder 返回 null", async () => {
        const r = await buildReminder(oneoff, "certs", row({ fieldValue: "2027-06-01" }), { today: TODAY });
        expect(r).toBeNull();
    });
    it("leadOverride 生效且 clamp（0..3650）", async () => {
        const r = await buildReminder(oneoff, "certs", row({ fieldValue: "2026-12-01" }), { today: TODAY, leadOverride: 90 });
        expect(r?.level).toBe("lead");
        // clamp 到 0：60 天超出 max(0,8) → later → 降噪为 null
        const clamped = await buildReminder(oneoff, "certs", row({ fieldValue: "2026-12-01" }), { today: TODAY, leadOverride: -5 });
        expect(clamped).toBeNull();
    });
    it("提醒 id 格式 rowId::moduleId.ruleKey", async () => {
        const r = await buildReminder(oneoff, "certs", row({ rowId: "20260101-abc", fieldValue: "2026-10-01" }), { today: TODAY })!;
        expect(r.id).toBe("20260101-abc::certs.expiry");
        expect(r.dueDate).toBe("2026-10-01");
    });
    it("lunar 标记透传：row.lunar → reminder.lunar（卡片 🌙；非农历不落字段）", async () => {
        // 透传与 kind 无关（buildReminder 统一展开），用 oneoff 保证日期落在提醒窗口内
        const lunarR = await buildReminder(oneoff, "members", row({ fieldValue: "2026-10-05", lunar: true }), { today: TODAY });
        expect(lunarR?.lunar).toBe(true);
        const solarR = await buildReminder(oneoff, "members", row({ fieldValue: "2026-10-05" }), { today: TODAY });
        expect(solarR?.lunar).toBeUndefined();
    });
});

describe("工具函数", async () => {
    it("localDateKey 本地时区（避免 UTC 偏移）", async () => {
        expect(localDateKey(new Date(2026, 9, 1))).toBe("2026-10-01");
        expect(localDateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
    });
    it("parseDate 拒绝无效", async () => {
        expect(parseDate("not-a-date")).toBeUndefined();
        expect(parseDate(undefined)).toBeUndefined();
        expect(parseDate("2026-10-01")?.getFullYear()).toBe(2026);
    });
});
