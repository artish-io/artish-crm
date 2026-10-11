# Artish CRM (prototype)

Internal sales-funnel tracker, separate from the main Artish app.

- **SQL** pipeline (kanban): Initial discovery → Post-demo → Close → Sustained
- **MQL** pipeline: Signed up (no account) → Created account, with a per-contact feature checklist
- Per-contact notes and meeting transcripts (file upload ≤ 4 MB, or a link)
- **Sync from app** pulls signups, leads and feature usage from the main app's admin analytics API

Single shared password, no per-user accounts. Data is one JSON blob in Vercel Blob.

## Local dev

```bash
cp .env.example .env.local   # set CRM_PASSWORD and SESSION_SECRET (16+ chars)
pnpm install
pnpm dev
```

Without `BLOB_READ_WRITE_TOKEN`, data goes to `./.data/` (git-ignored).

## Deploy to Vercel

1. Create a **private** Blob store and connect it to the project (this sets `BLOB_READ_WRITE_TOKEN`).
   Transcripts contain customer conversations, so do not use a public store.
2. Set env vars: `CRM_PASSWORD`, `SESSION_SECRET` (random, 32+ chars), `MAIN_APP_URL`,
   `MAIN_APP_ADMIN_PASSWORD` (the main app's `ADMIN_DASHBOARD_PASSWORD`).
3. Deploy. The app refuses logins until `CRM_PASSWORD` and `SESSION_SECRET` are set.

## Notes

- Sync never overwrites SQL stages, notes or files; it only updates product info and MQL stage.
- Synced contacts are archived rather than deleted so a later sync does not recreate them.
- Concurrent edits use ETag optimistic concurrency with retries; fine for a handful of users.
- This is a prototype: no audit log, no rate limiting beyond a fixed delay on bad passwords.
