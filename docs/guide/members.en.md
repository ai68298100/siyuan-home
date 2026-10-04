# Members

> Family members are the shared organizational dimension across all Lv Home modules.

## Add a member

Members page → enter a name and role → click "＋ Add".

| Field | Notes |
|---|---|
| Name | required |
| Role | Self / Spouse / Partner / Child / Elder / Other kin / Other |
| Birthday | optional; lunar calendar supported |
| Lunar | check to interpret the birthday as a lunar date |

Adding a member automatically creates a matching row in the members ledger database (dual write); later edits stay in sync.

## Edit a member

Click "Edit" on the member card → change fields → Save.

- Renaming → the ledger row's name column updates
- Clearing the birthday → the ledger row's birthday clears
- Members without a linked row get one created automatically on save

## Remove a member

Click "Delete" → confirm. **Only the settings-side reference is removed; the ledger row is kept.** Related reminders or filters pointing at the member reset automatically.

## Link a contact (Lv Contacts)

If the Lv Contacts plugin (v0.4.1+) is installed, you can link a member to a contact:

1. Click "Link contact" on the member card
2. Search contacts in the dialog
3. Pick one — a snapshot (`name [docId]`) is saved

Click "Unlink" to remove it. The snapshot lives on the butler side only and **never writes to contacts data**.

## Member stats

Each member card shows:

- **Todo stats**: top-3 per-module todo counts (from the latest scan)
- **Reminder count**: ⚠ mark + total
- **Lunar marker**: 🌙 icon

## Export contacts (.vcf)

"Export contacts" on the toolbar exports all members as a vCard 4.0 file (name, solar birthday, note, role) for your phone's address book. Members whose birthday is recorded as lunar get no BDAY field (no lunar→solar conversion is invented). Names/birthdays are personal data — a confirmation dialog appears before export.

## Member filter

Member chips on Overview and Reminders filter by member — selecting one shows only that member's items. Stale filters pointing at a deleted member reset automatically.
