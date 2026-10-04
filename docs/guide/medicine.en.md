# Medicine Cabinet

> Track medicine expiry dates and stock levels; get reminded on low stock and approaching expiry.

## Entering records

Ledger page → Medicine cabinet → fill in the quick form:

| Field | Notes |
|---|---|
| Name | medicine name |
| Category | prescription / OTC / topical / device / supplement |
| Expiry | validity end date |
| Stock qty | current stock (number) |
| Low-stock threshold | remind when stock falls to this |
| Storage location | e.g. "home medicine box" |

## Two independent rules

The medicine cabinet has two independent reminder rules:

1. **Expiry**: reminded 30 days before the expiry date (configurable)
2. **Low stock**: reminded immediately when stock ≤ threshold

The rules trigger independently — one box of medicine can be both near expiry and low on stock, producing two reminders.

## Low-stock semantics

- Stock **= or <** threshold → reminder fires
- Stock of **0** counts as a value (fires)
- Missing column/value for stock or threshold → not evaluated (no false alarms)
- **Restocking** above the threshold clears the reminder automatically on the next scan (nothing to dismiss by hand)

## Contacts

Medicine rows can also carry a "contact person" field — note the doctor or pharmacist who recommended it. With Lv Contacts installed, pick from the Members page or the detail drawer.

## Prescription → medicine cabinet

Prescription/medication rows in the health module have a "Move to cabinet" button in the detail drawer — one click creates a same-named cabinet row (member relation copied); the button grays out on success to prevent duplicates.

## Shopping → stock in

A shopping row with a quantity filled in can "stock in to the cabinet" from the detail drawer — the same-named cabinet row's quantity accumulates (a new row is created when none matches); a confirmation dialog reports the match. Stock reminders recompute immediately after stocking in.
