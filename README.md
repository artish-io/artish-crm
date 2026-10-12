# Artish CRM (prototype)

Internal sales-funnel tracker, separate from the main Artish app.

- **SQL** pipeline (kanban): Initial discovery → Post-demo → Close → Sustained
- **MQL** pipeline: Signed up (no account) → Created account, with a per-contact feature checklist
- Per-contact notes and meeting transcripts (file upload ≤ 4 MB, or a link)
- **Analytics** (`/analytics`, `/analytics/users`): signups, activation, retention, leads, per-user last sign-in, read straight from the main Artish database
- **Sync from database** turns signups, leads and feature usage into contacts

Single shared password, no per-user accounts. Contacts live in Postgres (Neon); uploaded transcript files live in a private Vercel Blob store.

## Local dev

```bash
cp .env.example .env.local   # set CRM_PASSWORD and SESSION_SECRET (16+ chars)
pnpm install
pnpm dev
```

Without `DATABASE_URL` an embedded Postgres is used (`./.data/pglite`), and without `BLOB_READ_WRITE_TOKEN` transcript files go to `./.data/uploads`. Both are git-ignored. On Vercel a missing `DATABASE_URL` is an error, never a silent fallback.

## Deploy to Vercel

1. Create a **private** Blob store and connect it to the project (this sets `BLOB_READ_WRITE_TOKEN`).
   Transcripts contain customer conversations, so do not use a public store.
2. Add a **Neon** database from the Vercel Marketplace (Storage tab) and connect it to the project; this sets `DATABASE_URL`. Tables are created on first request. If an older `crm/data.json` exists in Blob, it is imported once automatically (and left in place as a backup).
3. Set `CRM_PASSWORD` and `SESSION_SECRET` (random, 32+ chars).
4. Main-database access (read-only), set `CLOUD_SQL_INSTANCE`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `GCP_SERVICE_ACCOUNT_KEY`:
   - Create a Postgres role with `SELECT` only on the tables the dashboard reads.
   - Create a GCP service account with the **Cloud SQL Client** role and put its JSON key in `GCP_SERVICE_ACCOUNT_KEY`.
   - Cloud SQL connector tunnels over TLS with IAM authorization, so no authorized-network entry is needed.
5. Deploy. The app refuses logins until `CRM_PASSWORD` and `SESSION_SECRET` are set. Analytics pages show an error until the database variables are set.

## Notes

- Sync never overwrites SQL stages, notes or files; it only updates product info and MQL stage.
- Synced contacts are archived rather than deleted so a later sync does not recreate them.
- Edits lock the contact's row (`SELECT … FOR UPDATE`); a sync only updates product-derived columns, so it never overwrites notes or SQL stages.
- This is a prototype: no audit log, no rate limiting beyond a fixed delay on bad passwords.
