# Certificates

> Track validity dates for the whole family's documents and get reminded before they expire.

## Entering records

Ledger page → Certificates → fill in the quick form:

| Field | Notes |
|---|---|
| Name | document name (e.g. "ID card") |
| Member | owner (optional) |
| Category | ID card / household register / passport / visa… |
| Expiry | validity end date |
| Renewal rule | every 6 years / every 10 years / long-term / endorsement separately |
| Storage location | where it is physically kept |
| Notes | free text |

## Reminder rules

- **Expiry**: default lead time **90 days** (adjustable in Settings → Reminders)
- **Endorsement / inspection date**: default lead time **60 days**
- Rows whose status is "Expired / Replaced / Cancelled" **no longer remind**

## Renewal flow

1. See the certificate approaching expiry in the Reminders hub
2. Click "Renew" → pick the new expiry date → save
3. The ledger row's expiry updates automatically; the old reminder disappears and a new one is generated from the new date
4. Renewal history is visible at the bottom of the detail drawer

## Replacement chain

When a document is replaced (e.g. passport renewal), click "Link new" in the old document's detail drawer and pick the new row — the drawer then shows both directions "→ new / ← old" so the replacement history is clear at a glance. The data lives on the ledger rows; deleting either side breaks the chain.

## Contacts

While editing details you can fill in "Contact person (Lv Contacts)" — with the Lv Contacts plugin installed, click "Pick from contacts" to search and select. The snapshot format is `name [docId]`.

## FAQ

**Q: The expiry is set but no reminder appears?**
A: Check that the status column is "Valid" (non-valid statuses don't remind); check the lead-time setting.

**Q: How do I silence one certificate forever?**
A: Use "Ignore" (restorable) or change the status to "Expired / Cancelled".
