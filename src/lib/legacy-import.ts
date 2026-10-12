import { get, head, BlobNotFoundError } from '@vercel/blob';
import type { Query } from './sql';
import type { Contact, Data } from './types';

/**
 * One-time import of the old single-blob store (crm/data.json) into Postgres.
 * Runs inside the schema transaction, once (flagged in `meta`). The blob is left
 * untouched as a backup. Safe to delete this file after the first deploy.
 */
const BLOB_PATH = 'crm/data.json';

export async function importLegacyBlob(q: Query): Promise<void> {
  const done = await q(`SELECT 1 FROM meta WHERE key = 'legacy_blob_import'`);
  if (done.rows.length) return;

  let imported = 0;
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
    let exists = true;
    try {
      await head(BLOB_PATH);
    } catch (e) {
      if (!(e instanceof BlobNotFoundError)) throw e;
      exists = false;
    }
    if (exists) {
      const res = await get(BLOB_PATH, { access: 'private', useCache: false });
      if (res?.statusCode === 200 && res.stream) {
        const data = JSON.parse(await new Response(res.stream).text()) as Data;
        for (const c of data.contacts) {
          await insert(q, c);
          imported++;
        }
        if (data.lastSyncAt) {
          await q(`INSERT INTO meta (key, value) VALUES ('last_sync_at', $1::jsonb) ON CONFLICT (key) DO NOTHING`, [
            JSON.stringify(data.lastSyncAt),
          ]);
        }
      }
    }
  }
  await q(`INSERT INTO meta (key, value) VALUES ('legacy_blob_import', $1::jsonb)`, [
    JSON.stringify({ at: new Date().toISOString(), imported }),
  ]);
  if (imported) console.log(`Imported ${imported} contacts from the legacy Blob store`);
}

async function insert(q: Query, c: Contact) {
  await q(
    `INSERT INTO contacts (id, email, name, company, pipeline, stage, notes, source, has_account, product, transcripts, archived, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14)
     ON CONFLICT DO NOTHING`,
    [
      c.id, c.email ?? '', c.name ?? '', c.company ?? '', c.pipeline, c.stage, c.notes ?? '', c.source,
      !!c.hasAccount, c.product ? JSON.stringify(c.product) : null, JSON.stringify(c.transcripts ?? []),
      !!c.archived, c.createdAt, c.updatedAt,
    ],
  );
}
