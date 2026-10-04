# Contracts & Documents

> Track expiry dates and contact persons for rental, renovation, employment, property and other contracts.

## Entering records

Ledger page → Contracts & documents → fill in the quick form or edit details:

| Field | Notes |
|---|---|
| Name | contract name |
| Category | rental / renovation / purchase / employment / property / other |
| Counterparty | other party's name |
| Contact person (Lv Contacts) | picked from Lv Contacts, or typed by hand |
| Start date | contract start |
| Expiry | contract end |
| Deposit | amount |
| Attachments | scans / photos |

## Reminder rules

- **Expiry**: default lead time **90 days**
- Terminated / expired contracts **no longer remind**

## Contact person

The "contact person" field supports two input modes:

1. **Manual**: type the name and contact details
2. **From contacts**: click "Pick from contacts" → search Lv Contacts → select → the snapshot fills in automatically

The snapshot format is `name [docId]` for later traceability. Once linked, the full interaction history with that contact is visible in Lv Contacts.

## Renewal flow

1. A reminder arrives before expiry
2. Renewing → click "Renew" → enter the new expiry date
3. Not renewing → change the status to "Terminated" or "Expired" → reminders stop

## Auto-renewal clauses

Contracts with the "Auto-renew" column checked upgrade their expiry reminder into a **renewal decision reminder** (title carries 🔄) — prompting you to actively confirm renewal or non-renewal instead of passively waiting for a charge. Either way, click "Renew" or change the status on the Reminders page.
