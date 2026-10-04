# Reminders Hub

> Date fields in every module derive into reminders automatically, managed in one place.

## Three-level grouping

| Group | Meaning | Color |
|---|---|---|
| Overdue | due date has passed | 🔴 Red |
| Next 7 days | due within 7 days | 🟠 Orange |
| Lead time | inside the lead window | 🟡 Yellow |

## Filters

The filter bar stacks four dimensions:

- **Level**: Overdue / 7 days / Lead time / Handled
- **Member**: filter by owner
- **Module**: filter by source module
- **Time window**: Today / 7 days / 30 days / All

Filter state persists automatically and is restored next time.

## Actions

| Action | Effect |
|---|---|
| Done | leaves the active list; restorable from the "Handled" view |
| Renew | certs / insurance / contracts: opens a date picker and writes the new date back to the ledger row |
| Snooze | runtime-only (ledger dates untouched); reappears on the snoozed day |
| Ignore | hidden permanently (restorable from the Handled view) |
| Locate | opens the source ledger document |

## Export calendar

"Export calendar (.ics)" on the filter row exports **the currently filtered results** as a calendar file (each reminder = an all-day event on its due date). Import it into a phone/desktop calendar app for system-level alerts; exports containing high-consequence modules (health / certs / finances / child-related) ask for confirmation first.

## Handled view

With the filter set to "Handled" you see everything completed / ignored / done this cycle / memos done — each can be **restored** to the active list.

## Bulk actions

Click "Bulk" to enter selection mode → check rows or select all → bulk Done / Snooze 7 days / Ignore.

## Daily notifications

- One summary after the first scan past `notifyHour` (default 8:00) each day
- A "next 7 days" preview on Sunday evenings with the next scan
- Overdue items alert immediately the first time they are detected
- No notifications during silent hours (default 22:00–8:00)
