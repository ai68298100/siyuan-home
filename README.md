<div align="center">

# 🏠 Lv Home (小驴管家)

**A family archive that reminds you before things expire** — the family & life butler plugin for SiYuan notes.

[![CI](https://github.com/ai68298100/siyuan-home/actions/workflows/ci.yml/badge.svg)](https://github.com/ai68298100/siyuan-home/actions/workflows/ci.yml) [![Release](https://img.shields.io/github/v/release/ai68298100/siyuan-home)](https://github.com/ai68298100/siyuan-home/releases/latest) [![License](https://img.shields.io/github/license/ai68298100/siyuan-home)](./LICENSE)

Family archive · unified expiry reminder hub · household workspace

**[⬇️ Download](https://github.com/ai68298100/siyuan-home/releases/latest)** · **[🗺 Roadmap](./ROADMAP.md)** · **[📖 中文文档](./README.zh-CN.md)**

*Local-first · No plugin-owned telemetry · Data stays in your SiYuan workspace*

</div>

---

## ✨ What it solves

Certificates expire, medicine expires, insurance needs renewal, subscriptions auto-charge, birthdays (lunar ones too) get forgotten, kids' vaccination schedules are complex… and this information is scattered across chats, notes and memory.

**Lv Home brings it all into SiYuan notes**: one family ledger + one reminder hub that reaches out to you.

| Capability | What it means |
|---|---|
| ⏰ **Unified expiry reminders** | Certificates, medicine, policies, subscriptions, inspections, birthdays (lunar supported) — all derived automatically, lead time configurable per type (passport 1 year, medicine 30 days), overdue shown in red on top |
| 👥 **Members as first-class citizens** | Self / spouse / partner / children / elders / kin — every ledger is organized per member, filter "everything about my son" in one click |
| 🗃 **31 life modules** | People & records · assets & shopping · daily living · parenting & school · travel · media (details below) |
| 📋 **Rich detail drawer** | View all fields, edit inline, upload attachments, renewal history, replacement chains & timeline journals (valuations / prices / meter readings / lending / pre-trip checks), delete with double-confirm |
| 📈 **Growth charts (parenting)** | Height/weight timelines with official WHO reference bands (P3–P97, 0–13 weeks weekly + 0–60 months), percentile on hover |
| 🛒 **Smart lists** | Shopping suggestions from low stock (editable, copy-to-clipboard), media update reminders, reciprocation reminders for received gifts |
| 📊 **Check-in & exam integration** | Display study streaks and accuracy from 小驴考试, check-in strength summaries from 小驴打卡 |
| 📤 **Data portability** | CSV export per module + bulk CSV import (column-mapping wizard), calendar (.ics) & contacts (.vcf) export, sanitized diagnostics bundle, settings JSON export/import with auto-backup, sample data generator |
| 🔒 **Local-first** | Records live in your SiYuan workspace; the plugin has no author-owned server or telemetry. SiYuan sync, collaboration, backups and marketplace downloads remain host-controlled |
| 🔗 **Native databases** | Ledgers are SiYuan attribute-view databases inside a dedicated notebook — open any ledger doc to edit, link or embed it in daily notes ("mom's passport" inside your journal) |
| 🧩 **Modules on demand** | Disabled modules create no data and stay out of the UI; parenting/school only suggested when you have kids |
| 🔌 **Ecosystem ready** | Block menu quick capture, statusbar badge, service bridge (`window.LvHome`), contacts picker via 小驴人脉 |

## 📦 Install (v0.3.9)

1. Download `package.zip` from [Releases](https://github.com/ai68298100/siyuan-home/releases/latest)
2. SiYuan → Settings → Marketplace → Download → **Import** the zip
3. Enable the plugin → complete the 2-step onboarding (household → module picks and provisioning)
4. Press `Ctrl+Alt+H` anytime to open the hub

> **Validation status:** core data paths have automated tests and live-kernel coverage. The six-stage real SiYuan UI batch, including Android WebView and accessibility checks, is still pending; marketplace submission remains paused. `icon.png` and `preview.png` now use the v0.3.9 product assets.
> **Version note:** the tagged v0.3.9 package is the stable release artifact; `main` contains post-release hardening and currently reports 282 unit tests.
>
> Family sharing depends on SiYuan's collaboration, permissions, sync and conflict behavior. Test with non-sensitive data before sharing; this plugin does not provide a separate permission system.
>
> Privacy & FAQ: [privacy statement](https://github.com/ai68298100/siyuan-home/blob/main/docs/privacy.md) · [FAQ](https://github.com/ai68298100/siyuan-home/blob/main/docs/FAQ.md)

## 🧩 Module Overview (6 groups, 31 modules)

<details open>
<summary><b>People & Records</b> — Members (always on) · Certificates · Medical Records · Social Security · Insurance · Certifications · Pets</summary>

Rule-based expiry reminders (passport 1y / license 90d / endorsements), checkups & vaccine book, retirement countdown, policy ledger, renewal cycles, pet deworming
</details>

<details open>
<summary><b>Assets & Shopping</b> — Physical Assets · Digital Assets · Shopping Log · Memberships · Contracts</summary>

Location hierarchy & warranty tracking, account assets with password-location index (never passwords), tracking numbers & pickup codes, prepaid balances, contract expiry
</details>

<details open>
<summary><b>Daily Living</b> — Medicine Cabinet · Stock & Pantry · Gift Ledger · Chores · Dining · Addresses · Bookmarks · Snippets · House & Schedule</summary>

Medicine expiry + stock, pantry low-stock, gift net-balance per person, recurring chores, recipes & dislikes, payment days & lunar anniversaries, emergency checklist
</details>

<details open>
<summary><b>Parenting & School</b> — Parenting · Schooling (K→college) · Allowance & Lucky Money</summary>

National immunization schedule (22 doses), growth records, school phases & milestones, tuition payments, multi-account allowance
</details>

<details open>
<summary><b>Travel & Vehicles</b> — Vehicles · Transit Cards · Trip Plans · Bookings · Packing Lists · Trip Journal</summary>

Service/inspection/insurance/battery reminders, itinerary timeline, voucher archive, document self-check
</details>

<details open>
<summary><b>Media Library</b> — Movies / TV / Variety / Books / Comics / Novels</summary>

Want/doing/done states, ratings & progress, source links
</details>

> 🧮 **Modules on demand**: all 31 modules are schema-driven — enabling one provisions its database and joins the reminder hub automatically. Full list in [MODULES.md](./MODULES.md).

## 🚫 Explicitly NOT doing

Full accounting · password vaults · official data integrations · real-time travel info · barcode wallets · telemedicine · media streaming

> Lv Home stays at the **ledger + reminders + archive** layer — professional tools do the rest.

## 🗺 Roadmap

The current release is in a trust-and-validation phase: complete the real SiYuan UI batch, mobile/accessibility checks, recovery paths and production screenshots before marketplace submission. The next feature slice should optimize the five-minute path from a member to a first reminder and its source record. Pinyin search, webhooks, QR labels, AI and family collaboration remain an observation pool until host capability and user evidence are available.

| Phase | Content |
|---|---|
| ✅ v0.3.9 (current) | everything in v0.3.8, plus: UI aligned to the design spec (settings sidebar, onboarding brand page, ledger status dots, module sparklines, dialogs & theme polish), instant demo-generation receipts, horizontally scrollable ledger on narrow screens, proper icon & preview, dual release gates (CI + tag) |
| 🔜 Next | Task workbench, evidence center, inbox, health recovery |
| 🔭 Later | Family collaboration, template packs, yearly family report, AI capabilities |

Full plan: [ROADMAP.md](./ROADMAP.md)

## 🤝 Ecosystem

Works with the Lv plugin family: **Check-in** (numeric tracking), **Contacts** (technicians/teachers/doctors), **Quick Switch** (bookmarks/snippets), **Web Clipper** (archiving).

## 🛠 Development

```bash
pnpm install
pnpm run dev      # dev (app + kernel watch)
pnpm run build    # dist/ + package.zip
pnpm run check    # 5-layer gate (types + svelte + i18n + meta + audit)
pnpm run smoke    # release package and single-file loader smoke checks
pnpm test         # unit tests (282)
```

- Setup & conventions: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Release quality: CI runs check/test/build/smoke/size-gate on every push & PR
- Regression checklist: [docs/testing/v0.2.md](./docs/testing/v0.2.md)
- Questions and bug reports: [SUPPORT.md](./SUPPORT.md) · Security reports: [SECURITY.md](./SECURITY.md)

## 📚 Documentation

| Category | Docs |
|---|---|
| Usage | [FAQ](https://github.com/ai68298100/siyuan-home/blob/main/docs/FAQ.md) · [Privacy](https://github.com/ai68298100/siyuan-home/blob/main/docs/privacy.md) · [Migration](https://github.com/ai68298100/siyuan-home/blob/main/docs/migration.md) · [Glossary](https://github.com/ai68298100/siyuan-home/blob/main/docs/glossary.en.md) |
| Design | [01 Architecture](./docs/design/01-架构总览.md) · [02 Data model](./docs/design/02-数据模型与模块规格.md) · [03 Reminder hub](./docs/design/03-提醒中枢.md) · [07 Visual language](./docs/design/07-视觉设计语言.md) · [Index](./docs/design/00-index.md) |
| Interactive prototype | [prototype/index.html](./prototype/index.html) (open in browser — dark/light themes, 7 screens incl. style guide) |

## License

[MIT](./LICENSE) · Third-party data & notices: [NOTICE.md](./NOTICE.md) (WHO Child Growth Standards, CC BY-NC 3.0 IGO)

<div align="center">

*Start with one certificate — let the hub remember, so you don't have to.*

</div>

---

### 🌐 中文

**小驴管家** —— 思源笔记的家庭与生活管家：31 个 schema 驱动的生活模块（证件/药品/保单/订阅/上学/旅行/影音…）、统一到期提醒中枢、按成员组织、本地优先零遥测。完整介绍见 [中文文档](./README.zh-CN.md)。
