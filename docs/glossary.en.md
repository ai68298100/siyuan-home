# Glossary (Lv Home)

> 中文版: [glossary.md](glossary.md)

> A quick reference for non-technical family members: every term the butler UI uses, explained in one sentence. Sorted alphabetically.

| Term | What it is |
|---|---|
| **Ledger** | A module's master list (e.g. "Certificates", "Medicine cabinet"). Each record is a row stored in a SiYuan document, editable from the butler panel or the native SiYuan view. |
| **Reminders hub** | The page where due items from every module gather. Dates surface here automatically — no manual entry. |
| **Lead time** | How many days before expiry reminders start. Certificates default to 90 days; adjustable per module in settings. |
| **Overdue / Next 7 days / Lead time** | The three reminder groups: 🔴 past due / 🟠 due within a week / 🟡 inside the reminder window. |
| **Silent hours** | The time window with no notifications (default 22:00–8:00). |
| **Done / Snooze / Ignore** | The three reminder actions: clear it / be reminded again in a few days / hide it permanently (all restorable). |
| **Lunar marker 🌙** | The date follows the Chinese lunar calendar; leap months are handled automatically. |
| **Reciprocate 🎁** | After receiving a gift (an "in" favor), a reminder fires after 30 days to give one back. |
| **Still out** | A book lent from the media library that hasn't been returned yet. |
| **Low-stock threshold** | The quantity warning line for stock/medicine: reminders fire at or below it and clear automatically after restocking. |
| **Replacement chain** | The old↔new link between a renewed document and its replacement, visible both ways in the detail drawer. |
| **Diagnostics** | The "Export diagnostics" bundle in Settings → About for troubleshooting — sanitized, contains no family data. |
| **Import / Export** | Data channels: CSV (spreadsheets), .ics (calendars), .vcf (contacts), JSON (settings). Everything is generated locally, never over the network. |
| **Sample data** | Demo rows generated from Settings → About (marked 【Sample】), for trying things out — removable in one click. |

## The three most-used paths

1. **What's due?** → Open the butler → Reminders (sorted by urgency).
2. **Where is it / when does it expire?** → Ledger → pick a module → search or browse.
3. **New phone / computer?** → SiYuan sync carries the data; settings can be exported as JSON from Settings → About.

## Trouble?

- Data "missing" → check the ledger page dropdown for a "missing" marker, click rebuild (data lives in SiYuan documents and is rarely truly lost).
- More → [Getting started](getting-started.en.md) · [FAQ](../FAQ.md)
