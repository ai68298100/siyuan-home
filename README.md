# Lv Home (小驴管家)

**A family archive that reminds you before things expire** — the family & life butler plugin for SiYuan.

[中文文档](./README.zh-CN.md)

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

## Development

```bash
pnpm install
pnpm run dev
pnpm run build
pnpm run check
```

Stack: `plugin-sample-vite-svelte` template (Vite 8 + Svelte 5 + pnpm, Node ≥ 24).

## License

[MIT](./LICENSE)
