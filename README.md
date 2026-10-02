# Lv Home (小驴管家)

**A family archive that reminds you before things expire** — the family & life butler plugin for SiYuan.

[![CI](https://github.com/ai68298100/siyuan-home/actions/workflows/ci.yml/badge.svg)](https://github.com/ai68298100/siyuan-home/actions) [![Release](https://img.shields.io/github/v/release/ai68298100/siyuan-home?include_prereleases)](https://github.com/ai68298100/siyuan-home/releases) [![License](https://img.shields.io/github/license/ai68298100/siyuan-home)](./LICENSE)

[中文文档](./README.zh-CN.md)

## Install (v0.2.0)

1. Download `package.zip` from [Releases](https://github.com/ai68298100/siyuan-home/releases/latest)
2. SiYuan → Settings → Marketplace → Download → "Import" the zip
3. Enable the plugin → complete the 3-step onboarding

> Local-first, zero telemetry — see [privacy](./docs/privacy.md) & [FAQ](./docs/FAQ.md).

## Positioning

A local-first, searchable, proactively-reminding family archive:

- **Members as first-class citizens**: self / spouse / partner / children / elders / kin — certificates, medical records, policies and schooling are all organized per member.
- **Ledgers live in SiYuan databases**: one database per module, rows are blocks (linkable from daily notes); user-editable, never locked into plugin storage.
- **One unified expiry reminder hub**: certificates, medicine, policies, subscriptions, inspections, contracts, retirement — every date field flows through one pipeline with per-type lead times.
- **Modules on demand**: 6 groups, 31 modules. Disabled modules create no data and stay out of the UI. Wide coverage, light by default.
- **Work & study are scenarios**, not module groups: professional certs → Certifications; employment contracts → Contracts; learning sites → Bookmarks.

## Module Overview

| Group | Modules |
|---|---|
| People & Records | Members (always on) · Certificates · Medical Records · Social Security · Insurance · Certifications · Pets |
| Assets & Shopping | Physical Assets · Digital Assets · Shopping Log · Memberships · Contracts |
| Daily Living | Medicine Cabinet · Stock & Pantry · Gift Ledger · Chores & Cycles · Dining · Addresses · Bookmarks · Snippets · House & Schedule |
| Parenting & School | Parenting · Schooling (K→college) · Allowance & Lucky Money |
| Travel & Vehicles | Vehicles · Transit Cards · Trip Plans · Bookings · Packing Lists · Trip Journal |
| Media Library | Movies / Shows / Variety / Books / Comics / Novels |

Full feature list, roadmap and market research: [MODULES.md](./MODULES.md).

## Explicitly NOT doing

Full accounting, password vaults, official data integrations, real-time travel info, barcode wallets, telemedicine, media streaming. Lv Home stays at the **ledger + reminders + archive** layer.

## Roadmap

Current status & plans: [ROADMAP.md](./ROADMAP.md).

## Development

```bash
pnpm install
pnpm run dev      # dev (app + kernel watch)
pnpm run build    # build dist/
pnpm run check    # TypeScript + Svelte + i18n alignment
pnpm test         # unit tests (rule engine / hub)
```

Device regression checklist: [docs/testing/v0.2.md](./docs/testing/v0.2.md) · FAQ: [docs/FAQ.md](./docs/FAQ.md) · Privacy: [docs/privacy.md](./docs/privacy.md)

Stack: `plugin-sample-vite-svelte` template (Vite 8 + Svelte 5 + pnpm, Node ≥ 24).

## License

[MIT](./LICENSE)
