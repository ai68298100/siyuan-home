# Getting Started

> Finish first-time setup in 5 minutes and see your first due reminder.

## 1. Enable the plugin

After installing, enable **Lv Home** in SiYuan → Settings → Marketplace → Downloaded. A 🏠 icon appears in the top bar.

## 2. First-run wizard

Opening the butler panel for the first time shows a two-step wizard:

1. **Household** — pick roles for you and your family (self / spouse / child / elder…). This only shapes module recommendations; no members are created automatically.
2. **Recommended modules** — modules are preselected from your household (choosing "child" recommends parenting / schooling / allowance). Confirm and click "✓ Finish".

When you finish, the butler automatically provisions ledger notebooks for the enabled modules (default notebook "🏠 小驴管家"). Provisioning takes a few seconds.

> Skipping the wizard is fine — you can rerun it anytime from Settings → About → "Rerun wizard", or enable modules manually with the module switches.

## 3. Add members

Open the **Members** tab, enter a name and a role, then click "＋ Add".

- Birthdays support the **Chinese lunar calendar** (check "Lunar"; leap months are handled automatically).
- Members sync into the ledger database, so each module's "member" column can reference them.

## 4. Enter your first certificate

Open the **Ledger** tab → choose "Certificates" → fill in:

- **Name**: e.g. "ID card", "Passport"
- **Member**: pick the owner
- **Expiry**: pick the expiration date

Click "＋ New" and you're done. The row appears in the table below and in the native SiYuan document.

## 5. See due reminders

Open the **Reminders** tab — date fields in your ledgers become reminders automatically:

- 🔴 **Overdue** (red)
- 🟠 **Next 7 days** (orange)
- 🟡 **Within lead time** (yellow; certificates default to 90 days)

Each reminder offers: **Done** / **Renew** (update the expiry date) / **Snooze** / **Ignore** / **Locate** (opens the source document).

## 6. Daily use

- **Quick memo** — the input box at the bottom of Overview; no ledger needed.
- **Block-menu capture** — select text → right click → "Save to Lv Home" (text goes to snippets, URLs to bookmarks).
- **Status-bar badge** — SiYuan's bottom status bar shows today's due count.
- **Search** — the search box on the Ledger page (name/notes).
- **Export** — Ledger page exports the current module as CSV (high-consequence modules such as health/certs/finances ask for confirmation first, naming the category); Members page exports contacts as .vcf; Reminders page exports the calendar as .ics; Settings → About exports settings / diagnostics.

## Trouble?

- Ledger deleted by accident → Settings → re-enable the module switch → idempotent reprovision
- Corrupted settings → automatic fallback to defaults + a `.corrupted.json` marker
- More → [FAQ](../FAQ.md) · [Privacy](../privacy.md)
