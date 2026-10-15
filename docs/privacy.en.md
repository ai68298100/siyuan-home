# Privacy Statement & Sharing Boundaries (Privacy & Boundaries)

> Chinese version: [privacy.md](privacy.md)
> 
> Lv Home (小驴管家) v0.5.7 · Effective October 15, 2026

**Core Principle: Your data remains strictly on your local device and inside your SiYuan workspace. The plugin author does not collect, relay, or upload any data.**

## Data Storage & Ownership

- **Ledger Records**: All household ledgers (certificates, medicine, vehicles, assets, health, etc.) are stored as native **SiYuan database blocks and documents** in your local workspace (`data/` directory) and managed directly by the SiYuan kernel.
- **Settings & Runtime State**: Plugin preferences, reminder rule overrides, and runtime state (snoozed, muted, quick memos, named views, etc.) are stored locally under `data/storage/petal/siyuan-home/`.
- **Zero External Data Retention**: The plugin author operates no intermediary servers, analytics endpoints, or backup hosts.

## Sharing, Collaboration & Synchronization Boundaries

- **Family Sharing Mechanism**: Collaboration between family members relies entirely on SiYuan's native **workspace sharing, user permission controls, and multi-device sync** (official cloud or self-hosted S3/WebDAV). Lv Home does not operate an independent user account or permission system. All members with read/write access to the workspace can view ledger records.
- **Sync Boundaries**: When SiYuan sync is enabled, ledger documents and plugin storage travel with the workspace to your configured cloud storage. Transport encryption and storage security are governed by SiYuan or your chosen storage provider.

## Conflict Resolution, Rollback & Backup Boundaries

- **Multi-Device Conflict Resolution**: Concurrent edits or offline sync conflicts follow SiYuan kernel's **block-level collaborative conflict strategies**. The plugin does not hijack or force-overwrite underlying revisions.
- **Rollback & Version History**: If accidental edits or deletions occur, users can revert records using SiYuan's built-in **Doc History** and snapshot comparisons. In addition, the Reminder Hub provides a 5-second global undo snackbar (`UndoSnackbar`) for quick recovery of completed or snoozed actions.
- **Backup & Recovery**:
  - **Runtime & Settings**: Users can export sanitized diagnostic bundles or settings JSON backups at any time via Settings → About;
  - **Full Ledger Backups**: Ledger data resides within standard SiYuan documents, archived alongside full workspace backups and snapshot archives.

## Network Transparency Statement

- **Offline-First by Design**: The plugin operates entirely offline by default. All calculations (dates, statutory retirement formulas, allergy conflict screening, dual dates, pinyin indexing, etc.) run locally. Assets such as `pinyin-dict.json` are bundled locally, requiring no external CDNs.
- **User-Authorized External Interactions** (when the environment is not physically air-gapped):
  - 🔔 **Webhook Push (Optional)**: Only when explicitly enabled and configured by the user in Settings → Push (Bark / ntfy), a plaintext daily digest is sent to the user's configured endpoint.
  - 🔍 **Image OCR (Optional)**: Triggered manually on demand in ledger details using the engine configured in SiYuan Settings → OCR; external AI models require explicit confirmation prior to image submission.
  - ☁️ **Host Network Activities**: Application updates, marketplace queries, and cloud sync are initiated by the SiYuan host application and outside plugin control.

## Sensitive Data Protection & Masking

- **Zero Password Storage**: Digital Assets (`assets-virtual`) only records password-hint or location index fields. Plaintext passwords must never be stored.
- **Sensitive Masking**: Identification numbers, bank accounts, and phone numbers are masked by default with asterisks in table and banner views to prevent shoulder-surfing.
- **Desensitized Copying (MOD-04)**: Ledger drawers feature "Copy as Text (Masked)" to automatically apply security asterisks over national IDs, phone numbers, policy numbers, and credentials before sharing across chat apps or customer service.
- **Unified XSS Sanitization (SEC-01)**: All dynamically assembled user titles, notes, and modal dialog content pass through `escapeHtml` and `escapeAttr` sanitization to prevent script injection.

## Controlled Data Export

Exports for CSV, .ics calendar, and JSON are generated entirely on the client side in JavaScript without network transmission, accompanied by tiered confirmation prompts:
- **High-consequence modules** (health, parenting, certificates, assets, contracts, etc.) explicitly confirm plaintext contents before CSV generation;
- **Settings export** explicitly reminds users of household roster and reminder history retention;
- Exported files are saved to your local disk by the browser/SiYuan client and should be safeguarded responsibly.
